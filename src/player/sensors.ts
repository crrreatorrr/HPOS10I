// Raycast sensors in the community Physics Guide layout:
//   A/B  floor sensors, left/right of the centre, cast "down" for the current mode
//   C/D  ceiling sensors, left/right of the centre, cast "up"
//   E/F  wall sensors, from the centre, cast left/right
// Casts are recorded each tick while `recording` is on (the debug overlay).

import { Layers } from '../core/layers';
import { fposmod, radToDeg, wrapf } from '../runtime/math';
import type { CollisionObject2D, PhysicsWorld } from '../runtime/physics';
import { Vec2 } from '../runtime/vec2';

/** Offset of the two side rays used to re-measure a surface angle. */
const SURFACE_PROBE_OFFSET = 0.5;
/** A re-measured angle this close (degrees) to the reported one confirms it. */
const SURFACE_AGREEMENT = 1.0;

export class Hit {
  position = Vec2.ZERO;
  normal = Vec2.ZERO;
  /** Distance from the ray origin to the hit. */
  distance = 0;
  /** Ground angle of the surface (Physics Guide degrees). */
  angle = 0;
  /** True on a one-way (top-only) platform. */
  topOnly = false;
  collider: CollisionObject2D | null = null;
  origin = Vec2.ZERO;
  dir = Vec2.ZERO;
  length = 0;
  mask = 0;
}

export interface CastRecord {
  label: string;
  from: Vec2;
  to: Vec2;
  hit: boolean;
  point: Vec2;
}

/** Physics Guide angle from a surface normal: 0 floor, 90 right wall, 180 ceiling, 270 left wall. */
export function angleFromNormal(n: Vec2): number {
  const a = fposmod(radToDeg(Math.atan2(-n.x, -n.y)), 360);
  return a >= 359.9999 ? 0 : a;
}

/** Terrain mask for a collision path (0 = A, 1 = B). */
export function terrainMask(path: number, topOnly: boolean): number {
  let mask = Layers.TERRAIN_SOLID | (path === 0 ? Layers.TERRAIN_PATH_A : Layers.TERRAIN_PATH_B);
  if (topOnly) mask |= Layers.TERRAIN_TOP_ONLY;
  return mask;
}

const SOLID_BITS = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B;

export class PlayerSensors {
  casts: CastRecord[] = [];
  recording = false;
  /** The two side hits (or nulls) of the last castPair(), in label order. */
  lastPair: [Hit | null, Hit | null] = [null, null];
  private world: PhysicsWorld | null = null;

  beginFrame(world: PhysicsWorld): void {
    this.world = world;
    this.casts.length = 0;
  }

  cast(label: string, from: Vec2, dir: Vec2, length: number, mask: number): Hit | null {
    const to = from.add(dir.mul(length));
    let record: CastRecord | null = null;
    if (this.recording) {
      record = { label, from, to, hit: false, point: to };
      this.casts.push(record);
    }
    const world = this.world;
    if (!world) return null;
    const result = world.intersectRay(from, to, mask);
    if (!result) return null;
    const hit = new Hit();
    hit.position = result.position;
    hit.normal = result.normal;
    hit.distance = from.distanceTo(hit.position);
    hit.angle = angleFromNormal(hit.normal);
    hit.origin = from;
    hit.dir = dir;
    hit.length = length;
    hit.mask = mask;
    hit.collider = result.collider;
    const layer = result.layer;
    hit.topOnly = (layer & Layers.TERRAIN_TOP_ONLY) !== 0 && (layer & SOLID_BITS) === 0;
    if (record) {
      record.hit = true;
      record.point = hit.position;
    }
    return hit;
  }

  /**
   * Surface angle at a hit, from two parallel rays 0.5 px either side: the
   * line through their hits is the surface, whatever normal a polygon vertex
   * reported. The reported angle is kept when it matches the surface on either
   * side (a real corner). Falls back to the reported angle when a side misses.
   */
  surfaceAngle(hit: Hit): number {
    const world = this.world;
    if (!world) return hit.angle;
    const side = hit.dir.orthogonal().mul(SURFACE_PROBE_OFFSET);
    const length = hit.length + SURFACE_PROBE_OFFSET * 4;
    const points: Vec2[] = [];
    for (const offset of [side, side.neg()]) {
      const from = hit.origin.add(offset);
      const result = world.intersectRay(from, from.add(hit.dir.mul(length)), hit.mask);
      if (!result) return hit.angle;
      points.push(result.position);
    }
    const measured = secantAngle(points[0]!, points[1]!, hit.dir);
    if (Number.isNaN(measured)) return hit.angle;
    if (hit.normal.dot(hit.dir) < -0.001) {
      for (const check of [measured, secantAngle(points[0]!, hit.position, hit.dir), secantAngle(hit.position, points[1]!, hit.dir)]) {
        if (!Number.isNaN(check) && Math.abs(wrapf(check - hit.angle, -180, 180)) < SURFACE_AGREEMENT) return hit.angle;
      }
    }
    return measured;
  }

  /**
   * A pair of parallel rays (A/B or C/D) offset by +/- halfWidth along `side`,
   * both towards `dir`. Returns the nearer hit, or null. With a third label, a
   * centre ray is cast when both miss (terrain narrower than the pair).
   */
  castPair(labels: readonly string[], center: Vec2, side: Vec2, dir: Vec2, halfWidth: number, length: number, mask: number): Hit | null {
    const first = this.cast(labels[0]!, center.sub(side.mul(halfWidth)), dir, length, mask);
    const second = this.cast(labels[1]!, center.add(side.mul(halfWidth)), dir, length, mask);
    this.lastPair = [first, second];
    if (first === null && second === null && labels.length > 2) return this.cast(labels[2]!, center, dir, length, mask);
    if (first === null) return second;
    if (second === null) return first;
    return first.distance <= second.distance ? first : second;
  }

  /** True when `point` is inside solid terrain (crush checks). */
  pointInTerrain(point: Vec2, mask: number): boolean {
    return (this.world?.intersectPoint(point, mask, 1).length ?? 0) > 0;
  }

  /** True when `point` is inside moving terrain (a body with platformDelta()). */
  movingBodyAt(point: Vec2, mask: number): boolean {
    for (const body of this.world?.intersectPoint(point, mask, 4) ?? []) {
      if (isMovingTerrain(body)) return true;
    }
    return false;
  }
}

/** Moving terrain is any body that exposes platformDelta() (docs/CONTRACTS.md). */
export function isMovingTerrain(body: unknown): body is CollisionObject2D & { platformDelta(): Vec2 } {
  return !!body && typeof (body as { platformDelta?: unknown }).platformDelta === 'function' && !(body as CollisionObject2D).isFreed();
}

function secantAngle(from: Vec2, to: Vec2, dir: Vec2): number {
  const tangent = to.sub(from);
  if (tangent.lengthSquared() < 0.01) return NaN;
  let normal = tangent.orthogonal().normalized();
  if (normal.dot(dir) > 0) normal = normal.neg();
  return angleFromNormal(normal);
}
