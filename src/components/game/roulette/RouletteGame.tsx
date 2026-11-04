"use client";

import { useEffect, useRef, useState } from "react";
import { api, type PlayerSummary, type SpinResponse } from "@/lib/client/api";
import { betKey, colorOf, PAYOUTS, BET_LABELS, type BetKind, type RouletteBet } from "@/lib/game/roulette";
import { GameShell } from "../GameShell";
import { ChipRack } from "../TicketChip";
import { POCKET_FILL, RouletteWheel, rotationFor, SPIN_MS } from "./RouletteWheel";
import { RouletteTable } from "./RouletteTable";

type Phase = "betting" | "spinning" | "result";
type Placement = { key: string; amount: number };

const total = (bets: Iterable<RouletteBet>) => [...bets].reduce((s, b) => s + b.amount, 0);

export function RouletteGame() {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<Map<string, RouletteBet>>(new Map());
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [lastBets, setLastBets] = useState<RouletteBet[]>([]);
  const [phase, setPhase] = useState<Phase>("betting");
  const [wheelDeg, setWheelDeg] = useState(0);
  const [ballDeg, setBallDeg] = useState(0);
  const [spinId, setSpinId] = useState(0);
  const [outcome, setOutcome] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api
      .roulette()
      .then((d) => {
        setPlayer(d.player);
        setHistory(d.history);
      })
      .catch((e: Error) => setError(e.message));
    return () => clearTimeout(revealTimer.current);
  }, []);

  const staked = total(bets.values());
  const tickets = player?.tickets ?? 0;
  const maxBet = player?.rules.maxBetPerRound ?? Infinity;
  const spinning = phase === "spinning";
  const displayTickets = player ? (phase === "result" ? tickets : tickets - staked) : undefined;

  // After a result, the next action starts a fresh round.
  const freshRound = () => {
    if (phase !== "result") return { current: bets, log: placements };
    setOutcome(null);
    setPhase("betting");
    return { current: new Map<string, RouletteBet>(), log: [] as Placement[] };
  };

  const place = (spot: { kind: BetKind; target: number[] }) => {
    if (spinning || !player) return;
    const { current, log } = freshRound();
    const currentTotal = total(current.values());
    if (currentTotal + chip > tickets) return setError("Not enough Tickets for that bet");
    if (currentTotal + chip > maxBet) return setError(`Max ${maxBet} Tickets per spin`);
    setError(null);
    const key = betKey(spot);
    const next = new Map(current);
    next.set(key, { ...spot, amount: (current.get(key)?.amount ?? 0) + chip });
    setBets(next);
    setPlacements([...log, { key, amount: chip }]);
  };

  const undo = () => {
    const last = placements.at(-1);
    if (!last || phase !== "betting") return;
    const next = new Map(bets);
    const bet = next.get(last.key)!;
    if (bet.amount - last.amount <= 0) next.delete(last.key);
    else next.set(last.key, { ...bet, amount: bet.amount - last.amount });
    setBets(next);
    setPlacements(placements.slice(0, -1));
    setError(null);
  };

  const clear = () => {
    setBets(new Map());
    setPlacements([]);
    setOutcome(null);
    setPhase("betting");
    setError(null);
  };

  const double = () => {
    if (phase !== "betting" || staked === 0) return;
    if (staked * 2 > tickets) return setError("Not enough Tickets to double");
    if (staked * 2 > maxBet) return setError(`Max ${maxBet} Tickets per spin`);
    const next = new Map<string, RouletteBet>();
    const log: Placement[] = [...placements];
    for (const [key, bet] of bets) {
      next.set(key, { ...bet, amount: bet.amount * 2 });
      log.push({ key, amount: bet.amount });
    }
    setBets(next);
    setPlacements(log);
  };

  const rebet = () => {
    const amount = total(lastBets);
    if (!lastBets.length) return;
    if (amount > tickets) return setError("Not enough Tickets to repeat that bet");
    setOutcome(null);
    setPhase("betting");
    setError(null);
    setBets(new Map(lastBets.map((b) => [betKey(b), b])));
    setPlacements(lastBets.map((b) => ({ key: betKey(b), amount: b.amount })));
  };

  const spin = async () => {
    if (phase !== "betting" || staked === 0 || busy) return;
    setBusy(true);
    setError(null);
    const list = [...bets.values()];
    try {
      const res = await api.spin(list);
      setPhase("spinning");
      setSpinId((id) => id + 1);
      setWheelDeg((d) => rotationFor(res.result.number, d));
      setBallDeg((b) => Math.floor(b / 360) * 360 - 3 * 360);
      revealTimer.current = setTimeout(() => {
        setOutcome(res);
        setPlayer(res.player);
        setHistory(res.history);
        setLastBets(list);
        setPhase("result");
      }, SPIN_MS + 150);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const winningKeys = new Set(outcome?.bets.filter((b) => b.won).map((b) => betKey(b)));

  return (
    <GameShell player={player} displayTickets={displayTickets}>
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Wheel + result */}
        <section className="relative overflow-hidden bg-foreground p-5 text-white sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/40 blur-[90px]" />
          <div className="relative flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary-soft">
              European roulette
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">Single zero</p>
          </div>

          <RouletteWheel
            wheelDeg={wheelDeg}
            ballDeg={ballDeg}
            spinId={spinId}
            spinning={spinning}
            className="relative mx-auto my-5 aspect-square w-full max-w-[330px] drop-shadow-[0_20px_40px_rgba(110,84,255,0.35)]"
          />

          <div className="relative min-h-28 border-t border-white/10 pt-5" aria-live="polite">
            {spinning && (
              <p className="font-mono text-sm uppercase tracking-[0.16em] text-white/70">
                No more bets…
              </p>
            )}
            {phase === "result" && outcome && <ResultPanel outcome={outcome} />}
            {phase === "betting" && (
              <p className="font-mono text-sm uppercase tracking-[0.16em] text-white/50">
                {staked > 0 ? "Bets placed — spin when ready" : "Place your bets"}
              </p>
            )}
          </div>

          <div className="relative mt-4 border-t border-white/10 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">Last results</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {history.length === 0 && <span className="text-sm text-white/40">No spins yet</span>}
              {history.slice(0, 14).map((n, i) => (
                <span
                  key={i}
                  className={`flex size-8 items-center justify-center font-mono text-xs font-bold ${
                    i === 0 ? "ring-2 ring-white" : ""
                  }`}
                  style={{
                    background: POCKET_FILL[colorOf(n)],
                    color: n === 0 ? "#0E091C" : "#FFFFFF",
                  }}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Table + controls */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="relative bg-foreground p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
              <span>Click the layout to bet · lines for splits & corners</span>
              <span>Even-money bets lose on 0</span>
            </div>
            <RouletteTable
              bets={bets}
              onPlace={place}
              disabled={spinning || !player}
              winningNumber={phase === "result" ? outcome?.result.number : null}
              winningKeys={winningKeys}
            />
          </div>

          <div className="flex flex-col gap-4 border border-line bg-background p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Ticket value</p>
              <ChipRack selected={chip} available={Math.max(0, tickets - (phase === "result" ? 0 : staked))} disabled={spinning} onSelect={setChip} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ControlButton onClick={undo} disabled={spinning || phase !== "betting" || !placements.length}>Undo</ControlButton>
              <ControlButton onClick={clear} disabled={spinning || (!staked && phase !== "result")}>Clear</ControlButton>
              <ControlButton onClick={double} disabled={spinning || phase !== "betting" || !staked}>2×</ControlButton>
              <ControlButton onClick={rebet} disabled={spinning || !lastBets.length}>Rebet</ControlButton>

              <div className="mx-1 border-l border-line pl-3 text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Total bet</p>
                <p className="font-display text-lg font-semibold tabular-nums">
                  {phase === "result" ? outcome?.totalStaked ?? 0 : staked} <span className="text-sm text-muted">TIX</span>
                </p>
              </div>

              <button
                type="button"
                onClick={spin}
                disabled={phase !== "betting" || !staked || busy}
                className="inline-flex h-12 min-w-32 items-center justify-center bg-primary px-6 font-mono text-sm font-medium uppercase tracking-[0.12em] text-white shadow-[0_8px_30px_-8px_rgba(110,84,255,0.7)] transition-[background-color,transform,opacity] hover:bg-foreground active:scale-[0.97] disabled:opacity-40 disabled:hover:bg-primary"
              >
                {spinning ? "Spinning…" : busy ? "…" : "Spin"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="border-l-2 border-pink bg-pink/10 px-4 py-2 text-sm">
              {error}
            </p>
          )}

          <Payouts />
        </section>
      </div>
    </GameShell>
  );
}

function ResultPanel({ outcome }: { outcome: SpinResponse }) {
  const { number, color } = outcome.result;
  const won = outcome.pointsWon > 0;
  return (
    <div className="pop flex items-center gap-5">
      <span
        className="flex size-16 shrink-0 items-center justify-center font-display text-3xl font-bold"
        style={{ background: POCKET_FILL[color], color: number === 0 ? "#0E091C" : "#FFFFFF" }}
      >
        {number}
      </span>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
          {number === 0 ? "Zero" : `${color === "red" ? "Purple" : "Black"} · ${number % 2 ? "Odd" : "Even"}`}
        </p>
        {won ? (
          <>
            <p className="font-display text-2xl font-semibold text-[#85E6FF]">
              +{outcome.pointsWon.toLocaleString()} Prize Points
            </p>
            <p className="text-sm text-white/60">{outcome.ticketsReturned} Tickets returned</p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-semibold">No win this spin</p>
            <p className="text-sm text-white/60">{outcome.totalStaked} Tickets played</p>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-12 border border-line px-4 font-mono text-xs uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:border-primary hover:text-primary disabled:opacity-35 disabled:hover:border-line disabled:hover:text-foreground/80"
    >
      {children}
    </button>
  );
}

const PAYOUT_ROWS: BetKind[] = ["straight", "split", "street", "corner", "line", "dozen", "column", "red"];

function Payouts() {
  return (
    <details className="group border border-line bg-background">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-mono text-xs uppercase tracking-[0.14em] text-muted">
        Payout table · paid in Prize Points
        <span className="transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        {PAYOUT_ROWS.map((kind) => (
          <div key={kind} className="flex items-center justify-between bg-background px-4 py-3 text-sm">
            <span>{kind === "red" ? "Even money" : BET_LABELS[kind]}</span>
            <span className="font-mono tabular-nums text-primary">{PAYOUTS[kind]}:1</span>
          </div>
        ))}
      </div>
    </details>
  );
}
