// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DatasetFactory} from "./DatasetFactory.sol";

/// @notice Task budgets and answer commitments.
contract TaskEscrow is Ownable {
    using SafeERC20 for IERC20;

    struct Task {
        address engineer;
        address dataset;
        uint128 payPerItem;
        uint128 remaining;
        uint128 verifierFee;
        uint32 maxPaidPerContributor;
        uint8 quorum;
        uint64 deadline;
        bytes32 clipsRoot;
        bytes32 rulesHash;
    }

    struct TaskParams {
        uint128 budget;
        uint128 payPerItem;
        uint128 verifierFee;
        uint32 maxPaidPerContributor;
        uint8 quorum;
        uint64 deadline;
        bytes32 clipsRoot;
        bytes32 rulesHash;
        string name;
        string symbol;
    }

    IERC20 public immutable usdc;
    DatasetFactory public immutable factory;
    address public registry;
    mapping(bytes32 => Task) private tasks;

    event TaskCreated(
        bytes32 indexed taskId,
        address indexed engineer,
        address dataset,
        uint256 budget,
        uint256 payPerItem,
        bytes32 clipsRoot
    );
    event PaidOut(bytes32 indexed taskId, address indexed to, uint256 amount, uint256 verifierFee);
    event Refunded(bytes32 indexed taskId, uint256 amount);

    error OnlyRegistry();
    error TaskExists();
    error BadParams();
    error NotEngineer();
    error NotExpired();
    error InsufficientBudget();
    error AlreadySet();

    constructor(IERC20 usdc_, DatasetFactory factory_, address owner_) Ownable(owner_) {
        usdc = usdc_;
        factory = factory_;
    }

    function setRegistry(address registry_) external onlyOwner {
        if (registry != address(0)) revert AlreadySet();
        registry = registry_;
    }

    function createTask(bytes32 salt, TaskParams calldata p) external returns (bytes32 taskId) {
        taskId = keccak256(abi.encode(msg.sender, salt));
        if (tasks[taskId].engineer != address(0)) revert TaskExists();
        if (p.quorum < 2 || p.payPerItem == 0 || p.deadline <= block.timestamp || p.clipsRoot == bytes32(0)) {
            revert BadParams();
        }
        usdc.safeTransferFrom(msg.sender, address(this), p.budget);
        address dataset = factory.createDataset(taskId, msg.sender, p.name, p.symbol);
        tasks[taskId] = Task({
            engineer: msg.sender,
            dataset: dataset,
            payPerItem: p.payPerItem,
            remaining: p.budget,
            verifierFee: p.verifierFee,
            maxPaidPerContributor: p.maxPaidPerContributor,
            quorum: p.quorum,
            deadline: p.deadline,
            clipsRoot: p.clipsRoot,
            rulesHash: p.rulesHash
        });
        emit TaskCreated(taskId, msg.sender, dataset, p.budget, p.payPerItem, p.clipsRoot);
    }

    function getTask(bytes32 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function canPay(bytes32 taskId) public view returns (bool) {
        Task storage t = tasks[taskId];
        return t.remaining >= uint256(t.payPerItem) + t.verifierFee;
    }

    function payout(bytes32 taskId, address to, address[] calldata signers) external returns (uint256 paid) {
        if (msg.sender != registry) revert OnlyRegistry();
        Task storage t = tasks[taskId];
        if (!canPay(taskId)) revert InsufficientBudget();
        paid = t.payPerItem;
        uint256 fee = t.verifierFee;
        t.remaining -= uint128(paid + fee);
        usdc.safeTransfer(to, paid);
        if (fee > 0) {
            uint256 each = fee / signers.length;
            for (uint256 i; i < signers.length; ++i) {
                usdc.safeTransfer(signers[i], each);
            }
            uint256 dust = fee - each * signers.length;
            if (dust > 0) t.remaining += uint128(dust);
        }
        emit PaidOut(taskId, to, paid, fee);
    }

    function refund(bytes32 taskId) external {
        Task storage t = tasks[taskId];
        if (msg.sender != t.engineer) revert NotEngineer();
        if (block.timestamp <= t.deadline) revert NotExpired();
        uint256 amount = t.remaining;
        t.remaining = 0;
        usdc.safeTransfer(t.engineer, amount);
        emit Refunded(taskId, amount);
    }
}
