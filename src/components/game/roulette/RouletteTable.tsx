"use client";

import { useState } from "react";
import {
  betKey,
  colorOf,
  coveredNumbers,
  type BetKind,
  type RouletteBet,
} from "@/lib/game/roulette";
import { TicketChip } from "../TicketChip";
import { POCKET_FILL } from "./RouletteWheel";

type Spot = { kind: BetKind; target: number[] };

type Zone = Spot & { x: number; y: number; shape: "v" | "h" | "dot" };

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const colOf = (n: number) => Math.floor((n - 1) / 3); // 0..11, left to right
const rowOf = (n: number) => 2 - ((n - 1) % 3); // 0 = top row (3, 6, …)

// Clickable spots on the lines between numbers: splits, corners, streets, six lines.
function buildZones(): Zone[] {
  const zones: Zone[] = [];
  for (let n = 1; n <= 36; n++) {
    const c = colOf(n);
    const r = rowOf(n);
    if (c < 11) zones.push({ kind: "split", target: [n, n + 3], x: (c + 1) / 12, y: (r + 0.5) / 3, shape: "v" });
    if (n % 3 !== 0) {
      zones.push({ kind: "split", target: [n, n + 1], x: (c + 0.5) / 12, y: r / 3, shape: "h" });
      if (c < 11)
        zones.push({ kind: "corner", target: [n, n + 1, n + 3, n + 4], x: (c + 1) / 12, y: r / 3, shape: "dot" });
    }
    if (n % 3 === 1) {
      zones.push({ kind: "street", target: [n, n + 1, n + 2], x: (c + 0.5) / 12, y: 1, shape: "h" });
      if (c < 11) zones.push({ kind: "line", target: range(n, n + 5), x: (c + 1) / 12, y: 1, shape: "dot" });
    }
  }
  for (const k of [1, 2, 3]) {
    zones.push({ kind: "split", target: [0, k], x: 0, y: (rowOf(k) + 0.5) / 3, shape: "v" });
  }
  return zones;
}

const ZONES = buildZones();

const OUTSIDE: { spot: Spot; col: string; row: string; label: React.ReactNode }[] = [
  { spot: { kind: "dozen", target: [1] }, col: "2 / 6", row: "4", label: <>1<sup>st</sup> 12</> },
  { spot: { kind: "dozen", target: [2] }, col: "6 / 10", row: "4", label: <>2<sup>nd</sup> 12</> },
  { spot: { kind: "dozen", target: [3] }, col: "10 / 14", row: "4", label: <>3<sup>rd</sup> 12</> },
  { spot: { kind: "low", target: [] }, col: "2 / 4", row: "5", label: "1–18" },
  { spot: { kind: "even", target: [] }, col: "4 / 6", row: "5", label: "Even" },
  {
    spot: { kind: "red", target: [] },
    col: "6 / 8",
    row: "5",
    label: <Diamond fill={POCKET_FILL.red} label="Purple" />,
  },
  {
    spot: { kind: "black", target: [] },
    col: "8 / 10",
    row: "5",
    label: <Diamond fill={POCKET_FILL.black} label="Black" />,
  },
  { spot: { kind: "odd", target: [] }, col: "10 / 12", row: "5", label: "Odd" },
  { spot: { kind: "high", target: [] }, col: "12 / 14", row: "5", label: "19–36" },
  { spot: { kind: "column", target: [3] }, col: "14", row: "1", label: "2 to 1" },
  { spot: { kind: "column", target: [2] }, col: "14", row: "2", label: "2 to 1" },
  { spot: { kind: "column", target: [1] }, col: "14", row: "3", label: "2 to 1" },
];

function Diamond({ fill, label }: { fill: string; label: string }) {
  return (
    <svg viewBox="0 0 40 20" className="h-5 w-10" role="img" aria-label={label}>
      <path d="M20 1 39 10 20 19 1 10Z" fill={fill} stroke="#DDD7FE" strokeOpacity="0.5" />
    </svg>
  );
}

type RouletteTableProps = {
  bets: Map<string, RouletteBet>;
  onPlace: (spot: Spot) => void;
  disabled?: boolean;
  winningNumber?: number | null;
  winningKeys?: Set<string>;
};

export function RouletteTable({ bets, onPlace, disabled, winningNumber, winningKeys }: RouletteTableProps) {
  const [hover, setHover] = useState<number[] | null>(null);
  const hovered = new Set(hover ?? []);
  const settled = winningNumber !== null && winningNumber !== undefined;

  const spotProps = (spot: Spot) => ({
    onClick: () => !disabled && onPlace(spot),
    onMouseEnter: () => setHover(coveredNumbers(spot)),
    onMouseLeave: () => setHover(null),
    disabled,
    "aria-label": describe(spot),
  });

  const chipFor = (spot: Spot) => {
    const bet = bets.get(betKey(spot));
    if (!bet) return null;
    const won = winningKeys?.has(betKey(spot));
    return (
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 transition-opacity ${
          settled && !won ? "opacity-25" : ""
        } ${won ? "drop-shadow-[0_0_10px_rgba(133,230,255,0.9)]" : "drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]"}`}
      >
        <TicketChip value={bet.amount} compact className="h-5 w-auto sm:h-6" />
      </span>
    );
  };

  const cellBase =
    "relative flex items-center justify-center border border-white/15 font-mono text-white transition-[background-color,box-shadow] disabled:cursor-default";

  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid min-w-[720px] grid-cols-[repeat(14,minmax(0,1fr))] grid-rows-[repeat(3,52px)_44px_44px] select-none sm:grid-rows-[repeat(3,64px)_48px_48px]">
        {/* Zero */}
        <button
          type="button"
          {...spotProps({ kind: "straight", target: [0] })}
          style={{ gridColumn: "1", gridRow: "1 / 4", background: POCKET_FILL.green }}
          className={`${cellBase} border-0 text-xl font-bold text-foreground [clip-path:polygon(45%_0,100%_0,100%_100%,45%_100%,0_50%)] ${
            hovered.has(0) ? "brightness-110" : ""
          } ${winningNumber === 0 ? "animate-pulse" : ""}`}
        >
          <span className="pl-3">0</span>
          {chipFor({ kind: "straight", target: [0] })}
        </button>

        {/* Numbers */}
        {range(1, 36).map((n) => (
          <button
            key={n}
            type="button"
            {...spotProps({ kind: "straight", target: [n] })}
            style={{
              gridColumn: String(colOf(n) + 2),
              gridRow: String(rowOf(n) + 1),
              background: POCKET_FILL[colorOf(n)],
            }}
            className={`${cellBase} text-base font-bold sm:text-lg ${
              hovered.has(n) ? "shadow-[inset_0_0_0_2px_#85E6FF] brightness-125" : "hover:brightness-110"
            } ${winningNumber === n ? "z-10 animate-pulse shadow-[inset_0_0_0_3px_#FFFFFF,0_0_24px_#85E6FF]" : ""}`}
          >
            {n}
            {chipFor({ kind: "straight", target: [n] })}
          </button>
        ))}

        {/* Outside bets */}
        {OUTSIDE.map(({ spot, col, row, label }) => (
          <button
            key={betKey(spot)}
            type="button"
            {...spotProps(spot)}
            style={{ gridColumn: col, gridRow: row }}
            className={`${cellBase} bg-white/[0.03] text-[11px] uppercase tracking-[0.12em] hover:bg-primary/25 sm:text-xs ${
              hover && sameSpot(hover, coveredNumbers(spot)) ? "bg-primary/25" : ""
            }`}
          >
            {label}
            {chipFor(spot)}
          </button>
        ))}

        {/* Line bets overlay */}
        <div className="pointer-events-none relative" style={{ gridColumn: "2 / 14", gridRow: "1 / 4" }}>
          {ZONES.map((z) => {
            const key = betKey(z);
            return (
              <button
                key={key}
                type="button"
                {...spotProps(z)}
                className={`group pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 ${
                  z.shape === "v" ? "h-7 w-3" : z.shape === "h" ? "h-3 w-7" : "size-4"
                }`}
                style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%` }}
              >
                <span className="absolute inset-0.5 rounded-full bg-[#85E6FF] opacity-0 transition-opacity group-hover:opacity-80" />
                {chipFor(z)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function sameSpot(a: number[], b: number[] | null) {
  return !!b && a.length === b.length && a.every((n, i) => n === b[i]);
}

function describe(spot: Spot) {
  const nums = spot.target.join(", ");
  switch (spot.kind) {
    case "straight":
      return `Bet on ${nums}`;
    case "dozen":
      return `Bet on dozen ${nums}`;
    case "column":
      return `Bet on column ${nums}`;
    case "split":
    case "street":
    case "corner":
    case "line":
      return `${spot.kind} bet on ${nums}`;
    default:
      return `Bet on ${spot.kind}`;
  }
}
