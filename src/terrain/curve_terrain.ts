// Collision and visuals for curved terrain: a loop arc, a quarter pipe, a
// ramp with rounded ends, a free curve profile or a plain block. Curves are
// cut into short segments (segmentLength, ~5 px) so ground angles change
// smoothly.
//
// Origins:
//   LOOP          bottom inner point of the circle (where it meets the floor)
//   QUARTER_PIPE  start of the curve on the floor
//   RAMP          start of the lead-in on the floor
//   CURVE         the curve's own local space
//   BLOCK         top-left corner
// Arc angles use the Physics Guide convention: 0 = bottom, 90 = right side,
// 180 = top, 270 = left side.

import { Layers } from '../core/layers';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { degToRad } from '../runtime/math';
import { polygonShape, StaticBody2D } from '../runtime/physics';
import { Rect2, Vec2 } from '../runtime/vec2';
import type { Configurable, Props } from '../levels/common/props';
import { TerrainArt } from './terrain_art';

export enum CurveShape {
  LOOP,
  QUARTER_PIPE,
  RAMP,
  CURVE,
  BLOCK,
}

export enum PathLayer {
  BOTH,
  A,
  B,
}

const MAX_ARC_CHUNK = 90.0;

/** Cubic Bézier curve with in/out handles per point (the original Curve2D data). */
export interface CurvePoint {
  pos: Vec2;
  in: Vec2;
  out: Vec2;
}

export class CurveTerrain extends StaticBody2D implements Configurable {
  shape = CurveShape.RAMP;
  pathLayer = PathLayer.BOTH;
  topOnly = false;
  radius = 128.0;
  thickness = 16.0;
  arcStart = 0.0;
  arcEnd = 360.0;
  risesToRight = true;
  wallHeight = 0.0;
  slopeAngle = 22.0;
  runLength = 160.0;
  leadIn = 32.0;
  leadOut = 32.0;
  filletRadius = 48.0;
  curve: CurvePoint[] = [];
  size = new Vec2(128, 32);
  depth = 64.0;
  segmentLength = 5.0;
  fillColor = new Color(0.45, 0.32, 0.22);
  edgeColor = new Color(0.36, 0.78, 0.36);
  artZone = '';

  /** Outline polygons from the last rebuild (local space). */
  polygons: Vec2[][] = [];
  private bounds = new Rect2();
  private art: ReturnType<typeof TerrainArt.build> | null = null;
  private built = false;

  constructor(name = 'CurveTerrain') {
    super(name);
    this.addToGroup('curve_terrain');
  }

  applyProps(p: Props): void {
    this.shape = p.int('shape', this.shape);
    this.pathLayer = p.int('path_layer', this.pathLayer);
    this.topOnly = p.bool('top_only', this.topOnly);
    this.radius = Math.max(p.num('radius', this.radius), 8);
    this.thickness = Math.max(p.num('thickness', this.thickness), 2);
    this.arcStart = p.num('arc_start', this.arcStart);
    this.arcEnd = p.num('arc_end', this.arcEnd);
    this.risesToRight = p.bool('rises_to_right', this.risesToRight);
    this.wallHeight = Math.max(p.num('wall_height', this.wallHeight), 0);
    this.slopeAngle = p.num('slope_angle', this.slopeAngle);
    this.runLength = Math.max(p.num('run_length', this.runLength), 1);
    this.leadIn = Math.max(p.num('lead_in', this.leadIn), 0);
    this.leadOut = Math.max(p.num('lead_out', this.leadOut), 0);
    this.filletRadius = Math.max(p.num('fillet_radius', this.filletRadius), 0);
    this.size = p.vec('size', this.size);
    this.depth = Math.max(p.num('depth', this.depth), 1);
    this.segmentLength = p.num('segment_length', this.segmentLength);
    this.fillColor = p.color('fill_color', this.fillColor);
    this.edgeColor = p.color('edge_color', this.edgeColor);
    this.artZone = p.str('art_zone', this.artZone);
    const curve = p.raw<{ type: string; props: Record<string, unknown> }>('curve');
    if (curve && curve.type === 'Curve2D') this.curve = curvePoints(curve.props);
  }

  setArtZone(zoneId: string): void {
    if (this.artZone !== zoneId) {
      this.artZone = zoneId;
      this.art = null;
    }
  }

  override enterTree(): void {
    this.rebuild();
    super.enterTree();
  }

  /** Rebuilds collision from the current settings (call after changing them in the tree). */
  rebuild(): void {
    this.collisionMask = 0;
    this.collisionLayer = this.topOnly
      ? Layers.TERRAIN_TOP_ONLY
      : [Layers.TERRAIN_SOLID, Layers.TERRAIN_PATH_A, Layers.TERRAIN_PATH_B][this.pathLayer]!;
    this.polygons = [];
    this.bounds = new Rect2();
    this.clearShapes();
    for (const polygon of this.buildPolygons()) {
      if (polygon.length < 3) continue;
      this.polygons.push(polygon);
      let box = new Rect2(polygon[0]!.x, polygon[0]!.y, 0, 0);
      for (const pt of polygon) box = box.expand(pt);
      this.bounds = this.polygons.length === 1 ? box : this.bounds.merge(box);
      this.addShape(polygonShape(polygon));
    }
    this.art = null;
    this.built = true;
  }

  get localBounds(): Rect2 {
    return this.bounds;
  }

  cullRect(): Rect2 {
    return this.bounds.grow(24);
  }

  override draw(g: Gfx): void {
    if (!this.built) return;
    if (!this.art) this.art = TerrainArt.build(this);
    TerrainArt.draw(g, this, this.art);
  }

  buildPolygons(): Vec2[][] {
    switch (this.shape) {
      case CurveShape.LOOP:
        return this.loopPolygons();
      case CurveShape.QUARTER_PIPE:
        return [this.quarterPipePolygon()];
      case CurveShape.RAMP:
        return [this.fillBelow(this.rampProfile())];
      case CurveShape.CURVE:
        return this.curvePolygons();
    }
    return [[Vec2.ZERO, new Vec2(this.size.x, 0), this.size, new Vec2(0, this.size.y)]];
  }

  /** The running surface as a polyline (edge visuals). */
  buildSurface(): Vec2[] {
    switch (this.shape) {
      case CurveShape.LOOP:
        return this.arcPoints(this.arcStart, this.arcEnd, this.radius);
      case CurveShape.QUARTER_PIPE:
        return this.quarterPipeSurface();
      case CurveShape.RAMP:
        return this.rampProfile();
      case CurveShape.CURVE:
        return this.curveProfile();
    }
    return [Vec2.ZERO, new Vec2(this.size.x, 0)];
  }

  /** Lip edges: the whole running surface of a loop; elsewhere every top-facing edge. */
  isLipEdge(polygon: Vec2[], i: number, normal: Vec2): boolean {
    if (this.shape === CurveShape.LOOP) {
      const mid = polygon[i]!.add(polygon[(i + 1) % polygon.length]!).div(2);
      const toCenter = new Vec2(0, -this.radius).sub(mid).normalized();
      return normal.dot(toCenter) > 0.9;
    }
    return TerrainArt.isTopFacing(normal);
  }

  // --- Shapes ---------------------------------------------------------------------

  private circlePoint(deg: number, r: number): Vec2 {
    const a = degToRad(deg);
    return new Vec2(Math.sin(a) * r, -this.radius + Math.cos(a) * r);
  }

  arcPoints(fromDeg: number, toDeg: number, r: number): Vec2[] {
    const pts: Vec2[] = [];
    const span = toDeg - fromDeg;
    const count = Math.max(1, Math.ceil((Math.abs(degToRad(span)) * r) / this.segmentLength));
    for (let i = 0; i <= count; i++) pts.push(this.circlePoint(fromDeg + (span * i) / count, r));
    return pts;
  }

  private loopPolygons(): Vec2[][] {
    const out: Vec2[][] = [];
    const span = this.arcEnd - this.arcStart;
    if (Math.abs(span) < 0.1) return out;
    const chunks = Math.max(1, Math.ceil(Math.abs(span) / MAX_ARC_CHUNK));
    for (let i = 0; i < chunks; i++) {
      const a0 = this.arcStart + (span * i) / chunks;
      const a1 = this.arcStart + (span * (i + 1)) / chunks;
      out.push([...this.arcPoints(a0, a1, this.radius), ...this.arcPoints(a1, a0, this.radius + this.thickness)]);
    }
    return out;
  }

  private quarterPipeSurface(): Vec2[] {
    let pts = this.arcPoints(0, 90, this.radius);
    if (this.wallHeight > 0) pts.push(new Vec2(this.radius, -this.radius - this.wallHeight));
    if (!this.risesToRight) pts = mirror(pts);
    return pts;
  }

  private quarterPipePolygon(): Vec2[] {
    let pts = this.arcPoints(0, 90, this.radius);
    const top = -this.radius - this.wallHeight;
    if (this.wallHeight > 0) pts.push(new Vec2(this.radius, top));
    pts.push(new Vec2(this.radius + this.thickness, top), new Vec2(this.radius + this.thickness, this.depth), new Vec2(0, this.depth));
    if (!this.risesToRight) pts = mirror(pts).reverse();
    return pts;
  }

  private rampProfile(): Vec2[] {
    const rise = -Math.tan(degToRad(this.slopeAngle)) * this.runLength;
    const corners = [
      Vec2.ZERO,
      new Vec2(this.leadIn, 0),
      new Vec2(this.leadIn + this.runLength, rise),
      new Vec2(this.leadIn + this.runLength + this.leadOut, rise),
    ];
    return this.fillet(corners, this.filletRadius);
  }

  private curveProfile(): Vec2[] {
    if (this.curve.length < 2) return [];
    return tessellateEvenLength(this.curve, this.segmentLength);
  }

  private curvePolygons(): Vec2[][] {
    const profile = this.curveProfile();
    if (profile.length < 2) return [];
    if (profile[0]!.distanceTo(profile[profile.length - 1]!) < 0.5) {
      profile.pop();
      return [profile];
    }
    return [this.fillBelow(profile)];
  }

  private fillBelow(profile: Vec2[]): Vec2[] {
    if (profile.length < 2) return [];
    let bottom = -Infinity;
    for (const p of profile) bottom = Math.max(bottom, p.y);
    bottom += this.depth;
    return [...profile, new Vec2(profile[profile.length - 1]!.x, bottom), new Vec2(profile[0]!.x, bottom)];
  }

  private fillet(corners: Vec2[], r: number): Vec2[] {
    const out: Vec2[] = [corners[0]!];
    for (let i = 1; i < corners.length - 1; i++) {
      const prev = corners[i - 1]!;
      const corner = corners[i]!;
      const next = corners[i + 1]!;
      const u = corner.sub(prev).normalized();
      const v = next.sub(corner).normalized();
      const turn = u.angleTo(v);
      if (r <= 0 || Math.abs(turn) < 0.001) {
        out.push(corner);
        continue;
      }
      const t = Math.min(r * Math.tan(Math.abs(turn) / 2), Math.min(corner.distanceTo(prev), corner.distanceTo(next)) * 0.5);
      const rr = t / Math.tan(Math.abs(turn) / 2);
      const start = corner.sub(u.mul(t));
      const normal = turn < 0 ? u.orthogonal() : u.orthogonal().neg();
      const center = start.add(normal.mul(rr));
      const count = Math.max(1, Math.ceil((Math.abs(turn) * rr) / this.segmentLength));
      const spoke = start.sub(center);
      for (let k = 0; k <= count; k++) out.push(center.add(spoke.rotated((turn * k) / count)));
    }
    out.push(corners[corners.length - 1]!);
    return out;
  }
}

function mirror(points: Vec2[]): Vec2[] {
  return points.map((p) => new Vec2(-p.x, p.y));
}

/** The original Curve2D `_data.points` layout: in.x, in.y, out.x, out.y, pos.x, pos.y per point. */
function curvePoints(props: Record<string, unknown>): CurvePoint[] {
  const data = props._data as { points?: Vec2[] } | undefined;
  const flat = data?.points ?? [];
  const out: CurvePoint[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push({ in: flat[i]!, out: flat[i + 1]!, pos: flat[i + 2]! });
  return out;
}

/** Points along the curve spaced about `spacing` px apart (both ends included). */
export function tessellateEvenLength(curve: CurvePoint[], spacing: number): Vec2[] {
  const dense: Vec2[] = [];
  for (let i = 0; i + 1 < curve.length; i++) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    const p0 = a.pos;
    const p1 = a.pos.add(a.out);
    const p2 = b.pos.add(b.in);
    const p3 = b.pos;
    const steps = 64;
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      dense.push(
        p0
          .mul(mt * mt * mt)
          .add(p1.mul(3 * mt * mt * t))
          .add(p2.mul(3 * mt * t * t))
          .add(p3.mul(t * t * t)),
      );
    }
  }
  let total = 0;
  for (let i = 1; i < dense.length; i++) total += dense[i]!.distanceTo(dense[i - 1]!);
  const count = Math.max(1, Math.round(total / spacing));
  const step = total / count;
  const out: Vec2[] = [dense[0]!];
  let target = step;
  let walked = 0;
  for (let i = 1; i < dense.length && out.length < count; i++) {
    const a = dense[i - 1]!;
    const b = dense[i]!;
    const seg = a.distanceTo(b);
    while (walked + seg >= target && out.length < count) {
      out.push(a.lerp(b, (target - walked) / seg));
      target += step;
    }
    walked += seg;
  }
  out.push(dense[dense.length - 1]!);
  return out;
}
