import { LogoMark } from "@/components/Logo";
import type { Card } from "@/lib/game/blackjack";

const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" } as const;

const cardSize = "h-[104px] w-[74px] sm:h-[128px] sm:w-[90px]";

type PlayingCardProps = {
  card: Card | null;
  delayMs?: number;
  flip?: boolean;
};

export function PlayingCard({ card, delayMs = 0, flip }: PlayingCardProps) {
  if (!card) {
    return (
      <div
        className={`${cardSize} deal-in relative overflow-hidden rounded-lg border-2 border-white bg-primary shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]`}
        style={{ animationDelay: `${delayMs}ms` }}
        aria-label="Face-down card"
      >
        <div className="absolute inset-1.5 rounded-md border border-white/40 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.12)_6px_7px)]" />
        <LogoMark className="absolute left-1/2 top-1/2 h-7 w-auto -translate-x-1/2 -translate-y-1/2 [--logo-a:#ffffff] [--logo-b:#DDD7FE]" />
      </div>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const color = red ? "text-primary" : "text-foreground";
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <div
      className={`${cardSize} ${flip ? "flip-in" : "deal-in"} relative rounded-lg border border-black/10 bg-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)] ${color}`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-label={`${card.rank} of ${SUIT_NAME[card.suit]}`}
    >
      <div className="absolute left-1.5 top-1 flex flex-col items-center font-display font-semibold leading-none">
        <span className="text-lg sm:text-xl">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
      <span className="absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl">{symbol}</span>
      <div className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center font-display font-semibold leading-none">
        <span className="text-lg sm:text-xl">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
    </div>
  );
}
