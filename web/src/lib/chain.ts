import { createPublicClient, defineChain, http, parseAbi, type Address, type PublicClient } from "viem";
import { config } from "./config";

export const registryAbi = parseAbi([
  "event AttemptRecorded(bytes32 indexed attemptId, bytes32 indexed taskId, address indexed contributor, bytes32 itemId, uint8 kind, bool passed, uint16 score, bytes32 contentHash, uint256 paid)",
  "function stats(address) view returns (uint32 submitted, uint32 passed, uint64 lastAt)",
]);

export const vaultAbi = parseAbi(["event Licensed(address indexed dataset, address indexed buyer, uint256 amount)"]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

let client: PublicClient | null = null;

export function publicClient(): PublicClient {
  if (!client) {
    const chain = defineChain({
      id: config.chainId,
      name: config.chainId === 10143 ? "Monad Testnet" : `Chain ${config.chainId}`,
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  }
  return client;
}

export async function balanceOf(token: Address, owner: Address): Promise<bigint> {
  return publicClient().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}
