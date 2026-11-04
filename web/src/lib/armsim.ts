export const CLIP_SECONDS = 12;
export const CONTACT_T = 3.6;
export const SLIP_T = 6.4;
export const MARK_T = 6.46;
export const TOLERANCE_S = 0.15;

type Point = { x: number; y: number };
type Key = { t: number; x: number; y: number; open: boolean };

const SHOULDER: Point = { x: 60, y: 118 };
const L1 = 95;
const L2 = 85;
const GRIP_OFFSET = 14;
const CUP_REST: Point = { x: 210, y: 156 };
const FALL_S = 0.35;

const KEYS: Key[] = [
  { t: 0, x: 130, y: 70, open: true },
  { t: 2.0, x: 210, y: 110, open: true },
  { t: 3.0, x: 210, y: 156, open: true },
  { t: CONTACT_T, x: 210, y: 156, open: false },
  { t: 6.0, x: 205, y: 100, open: false },
  { t: 7.0, x: 200, y: 92, open: false },
  { t: 8.5, x: 180, y: 80, open: false },
  { t: 10.5, x: 140, y: 72, open: true },
  { t: CLIP_SECONDS, x: 130, y: 70, open: true },
];

const smooth = (u: number) => u * u * (3 - 2 * u);

function gripAt(t: number): { x: number; y: number; open: boolean } {
  const i = Math.max(0, KEYS.findIndex((k) => k.t > t) - 1);
  const a = KEYS[i];
  const b = KEYS[Math.min(KEYS.length - 1, i + 1)];
  const u = b.t > a.t ? smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)))) : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, open: t < CONTACT_T ? true : t >= b.t ? b.open : a.open };
}

function solve(target: Point): { elbow: Point; wrist: Point } {
  const dx = target.x - SHOULDER.x;
  const dy = target.y - SHOULDER.y;
  const d = Math.min(L1 + L2 - 0.001, Math.max(Math.abs(L1 - L2) + 0.001, Math.hypot(dx, dy)));
  const cosElbow = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const base = Math.atan2(dy, dx);
  const angle = base - Math.acos(Math.min(1, Math.max(-1, cosElbow)));
  const elbow = { x: SHOULDER.x + L1 * Math.cos(angle), y: SHOULDER.y + L1 * Math.sin(angle) };
  const reach = Math.hypot(target.x - elbow.x, target.y - elbow.y) || 1;
  return { elbow, wrist: { x: elbow.x + ((target.x - elbow.x) / reach) * L2, y: elbow.y + ((target.y - elbow.y) / reach) * L2 } };
}

export function force(t: number): number {
  if (t < CONTACT_T) return 0;
  if (t < 4.0) return 4.2 * smooth((t - CONTACT_T) / 0.4);
  if (t < 6.0) return 4.2 + 0.12 * Math.sin(9 * t) - 0.1 * (t - 4.0);
  if (t < SLIP_T) return 4.0 - 2.6 * smooth((t - 6.0) / (SLIP_T - 6.0)) + 0.08 * Math.sin(23 * t);
  if (t < SLIP_T + 0.05) return 1.4 * (1 - (t - SLIP_T) / 0.05);
  return 0;
}

export function armState(t: number) {
  const grip = gripAt(t);
  const { elbow, wrist } = solve({ x: grip.x, y: grip.y - GRIP_OFFSET });
  let cup = CUP_REST;
  let cupTilt = 0;
  if (t >= CONTACT_T && t < SLIP_T) {
    cup = { x: grip.x, y: grip.y };
  } else if (t >= SLIP_T) {
    const from = gripAt(SLIP_T);
    const u = Math.min(1, (t - SLIP_T) / FALL_S);
    cup = { x: from.x + 4 * u, y: from.y + (CUP_REST.y - from.y) * u * u };
    cupTilt = 9 * u;
  }
  return { shoulder: SHOULDER, elbow, wrist, gap: grip.open ? 32 : 24, cup, cupTilt };
}
