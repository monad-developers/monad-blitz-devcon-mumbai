import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

const KEY = "trace:burner";
let memoryKey: Hex | null = null;

export type Burner = { address: Address; key: Hex; persisted: boolean };

export function loadBurner(): Burner {
  let key: Hex | null = null;
  let persisted = true;
  try {
    key = localStorage.getItem(KEY) as Hex | null;
    if (!key) {
      key = generatePrivateKey();
      localStorage.setItem(KEY, key);
    }
  } catch {
    persisted = false;
    key = memoryKey ?? generatePrivateKey();
    memoryKey = key;
  }
  return { address: privateKeyToAccount(key).address, key, persisted };
}
