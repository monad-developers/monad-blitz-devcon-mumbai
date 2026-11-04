// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Dataset token, pro-rata license fees.
contract DatasetToken is ERC20 {
    using SafeERC20 for IERC20;

    uint256 private constant MAGNITUDE = 2 ** 128;

    IERC20 public immutable usdc;
    address public immutable registry;
    address public immutable vault;
    address public immutable engineer;
    bytes32 public immutable taskId;

    uint256 public magnifiedPerShare;
    mapping(address => int256) private corrections;
    mapping(address => uint256) public withdrawn;

    event Distributed(uint256 amount);
    event Claimed(address indexed holder, uint256 amount);

    error OnlyRegistry();
    error OnlyVault();
    error NoSupply();

    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 usdc_,
        address registry_,
        address vault_,
        address engineer_,
        bytes32 taskId_
    ) ERC20(name_, symbol_) {
        usdc = usdc_;
        registry = registry_;
        vault = vault_;
        engineer = engineer_;
        taskId = taskId_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != registry) revert OnlyRegistry();
        _mint(to, amount);
    }

    function distribute(uint256 usdcAmount) external {
        if (msg.sender != vault) revert OnlyVault();
        uint256 supply = totalSupply();
        if (supply == 0) revert NoSupply();
        magnifiedPerShare += (usdcAmount * MAGNITUDE) / supply;
        emit Distributed(usdcAmount);
    }

    function claimable(address holder) public view returns (uint256) {
        int256 accumulated = int256(magnifiedPerShare * balanceOf(holder)) + corrections[holder];
        return uint256(accumulated) / MAGNITUDE - withdrawn[holder];
    }

    function claim() external {
        _claim(msg.sender);
    }

    function claimFor(address holder) external {
        _claim(holder);
    }

    function _claim(address holder) private {
        uint256 amount = claimable(holder);
        withdrawn[holder] += amount;
        usdc.safeTransfer(holder, amount);
        emit Claimed(holder, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 delta = int256(magnifiedPerShare * value);
        if (from != address(0)) corrections[from] += delta;
        if (to != address(0)) corrections[to] -= delta;
    }
}
