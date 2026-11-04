#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${RUN_DIR:-$ROOT/.local}"
mkdir -p "$RUN"

# Public anvil keys, local only.
DEPLOYER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
NODES=(0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6)
RELAYERS=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a,0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba,0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e,0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356,0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

pkill -f "anvil --port 8545" 2>/dev/null || true
pkill -f "trace_verifier.node:app" 2>/dev/null || true
pkill -f "trace_verifier.coordinator:app" 2>/dev/null || true
rm -f "$RUN"/*.db

anvil --port 8545 --block-time "${BLOCK_TIME:-1}" --silent > "$RUN/anvil.log" 2>&1 &
until cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 0.2; done

CLIPS="$ROOT/clips/grasp-slip-01"
CLIPS_ROOT=$(jq -r .clipsRoot "$CLIPS/task.json")
RULES_HASH=$(jq -r .rulesHash "$CLIPS/task.json")
(cd "$ROOT/contracts" && DEPLOYER_KEY=$DEPLOYER NODE1_KEY=${NODES[0]} NODE2_KEY=${NODES[1]} NODE3_KEY=${NODES[2]} \
  CLIPS_ROOT=$CLIPS_ROOT RULES_HASH=$RULES_HASH forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast > "$RUN/deploy.log" 2>&1)
DEP="$ROOT/contracts/deployments/31337.json"
REGISTRY=$(jq -r .registry "$DEP")
TASK_ID=$(jq -r .taskId "$DEP")

cd "$ROOT/verifier"
for i in 0 1 2; do
  NODE_KEY=${NODES[$i]} CHAIN_ID=31337 REGISTRY_ADDRESS=$REGISTRY TASK_ID=$TASK_ID PHYSICS_DIR=$CLIPS CLIPS_ROOT=$CLIPS_ROOT \
  NODE_DB="$RUN/node$((i+1)).db" uv run uvicorn trace_verifier.node:app --port $((8101+i)) --log-level warning > "$RUN/node$((i+1)).log" 2>&1 &
done
for p in 8101 8102 8103; do until curl -sf localhost:$p/health >/dev/null; do sleep 0.2; done; done

RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 RELAYER_KEYS=$RELAYERS NODE_URLS=http://127.0.0.1:8101,http://127.0.0.1:8102,http://127.0.0.1:8103 \
DB_PATH="$RUN/coordinator.db" CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5200,http://localhost:5201}" \
uv run uvicorn trace_verifier.coordinator:app --host 0.0.0.0 --port 8100 --log-level warning > "$RUN/coordinator.log" 2>&1 &
until curl -sf localhost:8100/health >/dev/null; do sleep 0.2; done
echo "coordinator http://localhost:8100 · nodes 8101-8103 · anvil 8545 · logs in $RUN"
