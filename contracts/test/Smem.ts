import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseUnits } from "viem";

const USDC = (n: string) => parseUnits(n, 6);
const TICKET = 10n ** 18n;
const DAY = 10n; // 1 day = 10 seconds, like the demo.
const ROUND = 30n; // A game round lasts 30 seconds from the first stake.

describe("Smem", async function () {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice, bob] = await viem.getWalletClients();

  // Moves the chain to the first second of the next day.
  async function toNextDay() {
    const now = BigInt(await networkHelpers.time.latest());
    await networkHelpers.time.increaseTo((now / DAY + 1n) * DAY);
  }

  async function setup() {
    const usdc = await viem.deployContract("MockUSDC");
    // 1 Ticket per 1 USDC per day.
    const vault = await viem.deployContract("SmemVault", [usdc.address, 6, TICKET, DAY, owner.account.address]);
    // Yield pool per round: 1 to 10 USDC. Fee goes to the owner.
    const game = await viem.deployContract("HexGame", [
      vault.address,
      usdc.address,
      owner.account.address,
      USDC("1"),
      USDC("10"),
      5n,
      60n,
    ]);
    await vault.write.setGame([game.address, true]);
    // Fund the prize reserve with 1,000 USDC.
    await usdc.write.faucet();
    await usdc.write.transfer([game.address, USDC("1000")]);

    await usdc.write.faucet({ account: alice.account });
    await usdc.write.approve([vault.address, USDC("1000")], { account: alice.account });
    return { usdc, vault, game };
  }

  // Deposits at the start of a day, then waits until the deposit has held for one full day.
  async function depositAndEarnOneDay(vault: Awaited<ReturnType<typeof setup>>["vault"], amount: string) {
    await toNextDay();
    await vault.write.deposit([USDC(amount)], { account: alice.account });
    await toNextDay(); // The deposit day ends. It pays nothing, because the day did not start with the deposit.
    await toNextDay(); // The first full day ends.
  }

  it("keeps the deposit as principal", async function () {
    const { usdc, vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });

    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
    assert.equal(await vault.read.totalPrincipal(), USDC("100"));
    assert.equal(await usdc.read.balanceOf([vault.address]), USDC("100"));
  });

  it("gives Tickets only when a full day ends", async function () {
    const { vault } = await setup();
    await toNextDay();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    const aliceAddr = alice.account.address;

    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);
    assert.equal(await vault.read.ticketsPerDayOf([aliceAddr]), 100n * TICKET);
    // The deposit day did not start with the deposit, so it pays nothing.
    assert.equal(await vault.read.ticketsAtDayEndOf([aliceAddr]), 0n);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);
    assert.equal(await vault.read.ticketsAtDayEndOf([aliceAddr]), 100n * TICKET);

    // Halfway through the day, nothing new arrives.
    await networkHelpers.time.increase(5);
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 100n * TICKET);

    await toNextDay();
    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 300n * TICKET);
  });

  it("pays the lowest balance of a day after a withdrawal", async function () {
    const { vault } = await setup();
    await depositAndEarnOneDay(vault, "100");
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);

    // Withdraw half during the day. This day now pays 50.
    await vault.write.withdraw([USDC("50")], { account: alice.account });
    assert.equal(await vault.read.ticketsAtDayEndOf([alice.account.address]), 50n * TICKET);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 150n * TICKET);
  });

  it("opens day 1 with a random yield pool and a random crowd on every hex", async function () {
    const { game } = await setup();
    assert.equal(await game.read.currentRoundId(), 1n);
    const [crowd, totals, yieldPool, winningHex, settled] = await game.read.getRound([1n]);
    assert.ok(yieldPool >= USDC("1") && yieldPool <= USDC("10"));
    for (let h = 0; h < 6; h++) {
      assert.ok(crowd[h] >= 5n && crowd[h] <= 60n);
      assert.equal(totals[h], crowd[h]);
    }
    assert.equal(winningHex, 0);
    assert.equal(settled, false);
  });

  it("burns staked Tickets, and a forced draw pays the pool share of the winning hex", async function () {
    const { usdc, vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");
    const me = alice.account.address;

    await game.write.stake([3, 10n], { account: alice.account });
    assert.equal(await vault.read.ticketsOf([me]), 90n * TICKET);
    const [crowd, totals, yieldPool] = await game.read.getRound([1n]);
    assert.equal(totals[2], crowd[2] + 10n);

    const before = await usdc.read.balanceOf([me]);
    const treasuryBefore = await usdc.read.balanceOf([owner.account.address]);
    await game.write.draw([true], { account: alice.account });

    const [, , , winningHex, settled, forced, paid, fee] = await game.read.getRound([1n]);
    assert.equal(winningHex, 3);
    assert.equal(settled, true);
    assert.equal(forced, true);
    assert.equal(fee, (yieldPool * 500n) / 10_000n);
    const expected = ((yieldPool - fee) * 10n) / totals[2];
    assert.equal(paid, expected);
    assert.equal(await usdc.read.balanceOf([me]), before + expected);
    assert.equal(await usdc.read.balanceOf([owner.account.address]), treasuryBefore + fee);
    assert.equal(await game.read.wonInRound([1n, me]), expected);
    assert.equal(await vault.read.principalOf([me]), USDC("100"));
  });

  it("play stakes and draws in one transaction", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");
    await game.write.play([5, 4n, true], { account: alice.account });
    const [crowd, totals, yieldPool, winningHex, settled, forced, paid, fee] = await game.read.getRound([1n]);
    assert.equal(winningHex, 5);
    assert.equal(settled && forced, true);
    assert.equal(totals[4], crowd[4] + 4n);
    assert.equal(paid, ((yieldPool - fee) * 4n) / totals[4]);
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 96n * TICKET);
  });

  it("playMany stakes on several hexes in one transaction and pays the winning hex share", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");
    await game.write.playMany([[0n, 3n, 0n, 10n, 0n, 0n], true], { account: alice.account });
    const [crowd, totals, yieldPool, winningHex, settled, , paid, fee] = await game.read.getRound([1n]);
    assert.equal(settled, true);
    assert.equal(winningHex, 4); // The forced hex is where Alice staked the most.
    assert.equal(totals[1], crowd[1] + 3n);
    assert.equal(totals[3], crowd[3] + 10n);
    assert.equal(paid, ((yieldPool - fee) * 10n) / totals[3]);
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 87n * TICKET);
  });

  it("stays on the result until nextDay, which opens a new random day", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");

    await viem.assertions.revertWithCustomError(game.write.nextDay(), game, "DayNotDrawn");
    await game.write.stake([1, 1n], { account: alice.account });
    await game.write.draw([false], { account: alice.account });

    // The day is closed. No more stakes or draws until nextDay.
    await viem.assertions.revertWithCustomError(
      game.write.stake([1, 1n], { account: alice.account }),
      game,
      "DayClosed",
    );
    await viem.assertions.revertWithCustomError(game.write.draw([false]), game, "DayClosed");
    await networkHelpers.time.increase(1000);
    assert.equal(await game.read.currentRoundId(), 1n);

    await game.write.nextDay();
    assert.equal(await game.read.currentRoundId(), 2n);
    const [, , , winningHex, settled] = await game.read.getRound([2n]);
    assert.equal(winningHex, 0);
    assert.equal(settled, false);
  });

  it("rejects a stake larger than the Ticket balance", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");

    await viem.assertions.revertWithCustomError(
      game.write.stake([1, 101n], { account: alice.account }),
      vault,
      "InsufficientTickets",
    );
  });

  it("rejects an invalid tile", async function () {
    const { game } = await setup();
    await viem.assertions.revertWithCustomError(
      game.write.stake([7, 1n], { account: alice.account }),
      game,
      "InvalidTile",
    );
  });

  it("stops a non-game address from spending or crediting Tickets", async function () {
    const { vault } = await setup();
    await viem.assertions.revertWithCustomError(
      vault.write.spendTickets([alice.account.address, 1n], { account: bob.account }),
      vault,
      "NotGame",
    );
    await viem.assertions.revertWithCustomError(
      vault.write.creditTickets([bob.account.address, 1n], { account: bob.account }),
      vault,
      "NotGame",
    );
  });

  it("returns principal on withdraw and keeps earned Tickets", async function () {
    const { usdc, vault } = await setup();
    await depositAndEarnOneDay(vault, "100");

    await vault.write.withdraw([USDC("100")], { account: alice.account });

    assert.equal(await usdc.read.balanceOf([alice.account.address]), USDC("1000"));
    assert.equal(await vault.read.principalOf([alice.account.address]), 0n);
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);

    // No principal means no new Tickets.
    await toNextDay();
    await toNextDay();
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);
  });

  it("rejects a withdraw larger than principal", async function () {
    const { vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await viem.assertions.revertWithCustomError(
      vault.write.withdraw([USDC("101")], { account: alice.account }),
      vault,
      "InsufficientPrincipal",
    );
  });
});
