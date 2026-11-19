// A rebuild from the same tile data (a respawn) reuses the last merge, and the
// world then answers exactly as after a fresh merge.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileLayer, type TilesetData } from '../../src/levels/common/level_nodes';
import { PhysicsWorld, StaticBody2D } from '../../src/runtime/physics';
import { Vec2 } from '../../src/runtime/vec2';

const parsed = new Map<string, unknown>();

/** A tile layer built from the level's data (parsed once, like the cached level module). */
function layer(level: string): TileLayer {
  if (!parsed.has(level)) parsed.set(level, JSON.parse(readFileSync(`src/levels/data/${level}.json`, 'utf8')));
  const data = parsed.get(level) as { nodes: { cells?: [number, number, number, number][]; props: Record<string, unknown> }[] };
  const n = data.nodes.find((x) => x.cells)!;
  const id = /tiles\/([a-z0-9_]+)_tiles\.tres/.exec(JSON.stringify(n.props.tile_set ?? ''))?.[1] ?? '';
  if (!parsed.has(id)) parsed.set(id, JSON.parse(readFileSync(`src/levels/data/tilesets/${id}.json`, 'utf8')));
  const ts = parsed.get(id) as TilesetData;
  const l = new TileLayer();
  l.build(ts, n.cells!);
  return l;
}

const bodies = (l: TileLayer) => l.findChildren<StaticBody2D>((n) => n instanceof StaticBody2D);
const edgesOf = (w: PhysicsWorld, l: TileLayer) => bodies(l).map((b) => w.bodyEdges(b).map((e) => [e.a.x, e.a.y, e.b.x, e.b.y, e.normal.x, e.normal.y]));
const polysOf = (w: PhysicsWorld, l: TileLayer) => bodies(l).map((b) => w.bodyPolygons(b).map((p) => p.map((v) => [v.x, v.y])));

function probe(w: PhysicsWorld): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < 400; i++) {
    const x = (i * 97) % 6000;
    const y = (i * 53) % 1500;
    const hit = w.intersectRay(new Vec2(x, y - 300), new Vec2(x + (i % 7) - 3, y + 300), 0xffff);
    out.push(hit ? [hit.position.x, hit.position.y, hit.normal.x, hit.normal.y, (hit.collider as StaticBody2D).name] : null);
    out.push(w.intersectPoint(new Vec2(x, y), 0xffff).map((b) => b.name));
  }
  return out;
}

describe('merge cache across a respawn', () => {
  it('gives the same edges, polygons and query answers as a fresh merge', () => {
    const level = 'z3_capital_mansion/act2';
    // Fresh world: the reference answers.
    const fresh = new PhysicsWorld();
    const a = layer(level);
    for (const b of bodies(a)) fresh._register(b);
    const wantEdges = edgesOf(fresh, a);
    const wantPolys = polysOf(fresh, a);
    const wantProbe = probe(fresh);

    // One world through a respawn: the old layer leaves, a rebuilt one enters (cache hit).
    const world = new PhysicsWorld();
    const first = layer(level);
    for (const b of bodies(first)) world._register(b);
    probe(world);
    for (const b of bodies(first)) world._unregister(b);
    const again = layer(level);
    expect(bodies(again)[0]!.shapes[0]).toBe(bodies(first)[0]!.shapes[0]);
    for (const b of bodies(again)) world._register(b);
    expect(edgesOf(world, again)).toEqual(wantEdges);
    expect(polysOf(world, again)).toEqual(wantPolys);
    expect(probe(world)).toEqual(wantProbe);
    // Nothing answers for the bodies that left.
    expect(world.bodyEdges(bodies(first)[0]!)).toEqual([]);
  });

  it('merges again when the shapes change', () => {
    const world = new PhysicsWorld();
    const l = layer('z1_retro_rush_hills/act1');
    const solid = bodies(l)[0]!;
    world._register(solid);
    const before = JSON.stringify(world.bodyEdges(solid));
    const open = solid.shapes.find((s) => !s.edgeless)!;
    open.disabled = true;
    solid.shapesChanged();
    const after = JSON.stringify(world.bodyEdges(solid));
    delete open.disabled;
    solid.shapesChanged();
    expect(after).not.toBe(before);
    expect(JSON.stringify(world.bodyEdges(solid))).toBe(before);
  });
});
