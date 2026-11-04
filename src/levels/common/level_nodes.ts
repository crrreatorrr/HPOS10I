// Built-in level node types: the tile layer, decor rectangles, the Bounds
// rectangle and markers. Everything else is registered by its original scene
// or script path in registry.ts.

import { Layers } from '../../core/layers';
import { assetImage } from '../../runtime/assets';
import { Color } from '../../runtime/color';
import { context2d, makeCanvas, type Gfx } from '../../runtime/gfx';
import { Node2D } from '../../runtime/node';
import { polygonShape, StaticBody2D, type Shape } from '../../runtime/physics';
import { Rect2, Vec2 } from '../../runtime/vec2';
import type { Configurable, Props } from './props';

export const TILE = 16;
const CHUNK = 256;

export interface TilesetData {
  texture: string;
  cells: Record<string, { solid?: number[][]; top?: number[][] }>;
}

const tilesetModules = import.meta.glob('../data/tilesets/*.json', { import: 'default' }) as Record<string, () => Promise<TilesetData>>;
const tilesets = new Map<string, TilesetData>();

/** Loads a tileset by zone id ("z1_retro_rush_hills"). */
export async function loadTileset(id: string): Promise<TilesetData | null> {
  const known = tilesets.get(id);
  if (known) return known;
  const loader = tilesetModules[`../data/tilesets/${id}.json`];
  if (!loader) return null;
  const data = await loader();
  tilesets.set(id, data);
  return data;
}

export function tilesetIdFromPath(path: string): string {
  const m = /tiles\/([a-z0-9_]+)_tiles\.tres$/.exec(path);
  return m ? m[1]! : '';
}

/**
 * A layer of 16x16 terrain tiles. Collision is two static bodies (solid and
 * top-only) whose shared tile edges are merged away, so a run of tiles is one
 * clean surface for the sensors. Tiles buried in solid ground keep only
 * their point-query polygon (no edges), which keeps the edge grid small.
 * Drawing uses pre-rendered 256 px chunks of the zone's tile atlas.
 */
export class TileLayer extends Node2D implements Configurable {
  tilesetId = '';
  /** Art zone whose atlas is drawn (same layout and collision in every zone). */
  artZone = '';
  cells: [number, number, number, number][] = [];
  tileset: TilesetData | null = null;
  private solid = new StaticBody2D('TileSolid');
  private topOnly = new StaticBody2D('TileTopOnly');
  private chunks = new Map<string, HTMLCanvasElement | null>();
  private bounds = new Rect2();

  constructor(name = 'Tiles') {
    super(name);
    this.solid.collisionLayer = Layers.TERRAIN_SOLID;
    this.solid.mergeEdges = true;
    this.topOnly.collisionLayer = Layers.TERRAIN_TOP_ONLY;
    this.topOnly.mergeEdges = true;
    this.addChild(this.solid);
    this.addChild(this.topOnly);
    this.zIndex = -4;
  }

  applyProps(p: Props): void {
    this.tilesetId = tilesetIdFromPath(p.str('tile_set', ''));
  }

  setArtZone(zone: string): void {
    if (zone !== this.artZone) {
      this.artZone = zone;
      this.chunks.clear();
    }
  }

  /** Builds collision from cells and the tileset (call before entering the tree). */
  build(tileset: TilesetData, cells: [number, number, number, number][]): void {
    this.tileset = tileset;
    this.cells = cells;
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
      const buried =
        full.has(`${x},${y}`) && full.has(`${x - 1},${y}`) && full.has(`${x + 1},${y}`) && full.has(`${x},${y - 1}`) && full.has(`${x},${y + 1}`);
      for (const flat of info.solid ?? []) {
        const shape = polygonShape(toPoints(flat, cx, cy));
        if (buried) (shape as Shape & { edgeless?: boolean }).edgeless = true;
        solidShapes.push(shape);
      }
      for (const flat of info.top ?? []) topShapes.push(polygonShape(toPoints(flat, cx, cy)));
    }
    this.solid.clearShapes();
    for (const s of solidShapes) this.solid.addShape(s);
    this.topOnly.clearShapes();
    for (const s of topShapes) this.topOnly.addShape(s);
    this.bounds = cells.length ? new Rect2(minX, minY, maxX - minX, maxY - minY) : new Rect2();
    this.chunks.clear();
  }

  cullRect(): Rect2 | null {
    return null;
  }

  override draw(g: Gfx): void {
    if (!this.tileset || this.cells.length === 0) return;
    const atlas = assetImage(this.atlasPath());
    if (!atlas) return;
    // The view in this layer's space (layer sits at the origin in levels).
    const t = g.transform;
    const viewX = -t.tx;
    const viewY = -t.ty;
    const x0 = Math.floor(Math.max(viewX, this.bounds.x) / CHUNK);
    const y0 = Math.floor(Math.max(viewY, this.bounds.y) / CHUNK);
    const x1 = Math.floor(Math.min(viewX + 424, this.bounds.right) / CHUNK);
    const y1 = Math.floor(Math.min(viewY + 240, this.bounds.bottom) / CHUNK);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const chunk = this.chunk(cx, cy, atlas);
        if (chunk) g.ctx.drawImage(chunk, cx * CHUNK, cy * CHUNK);
      }
    }
  }

  private atlasPath(): string {
    const zone = this.artZone || this.tilesetId;
    return `assets/tiles/${zone}_tiles.png`;
  }

  private chunkIndex: Map<string, [number, number, number, number][]> | null = null;

  private chunk(cx: number, cy: number, atlas: HTMLImageElement): HTMLCanvasElement | null {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return this.chunks.get(key)!;
    if (!this.chunkIndex) {
      this.chunkIndex = new Map();
      for (const c of this.cells) {
        const k = `${Math.floor((c[0] * TILE) / CHUNK)},${Math.floor((c[1] * TILE) / CHUNK)}`;
        let list = this.chunkIndex.get(k);
        if (!list) this.chunkIndex.set(k, (list = []));
        list.push(c);
      }
    }
    const list = this.chunkIndex.get(key);
    if (!list) {
      this.chunks.set(key, null);
      return null;
    }
    const canvas = makeCanvas(CHUNK, CHUNK);
    if (!canvas) return null;
    const ctx = context2d(canvas);
    for (const [x, y, ax, ay] of list) {
      ctx.drawImage(atlas, ax * TILE, ay * TILE, TILE, TILE, x * TILE - cx * CHUNK, y * TILE - cy * CHUNK, TILE, TILE);
    }
    this.chunks.set(key, canvas);
    return canvas;
  }
}

function toPoints(flat: number[], cx: number, cy: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push(new Vec2(flat[i]! + cx, flat[i + 1]! + cy));
  return out;
}

function isFullSquare(flat: number[]): boolean {
  if (flat.length !== 8) return false;
  const xs = [flat[0], flat[2], flat[4], flat[6]].map(Math.abs);
  const ys = [flat[1], flat[3], flat[5], flat[7]].map(Math.abs);
  return xs.every((v) => v === 8) && ys.every((v) => v === 8);
}

/** A flat coloured rectangle in the level (back walls, shadows, signs). */
export class DecorRect extends Node2D implements Configurable {
  rect = new Rect2();
  color = Color.WHITE;

  applyProps(p: Props): void {
    const l = p.num('offset_left', 0);
    const t = p.num('offset_top', 0);
    const r = p.num('offset_right', l);
    const b = p.num('offset_bottom', t);
    this.rect = new Rect2(l, t, r - l, b - t);
    this.color = p.color('color', this.color);
  }

  cullRect(): Rect2 {
    return this.rect;
  }

  override draw(g: Gfx): void {
    g.rectR(this.rect, this.color);
  }
}

/** The level's camera limits; below its bottom edge is a pit. */
export class BoundsRect extends Node2D implements Configurable {
  rect = new Rect2();

  applyProps(p: Props): void {
    const l = p.num('offset_left', 0);
    const t = p.num('offset_top', 0);
    const r = p.num('offset_right', l);
    const b = p.num('offset_bottom', t);
    this.rect = new Rect2(l, t, r - l, b - t);
  }

  globalRect(): Rect2 {
    const o = this.globalPosition;
    return this.rect.translated(o);
  }
}

export class Marker extends Node2D {}

/** Builds a tile atlas canvas (for tests and missing atlases: a plain checker). */
export function placeholderAtlas(): HTMLCanvasElement | null {
  const c = makeCanvas(16, 16);
  if (!c) return null;
  const ctx = context2d(c);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, 0, 16, 16);
  return c;
}
