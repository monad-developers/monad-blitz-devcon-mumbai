// Publishes the source of the deployed contracts on the Monad explorer through Sourcify.
// Run after npm run deploy: npm run verify
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(
  await readFile(path.resolve(here, "../../src/contracts/deployment.json"), "utf8"),
);

const targets: Array<[string, unknown[]]> = [
  ["MockUSDC", []],
  ["SmemVault", deployment.constructorArgs.SmemVault],
  ["HexGame", deployment.constructorArgs.HexGame],
];

for (const [name, constructorArgs] of targets) {
  const address = deployment.contracts[name].address;
  console.log(`Verifying ${name} at ${address}`);
  try {
    await verifyContract(
      {
        address,
        constructorArgs,
        contract: `contracts/${name}.sol:${name}`,
        provider: "sourcify",
      },
      hre,
    );
  } catch (error) {
    console.error(`  ${name} failed: ${(error as Error).message}`);
  }
}
