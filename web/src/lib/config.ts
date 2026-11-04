import type { Address } from "viem";

const env = import.meta.env;

export const config = {
  apiUrl: (env.PUBLIC_API_URL ?? "").replace(/\/$/, ""),
  rpcUrl: env.PUBLIC_RPC_URL ?? "",
  chainId: Number(env.PUBLIC_CHAIN_ID ?? 0),
  explorerUrl: (env.PUBLIC_EXPLORER_URL ?? "").replace(/\/$/, ""),
  registry: (env.PUBLIC_REGISTRY_ADDRESS ?? "") as Address | "",
  vault: (env.PUBLIC_VAULT_ADDRESS ?? "") as Address | "",
  dataset: (env.PUBLIC_DATASET_ADDRESS ?? "") as Address | "",
  datasetSymbol: env.PUBLIC_DATASET_SYMBOL ?? "dCUP-01",
  startBlock: BigInt(env.PUBLIC_START_BLOCK ?? "0"),
  taskIds: (env.PUBLIC_TASK_IDS ?? "grasp-slip-01").split(",").map((s) => s.trim()).filter(Boolean),
};

export const chainConfigured = Boolean(config.rpcUrl && config.chainId && config.registry);

export function txLink(hash: string): string | null {
  return config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : null;
}

export function shortHex(value: string, head = 6, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function usdc(baseUnits: bigint | string | number): string {
  const n = Number(baseUnits) / 1e6;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
}
