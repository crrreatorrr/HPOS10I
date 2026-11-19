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
  private chunkCache: ChunkCache | null = null;
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
      this.chunkCache = null;
    }
  }

  /**
   * Builds collision from cells and the tileset (call before entering the tree). The last
   * layer's shapes are shared when the same cells and tileset come again (a respawn rebuilds
   * the level from the same data): nothing changes a tile shape after it is made.
   */
  build(tileset: TilesetData, cells: [number, number, number, number][]): void {
    this.tileset = tileset;
    this.cells = cells;
    const last = lastTileGeometry;
    const geometry = last && last.cells === cells && last.tileset === tileset ? last.geometry : tileGeometry(tileset, cells);
    lastTileGeometry = { cells, tileset, geometry };
    this.solid.clearShapes();
    for (const s of geometry.solid) this.solid.addShape(s);
    this.topOnly.clearShapes();
    for (const s of geometry.top) this.topOnly.addShape(s);
    this.bounds = geometry.bounds;
    this.chunkCache = null;
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
    return TileLayer.atlasPathFor(this.artZone || this.tilesetId);
  }

  /** The tile atlas of an art zone. */
  static atlasPathFor(zone: string): string {
    return `assets/tiles/${zone}_tiles.png`;
  }

  /** This layer's pre-rendered chunks: the last layer's when it drew the same cells with the same atlas (a respawn). */
  private chunksFor(atlas: HTMLImageElement): ChunkCache {
    const own = this.chunkCache;
    if (own && own.cells === this.cells && own.atlas === atlas) return own;
    const shared = lastChunkCache;
    const cache = shared && shared.cells === this.cells && shared.atlas === atlas ? shared : { cells: this.cells, atlas, chunks: new Map(), index: null };
    this.chunkCache = cache;
    lastChunkCache = cache;
    return cache;
  }

  private chunk(cx: number, cy: number, atlas: HTMLImageElement): HTMLCanvasElement | null {
    const key = `${cx},${cy}`;
    const cache = this.chunksFor(atlas);
    const chunks = cache.chunks;
    if (chunks.has(key)) return chunks.get(key)!;
    if (!cache.index) {
      cache.index = new Map();
      for (const c of this.cells) {
        const k = `${Math.floor((c[0] * TILE) / CHUNK)},${Math.floor((c[1] * TILE) / CHUNK)}`;
        let list = cache.index.get(k);
        if (!list) cache.index.set(k, (list = []));
        list.push(c);
      }
    }
    const list = cache.index.get(key);
    if (!list) {
      chunks.set(key, null);
      return null;
    }
    const canvas = makeCanvas(CHUNK, CHUNK);
    if (!canvas) return null;
    const ctx = context2d(canvas);
    for (const [x, y, ax, ay] of list) {
      ctx.drawImage(atlas, ax * TILE, ay * TILE, TILE, TILE, x * TILE - cx * CHUNK, y * TILE - cy * CHUNK, TILE, TILE);
    }
    chunks.set(key, canvas);
    return canvas;
  }
}

/** Pre-rendered 256 px chunks of one cells array drawn with one atlas. */
interface ChunkCache {
  cells: readonly [number, number, number, number][];
  atlas: HTMLImageElement;
  chunks: Map<string, HTMLCanvasElement | null>;
  index: Map<string, [number, number, number, number][]> | null;
}

/**
 * The chunks of the tile layer drawn last, so a respawn (the same level rebuilt from the same
 * data) draws without pre-rendering them again. One entry only: a level's chunks can be tens
 * of MB, and no other level keeps them alive.
 */
let lastChunkCache: ChunkCache | null = null;

interface TileGeometry {
  solid: Shape[];
  top: Shape[];
  bounds: Rect2;
}

/** The last tile layer's geometry (one entry: a respawn reuses it, other levels never keep theirs alive). */
let lastTileGeometry: { cells: object; tileset: TilesetData; geometry: TileGeometry } | null = null;

/** Drops the tile shapes and chunk pictures kept for a respawn (when a menu takes over). */
export function releaseTileCaches(): void {
  lastTileGeometry = null;
  lastChunkCache = null;
}

/** One number per tile coordinate (exact for any coordinate within +-524288 tiles). */
function tileKey(x: number, y: number): number {
  return (x + 524288) * 1048576 + (y + 524288);
}

/**
 * Collision shapes of a tile layer: solid and top-only polygons in cell order. A full-square
 * tile surrounded by full squares on four sides is buried: it keeps its polygon for point
 * queries but gives rays no edges.
 */
function tileGeometry(tileset: TilesetData, cells: [number, number, number, number][]): TileGeometry {
  const infos = new Map<number, TilesetData['cells'][string] | undefined>();
  const infoAt = (ax: number, ay: number) => {
    const k = tileKey(ax, ay);
    if (infos.has(k)) return infos.get(k);
    const info = tileset.cells[`${ax},${ay}`];
    infos.set(k, info);
    return info;
  };
  const fullInfo = new Map<object, boolean>();
  const full = new Set<number>();
  for (const [x, y, ax, ay] of cells) {
    const info = infoAt(ax, ay);
    if (!info) continue;
    let isFull = fullInfo.get(info);
    if (isFull === undefined) {
      const solid = info.solid;
      isFull = !!solid && solid.length === 1 && isFullSquare(solid[0]!);
      fullInfo.set(info, isFull);
    }
    if (isFull) full.add(tileKey(x, y));
  }
  const solid: Shape[] = [];
  const top: Shape[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, ax, ay] of cells) {
    const info = infoAt(ax, ay);
    if (!info) continue;
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    minX = Math.min(minX, x * TILE);
    minY = Math.min(minY, y * TILE);
    maxX = Math.max(maxX, x * TILE + TILE);
    maxY = Math.max(maxY, y * TILE + TILE);
    const buried =
      full.has(tileKey(x, y)) && full.has(tileKey(x - 1, y)) && full.has(tileKey(x + 1, y)) && full.has(tileKey(x, y - 1)) && full.has(tileKey(x, y + 1));
    for (const flat of info.solid ?? []) {
      const shape = polygonShape(toPoints(flat, cx, cy));
      if (buried) (shape as Shape & { edgeless?: boolean }).edgeless = true;
      solid.push(shape);
    }
    for (const flat of info.top ?? []) top.push(polygonShape(toPoints(flat, cx, cy)));
  }
  const bounds = cells.length ? new Rect2(minX, minY, maxX - minX, maxY - minY) : new Rect2();
  return { solid, top, bounds };
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
