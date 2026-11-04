// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {TaskEscrow} from "./TaskEscrow.sol";
import {VerifierStaking} from "./VerifierStaking.sol";
import {DatasetToken} from "./DatasetToken.sol";

/// @notice Records attestations; pays on quorum.
contract AttemptRegistry is EIP712 {
    struct Attestation {
        bytes32 taskId;
        bytes32 itemId;
        address contributor;
        bytes32 contentHash;
        uint8 kind;
        bool passed;
        uint16 score;
        uint64 deadline;
    }

    struct Stats {
        uint32 submitted;
        uint32 passed;
        uint64 lastAt;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 taskId,bytes32 itemId,address contributor,bytes32 contentHash,uint8 kind,bool passed,uint16 score,uint64 deadline)"
    );
    uint256 public constant TOKENS_PER_CONTRIBUTION = 1e18;

    TaskEscrow public immutable escrow;
    VerifierStaking public immutable staking;

    mapping(bytes32 => bool) public seen;
    mapping(address => Stats) public stats;
    mapping(bytes32 => mapping(address => uint32)) public paidCount;

    event AttemptRecorded(
        bytes32 indexed attemptId,
        bytes32 indexed taskId,
        address indexed contributor,
        bytes32 itemId,
        uint8 kind,
        bool passed,
        uint16 score,
        bytes32 contentHash,
        uint256 paid
    );

    error Expired();
    error AlreadyRecorded();
    error UnknownTask();
    error TaskClosed();
    error SignersNotAscending();
    error InactiveSigner(address signer);
    error QuorumNotMet(uint256 got, uint256 need);

    constructor(TaskEscrow escrow_, VerifierStaking staking_) EIP712("Trace", "1") {
        escrow = escrow_;
        staking = staking_;
    }

    function attemptId(bytes32 taskId, bytes32 itemId, address contributor) public pure returns (bytes32) {
        return keccak256(abi.encode(taskId, itemId, contributor));
    }

    function digest(Attestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.taskId,
                    a.itemId,
                    a.contributor,
                    a.contentHash,
                    a.kind,
                    a.passed,
                    a.score,
                    a.deadline
                )
            )
        );
    }

    function record(Attestation calldata a, bytes[] calldata sigs) external {
        if (block.timestamp > a.deadline) revert Expired();
        bytes32 id = attemptId(a.taskId, a.itemId, a.contributor);
        if (seen[id]) revert AlreadyRecorded();

        TaskEscrow.Task memory task = escrow.getTask(a.taskId);
        if (task.engineer == address(0)) revert UnknownTask();
        if (block.timestamp > task.deadline) revert TaskClosed();

        address[] memory signers = _verify(a, sigs, task.quorum);
        seen[id] = true;

        Stats storage s = stats[a.contributor];
        s.submitted += 1;
        s.lastAt = uint64(block.timestamp);

        uint256 paid;
        if (a.passed) {
            s.passed += 1;
            if (paidCount[a.taskId][a.contributor] < task.maxPaidPerContributor && escrow.canPay(a.taskId)) {
                paidCount[a.taskId][a.contributor] += 1;
                paid = escrow.payout(a.taskId, a.contributor, signers);
                DatasetToken(task.dataset).mint(a.contributor, TOKENS_PER_CONTRIBUTION);
                DatasetToken(task.dataset).mint(task.engineer, TOKENS_PER_CONTRIBUTION);
            }
        }

        emit AttemptRecorded(id, a.taskId, a.contributor, a.itemId, a.kind, a.passed, a.score, a.contentHash, paid);
    }

    function _verify(Attestation calldata a, bytes[] calldata sigs, uint8 quorum)
        private
        view
        returns (address[] memory signers)
    {
        if (sigs.length < quorum) revert QuorumNotMet(sigs.length, quorum);
        bytes32 h = digest(a);
        signers = new address[](sigs.length);
        address last;
        for (uint256 i; i < sigs.length; ++i) {
            address signer = ECDSA.recover(h, sigs[i]);
            if (signer <= last) revert SignersNotAscending();
            if (!staking.isActive(signer)) revert InactiveSigner(signer);
            signers[i] = signer;
            last = signer;
        }
    }
}
