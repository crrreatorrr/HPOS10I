// mergeEdges() must give exactly what the original quadratic version gave
// (same edges, same coordinates, same order) on every level's tiles and on
// random collinear runs, including near-epsilon touches.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CollisionObject2D, Edge } from '../../src/runtime/physics';
import { mergeEdges, polygonEdges, StaticBody2D } from '../../src/runtime/physics';
import { Vec2 } from '../../src/runtime/vec2';
import { TileLayer, type TilesetData } from '../../src/levels/common/level_nodes';

// The original implementation, kept verbatim as the reference.
function referenceMerge(edges: Edge[]): Edge[] {
  type Item = { e: Edge; t0: number; t1: number; side: 1 | -1 };
  const groups = new Map<string, { dx: number; dy: number; items: Item[] }>();
  for (const e of edges) {
    let dx = e.bx - e.ax;
    let dy = e.by - e.ay;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    // Canonical direction for the line.
    let flip = false;
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) {
      dx = -dx;
      dy = -dy;
      flip = true;
    }
    const offset = dx * e.ay - dy * e.ax;
    const key = `${dx.toFixed(5)},${dy.toFixed(5)},${offset.toFixed(3)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { dx, dy, items: [] }));
    const ta = e.ax * dx + e.ay * dy;
    const tb = e.bx * dx + e.by * dy;
    g.items.push({ e, t0: Math.min(ta, tb), t1: Math.max(ta, tb), side: flip ? -1 : 1 });
  }
  const out: Edge[] = [];
  for (const g of groups.values()) {
    const pos = g.items.filter((i) => i.side === 1);
    const neg = g.items.filter((i) => i.side === -1);
    if (pos.length === 0 || neg.length === 0) {
      for (const i of g.items) out.push(i.e);
      continue;
    }
    for (const item of g.items) {
      const opposite = item.side === 1 ? neg : pos;
      // Subtract every opposite interval from [t0, t1].
      let pieces: [number, number][] = [[item.t0, item.t1]];
      for (const o of opposite) {
        const next: [number, number][] = [];
        for (const [a, b] of pieces) {
          if (o.t1 <= a + 1e-6 || o.t0 >= b - 1e-6) {
            next.push([a, b]);
            continue;
          }
          if (o.t0 > a + 1e-6) next.push([a, o.t0]);
          if (o.t1 < b - 1e-6) next.push([o.t1, b]);
        }
        pieces = next;
        if (pieces.length === 0) break;
      }
      for (const [a, b] of pieces) {
        if (b - a < 1e-6) continue;
        const e = item.e;
        // Rebuild the piece keeping the original direction (a->b of e).
        const ta = e.ax * g.dx + e.ay * g.dy;
        const forward = (e.bx * g.dx + e.by * g.dy) >= ta;
        const p0 = refPointOnLine(e, g.dx, g.dy, forward ? a : b);
        const p1 = refPointOnLine(e, g.dx, g.dy, forward ? b : a);
        out.push({ ...e, ax: p0.x, ay: p0.y, bx: p1.x, by: p1.y, stamp: 0 });
      }
    }
  }
  return out;
}

function refPointOnLine(e: Edge, dx: number, dy: number, t: number): Vec2 {
  const ta = e.ax * dx + e.ay * dy;
  return new Vec2(e.ax + dx * (t - ta), e.ay + dy * (t - ta));
}

const flat = (edges: Edge[]) => edges.map((e) => [e.ax, e.ay, e.bx, e.by, e.nx, e.ny, e.layer, e.body.name]);

function expectSame(edges: Edge[]): number {
  const want = referenceMerge(edges.map((e) => ({ ...e })));
  const got = mergeEdges(edges.map((e) => ({ ...e })));
  expect(got.length).toBe(want.length);
  expect(flat(got)).toEqual(flat(want));
  return got.length;
}

/** The pre-merge edges of a level's tile layers, as PhysicsWorld builds them (buried tiles give none). */
function levelEdges(file: string): Edge[][] {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { nodes: { cells?: [number, number, number, number][]; props: Record<string, unknown> }[] };
  const out: Edge[][] = [];
  for (const n of data.nodes) {
    if (!n.cells) continue;
    const id = /tiles\/([a-z0-9_]+)_tiles\.tres/.exec(JSON.stringify(n.props.tile_set ?? ''))?.[1] ?? '';
    const ts = JSON.parse(readFileSync(`src/levels/data/tilesets/${id}.json`, 'utf8')) as TilesetData;
    const layer = new TileLayer();
    layer.build(ts, n.cells);
    for (const body of layer.findChildren<StaticBody2D>((c) => c instanceof StaticBody2D)) {
      const edges: Edge[] = [];
      for (const shape of body.shapes) {
        if (shape.kind !== 'polygon' || shape.edgeless) continue;
        edges.push(...polygonEdges(shape.points, body as CollisionObject2D));
      }
      out.push(edges);
    }
  }
  return out;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('mergeEdges equivalence', () => {
  for (const level of ['z1_retro_rush_hills/act1', 'z1_retro_rush_hills/act2', 'z2_wizard_academy/act1', 'z2_wizard_academy/act2', 'z3_capital_mansion/act1', 'z3_capital_mansion/act2', 'test_zone/test_zone']) {
    it(`matches the original on ${level}`, () => {
      let merged = 0;
      for (const edges of levelEdges(`src/levels/data/${level}.json`)) merged += expectSame(edges);
      expect(merged).toBeGreaterThan(0);
    });
  }

  it('matches the original on random collinear runs, long and short, with near-epsilon touches', () => {
    const body = new StaticBody2D('b') as CollisionObject2D;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const edges: Edge[] = [];
      const lines = 1 + Math.floor(r() * 4);
      for (let l = 0; l < lines; l++) {
        const angle = [0, Math.PI / 2, Math.PI / 4, Math.atan2(1, 2), r() * Math.PI][Math.floor(r() * 5)]!;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const ox = Math.round(r() * 64);
        const oy = Math.round(r() * 64);
        const n = 1 + Math.floor(r() * 40);
        for (let i = 0; i < n; i++) {
          const unit = [16, 8, 1, 0.5][Math.floor(r() * 4)]!;
          let t0 = Math.floor(r() * 20) * unit + (r() < 0.2 ? (r() - 0.5) * 4e-6 : 0);
          const len = r() < 0.1 ? 100 + r() * 300 : unit * (1 + Math.floor(r() * 3));
          let t1 = t0 + len;
          if (r() < 0.5) [t0, t1] = [t1, t0];
          edges.push({ ax: ox + dx * t0, ay: oy + dy * t0, bx: ox + dx * t1, by: oy + dy * t1, nx: -dy, ny: dx, body, layer: 1, stamp: 0 });
        }
      }
      expectSame(edges);
    }
  });
});
