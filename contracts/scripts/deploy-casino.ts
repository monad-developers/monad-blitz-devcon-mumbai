// Deploys TicketRoulette and TicketBlackjack on the current SmemVault and lets them spend and pay Tickets.
// Run after npm run deploy: npm run deploy-casino
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getAddress } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../src/contracts/deployment.json");
const deployment = JSON.parse(await readFile(file, "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const vault = await viem.getContractAt("SmemVault", getAddress(deployment.contracts.SmemVault.address));

const casino: Record<string, { address: string }> = {};
for (const name of ["TicketRoulette", "TicketBlackjack"] as const) {
  const game = await viem.deployContract(name, [vault.address]);
  await publicClient.waitForTransactionReceipt({ hash: await vault.write.setGame([game.address, true]) });
  console.log(`${name}: ${game.address} (allowed in the vault)`);
  casino[name] = { address: game.address };
  try {
    await verifyContract(
      { address: game.address, constructorArgs: [vault.address], contract: `contracts/${name}.sol:${name}`, provider: "sourcify" },
      hre,
    );
  } catch (error) {
    console.error(`  ${name} verify failed: ${(error as Error).message.split("\n")[0]}`);
  }
}

deployment.casino = casino;
await writeFile(file, JSON.stringify(deployment, null, 2) + "\n");
console.log("Wrote casino addresses to deployment.json");
