"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BlackjackView, type PlayerSummary } from "@/lib/client/api";
import type { Action, HandResult, PublicBlackjackState } from "@/lib/game/blackjack";
import { GameShell } from "../GameShell";
import { ChipRack, TicketChip } from "../TicketChip";
import { PlayingCard } from "./PlayingCard";

const DEALER_STEP_MS = 450;

const RESULT_COPY: Record<HandResult, { label: string; tone: string }> = {
  blackjack: { label: "Blackjack!", tone: "bg-[#85E6FF] text-foreground" },
  win: { label: "Win", tone: "bg-[#85E6FF] text-foreground" },
  push: { label: "Push", tone: "bg-white text-foreground" },
  lose: { label: "Dealer wins", tone: "bg-white/15 text-white" },
  bust: { label: "Bust", tone: "bg-pink text-foreground" },
};

const ACTIONS: { action: Action; label: string; key: string }[] = [
  { action: "hit", label: "Hit", key: "h" },
  { action: "stand", label: "Stand", key: "s" },
  { action: "double", label: "Double", key: "d" },
  { action: "split", label: "Split", key: "p" },
];

export function BlackjackGame() {
  const [view, setView] = useState<BlackjackView | null>(null);
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [bet, setBet] = useState(0);
  const [chip, setChip] = useState(5);
  const [pointsWon, setPointsWon] = useState<number | null>(null);
  const [resultDelay, setResultDelay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Animation delay per card, fixed once a card first appears.
  const [cardDelays, setCardDelays] = useState<Record<string, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    api
      .blackjack()
      .then((v) => {
        setView(v);
        setPlayer(v.player);
        const last = v.game.hands[0]?.bet;
        if (last) setBet(last);
      })
      .catch((e: Error) => setError(e.message));
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const game = view?.game;
  const inHand = game?.phase === "player";
  const tickets = player?.tickets ?? 0;
  const maxBet = player?.rules.maxBetPerRound ?? Infinity;

  const apply = useCallback((next: BlackjackView, dealt: boolean) => {
    const g = next.game;
    setCardDelays((prev) => {
      const delays = dealt ? {} : { ...prev };
      g.hands.forEach((h, hi) =>
        h.cards.forEach((_, ci) => {
          delays[`h${hi}-${ci}`] ??= dealt ? ci * 300 : 0;
        }),
      );
      g.dealer.forEach((_, i) => {
        delays[`d${i}`] ??= dealt ? 150 + i * 300 : Math.max(0, i - 1) * DEALER_STEP_MS;
      });
      return delays;
    });

    const settledDelay =
      g.phase === "settled" ? (dealt ? 900 : Math.max(0, g.dealer.length - 1) * DEALER_STEP_MS + 250) : 0;

    setView(next);
    setResultDelay(settledDelay);
    setPointsWon(g.phase === "settled" ? (next.pointsWon ?? 0) : null);
    // Hold the balance update until the dealer has finished revealing.
    timers.current.push(setTimeout(() => setPlayer(next.player), settledDelay));
  }, []);

  const deal = useCallback(async () => {
    if (busy || inHand || bet <= 0) return;
    setBusy(true);
    setError(null);
    try {
      apply(await api.deal(bet), true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [apply, bet, busy, inHand]);

  const act = useCallback(
    async (action: Action) => {
      if (busy || !view?.allowedActions.includes(action)) return;
      setBusy(true);
      setError(null);
      try {
        apply(await api.act(action), false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [apply, busy, view],
  );

  const addChip = (value: number) => {
    setChip(value);
    if (inHand) return;
    if (bet + value > tickets) return setError("Not enough Tickets for that bet");
    if (bet + value > maxBet) return setError(`Max ${maxBet} Tickets per hand`);
    setError(null);
    setBet(bet + value);
  };

  // Keyboard: H/S/D/P to play, Enter to deal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let focused buttons handle their own Enter/Space.
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "Enter" && !inHand) return void deal();
      const match = ACTIONS.find((a) => a.key === e.key.toLowerCase());
      if (match && inHand) void act(match.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, deal, inHand]);

  const canDeal = !inHand && bet > 0 && bet <= tickets && !busy;

  return (
    <GameShell player={player}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="relative flex min-h-[560px] flex-col justify-between overflow-hidden bg-foreground px-4 py-6 text-white sm:px-10 sm:py-8">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30 blur-[120px]" />
          <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-[0.07] [--line:#ffffff]" />

          {/* Dealer */}
          <div className="relative flex flex-col items-center">
            <HandLabel title="Dealer" total={game?.dealer.length ? game.dealerTotal : null} />
            <div className="mt-3 flex min-h-[104px] justify-center sm:min-h-[128px]">
              {game?.dealer.map((card, i) => (
                <div key={`d${i}`} className={i ? "-ml-10 sm:-ml-12" : ""}>
                  <PlayingCard card={card} delayMs={cardDelays[`d${i}`]} flip={i === 1 && !inHand} />
                </div>
              ))}
            </div>
            <span className="absolute right-0 top-0 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 sm:block">
              Shoe · {game?.shoeRemaining || 312} cards
            </span>
          </div>

          {/* Felt print */}
          <div className="relative my-6 text-center">
            <p className="font-display text-xl font-semibold uppercase tracking-[0.2em] text-primary-soft sm:text-3xl">
              Blackjack pays 3 to 2
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 sm:text-xs">
              Dealer stands on all 17s · 6 decks · Winnings paid as Prize Points
            </p>
          </div>

          {/* Player hands */}
          <div className="relative flex flex-wrap items-end justify-center gap-8">
            {!game?.hands.length && (
              <p className="pb-10 font-mono text-sm uppercase tracking-[0.16em] text-white/50">
                Choose your Tickets and deal
              </p>
            )}
            {game?.hands.map((hand, hi) => (
              <PlayerHand
                key={hi}
                hand={hand}
                index={hi}
                active={inHand && game.active === hi && game.hands.length > 1}
                resultDelay={resultDelay}
                delays={cardDelays}
              />
            ))}
          </div>
        </section>

        {/* Controls */}
        <aside className="flex flex-col gap-4">
          <div className="border border-line bg-background p-5">
            {inHand ? (
              <>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Your move</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ACTIONS.map(({ action, label, key }) => {
                    const enabled = view?.allowedActions.includes(action) && !busy;
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => act(action)}
                        disabled={!enabled}
                        className={`flex h-14 flex-col items-center justify-center font-mono text-sm uppercase tracking-[0.12em] transition-[background-color,transform,opacity] active:scale-[0.97] disabled:opacity-30 ${
                          action === "hit" || action === "stand"
                            ? "bg-primary text-white hover:bg-foreground"
                            : "border border-line hover:border-primary hover:text-primary"
                        }`}
                      >
                        {label}
                        <span className="text-[9px] opacity-60">[{key.toUpperCase()}]</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Double and split each put up another {game?.hands[game.active]?.bet ?? 0} Tickets.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Your bet</p>
                    <p className="font-display text-3xl font-semibold tabular-nums">
                      {bet} <span className="text-base text-muted">TIX</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBet(0)}
                    disabled={!bet}
                    className="font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-primary disabled:opacity-30"
                  >
                    Clear
                  </button>
                </div>
                <p className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  Tap a Ticket to add it
                </p>
                <ChipRack selected={chip} available={tickets - bet} onSelect={addChip} />
                <button
                  type="button"
                  onClick={deal}
                  disabled={!canDeal}
                  className="mt-5 inline-flex h-14 w-full items-center justify-center bg-primary font-mono text-sm uppercase tracking-[0.12em] text-white shadow-[0_8px_30px_-8px_rgba(110,84,255,0.7)] transition-[background-color,transform,opacity] hover:bg-foreground active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-primary"
                >
                  {game?.phase === "settled" ? "Deal again" : "Deal"} <span className="ml-2 text-[10px] opacity-60">[Enter]</span>
                </button>
              </>
            )}
          </div>

          {game?.phase === "settled" && pointsWon !== null && (
            <RoundSummary game={game} pointsWon={pointsWon} delay={resultDelay} />
          )}

          {error && (
            <p role="alert" className="border-l-2 border-pink bg-pink/10 px-4 py-2 text-sm">
              {error}
            </p>
          )}

          <div className="border border-line bg-background p-5 text-sm leading-relaxed text-muted">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">House rules</p>
            <ul className="mt-3 space-y-1.5">
              <li>Blackjack pays 3:2 · wins pay 1:1</li>
              <li>Dealer peeks for blackjack and stands on all 17s</li>
              <li>Double on any first two cards · split once</li>
              <li>Split Aces receive one card each</li>
            </ul>
          </div>
        </aside>
      </div>
    </GameShell>
  );
}

function HandLabel({ title, total, bet }: { title: string; total: number | null; bet?: number }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]">
      <span className="text-white/50">{title}</span>
      {total !== null && (
        <span className="min-w-8 bg-white px-2 py-0.5 text-center text-sm font-bold text-foreground tabular-nums">
          {total}
        </span>
      )}
      {bet !== undefined && (
        <span className="flex items-center gap-1.5 text-white/70">
          <TicketChip value={bet} compact className="h-4 w-auto" />
        </span>
      )}
    </div>
  );
}

function PlayerHand({
  hand,
  index,
  active,
  resultDelay,
  delays,
}: {
  hand: PublicBlackjackState["hands"][number];
  index: number;
  active: boolean;
  resultDelay: number;
  delays: Record<string, number>;
}) {
  const result = hand.result ? RESULT_COPY[hand.result] : null;
  const total = hand.soft && hand.total < 21 && !hand.done ? `${hand.total - 10}/${hand.total}` : hand.total;
  return (
    <div className={`flex flex-col items-center gap-3 p-3 transition-[box-shadow] ${active ? "shadow-[0_0_0_2px_#85E6FF]" : ""}`}>
      <div className="relative flex min-h-[104px] sm:min-h-[128px]">
        {hand.cards.map((card, ci) => (
          <div key={`h${index}-${ci}`} className={ci ? "-ml-10 sm:-ml-12" : ""}>
            <PlayingCard card={card} delayMs={delays[`h${index}-${ci}`]} />
          </div>
        ))}
        {result && (
          <span
            className={`pop absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] ${result.tone}`}
            style={{ animationDelay: `${resultDelay}ms` }}
          >
            {result.label}
            {hand.winnings ? ` +${hand.winnings} pts` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]">
        <span className="min-w-8 bg-white px-2 py-0.5 text-center text-sm font-bold text-foreground tabular-nums">
          {total}
        </span>
        <TicketChip value={hand.bet} compact className="h-5 w-auto" />
        {hand.doubled && <span className="text-primary-soft">Doubled</span>}
      </div>
    </div>
  );
}

function RoundSummary({ game, pointsWon, delay }: { game: PublicBlackjackState; pointsWon: number; delay: number }) {
  const returned = game.hands
    .filter((h) => h.result === "win" || h.result === "blackjack" || h.result === "push")
    .reduce((s, h) => s + h.bet, 0);
  const staked = game.hands.reduce((s, h) => s + h.bet, 0);
  return (
    <div className="pop border border-primary/30 bg-primary-soft/40 p-5" style={{ animationDelay: `${delay}ms` }} aria-live="polite">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Round result</p>
      <p className="mt-1 font-display text-2xl font-semibold">
        {pointsWon > 0 ? `+${pointsWon} Prize Points` : returned ? "Tickets returned" : "No win this hand"}
      </p>
      <p className="mt-1 text-sm text-muted">
        {staked} Tickets played · {returned} returned
      </p>
    </div>
  );
}
