# Trace contracts

Foundry project: `TaskEscrow`, `AttemptRegistry`, `DatasetFactory`, `DatasetToken`, `DataVault`, `TraceToken`, `VerifierStaking`, `MockUSDC`.

## Setup

```sh
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge test
```

## Deploy

`script/Deploy.s.sol` deploys every contract, stakes three verifier nodes, funds `grasp-slip-01`, and writes `deployments/<chainId>.json`.

| Env | Meaning |
|---|---|
| `DEPLOYER_KEY` | Pays for deployment and funds the task |
| `NODE1_KEY` `NODE2_KEY` `NODE3_KEY` | Verifier node keys; each stakes 100 TRACE |
| `CLIPS_ROOT` `RULES_HASH` | From `clips/grasp-slip-01/task.json` |
| `USDC_ADDRESS` | Optional. Unset deploys `MockUSDC`, labelled test USDC |
| `TASK_BUDGET` `PAY_PER_ITEM` `MAX_PER_CONTRIBUTOR` | Optional. Defaults 100 USDC, 0.05 USDC, 20 |
| `NODE_GAS_WEI` | Optional. MON sent to each node key, default 0.05 |

```sh
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --broadcast
```
