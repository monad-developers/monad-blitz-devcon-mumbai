#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAIN_ID="${CHAIN_ID:-31337}"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
PRICE_USDC="${1:-5}"
DEP="$ROOT/contracts/deployments/$CHAIN_ID.json"
if [ "$CHAIN_ID" = "31337" ]; then
  # Public anvil keys, local only.
  ENGINEER_KEY="${ENGINEER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
  LAB_KEY="${LAB_KEY:-0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6}"
fi
: "${ENGINEER_KEY:?set ENGINEER_KEY}" "${LAB_KEY:?set LAB_KEY}"
USDC=$(jq -r .usdc "$DEP"); VAULT=$(jq -r .vault "$DEP"); DATASET=$(jq -r .dataset "$DEP"); MOCK=$(jq -r .mockUsdc "$DEP")
PRICE=$((PRICE_USDC * 1000000))
LAB=$(cast wallet address "$LAB_KEY")
send() { cast send --rpc-url "$RPC" --private-key "$1" "${@:2}" --json | jq -r '.transactionHash + " status " + .status'; }

echo "set price $PRICE_USDC USDC";   send "$ENGINEER_KEY" "$VAULT" "setLicensePrice(address,uint256)" "$DATASET" "$PRICE"
if [ "$MOCK" = "true" ]; then echo "mint test USDC to lab"; send "$LAB_KEY" "$USDC" "mint(address,uint256)" "$LAB" "$PRICE"; fi
echo "approve vault";                send "$LAB_KEY" "$USDC" "approve(address,uint256)" "$VAULT" "$PRICE"
echo "license $DATASET";             send "$LAB_KEY" "$VAULT" "license(address)" "$DATASET"
SUPPLY=$(cast call "$DATASET" "totalSupply()(uint256)" --rpc-url "$RPC" | cut -d' ' -f1)
echo "licensed by $LAB · fee split across $(cast --from-wei "$SUPPLY") dataset tokens"
