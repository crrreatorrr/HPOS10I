// Typed access to the exported properties a level file sets on a node
// (converted from the original scenes by tools/levels/convert_tscn.mjs).

import { Color } from '../../runtime/color';
import { Rect2, Vec2 } from '../../runtime/vec2';

export type RawValue = unknown;
export type RawProps = Record<string, RawValue>;

/** Decodes the JSON value encoding into runtime values. */
export function decodeValue(v: RawValue): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decodeValue);
  const o = v as Record<string, unknown>;
  if ('v2' in o) {
    const [x, y] = o.v2 as number[];
    return new Vec2(x!, y!);
  }
  if ('color' in o) {
    const [r, g, b, a] = o.color as number[];
    return new Color(r!, g!, b!, a ?? 1);
  }
  if ('v2s' in o) {
    const flat = o.v2s as number[];
    const out: Vec2[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push(new Vec2(flat[i]!, flat[i + 1]!));
    return out;
  }
  if ('rect' in o) {
    const [x, y, w, h] = o.rect as number[];
    return new Rect2(x!, y!, w!, h!);
  }
  if ('res' in o) return String(o.res);
  if ('sub' in o) {
    const props: Record<string, unknown> = {};
    for (const [k, val] of Object.entries((o.props as RawProps) ?? {})) props[k] = decodeValue(val);
    return { type: o.sub, props };
  }
  if ('nodepath' in o) return String(o.nodepath);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) out[k] = decodeValue(val);
  return out;
}

/** Property reader with defaults, so a class picks its exports in one line each. */
export class Props {
  readonly values: Record<string, unknown>;

  constructor(raw: RawProps = {}) {
    this.values = {};
    for (const [k, v] of Object.entries(raw)) this.values[k] = decodeValue(v);
  }

  static of(values: Record<string, unknown>): Props {
    const p = new Props();
    Object.assign(p.values, values);
    return p;
  }

  has(key: string): boolean {
    return key in this.values;
  }

  num(key: string, fallback: number): number {
    const v = this.values[key];
    return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : fallback;
  }

  int(key: string, fallback: number): number {
    return Math.trunc(this.num(key, fallback));
  }

  bool(key: string, fallback: boolean): boolean {
    const v = this.values[key];
    return typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : fallback;
  }

  str(key: string, fallback: string): string {
    const v = this.values[key];
    return typeof v === 'string' ? v : fallback;
  }

  vec(key: string, fallback: Vec2): Vec2 {
    const v = this.values[key];
    return v instanceof Vec2 ? v : fallback;
  }

  color(key: string, fallback: Color): Color {
    const v = this.values[key];
    return v instanceof Color ? v : fallback;
  }

  vecs(key: string, fallback: Vec2[] = []): Vec2[] {
    const v = this.values[key];
    return Array.isArray(v) && v.every((x) => x instanceof Vec2) ? (v as Vec2[]) : fallback;
  }

  nums(key: string, fallback: number[] = []): number[] {
    const v = this.values[key];
    return Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : fallback;
  }

  strs(key: string, fallback: string[] = []): string[] {
    const v = this.values[key];
    return Array.isArray(v) ? v.map(String) : fallback;
  }

  raw<T = unknown>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

/** Anything a level file can configure. */
export interface Configurable {
  /** Applies the node's exported properties from the level file (before it enters the tree). */
  applyProps(props: Props): void;
}

export function isConfigurable(n: unknown): n is Configurable {
  return !!n && typeof (n as Configurable).applyProps === 'function';
}
