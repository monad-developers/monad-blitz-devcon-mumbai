// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title TapMateVault
/// @notice Chess wagers signed offline between two phones and settled later against fully funded chips.
/// @dev What this contract guarantees and what it does not:
///  - A win pays out only with the loser's signed Result, or after the loser stays silent on a claim.
///  - Chess rules are NOT checked onchain. A modified client that refuses to sign can contest a claim,
///    which voids the claim path. It cannot take the opponent's stake.
///  - Offline double-signing of a chip CANNOT be prevented. A chip can earn at most one win, and
///    reusing it is provable and slashable, but a late settler can still lose the race.
///  - A player offline for longer than DISPUTE can lose to a stale claim. Production needs a long DISPUTE.
contract TapMateVault is EIP712 {
    struct Wager {
        address player0; // strictly lower address
        address player1; // strictly higher address
        uint32 chip0; // chip index owned by player0
        uint32 chip1; // chip index owned by player1
        uint96 stake; // must equal CHIP; signed so the amount is explicit
        uint40 settleBy; // last timestamp for settle and claim
        bool player0IsWhite; // white signs odd plies, black signs even plies
    }

    struct Vault {
        uint32 chipStart; // chips in [chipStart, chipEnd) are valid
        uint32 chipEnd;
        uint32 consumed; // valid chips already paid out
        uint40 lockUntil; // can only increase while funded
        uint96 bond;
    }

    /// @notice The redeem ticket: the loser's signature admitting the result.
    struct Result {
        address winner;
        uint16 ply; // last ply played
        bytes32 finalPositionHash; // keccak256 of the final FEN string
        bytes loserSig;
    }

    /// @notice Evidence that the claimant moved at `ply` after the opponent moved at `ply - 1`.
    struct ClaimProof {
        uint16 ply;
        bytes32 positionHash;
        bytes moverSig;
        bytes32 prevPositionHash;
        bytes prevSig;
    }

    struct Claim {
        address claimant; // zero = no claim was ever filed
        uint40 deadline; // zero = not open
        uint16 ply;
        bool voided;
    }

    bytes32 private constant WAGER_TYPEHASH = keccak256(
        "Wager(address player0,address player1,uint32 chip0,uint32 chip1,uint96 stake,uint40 settleBy,bool player0IsWhite)"
    );
    bytes32 private constant MOVE_TYPEHASH = keccak256("Move(bytes32 gameId,uint16 ply,bytes32 positionHash)");
    bytes32 private constant RESULT_TYPEHASH =
        keccak256("Result(bytes32 gameId,address winner,uint16 ply,bytes32 finalPositionHash)");
    bytes32 private constant CONTEST_TYPEHASH = keccak256("Contest(bytes32 gameId,uint16 ply)");

    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BOND_RATIO = 2; // bond per chip, in chips. Demo value: production needs at least 3.

    uint96 public immutable CHIP; // wei per chip
    uint40 public immutable DISPUTE; // window to answer a claim
    uint40 public immutable PROOF; // extra window for claimForfeit and reports before exit
    uint40 public immutable MAX_LOCK;

    mapping(address => Vault) public vaults;
    mapping(address => mapping(uint32 => bytes32)) public consumedBy; // player => chip => gameId
    mapping(address => mapping(uint32 => bool)) public slashed;
    mapping(bytes32 => Claim) public claims;

    event Deposited(address indexed player, uint32 chipStart, uint32 chipEnd, uint40 lockUntil, uint96 bond);
    event Withdrawn(address indexed player, uint256 amount);
    event Settled(bytes32 indexed gameId, address indexed winner, address indexed loser, uint32 chip0, uint32 chip1);
    event ResultRecorded(bytes32 indexed gameId, uint16 ply, bytes32 finalPositionHash);
    event Claimed(bytes32 indexed gameId, address indexed claimant, uint16 ply, bytes32 positionHash, uint40 deadline);
    event Contested(bytes32 indexed gameId, address indexed contester, uint16 ply);
    event Slashed(
        address indexed cheater,
        uint32 indexed chip,
        bytes32 conflictingGameId,
        address indexed victim,
        uint256 reward,
        uint256 burned
    );

    error BadPlayers();
    error BadStake();
    error BadSig();
    error BadWinner();
    error BadPly();
    error Expired();
    error ChipOutOfRange();
    error ChipSpent(address owner, uint32 chip, bytes32 gameId);
    error LockTooShort();
    error StillLocked();
    error BadDeposit();
    error BadLock();
    error ClaimExists();
    error NoClaim();
    error ClaimOpen();
    error ClaimOver();
    error NoConflict();
    error AlreadySlashed();
    error TransferFailed();

    constructor(uint96 chip, uint40 dispute, uint40 proof, uint40 maxLock) EIP712("TapMate", "1") {
        CHIP = chip;
        DISPUTE = dispute;
        PROOF = proof;
        MAX_LOCK = maxLock;
    }

    // ---------- vault ----------

    /// @notice Adds `chips` new chip indices plus their bond. lockUntil may only increase.
    function deposit(uint32 chips, uint40 lockUntil) external payable {
        Vault storage v = vaults[msg.sender];
        if (msg.value != uint256(chips) * CHIP * (1 + BOND_RATIO)) revert BadDeposit();
        if (lockUntil < v.lockUntil || lockUntil < block.timestamp || lockUntil > block.timestamp + MAX_LOCK) {
            revert BadLock();
        }
        v.chipEnd += chips;
        v.lockUntil = lockUntil;
        v.bond += uint96(uint256(chips) * CHIP * BOND_RATIO);
        emit Deposited(msg.sender, v.chipStart, v.chipEnd, lockUntil, v.bond);
    }

    /// @notice All-or-nothing exit after lockUntil + DISPUTE + PROOF. Retires every chip index forever.
    function withdraw(address payable to) external {
        Vault storage v = vaults[msg.sender];
        if (block.timestamp <= uint256(v.lockUntil) + DISPUTE + PROOF) revert StillLocked();
        uint256 live = v.chipEnd - v.chipStart - v.consumed;
        uint256 amount = live * CHIP + v.bond;
        v.chipStart = v.chipEnd;
        v.consumed = 0;
        v.bond = 0;
        emit Withdrawn(msg.sender, amount);
        _send(to, amount);
    }

    // ---------- settlement ----------

    /// @notice Redeems a ticket. Anyone may submit it, and the payout always goes to the signed winner.
    /// @dev A voided claim does not block this: the loser's own signature outranks a contest.
    function settle(Wager calldata w, bytes calldata sig0, bytes calldata sig1, Result calldata r) external {
        bytes32 gameId = _checkWager(w, sig0, sig1);
        if (block.timestamp > w.settleBy) revert Expired();
        address loser;
        if (r.winner == w.player0) loser = w.player1;
        else if (r.winner == w.player1) loser = w.player0;
        else revert BadWinner();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RESULT_TYPEHASH, gameId, r.winner, r.ply, r.finalPositionHash))
        );
        _requireSig(loser, digest, r.loserSig);
        emit ResultRecorded(gameId, r.ply, r.finalPositionHash);
        _finish(w, gameId, r.winner);
    }

    // ---------- dispute: the opponent went silent ----------

    /// @notice Starts the forfeit clock. The claimant is whoever signed `p.ply`, never msg.sender.
    /// @dev Needs ply >= 2 so the opponent has provably played. A game gets exactly one claim.
    function claim(Wager calldata w, bytes calldata sig0, bytes calldata sig1, ClaimProof calldata p) external {
        bytes32 gameId = _checkWager(w, sig0, sig1);
        if (block.timestamp > w.settleBy) revert Expired();
        if (p.ply < 2) revert BadPly();
        _requireUnspent(w);
        Claim storage c = claims[gameId];
        if (c.claimant != address(0)) revert ClaimExists();
        bool oddPly = p.ply % 2 == 1;
        address mover = oddPly == w.player0IsWhite ? w.player0 : w.player1;
        address other = mover == w.player0 ? w.player1 : w.player0;
        _requireSig(mover, _moveDigest(gameId, p.ply, p.positionHash), p.moverSig);
        _requireSig(other, _moveDigest(gameId, p.ply - 1, p.prevPositionHash), p.prevSig);
        uint40 deadline = uint40(block.timestamp) + DISPUTE;
        c.claimant = mover;
        c.deadline = deadline;
        c.ply = p.ply;
        emit Claimed(gameId, mover, p.ply, p.positionHash, deadline);
    }

    /// @notice The opponent rejects an open claim, which voids it. Nobody can then win by forfeit.
    /// @dev Chips stay unspent and return at withdrawal. A signed Result can still settle.
    function contest(Wager calldata w, bytes calldata sig) external {
        bytes32 gameId = _hashWager(w);
        Claim storage c = claims[gameId];
        if (c.deadline == 0) revert NoClaim();
        if (block.timestamp > c.deadline) revert ClaimOver();
        address contester = c.claimant == w.player0 ? w.player1 : w.player0;
        _requireSig(contester, _hashTypedDataV4(keccak256(abi.encode(CONTEST_TYPEHASH, gameId, c.ply))), sig);
        c.deadline = 0;
        c.voided = true;
        emit Contested(gameId, contester, c.ply);
    }

    /// @notice Pays the claimant once the answer window has passed with no contest.
    function claimForfeit(Wager calldata w) external {
        bytes32 gameId = _hashWager(w);
        Claim storage c = claims[gameId];
        if (c.deadline == 0) revert NoClaim();
        if (block.timestamp <= c.deadline) revert ClaimOpen();
        c.deadline = 0;
        _finish(w, gameId, c.claimant);
    }

    // ---------- fraud proof ----------

    /// @notice The cheater signed `w` using a chip that a different game already consumed.
    /// @dev The reward, capped at one stake, goes to the opponent named in `w`. The rest is burned.
    function reportDoubleSpend(Wager calldata w, bytes calldata cheaterSig, bool cheaterIsPlayer0) external {
        (address cheater, uint32 chip, address victim) =
            cheaterIsPlayer0 ? (w.player0, w.chip0, w.player1) : (w.player1, w.chip1, w.player0);
        bytes32 gameId = _hashWager(w);
        _requireSig(cheater, gameId, cheaterSig);
        bytes32 spentIn = consumedBy[cheater][chip];
        if (spentIn == bytes32(0) || spentIn == gameId) revert NoConflict();
        if (slashed[cheater][chip]) revert AlreadySlashed();
        slashed[cheater][chip] = true;
        Vault storage v = vaults[cheater];
        uint256 amount = BOND_RATIO * CHIP;
        if (amount > v.bond) amount = v.bond;
        v.bond -= uint96(amount);
        uint256 reward = amount < CHIP ? amount : CHIP;
        emit Slashed(cheater, chip, spentIn, victim, reward, amount - reward);
        _send(BURN, amount - reward);
        _send(victim, reward);
    }

    // ---------- views ----------

    function hashWager(Wager calldata w) external view returns (bytes32) {
        return _hashWager(w);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------- internals ----------

    function _hashWager(Wager calldata w) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    WAGER_TYPEHASH, w.player0, w.player1, w.chip0, w.chip1, w.stake, w.settleBy, w.player0IsWhite
                )
            )
        );
    }

    function _moveDigest(bytes32 gameId, uint16 ply, bytes32 positionHash) private view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(MOVE_TYPEHASH, gameId, ply, positionHash)));
    }

    function _checkWager(Wager calldata w, bytes calldata sig0, bytes calldata sig1)
        private
        view
        returns (bytes32 gameId)
    {
        if (w.player0 >= w.player1) revert BadPlayers();
        if (w.stake != CHIP) revert BadStake();
        gameId = _hashWager(w);
        _requireSig(w.player0, gameId, sig0);
        _requireSig(w.player1, gameId, sig1);
    }

    function _requireSig(address signer, bytes32 digest, bytes calldata sig) private pure {
        if (ECDSA.recover(digest, sig) != signer) revert BadSig(); // rejects high-s and bad length or v
    }

    function _requireUnspent(Wager calldata w) private view {
        bytes32 a = consumedBy[w.player0][w.chip0];
        if (a != bytes32(0)) revert ChipSpent(w.player0, w.chip0, a);
        bytes32 b = consumedBy[w.player1][w.chip1];
        if (b != bytes32(0)) revert ChipSpent(w.player1, w.chip1, b);
    }

    /// @dev Consumes BOTH chips or reverts, so a chip can earn at most one win.
    function _finish(Wager calldata w, bytes32 gameId, address winner) private {
        _requireUnspent(w);
        Vault storage v0 = vaults[w.player0];
        Vault storage v1 = vaults[w.player1];
        if (w.chip0 < v0.chipStart || w.chip0 >= v0.chipEnd || w.chip1 < v1.chipStart || w.chip1 >= v1.chipEnd) {
            revert ChipOutOfRange();
        }
        if (w.settleBy > v0.lockUntil || w.settleBy > v1.lockUntil) revert LockTooShort();
        consumedBy[w.player0][w.chip0] = gameId;
        consumedBy[w.player1][w.chip1] = gameId;
        v0.consumed += 1;
        v1.consumed += 1;
        emit Settled(gameId, winner, winner == w.player0 ? w.player1 : w.player0, w.chip0, w.chip1);
        _send(winner, 2 * uint256(w.stake));
    }

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
