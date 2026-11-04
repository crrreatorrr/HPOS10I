// Small math helpers with the same semantics as the GDScript built-ins the
// game was written against (signf(0) = 0, fposmod always positive, ...).

export const TAU = Math.PI * 2;
export const INF = Number.POSITIVE_INFINITY;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** -1, 0 or 1 (0 for 0 and NaN). */
export function signf(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampi(v: number, lo: number, hi: number): number {
  return Math.trunc(clamp(v, lo, hi));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** Modulo with a result in [0, m). */
export function fposmod(v: number, m: number): number {
  const r = v % m;
  return r < 0 ? r + m : r === m ? 0 : r;
}

export function posmod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/** Wraps v into [lo, hi). */
export function wrapf(v: number, lo: number, hi: number): number {
  const range = hi - lo;
  if (range === 0) return lo;
  return lo + fposmod(v - lo, range);
}

export function moveToward(from: number, to: number, delta: number): number {
  if (Math.abs(to - from) <= delta) return to;
  return from + signf(to - from) * delta;
}

export function snappedf(v: number, step: number): number {
  if (step === 0) return v;
  return Math.floor(v / step + 0.5) * step;
}

export function isEqualApprox(a: number, b: number, eps = 0.00001): boolean {
  if (a === b) return true;
  let tolerance = eps * Math.abs(a);
  if (tolerance < eps) tolerance = eps;
  return Math.abs(a - b) < tolerance;
}

/** GDScript's ceili / floori / roundi. */
export const ceili = (v: number): number => Math.ceil(v);
export const floori = (v: number): number => Math.floor(v);
export const roundi = (v: number): number => Math.round(v);

/** Linear easing helpers used by UI tweens. */
export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Deterministic hash-based random in [0, 1) for a seed (stable visuals). */
export function hash01(seed: number): number {
  let x = Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** A seedable PRNG (mulberry32), for gameplay randomness that tests can pin. */
export class Rng {
  private state: number;

  constructor(seed = 0x1234abcd) {
    this.state = seed >>> 0;
  }

  seed(value: number): void {
    this.state = value >>> 0;
  }

  /** [0, 1) */
  randf(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randfRange(lo: number, hi: number): number {
    return lo + (hi - lo) * this.randf();
  }

  /** Integer in [lo, hi] inclusive. */
  randiRange(lo: number, hi: number): number {
    return lo + Math.floor(this.randf() * (hi - lo + 1));
  }
}

export const rng = new Rng((Date.now() ^ 0x5bd1e995) >>> 0);
