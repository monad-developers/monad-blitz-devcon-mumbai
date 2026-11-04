// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Test USDC for Monad Testnet. It has no value.
/// @dev Anyone can call faucet() to get test tokens for the demo. The owner can mint any amount,
///      for example to fund the simulated yield reserve.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000e6;
    address public immutable owner;

    error NotOwner();

    constructor() ERC20("USDC", "USDC") {
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints 1,000 USDC to the caller.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
