// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TRACE stake per verifier.
contract VerifierStaking is Ownable {
    using SafeERC20 for IERC20;

    struct Stake {
        uint128 amount;
        uint64 unlockAt;
    }

    IERC20 public immutable trace;
    uint256 public immutable minStake;
    uint64 public immutable unstakeDelay;
    mapping(address => Stake) public stakes;

    event Staked(address indexed verifier, uint256 amount);
    event UnstakeRequested(address indexed verifier, uint64 unlockAt);
    event Withdrawn(address indexed verifier, uint256 amount);
    event Slashed(address indexed verifier, uint256 amount, address indexed to);

    error NothingToWithdraw();
    error StillLocked();

    constructor(IERC20 trace_, uint256 minStake_, uint64 unstakeDelay_, address owner_) Ownable(owner_) {
        trace = trace_;
        minStake = minStake_;
        unstakeDelay = unstakeDelay_;
    }

    function stake(uint256 amount) external {
        trace.safeTransferFrom(msg.sender, address(this), amount);
        Stake storage s = stakes[msg.sender];
        s.amount += uint128(amount);
        s.unlockAt = 0;
        emit Staked(msg.sender, amount);
    }

    function requestUnstake() external {
        Stake storage s = stakes[msg.sender];
        s.unlockAt = uint64(block.timestamp) + unstakeDelay;
        emit UnstakeRequested(msg.sender, s.unlockAt);
    }

    function withdraw() external {
        Stake storage s = stakes[msg.sender];
        if (s.amount == 0 || s.unlockAt == 0) revert NothingToWithdraw();
        if (block.timestamp < s.unlockAt) revert StillLocked();
        uint256 amount = s.amount;
        delete stakes[msg.sender];
        trace.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function isActive(address verifier) external view returns (bool) {
        Stake storage s = stakes[verifier];
        return s.unlockAt == 0 && s.amount >= minStake;
    }

    function slash(address verifier, uint256 amount, address to) external onlyOwner {
        Stake storage s = stakes[verifier];
        uint256 cut = amount > s.amount ? s.amount : amount;
        s.amount -= uint128(cut);
        trace.safeTransfer(to, cut);
        emit Slashed(verifier, cut, to);
    }
}
