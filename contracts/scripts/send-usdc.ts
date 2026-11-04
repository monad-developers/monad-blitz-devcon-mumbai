// Mints test USDC to an address. Only the USDC owner (the deployer) can mint.
// Run: TO=0xYourAddress AMOUNT=5000 npm run send-usdc
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";

const to = process.env.TO ?? "";
if (!isAddress(to)) throw new Error("Set TO to a valid address, for example TO=0xabc... npm run send-usdc");
const amount = parseUnits(process.env.AMOUNT ?? "5000", 6);

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(await readFile(path.resolve(here, "../../src/contracts/deployment.json"), "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const usdc = await viem.getContractAt("MockUSDC", getAddress(deployment.contracts.MockUSDC.address));

const hash = await usdc.write.mint([getAddress(to), amount]);
await publicClient.waitForTransactionReceipt({ hash });
console.log(`Minted ${formatUnits(amount, 6)} USDC to ${to}`);
console.log(`https://testnet.monadexplorer.com/tx/${hash}`);
console.log(`Balance of ${to}: ${formatUnits(await usdc.read.balanceOf([getAddress(to)]), 6)} USDC`);
