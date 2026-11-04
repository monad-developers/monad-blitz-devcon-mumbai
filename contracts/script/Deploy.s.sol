// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TraceToken} from "../src/TraceToken.sol";
import {VerifierStaking} from "../src/VerifierStaking.sol";
import {DatasetFactory} from "../src/DatasetFactory.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {AttemptRegistry} from "../src/AttemptRegistry.sol";
import {DataVault} from "../src/DataVault.sol";

/// @notice Deploys, stakes, funds demo task.
contract Deploy is Script {
    uint256 constant MIN_STAKE = 100e18;

    MockUSDC usdc;
    TraceToken trace;
    VerifierStaking staking;
    DatasetFactory factory;
    TaskEscrow escrow;
    AttemptRegistry registry;
    DataVault vault;
    bool mock;
    bytes32 taskId;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        uint256[3] memory nodeKeys = [vm.envUint("NODE1_KEY"), vm.envUint("NODE2_KEY"), vm.envUint("NODE3_KEY")];

        vm.startBroadcast(deployerKey);
        _deploy(vm.addr(deployerKey));
        _fundNodes(nodeKeys);
        _createTask(vm.addr(deployerKey));
        vm.stopBroadcast();

        for (uint256 i; i < 3; ++i) {
            vm.startBroadcast(nodeKeys[i]);
            trace.approve(address(staking), MIN_STAKE);
            staking.stake(MIN_STAKE);
            vm.stopBroadcast();
        }

        _write();
    }

    function _deploy(address deployer) internal {
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        mock = usdcAddress == address(0);
        usdc = mock ? new MockUSDC() : MockUSDC(usdcAddress);
        trace = new TraceToken(deployer, 1_000_000e18);
        staking = new VerifierStaking(trace, MIN_STAKE, 1 days, deployer);
        factory = new DatasetFactory(usdc, deployer);
        escrow = new TaskEscrow(usdc, factory, deployer);
        registry = new AttemptRegistry(escrow, staking);
        vault = new DataVault(usdc);
        factory.wire(address(escrow), address(registry), address(vault));
        escrow.setRegistry(address(registry));
    }

    function _fundNodes(uint256[3] memory nodeKeys) internal {
        uint256 gas = vm.envOr("NODE_GAS_WEI", uint256(0.05 ether));
        for (uint256 i; i < 3; ++i) {
            address node = vm.addr(nodeKeys[i]);
            trace.transfer(node, MIN_STAKE);
            if (node.balance < gas) payable(node).transfer(gas - node.balance);
        }
    }

    function _createTask(address deployer) internal {
        uint128 budget = uint128(vm.envOr("TASK_BUDGET", uint256(100e6)));
        if (mock) usdc.mint(deployer, budget);
        usdc.approve(address(escrow), budget);
        taskId = escrow.createTask(
            keccak256("grasp-slip-01"),
            TaskEscrow.TaskParams({
                budget: budget,
                payPerItem: uint128(vm.envOr("PAY_PER_ITEM", uint256(50_000))),
                verifierFee: 0,
                maxPaidPerContributor: uint32(vm.envOr("MAX_PER_CONTRIBUTOR", uint256(20))),
                quorum: 2,
                deadline: uint64(block.timestamp + 30 days),
                clipsRoot: vm.envBytes32("CLIPS_ROOT"),
                rulesHash: vm.envBytes32("RULES_HASH"),
                name: "Cup slip 01",
                symbol: "dCUP-01"
            })
        );
    }

    function _write() internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "usdc", address(usdc));
        vm.serializeBool(key, "mockUsdc", mock);
        vm.serializeAddress(key, "trace", address(trace));
        vm.serializeAddress(key, "staking", address(staking));
        vm.serializeAddress(key, "factory", address(factory));
        vm.serializeAddress(key, "escrow", address(escrow));
        vm.serializeAddress(key, "registry", address(registry));
        vm.serializeAddress(key, "vault", address(vault));
        vm.serializeAddress(key, "dataset", escrow.getTask(taskId).dataset);
        vm.serializeUint(key, "startBlock", block.number);
        string memory json = vm.serializeBytes32(key, "taskId", taskId);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("deployment written to", path);
    }
}
