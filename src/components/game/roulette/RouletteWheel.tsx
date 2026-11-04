import { LogoMark } from "@/components/Logo";
import { colorOf, WHEEL_ORDER } from "@/lib/game/roulette";

export const SPIN_MS = 6000;
const STEP = 360 / WHEEL_ORDER.length;

export const POCKET_FILL = {
  red: "#6E54FF",
  black: "#1B1430",
  green: "#85E6FF",
} as const;

// Rounded so server and browser render identical paths.
const round = (n: number) => Math.round(n * 1000) / 1000;

const point = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return [round(r * Math.sin(rad)), round(-r * Math.cos(rad))] as const;
};

function sector(r1: number, r2: number, a0: number, a1: number) {
  const [x1, y1] = point(r2, a0);
  const [x2, y2] = point(r2, a1);
  const [x3, y3] = point(r1, a1);
  const [x4, y4] = point(r1, a0);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
}

/** Wheel rotation that brings `n`'s pocket under the top marker. */
export function rotationFor(n: number, current: number, turns = 5) {
  const index = WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
  const target = (360 - index * STEP) % 360;
  const base = Math.ceil(current / 360) * 360;
  return base + turns * 360 + target;
}

type RouletteWheelProps = {
  wheelDeg: number;
  ballDeg: number;
  spinId: number;
  spinning: boolean;
  className?: string;
};

export function RouletteWheel({ wheelDeg, ballDeg, spinId, spinning, className }: RouletteWheelProps) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} role="img" aria-label="Roulette wheel">
      <defs>
        <radialGradient id="rw-rim" cx="0" cy="0" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0.86" stopColor="#2A2148" />
          <stop offset="0.94" stopColor="#0E091C" />
          <stop offset="1" stopColor="#3B2F6B" />
        </radialGradient>
        <radialGradient id="rw-cone" cx="0" cy="0" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#DDD7FE" />
          <stop offset="0.55" stopColor="#9D8AFF" />
          <stop offset="1" stopColor="#4F35D2" />
        </radialGradient>
      </defs>

      {/* Static bowl and ball track */}
      <circle r="49.5" fill="url(#rw-rim)" />
      <circle r="44.6" fill="none" stroke="#DDD7FE" strokeOpacity="0.25" strokeWidth="0.4" />

      {/* Rotating wheel head */}
      <g
        style={{
          transform: `rotate(${wheelDeg}deg)`,
          transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.62, 0.12, 1)` : "none",
        }}
      >
        {WHEEL_ORDER.map((n, i) => (
          <path
            key={n}
            d={sector(34, 43.5, (i - 0.5) * STEP, (i + 0.5) * STEP)}
            fill={POCKET_FILL[colorOf(n)]}
            stroke="#DDD7FE"
            strokeOpacity="0.35"
            strokeWidth="0.25"
          />
        ))}
        {WHEEL_ORDER.map((n, i) => (
          <text
            key={`t${n}`}
            transform={`rotate(${i * STEP}) translate(0 -40)`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="3.3"
            fontWeight="700"
            fontFamily="var(--font-roboto-mono), monospace"
            fill={n === 0 ? "#0E091C" : "#FFFFFF"}
          >
            {n}
          </text>
        ))}
        <circle r="34" fill="#0E091C" />
        <circle r="30.5" fill="url(#rw-cone)" />
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-8"
            x2="0"
            y2="-30"
            transform={`rotate(${i * 45})`}
            stroke="#0E091C"
            strokeOpacity="0.25"
            strokeWidth="0.6"
          />
        ))}
        <circle r="9" fill="#FFFFFF" stroke="#0E091C" strokeOpacity="0.2" strokeWidth="0.5" />
        <foreignObject x="-6" y="-4.5" width="12" height="9">
          <LogoMark className="h-full w-full" />
        </foreignObject>
      </g>

      {/* Marker */}
      <path d="M0 -44.2 L-1.8 -48.4 L1.8 -48.4 Z" fill="#FFFFFF" />

      {/* Ball: orbits counter to the wheel, then drops into the top pocket */}
      <g
        style={{
          transform: `rotate(${ballDeg}deg)`,
          transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.18, 0.7, 0.22, 1)` : "none",
        }}
      >
        <g key={spinId} className={spinning ? "roulette-ball-drop" : undefined} style={{ transform: "translateY(-38.5px)" }}>
          <circle r="1.9" fill="#FFFFFF" stroke="#0E091C" strokeOpacity="0.3" strokeWidth="0.3" />
          <circle r="0.7" cx="-0.5" cy="-0.5" fill="#FFFFFF" />
        </g>
      </g>
    </svg>
  );
}
