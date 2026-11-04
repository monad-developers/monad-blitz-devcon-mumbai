"use client";

import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";

import { Wordmark } from "@/components/Logo";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatUnits, maxUint256, parseUnits, type Hash } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import {
  DAY_LENGTH,
  hexGame,
  LEGACY_VAULTS,
  legacyVaultAbi,
  TILES,
  TICKET_DECIMALS,
  usdc,
  USDC_DECIMALS,
  vault,
} from "@/lib/contracts";
import { addressUrl, chain, txUrl } from "@/lib/wagmi";

type Busy = null | "connect" | "faucet" | "deposit" | "withdraw" | "play" | "nextDay" | "switch" | "migrate";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  const text = err.shortMessage ?? err.message ?? "Transaction failed.";
  if (/user rejected|denied/i.test(text)) return "You rejected the request in MetaMask.";
  if (/InsufficientTickets/.test(text)) return "You do not have enough Tickets for this stake.";
  if (/InsufficientPrincipal/.test(text)) return "You cannot withdraw more than you saved.";
  if (/provider not found|connector not found/i.test(text)) return "MetaMask is not installed in this browser.";
  return text.split("\n")[0].slice(0, 160);
}

export function SmemApp() {
  // False during server render, true in the browser. Wallet state only exists in the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const write = useWriteContract();
  const publicClient = usePublicClient({ chainId: chain.id });

  const wrongChain = isConnected && chainId !== chain.id;
  const ready = mounted && isConnected && !wrongChain && !!address;

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ label: string; hash: Hash } | null>(null);
  const [amount, setAmount] = useState("100");
  const [tile, setTile] = useState<number>(1);
  // Tickets the player plans to put on each hex before locking in.
  const [plan, setPlan] = useState<string[]>(["", "", "", "", "", ""]);
  const planTickets = plan.map((v) => BigInt(Math.max(0, Math.floor(Number(v) || 0))));
  const planTotal = planTickets.reduce((a, b) => a + b, 0n);
  const planHexes = planTickets.filter((v) => v > 0n).length;
  const setPlanFor = (hexId: number, value: string) =>
    setPlan((p) => p.map((v, i) => (i === hexId - 1 ? value.replace(/[^0-9]/g, "") : v)));
  // After a play, the board spins for 5 seconds before it shows the result.
  const [revealUntil, setRevealUntil] = useState(0);
  const [forceWin, setForceWin] = useState(false);

  // A browser clock that ticks every 100 ms. It stays 0 during the server prerender.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  // The vault splits time into days of DAY_LENGTH seconds. Tickets arrive when a day ends.
  const nowSeconds = Math.floor(now / 1000);
  const dayIndex = Math.floor(nowSeconds / DAY_LENGTH);
  const secondsLeft = DAY_LENGTH - (nowSeconds % DAY_LENGTH);
  const dayProgress = 1 - secondsLeft / DAY_LENGTH;
  const user = address ?? "0x0000000000000000000000000000000000000000";

  const reads = useReadContracts({
    contracts: [
      { ...usdc, functionName: "balanceOf", args: [user] },
      { ...usdc, functionName: "allowance", args: [user, vault.address] },
      { ...vault, functionName: "principalOf", args: [user] },
      { ...vault, functionName: "ticketsOf", args: [user] },
      { ...vault, functionName: "ticketsPerDayOf", args: [user] },
      { ...vault, functionName: "ticketsAtDayEndOf", args: [user] },
      { ...hexGame, functionName: "usdcWonOf", args: [user] },
      { ...hexGame, functionName: "lastSettledRound" },
      { ...vault, functionName: "totalPrincipal" },
      { ...hexGame, functionName: "prizeReserve" },
      { ...hexGame, functionName: "currentRoundId" },
      { ...hexGame, functionName: "currentStakesOf", args: [user] },
      { ...vault, functionName: "currentDay" },
    ],
    // keepPreviousData keeps the old numbers on screen while a new read loads.
    query: { enabled: ready && now > 0, refetchInterval: 2000, placeholderData: keepPreviousData },
  });

  // Read again as soon as a new day starts, so the new Tickets show at once.
  const { refetch } = reads;
  useEffect(() => {
    if (ready && dayIndex > 0) void refetch();
  }, [dayIndex, ready, refetch]);

  const value = (i: number) => (reads.data?.[i]?.result as bigint | undefined) ?? 0n;
  const walletUsdc = value(0);
  const allowance = value(1);
  const principal = value(2);
  const tickets = value(3);
  const ticketsPerDay = value(4);
  const ticketsAtDayEnd = value(5);
  const usdcWon = value(6);
  const lastRound = value(7);
  const totalPrincipal = value(8);
  const prizeReserve = value(9);
  const currentId = value(10);
  const myStakes = (reads.data?.[11]?.result as readonly bigint[] | undefined) ?? ZERO_STAKES;

  // Show new Tickets the moment a day ends. The chain's latest block can lag the browser clock by a second or
  // two, so compare with the day of the block that the read came from, not the time of the read.
  const chainDay = reads.data?.[12]?.result as bigint | undefined;
  const readDay = chainDay !== undefined ? Number(chainDay) : dayIndex;
  const daysSinceRead = Math.max(0, dayIndex - readDay);
  const shownTickets =
    tickets + (daysSinceRead > 0 ? ticketsAtDayEnd + ticketsPerDay * BigInt(daysSinceRead - 1) : 0n);
  // Tickets that build up during the current day and arrive when it ends.
  const eligibleToday = daysSinceRead > 0 ? ticketsPerDay : ticketsAtDayEnd;
  const accruing = Number(formatUnits(eligibleToday, TICKET_DECIMALS)) * dayProgress;

  // The last settled round: which hex won, and what this player got.
  const lastReads = useReadContracts({
    contracts: [
      { ...hexGame, functionName: "getRound", args: [lastRound] },
      { ...hexGame, functionName: "stakesOf", args: [lastRound, user] },
      { ...hexGame, functionName: "wonInRound", args: [lastRound, user] },
      { ...hexGame, functionName: "getRound", args: [currentId] },
    ],
    query: { enabled: ready && now > 0, refetchInterval: 2000, placeholderData: keepPreviousData },
  });
  const myLastWin = (lastReads.data?.[2]?.result as bigint | undefined) ?? 0n;
  const current = currentId > 0n ? (lastReads.data?.[3]?.result as RoundData | undefined) : undefined;

  // The demo day stays open until someone draws, then stays on the result until "Next day".
  const settled = !!current?.[4];

  // Deposits left in older vaults from earlier deploys.
  const legacyReads = useReadContracts({
    contracts: LEGACY_VAULTS.map(
      (address) => ({ address, abi: legacyVaultAbi, functionName: "principalOf", args: [user] }) as const,
    ),
    query: { enabled: ready && now > 0, refetchInterval: 10_000, placeholderData: keepPreviousData },
  });
  const legacy = LEGACY_VAULTS.map((address, i) => ({
    address,
    amount: (legacyReads.data?.[i]?.result as bigint | undefined) ?? 0n,
  })).filter((v) => v.amount > 0n && v.address.toLowerCase() !== vault.address.toLowerCase());
  const legacyTotal = legacy.reduce((sum, v) => sum + v.amount, 0n);

  const toTickets = (v: bigint) => Number(formatUnits(v, TICKET_DECIMALS));
  const wholeTickets = Math.floor(toTickets(tickets));

  async function run(label: Exclude<Busy, null>, action: () => Promise<Hash>) {
    if (!publicClient) return;
    setBusy(label);
    setError(null);
    try {
      const hash = await action();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
      setLastTx({ label, hash });
      await reads.refetch();
      return receipt;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function onConnect() {
    const metaMask = connectors[0];
    if (!metaMask) return setError("MetaMask is not installed in this browser.");
    setBusy("connect");
    setError(null);
    try {
      await connect.mutateAsync({ connector: metaMask, chainId: chain.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSwitch() {
    setBusy("switch");
    setError(null);
    try {
      await switchChain.mutateAsync({ chainId: chain.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const onFaucet = () =>
    run("faucet", () => write.mutateAsync({ ...usdc, functionName: "faucet" }));

  async function onDeposit() {
    const value = safeParse(amount, USDC_DECIMALS);
    if (!value) return setError("Enter an amount greater than 0.");
    if (value > walletUsdc) return setError("Your wallet does not have that much USDC. Get some from the faucet.");
    await run("deposit", async () => {
      if (allowance < value) {
        // One approval lets every later deposit go through in a single transaction.
        const approveHash = await write.mutateAsync({
          ...usdc,
          functionName: "approve",
          args: [vault.address, maxUint256],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }
      return write.mutateAsync({ ...vault, functionName: "deposit", args: [value] });
    });
  }

  // Withdraws from every old vault, then deposits the total into the current vault.
  async function onMigrate() {
    await run("migrate", async () => {
      for (const old of legacy) {
        const hash = await write.mutateAsync({
          address: old.address,
          abi: legacyVaultAbi,
          functionName: "withdraw",
          args: [old.amount],
        });
        await publicClient!.waitForTransactionReceipt({ hash });
      }
      if (allowance < legacyTotal) {
        const approveHash = await write.mutateAsync({
          ...usdc,
          functionName: "approve",
          args: [vault.address, maxUint256],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }
      return write.mutateAsync({ ...vault, functionName: "deposit", args: [legacyTotal] });
    });
    await legacyReads.refetch();
  }

  async function onWithdraw() {
    const value = safeParse(amount, USDC_DECIMALS);
    if (!value) return setError("Enter an amount greater than 0.");
    if (value > principal) return setError("You cannot withdraw more than you saved.");
    await run("withdraw", () => write.mutateAsync({ ...vault, functionName: "withdraw", args: [value] }));
  }

  async function onPlay() {
    if (planTotal === 0n) return setError("Put Tickets on at least one hex.");
    if (Number(planTotal) > wholeTickets) return setError("You do not have enough Tickets for this plan.");
    const receipt = await run("play", () =>
      write.mutateAsync({
        ...hexGame,
        functionName: "playMany",
        args: [planTickets, forceWin],
        gas: 2_000_000n,
      }),
    );
    if (receipt) {
      setRevealUntil(now + 5000);
      setPlan(["", "", "", "", "", ""]);
      await lastReads.refetch();
    }
  }

  // The server opens the next day, so the player does not sign anything.
  async function onNextDay() {
    setBusy("nextDay");
    setError(null);
    try {
      const res = await fetch("/api/next-day", { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The next day did not open.");
      await Promise.all([reads.refetch(), lastReads.refetch()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const usdcText = (v: bigint) => fmt(Number(formatUnits(v, USDC_DECIMALS)));
  const roundTotals = current?.[1] ?? ZERO_STAKES;
  const roundTickets = roundTotals.reduce((a, b) => a + b, 0n);
  const roundPool = current?.[2] ?? 0n;
  const revealing = busy === "play" || now < revealUntil;
  const revealSeconds = Math.max(0, Math.ceil((revealUntil - now) / 1000));
  const showResult = settled && !revealing;
  const rollingHex = revealing ? TILES[Math.floor(now / 120) % TILES.length] : undefined;
  const winningHex = showResult ? current?.[3] : undefined;
  const myTotal = myStakes.reduce((a, b) => a + b, 0n);
  const myOnWinner = winningHex ? myStakes[winningHex - 1] : 0n;
  const winnerTotal = winningHex ? roundTotals[winningHex - 1] : 0n;
  const myShare = winnerTotal > 0n ? Number((myOnWinner * 10_000n) / winnerTotal) / 100 : 0;
  const myWinNow = currentId > 0n && lastRound === currentId ? myLastWin : 0n;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Morney home">
            <Wordmark />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/play"
            className="rounded-full border border-accent/60 px-3 py-1.5 text-xs text-accent-strong hover:bg-accent/10"
          >
            Ticket Boosters
          </Link>
          <span className="hidden rounded-full border border-border px-3 py-1 text-xs text-muted sm:inline">
            Monad Testnet
          </span>
          {!mounted ? null : !isConnected ? (
            <button className="btn-primary" onClick={onConnect} disabled={busy === "connect"}>
              {busy === "connect" ? "Connecting…" : "Connect MetaMask"}
            </button>
          ) : wrongChain ? (
            <button className="btn-primary" onClick={onSwitch} disabled={busy === "switch"}>
              {busy === "switch" ? "Switching…" : "Switch to Monad Testnet"}
            </button>
          ) : (
            <button
              className="rounded-full border border-border bg-surface px-4 py-2 font-mono text-sm hover:border-accent"
              onClick={() => disconnect.mutate({})}
              title="Disconnect"
            >
              {short(address!)}
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="mt-8 text-center sm:mt-12">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Your savings stay safe.
          <br />
          <span className="text-accent-strong">Your Tickets play.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted sm:text-base">
          Deposit USDC. Earn Tickets at the end of every day. Stake Tickets on a hex to win the daily yield pool. A
          loss costs Tickets, never your deposit.
        </p>
      </section>

      {ready && legacyTotal > 0n && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-accent/60 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            You have <span className="font-semibold">{fmt(Number(formatUnits(legacyTotal, USDC_DECIMALS)))} USDC</span>{" "}
            in an old Morney vault from an earlier deploy. Move it to the current vault to earn Tickets.
          </p>
          <button className="btn-primary shrink-0" onClick={onMigrate} disabled={!!busy}>
            {busy === "migrate" ? "Moving…" : "Move to current vault"}
          </button>
        </div>
      )}

      {/* Stats */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wallet" value={ready ? fmt(Number(formatUnits(walletUsdc, USDC_DECIMALS))) : "—"} unit="USDC" />
        <Stat label="Saved" value={ready ? fmt(Number(formatUnits(principal, USDC_DECIMALS))) : "—"} unit="USDC" />
        <Stat
          label="Tickets"
          value={ready ? fmt(toTickets(shownTickets)) : "—"}
          unit={
            ready
              ? `+${fmt(accruing)} building up · ${fmt(toTickets(ticketsPerDay))}/day`
              : "Tickets"
          }
          highlight
        />
        <Stat
          label="Yield won"
          value={ready ? usdcText(usdcWon) : "—"}
          unit="USDC · all time"
        />
      </section>

      {!ready && mounted && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {wrongChain ? "Switch MetaMask to Monad Testnet to continue." : "Connect MetaMask to start saving and playing."}
        </div>
      )}

      {/* Main */}
      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_1.3fr]">
        {/* Savings */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Savings</h3>
            <button className="text-sm text-accent-strong hover:underline disabled:opacity-40" onClick={onFaucet} disabled={!ready || !!busy}>
              {busy === "faucet" ? "Minting…" : "Get 1,000 USDC"}
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">
            Every 100 USDC you hold for a full day earns 1 Ticket when the day ends. Withdraw your full deposit at any
            time.
          </p>

          <label className="mt-5 block text-xs uppercase tracking-wider text-muted" htmlFor="amount">
            Amount (USDC)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="amount"
              inputMode="decimal"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
            />
            <button
              className="rounded-xl border border-border px-3 text-xs text-muted hover:text-foreground disabled:opacity-40"
              disabled={!ready}
              onClick={() => setAmount(formatUnits(walletUsdc, USDC_DECIMALS))}
            >
              MAX
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={onDeposit} disabled={!ready || !!busy}>
              {busy === "deposit" ? "Depositing…" : "Deposit"}
            </button>
            <button className="btn-secondary" onClick={onWithdraw} disabled={!ready || !!busy || principal === 0n}>
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Total saved by everyone" value={`${fmt(Number(formatUnits(totalPrincipal, USDC_DECIMALS)))} USDC`} />
            <Row label="Your Tickets per day" value={fmt(toTickets(ticketsPerDay))} />
            <Row label="Day length (demo)" value={`${DAY_LENGTH} seconds`} />
            <Row label="Yield source" value="Simulated (testnet)" />
          </dl>
        </div>

        {/* Game */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Hex Yield Draw</h3>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
              Day {currentId.toString()} · {revealing ? "drawing" : settled ? "drawn" : "open"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Put Tickets on one or more hexes, then lock in. Five seconds later, one hex wins today&apos;s yield. Everyone on it splits 95% by their share
            of the hex. Morney keeps 5%.
          </p>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-sm text-muted">Today&apos;s total yield (estimate)</span>
            <span className="font-mono text-lg tabular-nums text-accent-strong">{usdcText(roundPool)} USDC</span>
          </div>

          <div className="mt-4 grid grid-cols-3 justify-items-center gap-x-2 gap-y-3">
            {TILES.map((t) => {
              const picked = t === tile;
              const won = winningHex === t;
              const lost = showResult && !won;
              const rolling = rollingHex === t;
              const onHex = roundTotals[t - 1];
              const mine = myStakes[t - 1];
              const planned = planTickets[t - 1];
              return (
                <button
                  key={t}
                  onClick={() => setTile(t)}
                  aria-pressed={picked}
                  aria-label={`Hex ${t}`}
                  className={[
                    "hex grid aspect-[1.15] w-full max-w-28 place-items-center font-semibold transition",
                    rolling
                      ? "hex-rolling bg-accent-strong text-background"
                      : won
                      ? "bg-win text-background"
                      : picked && !showResult
                        ? "bg-accent text-foreground"
                        : lost
                          ? "bg-surface-2 text-muted opacity-50"
                          : "bg-surface-2 text-muted hover:bg-border",
                  ].join(" ")}
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-2xl">{t}</span>
                    <span className="font-mono text-[11px] font-normal opacity-90">{onHex.toLocaleString()} Tickets</span>
                    {mine > 0n && <span className="font-mono text-[10px] font-normal">you {mine.toLocaleString()}</span>}
                    {!settled && planned > 0n && (
                      <span className="font-mono text-[10px] font-semibold">+{planned.toLocaleString()} yours</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            {roundTickets.toLocaleString()} Tickets on the board today · you staked {myTotal.toLocaleString()}
          </p>

          {revealing ? (
            <div aria-live="polite" className="mt-4 rounded-xl border border-accent/60 bg-accent/10 px-4 py-4 text-center text-sm">
              {busy === "play" ? "Confirm in MetaMask, then the draw runs on chain…" : `Drawing the winning hex… ${revealSeconds}s`}
            </div>
          ) : !settled ? (
            <>
              <label className="mt-4 block text-xs uppercase tracking-wider text-muted" htmlFor="stake">
                Tickets on hex {tile} · tap a hex to switch · you have {ready ? wholeTickets.toLocaleString() : "—"}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="stake"
                  inputMode="numeric"
                  className="input"
                  placeholder="0"
                  value={plan[tile - 1]}
                  onChange={(e) => setPlanFor(tile, e.target.value)}
                />
                {[1, 5, 10].map((n) => (
                  <button
                    key={n}
                    className="rounded-xl border border-border px-3 text-xs text-muted hover:text-foreground"
                    onClick={() => setPlanFor(tile, String(Number(plan[tile - 1] || 0) + n))}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>
                  Your plan: {planTotal.toLocaleString()} Ticket{planTotal === 1n ? "" : "s"} on {planHexes} hex
                  {planHexes === 1 ? "" : "es"}
                  {planHexes > 0 &&
                    ` (${planTickets
                      .map((v, i) => (v > 0n ? `hex ${i + 1}: ${v}` : ""))
                      .filter(Boolean)
                      .join(", ")})`}
                </span>
                {planTotal > 0n && (
                  <button className="underline hover:text-foreground" onClick={() => setPlan(["", "", "", "", "", ""])}>
                    Clear
                  </button>
                )}
              </div>
              <button className="btn-primary mt-3 w-full" onClick={onPlay} disabled={!ready || !!busy || planTotal === 0n}>
                {planTotal > 0n
                  ? `Lock in ${planTotal.toLocaleString()} Ticket${planTotal === 1n ? "" : "s"} & draw`
                  : "Put Tickets on a hex to lock in"}
              </button>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={forceWin}
                  onChange={(e) => setForceWin(e.target.checked)}
                />
                Demo: make my hex win
              </label>
            </>
          ) : (
            <div aria-live="polite" className="mt-4 rounded-xl border border-border px-4 py-3 text-sm">
              <div>
                Hex <span className="font-semibold">{winningHex}</span> won today&apos;s{" "}
                <span className="font-mono">{usdcText(roundPool)} USDC</span>
                {current?.[5] ? " (demo: forced)" : ""}.
              </div>
              {myOnWinner > 0n ? (
                <div className="mt-1 text-win">
                  You had {myOnWinner.toLocaleString()} of {winnerTotal.toLocaleString()} Tickets on hex {winningHex} ({myShare}
                  %). You won <span className="font-mono font-semibold">{usdcText(myWinNow)} USDC</span>. It is in your
                  wallet now.
                </div>
              ) : myTotal > 0n ? (
                <div className="mt-1 text-lose">You were not on hex {winningHex}. Your staked Tickets are spent.</div>
              ) : (
                <div className="mt-1 text-muted">You did not stake today.</div>
              )}
              <button className="btn-primary mt-3 w-full" onClick={onNextDay} disabled={!ready || !!busy}>
                {busy === "nextDay" ? "Opening the next day…" : "Next day"}
              </button>
            </div>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Prize reserve (simulated yield)" value={`${usdcText(prizeReserve)} USDC`} />
          </dl>
        </div>
      </section>

      {/* Status */}
      <div aria-live="polite" className="mt-4 min-h-6 text-center text-sm">
        {error ? (
          <span className="text-lose">{error}</span>
        ) : lastTx ? (
          <a className="text-muted hover:text-foreground" href={txUrl(lastTx.hash)} target="_blank" rel="noreferrer">
            Last transaction ({lastTx.label}) confirmed on Monad: <span className="font-mono">{short(lastTx.hash)}</span> ↗
          </a>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ContractLink name="SmemVault" address={vault.address} />
          <ContractLink name="HexGame" address={hexGame.address} />
          <ContractLink name="USDC" address={usdc.address} />
        </div>
        <p className="mt-3">
          Testnet demo. This USDC is a test token with no value. The hex draw uses block data and is not safe for real prizes.
        </p>
      </footer>
    </div>
  );
}

// getRound: crowd, totals, yieldPool, winningHex, settled, forced, paidToWinners, fee
type RoundData = readonly [readonly bigint[], readonly bigint[], bigint, number, boolean, boolean, bigint, bigint];
const ZERO_STAKES: readonly bigint[] = [0n, 0n, 0n, 0n, 0n, 0n];

function safeParse(value: string, decimals: number) {
  try {
    const parsed = parseUnits(value.trim() || "0", decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`border p-4 ${highlight ? "border-accent bg-accent/5" : "border-border bg-background/80"}`}>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{unit}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ContractLink({ name, address }: { name: string; address: string }) {
  return (
    <a className="hover:text-foreground" href={addressUrl(address)} target="_blank" rel="noreferrer">
      {name}: <span className="font-mono">{short(address)}</span> ↗
    </a>
  );
}
