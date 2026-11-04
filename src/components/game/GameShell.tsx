"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Wordmark } from "@/components/Logo";
import type { PlayerSummary } from "@/lib/client/api";

const GAMES = [
  { href: "/play/roulette", label: "Roulette" },
  { href: "/play/blackjack", label: "Blackjack" },
];

// Client-only clock that ticks every 30s; null during server render.
const TICK_MS = 30_000;
const subscribeClock = (onTick: () => void) => {
  const id = setInterval(onTick, TICK_MS);
  return () => clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

function useCountdown(to?: string) {
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  if (!to || now === null) return null;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

type GameShellProps = {
  player: PlayerSummary | null;
  /** Ticket balance to display, e.g. minus bets not yet submitted. */
  displayTickets?: number;
  children: React.ReactNode;
};

export function GameShell({ player, displayTickets, children }: GameShellProps) {
  const pathname = usePathname();
  const resetsIn = useCountdown(player?.resetsAt);
  const tickets = displayTickets ?? player?.tickets;

  return (
    <div className="flex min-h-svh flex-col bg-surface">
      <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" aria-label="Morney home">
              <Wordmark />
            </Link>
            <nav className="hidden items-center gap-1 font-mono text-[13px] uppercase tracking-[0.08em] sm:flex">
              {GAMES.map((g) => (
                <Link
                  key={g.href}
                  href={g.href}
                  className={`px-3 py-2 transition-colors ${
                    pathname === g.href
                      ? "bg-primary-soft/60 text-primary"
                      : "text-foreground/60 hover:text-primary"
                  }`}
                >
                  {g.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Balance label="Tickets" value={tickets} accent />
            <Balance label="Prize Points" value={player?.prizePoints} />
          </div>
        </div>
        <nav className="flex border-t border-line font-mono text-xs uppercase tracking-[0.08em] sm:hidden">
          {GAMES.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className={`flex-1 py-2.5 text-center ${
                pathname === g.href ? "bg-primary-soft/60 text-primary" : "text-foreground/60"
              }`}
            >
              {g.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-line bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted sm:flex-row sm:justify-between sm:px-6">
          <span>
            Scoring: winning bets return your Tickets + earn{" "}
            {player?.rules.pointsPerTicketWon ?? "…"} Prize Point per Ticket won
          </span>
          <span>
            Daily allowance {player?.dailyAllowance ?? "…"} Tickets
            {resetsIn ? ` · resets in ${resetsIn}` : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Balance({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div
      className={`border px-3 py-1.5 text-right ${
        accent ? "border-primary/30 bg-primary-soft/40" : "border-line bg-background"
      }`}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted sm:text-[10px]">
        {label}
      </p>
      <p
        className={`font-display text-base font-semibold tabular-nums sm:text-lg ${
          accent ? "text-primary" : ""
        }`}
      >
        {value === undefined ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}
