#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAIN_ID="${1:-31337}"
DEP="$ROOT/contracts/deployments/$CHAIN_ID.json"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
API="${API_URL:-http://localhost:8100}"
EXPLORER="${EXPLORER_URL:-}"
TMP=$(mktemp)
cat > "$TMP" <<ENV
PUBLIC_API_URL=$API
PUBLIC_RPC_URL=$RPC
PUBLIC_CHAIN_ID=$CHAIN_ID
PUBLIC_EXPLORER_URL=$EXPLORER
PUBLIC_REGISTRY_ADDRESS=$(jq -r .registry "$DEP")
PUBLIC_VAULT_ADDRESS=$(jq -r .vault "$DEP")
PUBLIC_DATASET_ADDRESS=$(jq -r .dataset "$DEP")
PUBLIC_DATASET_SYMBOL=dCUP-01
PUBLIC_START_BLOCK=$(jq -r .startBlock "$DEP")
PUBLIC_TASK_IDS=grasp-slip-01
ENV
if cmp -s "$TMP" "$ROOT/web/.env.local"; then
  rm -f "$TMP"
  echo "web/.env.local unchanged for chain $CHAIN_ID"
else
  mv "$TMP" "$ROOT/web/.env.local"
  echo "wrote web/.env.local for chain $CHAIN_ID"
fi
