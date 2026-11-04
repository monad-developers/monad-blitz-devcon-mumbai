// Deploys MockUSDC, SmemVault and HexGame, then writes the addresses and ABIs for the web app.
// Run: npm run deploy
// Set USDC_ADDRESS to keep an existing MockUSDC, so wallets keep their test USDC.
// Set VAULT_ADDRESS to keep an existing SmemVault, so deposits and Tickets stay. Only HexGame is new.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { getAddress, parseUnits } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../../src/contracts/deployment.json");

// Tickets that 1 USDC earns for 1 full day. 0.01 means 100 USDC earns 1 Ticket per day.
const TICKETS_PER_USDC_PER_DAY = process.env.TICKETS_PER_USDC_PER_DAY ?? "0.01";
// The length of one day in seconds. The demo uses 10 seconds. Production uses 86400.
const DAY_LENGTH_SECONDS = BigInt(process.env.DAY_LENGTH_SECONDS ?? "10");
// The simulated yield pool for each round, in USDC.
const MIN_YIELD_POOL = parseUnits(process.env.MIN_YIELD_POOL ?? "1000", 6);
const MAX_YIELD_POOL = parseUnits(process.env.MAX_YIELD_POOL ?? "5000", 6);
// Simulated Tickets from other players on each hex, per day.
const MIN_CROWD = BigInt(process.env.MIN_CROWD ?? "1");
const MAX_CROWD = BigInt(process.env.MAX_CROWD ?? "20");
// USDC that the deployer sends to HexGame to pay the simulated yield pools.
const PRIZE_RESERVE = parseUnits(process.env.PRIZE_RESERVE ?? "3000000", 6);

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();
const wait = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });

console.log(`Network:  ${networkName} (chain ${chainId})`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`Balance:  ${(await publicClient.getBalance({ address: deployer.account.address })) / 10n ** 15n} mMON`);

type Previous = {
  contracts?: { HexGame?: { address: string } };
  casino?: unknown;
  constructorArgs?: { SmemVault?: unknown[] };
};
let previous: Previous = {};
try {
  previous = JSON.parse(await readFile(outFile, "utf8"));
} catch {
  // No earlier deployment.
}

const startBlock = await publicClient.getBlockNumber();

const usdc = process.env.USDC_ADDRESS
  ? await viem.getContractAt("MockUSDC", getAddress(process.env.USDC_ADDRESS))
  : await viem.deployContract("MockUSDC");
console.log(`MockUSDC:  ${usdc.address}${process.env.USDC_ADDRESS ? " (kept)" : ""}`);

let vaultArgs: unknown[];
let vault;
if (process.env.VAULT_ADDRESS) {
  vault = await viem.getContractAt("SmemVault", getAddress(process.env.VAULT_ADDRESS));
  vaultArgs = previous.constructorArgs?.SmemVault ?? [];
  console.log(`SmemVault: ${vault.address} (kept)`);
} else {
  const ticketRate = parseUnits(TICKETS_PER_USDC_PER_DAY, 18);
  const args = [usdc.address, 6, ticketRate, DAY_LENGTH_SECONDS, deployer.account.address] as const;
  vault = await viem.deployContract("SmemVault", [...args]);
  vaultArgs = [...args];
  console.log(`SmemVault: ${vault.address}`);
}
const dayLength = await vault.read.dayLength();

const gameArgs = [
  vault.address,
  usdc.address,
  deployer.account.address,
  MIN_YIELD_POOL,
  MAX_YIELD_POOL,
  MIN_CROWD,
  MAX_CROWD,
] as const;
const game = await viem.deployContract("HexGame", [...gameArgs]);
console.log(`HexGame:   ${game.address}`);

await wait(await vault.write.setGame([game.address, true]));
console.log("HexGame is allowed to spend Tickets.");

// Turn off the old game when the vault is kept.
const oldGame = previous.contracts?.HexGame?.address;
if (process.env.VAULT_ADDRESS && oldGame && getAddress(oldGame) !== getAddress(game.address)) {
  if (await vault.read.isGame([getAddress(oldGame)])) {
    await wait(await vault.write.setGame([getAddress(oldGame), false]));
    console.log(`Old HexGame ${oldGame} is turned off.`);
  }
}

// Fund the prize reserve. The owner mints test USDC straight to the game.
await wait(await usdc.write.mint([game.address, PRIZE_RESERVE]));
console.log(`Prize reserve: ${PRIZE_RESERVE / 10n ** 6n} USDC`);

async function abiOf(name: string) {
  const artifact = JSON.parse(
    await readFile(path.resolve(here, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8"),
  );
  return artifact.abi;
}

const stringify = (args: readonly unknown[]) => args.map((a) => (typeof a === "bigint" ? a.toString() : a));

const deployment = {
  chainId,
  network: networkName,
  deployedAt: new Date().toISOString(),
  startBlock: startBlock.toString(),
  deployer: deployer.account.address,
  dayLengthSeconds: Number(dayLength),
  constructorArgs: {
    SmemVault: stringify(vaultArgs),
    HexGame: stringify(gameArgs),
  },
  // Keep the Ticket Booster addresses from npm run deploy-casino.
  ...(previous.casino ? { casino: previous.casino } : {}),
  contracts: {
    MockUSDC: { address: usdc.address, abi: await abiOf("MockUSDC") },
    SmemVault: { address: vault.address, abi: await abiOf("SmemVault") },
    HexGame: { address: game.address, abi: await abiOf("HexGame") },
  },
};

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(deployment, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
