// Collision for the game: no rigid bodies, only what the momentum
// controller and the trigger areas need.
//
//  - Bodies (static and animatable) are polygons on collision layers. Their
//    outward-facing edges sit in a uniform grid, so a ray only looks at the
//    few edges near it. Static bodies flagged `mergeEdges` (tile maps) have
//    the edges they share with neighbours removed first, so the floor of a
//    row of tiles is one clean line for the sensors (no internal edges).
//  - Rays only hit edges facing them (they never "hit from inside"), like
//    the original sensors were set up to expect.
//  - Animatable bodies are moved by their scripts during a tick and the world
//    sees the new place at the end of the tick (step()), so every sensor in a
//    tick reads the same geometry the previous frame drew.
//  - Areas (triggers) report enter/exit overlaps against other areas, once
//    per tick after every script has run.

import { Node2D } from './node';
import { Signal } from './signal';
import { Transform2D } from './transform';
import { Rect2, Vec2 } from './vec2';

// --- Shapes -------------------------------------------------------------------------

/** `edgeless` shapes answer point queries but give rays no edges (tiles buried in ground). */
export type Shape =
  | { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean; edgeless?: boolean }
  | { kind: 'circle'; radius: number; offset: Vec2; disabled?: boolean; edgeless?: boolean }
  | { kind: 'polygon'; points: Vec2[]; disabled?: boolean; edgeless?: boolean };

export function rectShape(size: Vec2, offset: Vec2 = Vec2.ZERO): Shape {
  return { kind: 'rect', size, offset };
}

export function circleShape(radius: number, offset: Vec2 = Vec2.ZERO): Shape {
  return { kind: 'circle', radius, offset };
}

export function polygonShape(points: Vec2[]): Shape {
  return { kind: 'polygon', points };
}

function shapePolygon(shape: Shape): Vec2[] {
  switch (shape.kind) {
    case 'rect': {
      const hx = shape.size.x / 2;
      const hy = shape.size.y / 2;
      const o = shape.offset;
      return [
        new Vec2(o.x - hx, o.y - hy),
        new Vec2(o.x + hx, o.y - hy),
        new Vec2(o.x + hx, o.y + hy),
        new Vec2(o.x - hx, o.y + hy),
      ];
    }
    case 'circle': {
      const out: Vec2[] = [];
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push(new Vec2(shape.offset.x + Math.cos(a) * shape.radius, shape.offset.y + Math.sin(a) * shape.radius));
      }
      return out;
    }
    case 'polygon':
      return shape.points;
  }
}

export function polygonArea(points: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// --- Collision objects ----------------------------------------------------------------

export abstract class CollisionObject2D extends Node2D {
  collisionLayer = 1;
  collisionMask = 0;
  readonly shapes: Shape[] = [];
  /** @internal */ _world: PhysicsWorld | null = null;
  /** @internal Bumped on every shape change (area geometry cache). */
  _shapeVersion = 0;

  addShape(shape: Shape): Shape {
    this._shapeVersion++;
    this.shapes.push(shape);
    this._world?._shapesChanged(this);
    return shape;
  }

  clearShapes(): void {
    this._shapeVersion++;
    this.shapes.length = 0;
    this._world?._shapesChanged(this);
  }

  /** Call after changing shapes in place. */
  shapesChanged(): void {
    this._shapeVersion++;
    this._world?._shapesChanged(this);
  }

  override enterTree(): void {
    const world = this.tree.physics;
    world._register(this);
  }

  override exitTree(): void {
    this._world?._unregister(this);
  }

  /** World transform the physics world currently uses for this object. */
  serverTransform(): Transform2D {
    return this._world?._serverTransform(this) ?? this.globalTransform;
  }

  serverOrigin(): Vec2 {
    return this.serverTransform().origin;
  }
}

export class StaticBody2D extends CollisionObject2D {
  /** Remove edges shared with other mergeable polygons on the same layer (tile maps). */
  mergeEdges = false;
  /** Conveyors: px/frame along the surface, + is right (contract `conveyor_speed`). */

  /** Re-read the transform and shapes after moving a static body. */
  refresh(): void {
    this._world?._shapesChanged(this);
  }
}

/** Terrain moved by a script. Exposes platformDelta() by convention (moving terrain). */
export class AnimatableBody2D extends CollisionObject2D {
  syncToPhysics = true;
}

export class Area2D extends CollisionObject2D {
  monitoring = true;
  private _monitorable = true;
  readonly areaEntered = new Signal<[Area2D]>();
  readonly areaExited = new Signal<[Area2D]>();
  /** @internal */ readonly _overlaps = new Set<Area2D>();

  get monitorable(): boolean {
    return this._monitorable;
  }

  set monitorable(v: boolean) {
    this._monitorable = v;
  }

  /** Deferred setter, kept for API parity (takes effect at the next overlap pass). */
  setMonitorableDeferred(v: boolean): void {
    this._monitorable = v;
  }

  getOverlappingAreas(): Area2D[] {
    return [...this._overlaps];
  }

  overlapsArea(other: Area2D): boolean {
    return this._overlaps.has(other);
  }
}

// --- World ----------------------------------------------------------------------------

export interface RayHit {
  position: Vec2;
  normal: Vec2;
  collider: CollisionObject2D;
  layer: number;
}

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  body: CollisionObject2D;
  layer: number;
  stamp: number;
}

interface WorldPoly {
  points: Vec2[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  body: CollisionObject2D;
  stamp: number;
}

interface BodyRecord {
  body: CollisionObject2D;
  transform: Transform2D;
  edges: Edge[];
  polys: WorldPoly[];
  cells: number[];
  isStatic: boolean;
}

const CELL = 64;
const EPS = 1e-9;

function cellKey(cx: number, cy: number): number {
  // 2^21 cells either way is far beyond any level.
  return (cx + 1048576) * 2097152 + (cy + 1048576);
}

export class PhysicsWorld {
  private records = new Map<CollisionObject2D, BodyRecord>();
  private dynamic: BodyRecord[] = [];
  private edgeGrid = new Map<number, Edge[]>();
  private polyGrid = new Map<number, WorldPoly[]>();
  private areas: Area2D[] = [];
  private stamp = 1;
  private mergeDirty = new Set<number>();
  private mergeGroups = new Map<number, Set<CollisionObject2D>>();
  /** Bumped when the static geometry changes (terrain caches can watch it). */
  revision = 0;

  // --- Registration ---------------------------------------------------------------

  /** @internal */
  _register(obj: CollisionObject2D): void {
    obj._world = this;
    if (obj instanceof Area2D) {
      this.areas.push(obj);
      return;
    }
    const rec: BodyRecord = {
      body: obj,
      transform: obj.globalTransform,
      edges: [],
      polys: [],
      cells: [],
      isStatic: obj instanceof StaticBody2D,
    };
    this.records.set(obj, rec);
    if (!rec.isStatic) this.dynamic.push(rec);
    if (obj instanceof StaticBody2D && obj.mergeEdges) {
      let group = this.mergeGroups.get(obj.collisionLayer);
      if (!group) this.mergeGroups.set(obj.collisionLayer, (group = new Set()));
      group.add(obj);
      this.mergeDirty.add(obj.collisionLayer);
    } else {
      this.build(rec);
    }
  }

  /** @internal */
  _unregister(obj: CollisionObject2D): void {
    if (obj instanceof Area2D) {
      const i = this.areas.indexOf(obj);
      if (i >= 0) this.areas.splice(i, 1);
      for (const other of obj._overlaps) {
        other._overlaps.delete(obj);
        if (other.isInsideTree()) other.areaExited.emit(obj);
      }
      for (const other of this.areas) {
        if (other._overlaps.delete(obj) && other.isInsideTree()) other.areaExited.emit(obj);
      }
      obj._overlaps.clear();
      obj._world = null;
      return;
    }
    const rec = this.records.get(obj);
    if (rec) {
      this.unindex(rec);
      this.records.delete(obj);
      const di = this.dynamic.indexOf(rec);
      if (di >= 0) this.dynamic.splice(di, 1);
      if (obj instanceof StaticBody2D && obj.mergeEdges) {
        this.mergeGroups.get(obj.collisionLayer)?.delete(obj);
        this.mergeDirty.add(obj.collisionLayer);
      }
      this.revision++;
    }
    obj._world = null;
  }

  /** @internal */
  _shapesChanged(obj: CollisionObject2D): void {
    const rec = this.records.get(obj);
    if (!rec) return;
    rec.transform = obj.globalTransform;
    if (obj instanceof StaticBody2D && obj.mergeEdges) {
      this.mergeDirty.add(obj.collisionLayer);
    } else {
      this.build(rec);
    }
  }

  /** @internal */
  _serverTransform(obj: CollisionObject2D): Transform2D {
    return this.records.get(obj)?.transform ?? obj.globalTransform;
  }

  private unindex(rec: BodyRecord): void {
    for (const key of rec.cells) {
      const edges = this.edgeGrid.get(key);
      if (edges) {
        const kept = edges.filter((e) => e.body !== rec.body);
        if (kept.length) this.edgeGrid.set(key, kept);
        else this.edgeGrid.delete(key);
      }
      const polys = this.polyGrid.get(key);
      if (polys) {
        const kept = polys.filter((p) => p.body !== rec.body);
        if (kept.length) this.polyGrid.set(key, kept);
        else this.polyGrid.delete(key);
      }
    }
    rec.cells = [];
  }

  private worldPolys(rec: BodyRecord): { pts: Vec2[]; edgeless: boolean }[] {
    const t = rec.transform;
    const out: { pts: Vec2[]; edgeless: boolean }[] = [];
    const identity = t.isTranslationOnly() && t.tx === 0 && t.ty === 0;
    for (const shape of rec.body.shapes) {
      if (shape.disabled) continue;
      const local = shapePolygon(shape);
      if (local.length < 3) continue;
      out.push({ pts: identity ? local : local.map((p) => t.xform(p)), edgeless: shape.edgeless === true });
    }
    return out;
  }

  private build(rec: BodyRecord): void {
    this.unindex(rec);
    rec.edges = [];
    rec.polys = [];
    for (const poly of this.worldPolys(rec)) {
      rec.polys.push(makeWorldPoly(poly.pts, rec.body));
      if (!poly.edgeless) pushAll(rec.edges, polygonEdges(poly.pts, rec.body));
    }
    if (rec.isStatic) this.index(rec);
    this.revision++;
  }

  private index(rec: BodyRecord): void {
    const cells = new Set<number>();
    for (const e of rec.edges) {
      for (const key of cellsFor(Math.min(e.ax, e.bx), Math.min(e.ay, e.by), Math.max(e.ax, e.bx), Math.max(e.ay, e.by))) {
        let list = this.edgeGrid.get(key);
        if (!list) this.edgeGrid.set(key, (list = []));
        list.push(e);
        cells.add(key);
      }
    }
    for (const p of rec.polys) {
      for (const key of cellsFor(p.minX, p.minY, p.maxX, p.maxY)) {
        let list = this.polyGrid.get(key);
        if (!list) this.polyGrid.set(key, (list = []));
        list.push(p);
        cells.add(key);
      }
    }
    rec.cells = [...cells];
  }

  /** Rebuilds merged edges for tile-map style bodies (once, before the next query). */
  private flushMerges(): void {
    if (this.mergeDirty.size === 0) return;
    for (const layer of this.mergeDirty) {
      const group = this.mergeGroups.get(layer);
      if (!group) continue;
      const recs = [...group].map((b) => this.records.get(b)).filter((r): r is BodyRecord => !!r);
      for (const rec of recs) {
        this.unindex(rec);
        rec.transform = rec.body.globalTransform;
        rec.edges = [];
        rec.polys = [];
      }
      const all: Edge[] = [];
      for (const rec of recs) {
        for (const poly of this.worldPolys(rec)) {
          rec.polys.push(makeWorldPoly(poly.pts, rec.body));
          if (!poly.edgeless) pushAll(all, polygonEdges(poly.pts, rec.body));
        }
      }
      const merged = mergeEdges(all);
      for (const e of merged) this.records.get(e.body)?.edges.push(e);
      for (const rec of recs) this.index(rec);
    }
    this.mergeDirty.clear();
    this.revision++;
  }

  // --- Step -------------------------------------------------------------------------

  /** End of a physics tick: moving bodies take their new place, areas update overlaps. */
  step(): void {
    this.flushMerges();
    for (const rec of this.dynamic) {
      const t = rec.body.globalTransform;
      const old = rec.transform;
      if (t.tx !== old.tx || t.ty !== old.ty || t.a !== old.a || t.b !== old.b || t.c !== old.c || t.d !== old.d || rec.edges.length === 0) {
        rec.transform = t;
        rec.edges = [];
        rec.polys = [];
        for (const poly of this.worldPolys(rec)) {
          rec.polys.push(makeWorldPoly(poly.pts, rec.body));
          if (!poly.edgeless) pushAll(rec.edges, polygonEdges(poly.pts, rec.body));
        }
      }
    }
    this.updateAreas();
  }

  /** Moves a body's physics transform right away (teleports, tests). */
  syncNow(obj: CollisionObject2D): void {
    const rec = this.records.get(obj);
    if (!rec) return;
    rec.transform = obj.globalTransform;
    if (rec.isStatic) this._shapesChanged(obj);
    else {
      rec.edges = [];
      rec.polys = [];
      for (const poly of this.worldPolys(rec)) {
        rec.polys.push(makeWorldPoly(poly.pts, rec.body));
        if (!poly.edgeless) pushAll(rec.edges, polygonEdges(poly.pts, rec.body));
      }
    }
  }

  // --- Queries ----------------------------------------------------------------------

  /** Nearest edge facing the ray from `from` to `to` on `mask`, or null. */
  intersectRay(from: Vec2, to: Vec2, mask: number, exclude?: ReadonlySet<CollisionObject2D>): RayHit | null {
    this.flushMerges();
    const rx = to.x - from.x;
    const ry = to.y - from.y;
    let bestT = Number.POSITIVE_INFINITY;
    let best: Edge | null = null;
    const stamp = ++this.stamp;
    const test = (e: Edge) => {
      if (e.stamp === stamp) return;
      e.stamp = stamp;
      if ((e.layer & mask) === 0) return;
      if (e.nx * rx + e.ny * ry >= -EPS) return; // back-facing or parallel
      if (exclude && exclude.has(e.body)) return;
      const sx = e.bx - e.ax;
      const sy = e.by - e.ay;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < EPS) return;
      const qx = e.ax - from.x;
      const qy = e.ay - from.y;
      const t = (qx * sy - qy * sx) / denom;
      if (t < -EPS || t > 1 + EPS) return;
      const u = (qx * ry - qy * rx) / denom;
      if (u < -EPS || u > 1 + EPS) return;
      if (t < bestT || (t === bestT && best !== null && e.nx * rx + e.ny * ry < best.nx * rx + best.ny * ry)) {
        bestT = t;
        best = e;
      }
    };
    const minX = Math.min(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxX = Math.max(from.x, to.x);
    const maxY = Math.max(from.y, to.y);
    for (const key of cellsFor(minX, minY, maxX, maxY)) {
      const list = this.edgeGrid.get(key);
      if (list) for (const e of list) test(e);
    }
    for (const rec of this.dynamic) {
      if ((rec.body.collisionLayer & mask) === 0) continue;
      for (const e of rec.edges) test(e);
    }
    if (best === null) return null;
    const hit: Edge = best;
    const t = Math.max(0, Math.min(1, bestT));
    return {
      position: new Vec2(from.x + rx * t, from.y + ry * t),
      normal: new Vec2(hit.nx, hit.ny),
      collider: hit.body,
      layer: hit.layer,
    };
  }

  /** Bodies on `mask` whose polygons contain `point` (at most `max`). */
  intersectPoint(point: Vec2, mask: number, max = 32): CollisionObject2D[] {
    this.flushMerges();
    const out: CollisionObject2D[] = [];
    const seen = new Set<CollisionObject2D>();
    const consider = (p: WorldPoly) => {
      if (out.length >= max || seen.has(p.body)) return;
      if ((p.body.collisionLayer & mask) === 0) return;
      if (point.x < p.minX || point.x > p.maxX || point.y < p.minY || point.y > p.maxY) return;
      if (pointInPolygon(point, p.points)) {
        seen.add(p.body);
        out.push(p.body);
      }
    };
    const list = this.polyGrid.get(cellKey(Math.floor(point.x / CELL), Math.floor(point.y / CELL)));
    if (list) for (const p of list) consider(p);
    for (const rec of this.dynamic) for (const p of rec.polys) consider(p);
    return out;
  }

  /** Every body polygon in world space (debug drawing, terrain art). */
  bodyPolygons(obj: CollisionObject2D): Vec2[][] {
    this.flushMerges();
    return this.records.get(obj)?.polys.map((p) => p.points) ?? [];
  }

  /** World-space edges of a body as the sensors see them (after merging). */
  bodyEdges(obj: CollisionObject2D): { a: Vec2; b: Vec2; normal: Vec2 }[] {
    this.flushMerges();
    return (
      this.records.get(obj)?.edges.map((e) => ({
        a: new Vec2(e.ax, e.ay),
        b: new Vec2(e.bx, e.by),
        normal: new Vec2(e.nx, e.ny),
      })) ?? []
    );
  }

  // --- Areas ------------------------------------------------------------------------

  /**
   * Overlaps for every monitoring area against the monitorable areas on its
   * mask. Monitorable areas are few (the player, enemies, shots), so they go
   * in a small grid each tick and each monitoring area (thousands of tickets)
   * only looks up its own cells. Geometry is cached until a transform changes.
   */
  private updateAreas(): void {
    const grid = new Map<number, Area2D[]>();
    for (const b of this.areas) {
      if (!b.isInsideTree() || !b.monitorable || b.collisionLayer === 0) continue;
      const g = cachedGeometry(b);
      for (const key of cellsFor(g.minX, g.minY, g.maxX, g.maxY)) {
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(b);
      }
    }
    const entered: [Area2D, Area2D][] = [];
    const exited: [Area2D, Area2D][] = [];
    const now = new Set<Area2D>();
    for (const a of this.areas) {
      if (!a.isInsideTree()) continue;
      now.clear();
      if (a.monitoring && a.collisionMask !== 0 && grid.size > 0) {
        const ga = cachedGeometry(a);
        for (const key of cellsFor(ga.minX, ga.minY, ga.maxX, ga.maxY)) {
          const list = grid.get(key);
          if (!list) continue;
          for (const b of list) {
            if (b === a || now.has(b) || (a.collisionMask & b.collisionLayer) === 0) continue;
            if (geomOverlap(ga.shapes, cachedGeometry(b).shapes)) now.add(b);
          }
        }
      }
      if (now.size === 0 && a._overlaps.size === 0) continue;
      for (const b of a._overlaps) if (!now.has(b)) exited.push([a, b]);
      for (const b of now) if (!a._overlaps.has(b)) entered.push([a, b]);
      a._overlaps.clear();
      for (const b of now) a._overlaps.add(b);
    }
    for (const [a, b] of exited) if (a.isInsideTree()) a.areaExited.emit(b);
    for (const [a, b] of entered) if (a.isInsideTree() && b.isInsideTree()) a.areaEntered.emit(b);
  }
}

// --- Helpers --------------------------------------------------------------------------

function pushAll<T>(into: T[], items: T[]): void {
  for (const it of items) into.push(it);
}

function* cellsFor(minX: number, minY: number, maxX: number, maxY: number): Generator<number> {
  const x0 = Math.floor(minX / CELL);
  const y0 = Math.floor(minY / CELL);
  const x1 = Math.floor(maxX / CELL);
  const y1 = Math.floor(maxY / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) yield cellKey(cx, cy);
}

function makeWorldPoly(points: Vec2[], body: CollisionObject2D): WorldPoly {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { points, minX, minY, maxX, maxY, body, stamp: 0 };
}

function polygonEdges(poly: Vec2[], body: CollisionObject2D): Edge[] {
  const out: Edge[] = [];
  const ccw = polygonArea(poly) > 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len = Math.hypot(sx, sy);
    if (len < 1e-7) continue;
    const nx = (ccw ? sy : -sy) / len;
    const ny = (ccw ? -sx : sx) / len;
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, nx, ny, body, layer: body.collisionLayer, stamp: 0 });
  }
  return out;
}

/**
 * Removes the parts of edges that lie against an opposite-facing edge on the
 * same line (two solid tiles touching), keeping only the outer boundary.
 */
export function mergeEdges(edges: Edge[]): Edge[] {
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
        const p0 = pointOnLine(e, g.dx, g.dy, forward ? a : b);
        const p1 = pointOnLine(e, g.dx, g.dy, forward ? b : a);
        out.push({ ...e, ax: p0.x, ay: p0.y, bx: p1.x, by: p1.y, stamp: 0 });
      }
    }
  }
  return out;
}

function pointOnLine(e: Edge, dx: number, dy: number, t: number): Vec2 {
  const ta = e.ax * dx + e.ay * dy;
  return new Vec2(e.ax + dx * (t - ta), e.ay + dy * (t - ta));
}

type AreaGeom = { kind: 'rect'; x0: number; y0: number; x1: number; y1: number } | { kind: 'circle'; cx: number; cy: number; r: number };

interface CachedGeom {
  t: Transform2D;
  version: number;
  shapes: AreaGeom[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const geomCache = new WeakMap<Area2D, CachedGeom>();

function cachedGeometry(area: Area2D): CachedGeom {
  const t = area.globalTransform;
  const known = geomCache.get(area);
  const version = shapeFingerprint(area);
  if (known && known.version === version && sameTransform(known.t, t)) return known;
  const shapes = areaGeometry(area, t);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of shapes) {
    if (g.kind === 'rect') {
      minX = Math.min(minX, g.x0);
      minY = Math.min(minY, g.y0);
      maxX = Math.max(maxX, g.x1);
      maxY = Math.max(maxY, g.y1);
    } else {
      minX = Math.min(minX, g.cx - g.r);
      minY = Math.min(minY, g.cy - g.r);
      maxX = Math.max(maxX, g.cx + g.r);
      maxY = Math.max(maxY, g.cy + g.r);
    }
  }
  if (shapes.length === 0) minX = minY = maxX = maxY = 0;
  const geom = { t, version, shapes, minX, minY, maxX, maxY };
  geomCache.set(area, geom);
  return geom;
}

/** A number that changes when any shape is edited in place (size, offset, disabled...). */
function shapeFingerprint(area: Area2D): number {
  let h = area.shapes.length * 7919;
  for (const sh of area.shapes) {
    h = h * 31 + (sh.disabled ? 17 : 3);
    if (sh.kind === 'rect') h = h * 31 + sh.size.x * 131 + sh.size.y * 137 + sh.offset.x * 139 + sh.offset.y * 149;
    else if (sh.kind === 'circle') h = h * 31 + sh.radius * 151 + sh.offset.x * 157 + sh.offset.y * 163;
    else h = h * 31 + sh.points.length + (sh.points[0]?.x ?? 0) * 167 + (sh.points[0]?.y ?? 0) * 173;
    h %= 1e12;
  }
  return h;
}

function sameTransform(p: Transform2D, q: Transform2D): boolean {
  return p.tx === q.tx && p.ty === q.ty && p.a === q.a && p.b === q.b && p.c === q.c && p.d === q.d;
}

function areaGeometry(area: Area2D, t: Transform2D = area.globalTransform): AreaGeom[] {
  const out: AreaGeom[] = [];
  for (const s of area.shapes) {
    if (s.disabled) continue;
    if (s.kind === 'circle') {
      const c = t.xform(s.offset);
      const sc = Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d));
      out.push({ kind: 'circle', cx: c.x, cy: c.y, r: s.radius * sc });
    } else if (s.kind === 'rect' && t.b === 0 && t.c === 0) {
      const c = t.xform(s.offset);
      const hx = Math.abs((s.size.x / 2) * t.a);
      const hy = Math.abs((s.size.y / 2) * t.d);
      out.push({ kind: 'rect', x0: c.x - hx, y0: c.y - hy, x1: c.x + hx, y1: c.y + hy });
    } else {
      const pts = shapePolygon(s).map((p) => t.xform(p));
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      out.push({ kind: 'rect', x0, y0, x1, y1 });
    }
  }
  return out;
}

function geomOverlap(a: AreaGeom[], b: AreaGeom[]): boolean {
  for (const ga of a) for (const gb of b) if (shapeOverlap(ga, gb)) return true;
  return false;
}

function shapeOverlap(a: AreaGeom, b: AreaGeom): boolean {
  if (a.kind === 'rect' && b.kind === 'rect') {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  }
  if (a.kind === 'circle' && b.kind === 'circle') {
    const r = a.r + b.r;
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    return dx * dx + dy * dy < r * r;
  }
  const c = (a.kind === 'circle' ? a : b) as Extract<AreaGeom, { kind: 'circle' }>;
  const r = (a.kind === 'rect' ? a : b) as Extract<AreaGeom, { kind: 'rect' }>;
  const nx = Math.max(r.x0, Math.min(c.cx, r.x1));
  const ny = Math.max(r.y0, Math.min(c.cy, r.y1));
  const dx = c.cx - nx;
  const dy = c.cy - ny;
  return dx * dx + dy * dy < c.r * c.r;
}

/** World-space rectangles of an area's shapes (debug, tests). */
export function areaRects(area: Area2D): Rect2[] {
  return areaGeometry(area, area.globalTransform).map((g) =>
    g.kind === 'rect' ? new Rect2(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0) : new Rect2(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2),
  );
}
