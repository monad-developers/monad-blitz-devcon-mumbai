import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ArrowUpRight } from "@/components/Navbar";
import { TicketChip } from "@/components/game/TicketChip";

export const metadata: Metadata = {
  title: "Play — Morney",
  description: "Use your daily Tickets on casino games and earn Prize Points.",
};

const GAMES = [
  {
    href: "/play/roulette",
    name: "Roulette",
    kicker: "Single zero",
    body: "Classic European roulette. Straights pay 35:1, splits, corners, streets, dozens and even-money bets on the full layout.",
    chip: 25,
  },
  {
    href: "/play/blackjack",
    name: "Blackjack",
    kicker: "6 decks · 3:2",
    body: "Classic casino blackjack. Hit, stand, double or split against a dealer who stands on all 17s.",
    chip: 10,
  },
];

export default function PlayPage() {
  return (
    <div className="flex min-h-svh flex-col bg-surface">
      <header className="border-b border-line bg-background">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center px-4 sm:px-6">
          <Link href="/" aria-label="Morney home">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-16 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Choose how to play</p>
        <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.2rem,5vw,4rem)] font-medium uppercase leading-[1] tracking-[-0.03em]">
          Spend Tickets.
          <span className="slice-text block italic">Earn Prize Points.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Bets use your daily Tickets — never your savings. Winning bets return
          your Tickets and turn the winnings into Prize Points for today&apos;s
          prize pool.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {GAMES.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="group relative overflow-hidden bg-foreground p-8 text-white transition-transform hover:-translate-y-1"
            >
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/50 blur-[80px] transition-opacity group-hover:opacity-100 sm:opacity-70" />
              <div className="relative flex items-start justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary-soft">{g.kicker}</p>
                <TicketChip value={g.chip} className="h-10 w-auto rotate-6 transition-transform group-hover:rotate-0" />
              </div>
              <h2 className="relative mt-16 font-display text-5xl font-medium uppercase tracking-[-0.03em]">{g.name}</h2>
              <p className="relative mt-3 max-w-md leading-relaxed text-white/65">{g.body}</p>
              <span className="relative mt-8 inline-flex items-center gap-2 font-mono text-sm uppercase tracking-[0.12em] text-[#85E6FF]">
                Play now <ArrowUpRight className="size-4" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
