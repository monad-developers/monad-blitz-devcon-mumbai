// European single-zero roulette rules. Shared by the server (settlement)
// and the client (table layout, previews).

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = "red" | "black" | "green";

export function colorOf(n: number): PocketColor {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export type BetKind =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "line"
  | "dozen"
  | "column"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

/**
 * `target` identifies the bet:
 * - inside bets: the covered numbers
 * - dozen / column: [1 | 2 | 3]
 * - even-money bets: []
 */
export type RouletteBet = {
  kind: BetKind;
  target: number[];
  amount: number;
};

// Payout multiplier, excluding the returned stake.
export const PAYOUTS: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  line: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
};

export const BET_LABELS: Record<BetKind, string> = {
  straight: "Straight",
  split: "Split",
  street: "Street",
  corner: "Corner",
  line: "Six line",
  dozen: "Dozen",
  column: "Column",
  red: "Purple",
  black: "Black",
  odd: "Odd",
  even: "Even",
  low: "1–18",
  high: "19–36",
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const sorted = (nums: number[]) => [...nums].sort((a, b) => a - b);

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && sorted(a).every((n, i) => n === sorted(b)[i]);

export function betKey(bet: Pick<RouletteBet, "kind" | "target">) {
  return `${bet.kind}:${sorted(bet.target).join("-")}`;
}

/** Numbers a bet wins on, or null if the bet is not a legal layout bet. */
export function coveredNumbers(
  bet: Pick<RouletteBet, "kind" | "target">,
): number[] | null {
  const t = sorted(bet.target);
  const isNum = (n: number) => Number.isInteger(n) && n >= 0 && n <= 36;
  if (!t.every(isNum)) return null;

  switch (bet.kind) {
    case "straight":
      return t.length === 1 ? t : null;
    case "split": {
      if (t.length !== 2) return null;
      const [a, b] = t;
      if (a === 0) return b >= 1 && b <= 3 ? t : null;
      if (b - a === 3) return t;
      if (b - a === 1 && Math.ceil(a / 3) === Math.ceil(b / 3)) return t;
      return null;
    }
    case "street": {
      const n = t[0];
      return n % 3 === 1 && sameSet(t, range(n, n + 2)) ? t : null;
    }
    case "corner": {
      const n = t[0];
      return n >= 1 && n % 3 !== 0 && n <= 32 && sameSet(t, [n, n + 1, n + 3, n + 4])
        ? t
        : null;
    }
    case "line": {
      const n = t[0];
      return n % 3 === 1 && n <= 31 && sameSet(t, range(n, n + 5)) ? t : null;
    }
    case "dozen": {
      const d = t[0];
      return t.length === 1 && d >= 1 && d <= 3
        ? range((d - 1) * 12 + 1, d * 12)
        : null;
    }
    case "column": {
      const c = t[0];
      return t.length === 1 && c >= 1 && c <= 3
        ? range(1, 36).filter((n) => (n - 1) % 3 === c - 1)
        : null;
    }
    case "red":
      return t.length === 0 ? range(1, 36).filter((n) => colorOf(n) === "red") : null;
    case "black":
      return t.length === 0 ? range(1, 36).filter((n) => colorOf(n) === "black") : null;
    case "odd":
      return t.length === 0 ? range(1, 36).filter((n) => n % 2 === 1) : null;
    case "even":
      return t.length === 0 ? range(1, 36).filter((n) => n % 2 === 0) : null;
    case "low":
      return t.length === 0 ? range(1, 18) : null;
    case "high":
      return t.length === 0 ? range(19, 36) : null;
    default:
      return null;
  }
}

export type SettledBet = RouletteBet & { won: boolean; winnings: number };

export function settleBets(bets: RouletteBet[], result: number): SettledBet[] {
  return bets.map((bet) => {
    const won = coveredNumbers(bet)?.includes(result) ?? false;
    return { ...bet, won, winnings: won ? bet.amount * PAYOUTS[bet.kind] : 0 };
  });
}
