// Ticket-shaped betting token. Colors come from the Monad brand kit.

export const CHIP_VALUES = [1, 5, 10, 25, 100] as const;

const TIERS: { min: number; fill: string; ink: string }[] = [
  { min: 100, fill: "#FFAE45", ink: "#0E091C" },
  { min: 25, fill: "#FF8EE4", ink: "#0E091C" },
  { min: 10, fill: "#6E54FF", ink: "#FFFFFF" },
  { min: 5, fill: "#85E6FF", ink: "#0E091C" },
  { min: 0, fill: "#DDD7FE", ink: "#0E091C" },
];

const tier = (value: number) => TIERS.find((t) => value >= t.min) ?? TIERS[TIERS.length - 1];

export function formatTickets(n: number) {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

type TicketChipProps = {
  value: number;
  className?: string;
  /** Compact token for bets placed on the table. */
  compact?: boolean;
};

export function TicketChip({ value, className, compact }: TicketChipProps) {
  const { fill, ink } = tier(value);
  return (
    <svg
      viewBox="0 0 56 34"
      className={className}
      aria-label={`${value} Ticket${value === 1 ? "" : "s"}`}
      role="img"
    >
      <path
        d="M4 0h48a4 4 0 0 1 4 4v8a5 5 0 0 0 0 10v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-8a5 5 0 0 0 0-10V4a4 4 0 0 1 4-4Z"
        fill={fill}
        stroke="rgba(14,9,28,0.35)"
        strokeWidth="1"
      />
      {!compact && (
        <line x1="40" y1="5" x2="40" y2="29" stroke={ink} strokeOpacity="0.35" strokeDasharray="2 2.5" />
      )}
      <text
        x={compact ? 28 : 21}
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fill={ink}
        fontFamily="var(--font-roboto-mono), monospace"
        fontWeight="700"
        fontSize={compact ? 17 : 15}
      >
        {formatTickets(value)}
      </text>
      {!compact && (
        <path
          d="M44 12v10M46 12v10M47.5 12v10M49.5 12v10"
          stroke={ink}
          strokeOpacity="0.45"
          strokeWidth="1"
          fill="none"
        />
      )}
    </svg>
  );
}

type ChipRackProps = {
  selected: number;
  available: number;
  disabled?: boolean;
  onSelect: (value: number) => void;
};

export function ChipRack({ selected, available, disabled, onSelect }: ChipRackProps) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Ticket value">
      {CHIP_VALUES.map((v) => {
        const unaffordable = v > available;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected === v}
            disabled={disabled || unaffordable}
            onClick={() => onSelect(v)}
            className={`transition-[transform,opacity,filter] duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
              selected === v
                ? "-translate-y-1.5 drop-shadow-[0_6px_14px_rgba(110,84,255,0.55)]"
                : "hover:-translate-y-0.5"
            }`}
          >
            <TicketChip value={v} className="h-9 w-auto sm:h-10" />
          </button>
        );
      })}
    </div>
  );
}
