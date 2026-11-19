// TileLayer.build() must make the same collision shapes as before its numeric-key rewrite,
// and a rebuild from the same data (a respawn) reuses them.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileLayer, type TilesetData } from '../../src/levels/common/level_nodes';
import { polygonShape, StaticBody2D, type Shape } from '../../src/runtime/physics';
import { Rect2, Vec2 } from '../../src/runtime/vec2';

const TILE = 16;

/** The original string-keyed build, as the reference. */
function reference(tileset: TilesetData, cells: [number, number, number, number][]): { solid: Shape[]; top: Shape[]; bounds: Rect2 } {
  const isFullSquare = (flat: number[]) =>
    flat.length === 8 && [flat[0], flat[2], flat[4], flat[6]].map((v) => Math.abs(v!)).every((v) => v === 8) && [flat[1], flat[3], flat[5], flat[7]].map((v) => Math.abs(v!)).every((v) => v === 8);
  const toPoints = (flat: number[], cx: number, cy: number) => {
    const out: Vec2[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push(new Vec2(flat[i]! + cx, flat[i + 1]! + cy));
    return out;
  };
  const full = new Set<string>();
  for (const [x, y, ax, ay] of cells) {
    const solid = tileset.cells[`${ax},${ay}`]?.solid;
    if (solid && solid.length === 1 && isFullSquare(solid[0]!)) full.add(`${x},${y}`);
  }
  const solidShapes: Shape[] = [];
  const topShapes: Shape[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, ax, ay] of cells) {
    const info = tileset.cells[`${ax},${ay}`];
    if (!info) continue;
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    minX = Math.min(minX, x * TILE);
    minY = Math.min(minY, y * TILE);
    maxX = Math.max(maxX, x * TILE + TILE);
    maxY = Math.max(maxY, y * TILE + TILE);
    const buried = full.has(`${x},${y}`) && full.has(`${x - 1},${y}`) && full.has(`${x + 1},${y}`) && full.has(`${x},${y - 1}`) && full.has(`${x},${y + 1}`);
    for (const flat of info.solid ?? []) {
      const shape = polygonShape(toPoints(flat, cx, cy));
      if (buried) (shape as Shape & { edgeless?: boolean }).edgeless = true;
      solidShapes.push(shape);
    }
    for (const flat of info.top ?? []) topShapes.push(polygonShape(toPoints(flat, cx, cy)));
  }
  return { solid: solidShapes, top: topShapes, bounds: cells.length ? new Rect2(minX, minY, maxX - minX, maxY - minY) : new Rect2() };
}

const plain = (shapes: Shape[]) => shapes.map((s) => (s.kind === 'polygon' ? [s.points.map((p) => [p.x, p.y]), s.edgeless === true] : s.kind));

function layers(level: string): { ts: TilesetData; cells: [number, number, number, number][] }[] {
  const data = JSON.parse(readFileSync(`src/levels/data/${level}.json`, 'utf8')) as { nodes: { cells?: [number, number, number, number][]; props: Record<string, unknown> }[] };
  return data.nodes
    .filter((n) => n.cells)
    .map((n) => {
      const id = /tiles\/([a-z0-9_]+)_tiles\.tres/.exec(JSON.stringify(n.props.tile_set ?? ''))?.[1] ?? '';
      return { ts: JSON.parse(readFileSync(`src/levels/data/tilesets/${id}.json`, 'utf8')) as TilesetData, cells: n.cells! };
    });
}

function bodies(layer: TileLayer): StaticBody2D[] {
  return layer.findChildren<StaticBody2D>((n) => n instanceof StaticBody2D);
}

describe('tile layer geometry', () => {
  for (const level of ['z1_retro_rush_hills/act1', 'z2_wizard_academy/act2', 'z3_capital_mansion/act1', 'z3_capital_mansion/act2', 'test_zone/test_zone']) {
    it(`matches the original build on ${level}`, () => {
      for (const { ts, cells } of layers(level)) {
        const want = reference(ts, cells);
        const layer = new TileLayer();
        layer.build(ts, cells);
        const [solid, top] = bodies(layer);
        expect(plain(solid!.shapes)).toEqual(plain(want.solid));
        expect(plain(top!.shapes)).toEqual(plain(want.top));
        expect((layer as unknown as { bounds: Rect2 }).bounds).toEqual(want.bounds);
      }
    });
  }

  it('a rebuild from the same data (a respawn) reuses the shapes', () => {
    const [{ ts, cells }] = layers('z3_capital_mansion/act2');
    const a = new TileLayer();
    a.build(ts!, cells!);
    const b = new TileLayer();
    b.build(ts!, cells!);
    expect(bodies(b)[0]!.shapes[0]).toBe(bodies(a)[0]!.shapes[0]);
    expect(bodies(b)[0]!.shapes.length).toBe(bodies(a)[0]!.shapes.length);
  });
});
