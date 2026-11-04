// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TraceToken} from "../src/TraceToken.sol";
import {VerifierStaking} from "../src/VerifierStaking.sol";
import {DatasetFactory} from "../src/DatasetFactory.sol";
import {DatasetToken} from "../src/DatasetToken.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {AttemptRegistry} from "../src/AttemptRegistry.sol";
import {DataVault} from "../src/DataVault.sol";

contract TraceTest is Test {
    MockUSDC usdc;
    TraceToken trace;
    VerifierStaking staking;
    DatasetFactory factory;
    TaskEscrow escrow;
    AttemptRegistry registry;
    DataVault vault;

    address owner = makeAddr("owner");
    address engineer = makeAddr("engineer");
    address contributor = makeAddr("contributor");
    address buyer = makeAddr("buyer");

    uint256[3] nodeKeys;
    address[3] nodes;

    bytes32 taskId;
    DatasetToken dataset;

    uint128 constant PAY = 50_000;
    uint256 constant MIN_STAKE = 100e18;

    function setUp() public {
        usdc = new MockUSDC();
        trace = new TraceToken(owner, 1_000_000e18);
        staking = new VerifierStaking(trace, MIN_STAKE, 1 days, owner);
        factory = new DatasetFactory(usdc, owner);
        escrow = new TaskEscrow(usdc, factory, owner);
        registry = new AttemptRegistry(escrow, staking);
        vault = new DataVault(usdc);
        vm.startPrank(owner);
        factory.wire(address(escrow), address(registry), address(vault));
        escrow.setRegistry(address(registry));
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            nodeKeys[i] = uint256(keccak256(abi.encode("node", i)));
            nodes[i] = vm.addr(nodeKeys[i]);
            vm.prank(owner);
            trace.transfer(nodes[i], MIN_STAKE);
            vm.startPrank(nodes[i]);
            trace.approve(address(staking), MIN_STAKE);
            staking.stake(MIN_STAKE);
            vm.stopPrank();
        }

        taskId = _createTask(engineer, "grasp-slip-01", 1_000_000, 0, 3);
        dataset = DatasetToken(escrow.getTask(taskId).dataset);
    }

    function _createTask(address who, bytes32 salt, uint128 budget, uint128 fee, uint32 cap) internal returns (bytes32 id) {
        usdc.mint(who, budget);
        vm.startPrank(who);
        usdc.approve(address(escrow), budget);
        id = escrow.createTask(
            salt,
            TaskEscrow.TaskParams({
                budget: budget,
                payPerItem: PAY,
                verifierFee: fee,
                maxPaidPerContributor: cap,
                quorum: 2,
                deadline: uint64(block.timestamp + 1 days),
                clipsRoot: keccak256("clips"),
                rulesHash: keccak256("rules"),
                name: "Cup slip 01",
                symbol: "dCUP-01"
            })
        );
        vm.stopPrank();
    }

    function _att(bytes32 task, string memory clip, address who, bool passed) internal view returns (AttemptRegistry.Attestation memory) {
        return AttemptRegistry.Attestation({
            taskId: task,
            itemId: keccak256(bytes(clip)),
            contributor: who,
            contentHash: keccak256(abi.encode(clip, who)),
            kind: 0,
            passed: passed,
            score: passed ? 6000 : 0,
            deadline: uint64(block.timestamp + 5 minutes)
        });
    }

    function _sign(AttemptRegistry.Attestation memory a, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.digest(a));
        return abi.encodePacked(r, s, v);
    }

    function _sorted(uint256 i, uint256 j) internal view returns (uint256, uint256) {
        return nodes[i] < nodes[j] ? (i, j) : (j, i);
    }

    function _sigs(AttemptRegistry.Attestation memory a, uint256 i, uint256 j) internal view returns (bytes[] memory sigs) {
        (uint256 lo, uint256 hi) = _sorted(i, j);
        sigs = new bytes[](2);
        sigs[0] = _sign(a, nodeKeys[lo]);
        sigs[1] = _sign(a, nodeKeys[hi]);
    }

    function test_twoOfThreePaysMintsAndRecords() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes32 id = registry.attemptId(taskId, a.itemId, contributor);
        vm.expectEmit(true, true, true, true, address(registry));
        emit AttemptRegistry.AttemptRecorded(id, taskId, contributor, a.itemId, 0, true, 6000, a.contentHash, PAY);
        registry.record(a, _sigs(a, 0, 2));

        assertEq(usdc.balanceOf(contributor), PAY);
        assertEq(dataset.balanceOf(contributor), 1e18);
        assertEq(dataset.balanceOf(engineer), 1e18);
        assertEq(escrow.getTask(taskId).remaining, 1_000_000 - PAY);
        (uint32 submitted, uint32 passed,) = registry.stats(contributor);
        assertEq(submitted, 1);
        assertEq(passed, 1);
        assertTrue(registry.seen(id));
    }

    function test_failedAttestationRecordsWithoutPaying() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, false);
        registry.record(a, _sigs(a, 0, 1));
        assertEq(usdc.balanceOf(contributor), 0);
        assertEq(dataset.totalSupply(), 0);
        (uint32 submitted, uint32 passed,) = registry.stats(contributor);
        assertEq(submitted, 1);
        assertEq(passed, 0);
    }

    function test_revertsOnDuplicateSigner() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _sign(a, nodeKeys[0]);
        sigs[1] = _sign(a, nodeKeys[0]);
        vm.expectRevert(AttemptRegistry.SignersNotAscending.selector);
        registry.record(a, sigs);
    }

    function test_revertsOnUnstakedSigner() public {
        uint256 rogueKey = uint256(keccak256("rogue"));
        address rogue = vm.addr(rogueKey);
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = new bytes[](2);
        bool rogueFirst = rogue < nodes[0];
        sigs[0] = _sign(a, rogueFirst ? rogueKey : nodeKeys[0]);
        sigs[1] = _sign(a, rogueFirst ? nodeKeys[0] : rogueKey);
        vm.expectRevert(abi.encodeWithSelector(AttemptRegistry.InactiveSigner.selector, rogue));
        registry.record(a, sigs);
    }

    function test_revertsBelowQuorum() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _sign(a, nodeKeys[0]);
        vm.expectRevert(abi.encodeWithSelector(AttemptRegistry.QuorumNotMet.selector, 1, 2));
        registry.record(a, sigs);
    }

    function test_revertsOnReplay() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = _sigs(a, 0, 1);
        registry.record(a, sigs);
        vm.expectRevert(AttemptRegistry.AlreadyRecorded.selector);
        registry.record(a, sigs);
    }

    function test_revertsOnTamperedAttestation() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, false);
        bytes[] memory sigs = _sigs(a, 0, 1);
        a.passed = true;
        vm.expectRevert();
        registry.record(a, sigs);
    }

    function test_revertsAfterSignatureDeadline() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = _sigs(a, 0, 1);
        vm.warp(a.deadline + 1);
        vm.expectRevert(AttemptRegistry.Expired.selector);
        registry.record(a, sigs);
    }

    function test_unstakeRequestDeactivatesSigner() public {
        vm.prank(nodes[1]);
        staking.requestUnstake();
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = _sigs(a, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(AttemptRegistry.InactiveSigner.selector, nodes[1]));
        registry.record(a, sigs);
    }

    function test_capStopsPayButStillRecords() public {
        bytes32 capped = _createTask(engineer, "capped", 1_000_000, 0, 1);
        AttemptRegistry.Attestation memory a1 = _att(capped, "c01", contributor, true);
        registry.record(a1, _sigs(a1, 0, 1));
        AttemptRegistry.Attestation memory a2 = _att(capped, "c02", contributor, true);
        registry.record(a2, _sigs(a2, 0, 1));
        assertEq(usdc.balanceOf(contributor), PAY);
        assertEq(registry.paidCount(capped, contributor), 1);
        (, uint32 passed,) = registry.stats(contributor);
        assertEq(passed, 2);
    }

    function test_exhaustedBudgetRecordsUnpaid() public {
        bytes32 small = _createTask(engineer, "small", PAY, 0, 5);
        AttemptRegistry.Attestation memory a1 = _att(small, "c01", contributor, true);
        registry.record(a1, _sigs(a1, 0, 1));
        AttemptRegistry.Attestation memory a2 = _att(small, "c02", contributor, true);
        registry.record(a2, _sigs(a2, 0, 1));
        assertEq(usdc.balanceOf(contributor), PAY);
        assertEq(escrow.getTask(small).remaining, 0);
    }

    function test_verifierFeeSplitsAcrossSigners() public {
        bytes32 feeTask = _createTask(engineer, "fee", 1_000_000, 10_000, 5);
        AttemptRegistry.Attestation memory a = _att(feeTask, "c01", contributor, true);
        registry.record(a, _sigs(a, 0, 1));
        assertEq(usdc.balanceOf(nodes[0]), 5_000);
        assertEq(usdc.balanceOf(nodes[1]), 5_000);
        assertEq(usdc.balanceOf(nodes[2]), 0);
        assertEq(escrow.getTask(feeTask).remaining, 1_000_000 - PAY - 10_000);
    }

    function test_licenseSplitsProRata() public {
        address other = makeAddr("other");
        AttemptRegistry.Attestation memory a1 = _att(taskId, "c01", contributor, true);
        registry.record(a1, _sigs(a1, 0, 1));
        AttemptRegistry.Attestation memory a2 = _att(taskId, "c02", contributor, true);
        registry.record(a2, _sigs(a2, 1, 2));
        AttemptRegistry.Attestation memory a3 = _att(taskId, "c01", other, true);
        registry.record(a3, _sigs(a3, 0, 2));

        vm.prank(engineer);
        vault.setLicensePrice(address(dataset), 6_000_000);
        usdc.mint(buyer, 6_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 6_000_000);
        vault.license(address(dataset));
        vm.stopPrank();

        assertTrue(vault.isLicensed(address(dataset), buyer));
        assertApproxEqAbs(dataset.claimable(engineer), 3_000_000, 1);
        assertApproxEqAbs(dataset.claimable(contributor), 2_000_000, 1);
        assertApproxEqAbs(dataset.claimable(other), 1_000_000, 1);
        assertLe(dataset.claimable(engineer) + dataset.claimable(contributor) + dataset.claimable(other), 6_000_000);

        uint256 contributorShare = dataset.claimable(contributor);
        uint256 otherShare = dataset.claimable(other);
        vm.prank(contributor);
        dataset.transfer(other, 1e18);
        assertEq(dataset.claimable(contributor), contributorShare);
        assertEq(dataset.claimable(other), otherShare);

        uint256 before = usdc.balanceOf(contributor);
        vm.prank(contributor);
        dataset.claim();
        assertEq(usdc.balanceOf(contributor) - before, contributorShare);
        assertEq(dataset.claimable(contributor), 0);
    }

    function test_claimForPaysOnlyTheHolder() public {
        AttemptRegistry.Attestation memory a = _att(taskId, "c01", contributor, true);
        registry.record(a, _sigs(a, 0, 1));
        vm.prank(engineer);
        vault.setLicensePrice(address(dataset), 4_000_000);
        usdc.mint(buyer, 4_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 4_000_000);
        vault.license(address(dataset));
        vm.stopPrank();

        address relayer = makeAddr("relayer");
        uint256 share = dataset.claimable(contributor);
        uint256 before = usdc.balanceOf(contributor);
        vm.prank(relayer);
        dataset.claimFor(contributor);
        assertEq(usdc.balanceOf(contributor) - before, share);
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(dataset.claimable(contributor), 0);

        vm.prank(relayer);
        dataset.claimFor(contributor);
        assertEq(usdc.balanceOf(contributor) - before, share);
    }

    function test_onlyEngineerSetsPrice() public {
        vm.expectRevert(DataVault.NotEngineer.selector);
        vault.setLicensePrice(address(dataset), 1);
    }

    function test_refundAfterDeadline() public {
        vm.prank(engineer);
        vm.expectRevert(TaskEscrow.NotExpired.selector);
        escrow.refund(taskId);
        vm.warp(block.timestamp + 2 days);
        vm.prank(engineer);
        escrow.refund(taskId);
        assertEq(usdc.balanceOf(engineer), 1_000_000);
    }

    function test_recordRevertsAfterTaskDeadline() public {
        vm.warp(block.timestamp + 1 days + 1);
        AttemptRegistry.Attestation memory a = _att(taskId, "c07", contributor, true);
        bytes[] memory sigs = _sigs(a, 0, 1);
        vm.expectRevert(AttemptRegistry.TaskClosed.selector);
        registry.record(a, sigs);
    }

    function test_slashReducesStakeAndDeactivates() public {
        vm.prank(owner);
        staking.slash(nodes[2], 60e18, owner);
        assertFalse(staking.isActive(nodes[2]));
        assertEq(trace.balanceOf(owner), 1_000_000e18 - 3 * MIN_STAKE + 60e18);
    }
}
