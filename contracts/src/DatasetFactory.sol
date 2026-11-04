// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DatasetToken} from "./DatasetToken.sol";

/// @notice One DatasetToken per task.
contract DatasetFactory is Ownable {
    IERC20 public immutable usdc;
    address public escrow;
    address public registry;
    address public vault;

    event DatasetCreated(bytes32 indexed taskId, address indexed dataset, string symbol);

    error OnlyEscrow();
    error AlreadyWired();

    constructor(IERC20 usdc_, address owner_) Ownable(owner_) {
        usdc = usdc_;
    }

    function wire(address escrow_, address registry_, address vault_) external onlyOwner {
        if (escrow != address(0)) revert AlreadyWired();
        escrow = escrow_;
        registry = registry_;
        vault = vault_;
    }

    function createDataset(bytes32 taskId, address engineer, string calldata name, string calldata symbol)
        external
        returns (address dataset)
    {
        if (msg.sender != escrow) revert OnlyEscrow();
        dataset = address(new DatasetToken(name, symbol, usdc, registry, vault, engineer, taskId));
        emit DatasetCreated(taskId, dataset, symbol);
    }
}
