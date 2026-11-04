// Runs the full Smem flow on the deployed contracts: faucet, deposit, earn Tickets, play, withdraw.
// Run after npm run deploy: npm run smoke
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, getAddress, parseUnits, type Hash } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(await readFile(path.resolve(here, "../../src/contracts/deployment.json"), "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const me = wallet.account.address;

const usdc = await viem.getContractAt("MockUSDC", getAddress(deployment.contracts.MockUSDC.address));
const vault = await viem.getContractAt("SmemVault", getAddress(deployment.contracts.SmemVault.address));
const game = await viem.getContractAt("HexGame", getAddress(deployment.contracts.HexGame.address));

const explorer = "https://testnet.monadexplorer.com/tx/";
async function step(label: string, send: Promise<Hash>) {
  const hash = await send;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`✔ ${label.padEnd(10)} ${explorer}${hash}`);
  return receipt;
}
const tickets = async () => formatUnits(await vault.read.ticketsOf([me]), 18);

await step("faucet", usdc.write.faucet());
await step("approve", usdc.write.approve([vault.address, parseUnits("1000", 6)]));
await step("deposit", vault.write.deposit([parseUnits("1000", 6)]));
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} USDC`);

console.log("  waiting for the first full day to end…");
const deadline = Date.now() + 60_000;
while ((await vault.read.ticketsOf([me])) === 0n) {
  if (Date.now() > deadline) throw new Error("No Tickets after 60 seconds.");
  await new Promise((r) => setTimeout(r, 2_000));
}
console.log(`  tickets:   ${await tickets()}`);

// Open a day if the last one is drawn, then stake 1 Ticket on hex 3 and draw with the demo switch on.
let round = await game.read.currentRoundId();
if ((await game.read.getRound([round]))[4]) {
  await step("next day", game.write.nextDay({ gas: 800_000n }));
  round = await game.read.currentRoundId();
}
await step("play", game.write.play([3, 1n, true], { gas: 1_500_000n }));
const [crowd, totals, yieldPool, winningHex, , forced, paid, fee] = await game.read.getRound([round]);
console.log(`  day ${round}: crowd ${crowd.join(", ")}`);
console.log(`  hex ${winningHex} won (forced: ${forced}). Yield ${formatUnits(yieldPool, 6)} USDC, fee ${formatUnits(fee, 6)}`);
console.log(`  this wallet had 1 of ${totals[2]} Tickets on hex 3 and won ${formatUnits(paid, 6)} USDC`);

await step("withdraw", vault.write.withdraw([parseUnits("1000", 6)]));
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} USDC`);
console.log(`  wallet:    ${formatUnits(await usdc.read.balanceOf([me]), 6)} USDC`);
