#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.testnet}"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy .env.testnet.example)"; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${MONAD_RPC_URL:?}" "${CHAIN_ID:?}" "${DEPLOYER_KEY:?}" "${NODE1_KEY:?}" "${NODE2_KEY:?}" "${NODE3_KEY:?}" "${RELAYER_KEYS:?}"
RUN="${RUN_DIR:-$ROOT/.testnet}"
mkdir -p "$RUN"
CLIPS="$ROOT/clips/grasp-slip-01"
CLIPS_ROOT=$(jq -r .clipsRoot "$CLIPS/task.json")
RULES_HASH=$(jq -r .rulesHash "$CLIPS/task.json")
DEP="$ROOT/contracts/deployments/$CHAIN_ID.json"

[ "$(cast chain-id --rpc-url "$MONAD_RPC_URL")" = "$CHAIN_ID" ] || { echo "RPC is not chain $CHAIN_ID"; exit 1; }

if [ ! -f "$DEP" ] || [ "${REDEPLOY:-0}" = "1" ]; then
  echo "deploying to chain ${CHAIN_ID}…"
  (cd "$ROOT/contracts" && CLIPS_ROOT=$CLIPS_ROOT RULES_HASH=$RULES_HASH \
    forge script script/Deploy.s.sol --rpc-url "$MONAD_RPC_URL" --broadcast --slow > "$RUN/deploy.log" 2>&1) \
    || { echo "deploy failed, see $RUN/deploy.log"; exit 1; }
fi
REGISTRY=$(jq -r .registry "$DEP")
TASK_ID=$(jq -r .taskId "$DEP")
ONCHAIN_ROOT=$(cast call "$(jq -r .escrow "$DEP")" "getTask(bytes32)((address,address,uint128,uint128,uint128,uint32,uint8,uint64,bytes32,bytes32))" "$TASK_ID" --rpc-url "$MONAD_RPC_URL" | tr -d '()' | tr ',' '\n' | sed -n 9p | tr -d ' ')
[ "$ONCHAIN_ROOT" = "$CLIPS_ROOT" ] || { echo "clips/ do not match the deployed clipsRoot ($ONCHAIN_ROOT)"; exit 1; }

MIN_WEI=$(cast to-wei "${RELAYER_MIN_MON:-2}")
for key in ${RELAYER_KEYS//,/ }; do
  addr=$(cast wallet address "$key")
  bal=$(cast balance "$addr" --rpc-url "$MONAD_RPC_URL")
  if [ "$(echo "$bal < $MIN_WEI" | bc)" = "1" ]; then
    echo "funding relayer $addr"
    ETH_PRIVATE_KEY=$DEPLOYER_KEY cast send "$addr" --value "$(echo "$MIN_WEI - $bal" | bc)" --rpc-url "$MONAD_RPC_URL" > /dev/null
  fi
done

pkill -f "trace_verifier.node:app" 2>/dev/null || true
pkill -f "trace_verifier.coordinator:app" 2>/dev/null || true
cd "$ROOT/verifier"
i=0
for key in "$NODE1_KEY" "$NODE2_KEY" "$NODE3_KEY"; do
  i=$((i+1))
  NODE_KEY=$key CHAIN_ID=$CHAIN_ID REGISTRY_ADDRESS=$REGISTRY TASK_ID=$TASK_ID PHYSICS_DIR=$CLIPS CLIPS_ROOT=$CLIPS_ROOT \
  NODE_DB="$RUN/node$i.db" uv run uvicorn trace_verifier.node:app --port $((8100+i)) --log-level warning > "$RUN/node$i.log" 2>&1 &
done
for p in 8101 8102 8103; do until curl -sf localhost:$p/health >/dev/null; do sleep 0.3; done; done
RPC_URL=$MONAD_RPC_URL CHAIN_ID=$CHAIN_ID NODE_URLS=http://127.0.0.1:8101,http://127.0.0.1:8102,http://127.0.0.1:8103 \
DB_PATH="$RUN/coordinator.db" CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5200}" PUBLIC_URL="${PUBLIC_API_URL:-}" \
uv run uvicorn trace_verifier.coordinator:app --host 0.0.0.0 --port 8100 --log-level warning > "$RUN/coordinator.log" 2>&1 &
until curl -sf localhost:8100/health >/dev/null; do sleep 0.3; done
RPC_URL=$MONAD_RPC_URL API_URL="${PUBLIC_API_URL:-http://localhost:8100}" EXPLORER_URL="${EXPLORER_URL:-}" "$ROOT/scripts/web-env.sh" "$CHAIN_ID"
echo "coordinator on :8100 against chain $CHAIN_ID · logs in $RUN"
