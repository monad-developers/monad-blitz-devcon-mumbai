// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {SmemVault} from "./SmemVault.sol";

/// @title HexGame (demo)
/// @notice A daily yield draw on 6 hexes, moved forward by hand for demos.
///         1. Each day opens with a random estimated yield pool and a random crowd of Tickets on every hex.
///         2. Players stake Tickets on hexes. The game spends the staked Tickets.
///         3. A player presses draw. One hex wins at random, weighted by its Tickets: more Tickets, better odds.
///            A demo flag can make the caller's hex win.
///         4. The treasury takes 5%. Each player on the winning hex gets 95% x (their Tickets / all Tickets on it).
///            The simulated crowd's share stays in the reserve.
///         5. The day stays on its result until someone calls nextDay().
/// @dev Testnet demo. The crowd and the yield pool are SIMULATED. The forceMyHex flag exists only for live demos.
///      DEMO RANDOMNESS ONLY. The seed uses block data, which a block producer can influence.
contract HexGame {
    using SafeERC20 for IERC20;

    uint8 public constant TILES = 6;
    uint256 public constant FEE_BPS = 500; // 5%

    SmemVault public immutable vault;
    IERC20 public immutable usdc;
    address public immutable treasury;
    uint256 public immutable minYieldPool;
    uint256 public immutable maxYieldPool;
    uint256 public immutable minCrowd;
    uint256 public immutable maxCrowd;
    uint256 private immutable ticketUnit;

    struct Round {
        uint256[6] crowd; // Simulated Tickets from other players.
        uint256[6] totals; // Crowd plus real stakes, in whole Tickets.
        uint256 yieldPool; // Estimated yield for the day, in USDC.
        uint8 winningHex; // 0 until the draw.
        bool settled;
        bool forced;
        uint256 paidToWinners;
        uint256 fee;
    }

    uint256 public currentRoundId;
    uint256 public lastSettledRound;

    mapping(uint256 roundId => Round) private rounds;
    mapping(uint256 roundId => mapping(uint256 hexIndex => address[])) private stakers;
    mapping(uint256 roundId => mapping(address => uint256[6])) private stakes;
    mapping(uint256 roundId => mapping(address => uint256)) public wonInRound;
    mapping(address => uint256) public usdcWonOf;

    event DayOpened(uint256 indexed roundId, uint256 yieldPool, uint256[6] crowd);
    event Staked(address indexed player, uint256 indexed roundId, uint8 hexId, uint256 tickets);
    event Drawn(
        uint256 indexed roundId, uint8 winningHex, bool forced, uint256 yieldPool, uint256 paidToWinners, uint256 fee
    );
    event Won(address indexed player, uint256 indexed roundId, uint256 amount);

    error InvalidTile();
    error ZeroStake();
    error InvalidConfig();
    error DayClosed();
    error DayNotDrawn();

    constructor(
        SmemVault vault_,
        IERC20 usdc_,
        address treasury_,
        uint256 minYieldPool_,
        uint256 maxYieldPool_,
        uint256 minCrowd_,
        uint256 maxCrowd_
    ) {
        if (minYieldPool_ == 0 || maxYieldPool_ < minYieldPool_ || maxCrowd_ < minCrowd_) revert InvalidConfig();
        vault = vault_;
        usdc = usdc_;
        treasury = treasury_;
        minYieldPool = minYieldPool_;
        maxYieldPool = maxYieldPool_;
        minCrowd = minCrowd_;
        maxCrowd = maxCrowd_;
        ticketUnit = vault_.TICKET_UNIT();
        _openDay();
    }

    // ---------------------------------------------------------------------
    // Play
    // ---------------------------------------------------------------------

    /// @param hexId The hex you pick, from 1 to 6.
    /// @param tickets The number of whole Tickets you stake.
    function stake(uint8 hexId, uint256 tickets) external {
        _stake(hexId, tickets);
    }

    /// @notice Stakes and draws in one transaction.
    /// @param forceMyHex Demo only. When true, the hex where the caller staked the most wins.
    function play(uint8 hexId, uint256 tickets, bool forceMyHex) external {
        _stake(hexId, tickets);
        _draw(forceMyHex);
    }

    /// @notice Stakes on several hexes at once, then draws, in one transaction.
    /// @param tickets Whole Tickets for hex 1 to hex 6. Use 0 to skip a hex.
    /// @param forceMyHex Demo only. When true, the hex where the caller staked the most wins.
    function playMany(uint256[6] calldata tickets, bool forceMyHex) external {
        bool any;
        for (uint256 i = 0; i < TILES; i++) {
            if (tickets[i] > 0) {
                _stake(uint8(i + 1), tickets[i]);
                any = true;
            }
        }
        if (!any) revert ZeroStake();
        _draw(forceMyHex);
    }

    function _stake(uint8 hexId, uint256 tickets) internal {
        if (hexId < 1 || hexId > TILES) revert InvalidTile();
        if (tickets == 0) revert ZeroStake();
        Round storage r = rounds[currentRoundId];
        if (r.settled) revert DayClosed();

        vault.spendTickets(msg.sender, tickets * ticketUnit);

        uint256 i = hexId - 1;
        if (stakes[currentRoundId][msg.sender][i] == 0) stakers[currentRoundId][i].push(msg.sender);
        stakes[currentRoundId][msg.sender][i] += tickets;
        r.totals[i] += tickets;

        emit Staked(msg.sender, currentRoundId, hexId, tickets);
    }

    /// @notice Ends the day and draws the winning hex.
    /// @param forceMyHex Demo only. When true, the hex where the caller staked the most wins.
    function draw(bool forceMyHex) external {
        _draw(forceMyHex);
    }

    function _draw(bool forceMyHex) internal {
        Round storage r = rounds[currentRoundId];
        if (r.settled) revert DayClosed();

        uint8 winning;
        if (forceMyHex) {
            uint256 best;
            uint256[6] storage mine = stakes[currentRoundId][msg.sender];
            for (uint256 i = 0; i < TILES; i++) {
                if (mine[i] > best) {
                    best = mine[i];
                    winning = uint8(i + 1);
                }
            }
        }
        r.forced = winning != 0;
        if (winning == 0) {
            // Weighted draw: a hex with more Tickets has a bigger chance to win.
            uint256 boardTotal;
            for (uint256 i = 0; i < TILES; i++) boardTotal += r.totals[i];
            uint256 ticket = uint256(_seed(currentRoundId, "draw")) % boardTotal;
            for (uint256 i = 0; i < TILES; i++) {
                if (ticket < r.totals[i]) {
                    winning = uint8(i + 1);
                    break;
                }
                ticket -= r.totals[i];
            }
        }
        _settle(currentRoundId, winning);
    }

    /// @notice Opens the next day with a new estimated yield and a new crowd.
    function nextDay() external {
        if (!rounds[currentRoundId].settled) revert DayNotDrawn();
        _openDay();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getRound(uint256 roundId)
        external
        view
        returns (
            uint256[6] memory crowd,
            uint256[6] memory totals,
            uint256 yieldPool,
            uint8 winningHex,
            bool settled,
            bool forced,
            uint256 paidToWinners,
            uint256 fee
        )
    {
        Round storage r = rounds[roundId];
        return (r.crowd, r.totals, r.yieldPool, r.winningHex, r.settled, r.forced, r.paidToWinners, r.fee);
    }

    function stakesOf(uint256 roundId, address player) external view returns (uint256[6] memory) {
        return stakes[roundId][player];
    }

    function currentStakesOf(address player) external view returns (uint256[6] memory) {
        return stakes[currentRoundId][player];
    }

    function prizeReserve() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _openDay() internal {
        currentRoundId++;
        Round storage r = rounds[currentRoundId];
        r.yieldPool = minYieldPool + (uint256(_seed(currentRoundId, "pool")) % (maxYieldPool - minYieldPool + 1));
        uint256 span = maxCrowd - minCrowd + 1;
        for (uint256 i = 0; i < TILES; i++) {
            uint256 c = minCrowd + (uint256(keccak256(abi.encode(_seed(currentRoundId, "crowd"), i))) % span);
            r.crowd[i] = c;
            r.totals[i] = c;
        }
        emit DayOpened(currentRoundId, r.yieldPool, r.crowd);
    }

    function _settle(uint256 roundId, uint8 winning) internal {
        Round storage r = rounds[roundId];
        r.winningHex = winning;
        r.settled = true;
        lastSettledRound = roundId;

        uint256 onHex = r.totals[winning - 1];
        uint256 reserve = usdc.balanceOf(address(this));
        uint256 pool = r.yieldPool > reserve ? reserve : r.yieldPool;
        address[] storage winners = stakers[roundId][winning - 1];

        uint256 paid;
        uint256 fee;
        if (winners.length > 0 && onHex > 0 && pool > 0) {
            fee = (pool * FEE_BPS) / 10_000;
            uint256 forWinners = pool - fee;
            if (fee > 0) usdc.safeTransfer(treasury, fee);
            for (uint256 j = 0; j < winners.length; j++) {
                address player = winners[j];
                uint256 amount = (forWinners * stakes[roundId][player][winning - 1]) / onHex;
                if (amount == 0) continue;
                wonInRound[roundId][player] = amount;
                usdcWonOf[player] += amount;
                paid += amount;
                usdc.safeTransfer(player, amount);
                emit Won(player, roundId, amount);
            }
        }
        r.fee = fee;
        r.paidToWinners = paid;
        emit Drawn(roundId, winning, r.forced, r.yieldPool, paid, fee);
    }

    function _seed(uint256 roundId, string memory salt) internal view returns (bytes32) {
        return keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), block.timestamp, roundId, salt));
    }
}
