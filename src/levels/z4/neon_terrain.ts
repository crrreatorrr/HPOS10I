// Neon Rush Remix terrain look (docs/DESIGN.md: Zone 1's ideas in synthwave
// neon, a dark sky and glowing outlines). NeonTerrain is a CurveTerrain with
// its own drawing: a dark fill (fill_color) with a faint world-aligned grid,
// a glowing lip (edge_color, magenta by default) along every open
// running edge and a thinner glow (accent_color, cyan) along the other
// open edges. An edge is open when no other terrain lies just outside it,
// so pieces that butt together read as one surface. NeonLoop is a
// TerrainLoop drawn the same way (its ring pieces are hidden and drawn by
// the loop). Collision is CurveTerrain's, untouched.

import { Layers } from '../../core/layers';
import { assetImage } from '../../runtime/assets';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import type { CollisionObject2D } from '../../runtime/physics';
import { polygonArea } from '../../runtime/physics';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import type { Props } from '../common/props';
import { CurveTerrain } from '../../terrain/curve_terrain';
import { TerrainLoop } from '../../terrain/loop';

export const NEON_FILL = new Color(0.07, 0.035, 0.14);
export const NEON_EDGE = new Color(1.0, 0.22, 0.78);
export const NEON_ACCENT = new Color(0.18, 0.92, 1.0);
const GRID = new Color(0.62, 0.2, 0.9, 0.16);

const EDGE_PART = 8;
const PROBE = 2;
const TERRAIN_BITS = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B | Layers.TERRAIN_TOP_ONLY;

interface NeonBuilt {
  tops: Vec2[][];
  sides: Vec2[][];
}

/** Colours of a neon piece. */
export interface NeonColors {
  fill: Color;
  edge: Color;
  accent: Color;
}

function isMoving(body: CollisionObject2D): boolean {
  return typeof (body as Partial<{ platformDelta(): Vec2 }>).platformDelta === 'function';
}

function covered(point: Vec2, self: CollisionObject2D): boolean {
  for (const body of tree.physics.intersectPoint(point, TERRAIN_BITS, 4)) {
    if (body !== self && !isMoving(body)) return true;
  }
  return false;
}

/** Splits a polygon outline into open running edges and other open edges (local space). */
function buildNeon(piece: CurveTerrain): NeonBuilt {
  const toWorld = piece.globalTransform;
  const tops: Vec2[][] = [];
  const sides: Vec2[][] = [];
  for (const polygon of piece.polygons) {
    const pts: Vec2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / EDGE_PART));
      for (let k = 0; k < n; k++) pts.push(a.lerp(b, k / n));
    }
    const ccw = polygonArea(pts) > 0;
    const kinds: number[] = []; // 0 closed, 1 top, 2 side
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const d = b.sub(a);
      const normal = (ccw ? new Vec2(d.y, -d.x) : new Vec2(-d.y, d.x)).normalized();
      const mid = a.add(b).div(2);
      const open = !covered(toWorld.xform(mid.add(normal.mul(PROBE))), piece);
      kinds.push(!open ? 0 : piece.isLipEdge(pts, i, normal) ? 1 : 2);
    }
    for (const want of [1, 2]) {
      const out = want === 1 ? tops : sides;
      let start = kinds.findIndex((k) => k !== want);
      if (start < 0) {
        out.push([...pts, pts[0]!]);
        continue;
      }
      let chain: Vec2[] = [];
      for (let s = 1; s <= pts.length; s++) {
        const i = (start + s) % pts.length;
        if (kinds[i] === want) {
          if (chain.length === 0) chain.push(pts[i]!);
          chain.push(pts[(i + 1) % pts.length]!);
        } else if (chain.length > 0) {
          out.push(chain);
          chain = [];
        }
      }
      if (chain.length > 0) out.push(chain);
      start = 0;
    }
  }
  return { tops, sides };
}

/** Draws one piece in neon (g's transform at the piece's origin). */
function drawNeon(g: Gfx, piece: CurveTerrain, built: NeonBuilt, colors: NeonColors): void {
  const ctx = g.ctx;
  const t = g.transform;
  // The visible part of the piece, in its local space (no scale or rotation in levels).
  const view = new Rect2(-t.tx, -t.ty, VIEW_W, VIEW_H);
  const origin = piece.globalPosition;
  const panel = assetImage('assets/terrain/z4_neon_rush_remix/fill.png');
  for (const poly of piece.polygons) {
    g.polygon(poly, colors.fill);
    let box = new Rect2(poly[0]!.x, poly[0]!.y, 0, 0);
    for (const p of poly) box = box.expand(p);
    const area = box.intersection(view);
    if (area.w <= 0 || area.h <= 0) continue;
    ctx.save();
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    if (panel) {
      ctx.globalAlpha = g.alpha * 0.84;
      g.tiled(panel, area, origin.neg());
      ctx.globalAlpha = g.alpha;
    }
    ctx.strokeStyle = GRID.css();
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor((area.x + origin.x) / 32) * 32 - origin.x;
    for (let x = x0; x <= area.right; x += 32) {
      ctx.moveTo(x + 0.5, area.y);
      ctx.lineTo(x + 0.5, area.bottom);
    }
    const y0 = Math.floor((area.y + origin.y) / 16) * 16 - origin.y;
    for (let y = y0; y <= area.bottom; y += 16) {
      ctx.moveTo(area.x, y + 0.5);
      ctx.lineTo(area.right, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }
  g.additive(() => {
    for (const chain of built.sides) {
      g.polyline(chain, colors.accent.withAlpha(0.2), 4);
      g.polyline(chain, colors.accent.withAlpha(0.8), 1);
    }
    for (const chain of built.tops) {
      g.polyline(chain, colors.edge.withAlpha(0.16), 8);
      g.polyline(chain, colors.edge.withAlpha(0.4), 4);
      g.polyline(chain, colors.edge.lightened(0.5), 1.5);
    }
  });
}

/** A CurveTerrain drawn in neon. */
export class NeonTerrain extends CurveTerrain {
  accentColor = NEON_ACCENT;
  private neon: NeonBuilt | null = null;

  constructor(name = 'NeonTerrain') {
    super(name);
    this.fillColor = NEON_FILL;
    this.edgeColor = NEON_EDGE;
    this.zIndex = -3;
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.accentColor = p.color('accent_color', this.accentColor);
  }

  override rebuild(): void {
    super.rebuild();
    this.neon = null;
  }

  override draw(g: Gfx): void {
    if (this.polygons.length === 0) return;
    if (!this.neon) this.neon = buildNeon(this);
    drawNeon(g, this, this.neon, { fill: this.fillColor, edge: this.edgeColor, accent: this.accentColor });
  }
}

/** A loop drawn in neon: the ring pieces are hidden and drawn here. */
export class NeonLoop extends TerrainLoop {
  colors: NeonColors = { fill: NEON_FILL, edge: NEON_EDGE, accent: NEON_ACCENT };
  private built = new Map<CurveTerrain, NeonBuilt>();
  private readonly pieces: CurveTerrain[];

  constructor(name = 'NeonLoop') {
    super(name);
    this.pieces = [this.floor, this.lowerRight, this.upper, this.lowerLeft, this.rightFoot, this.leftFoot];
    for (const piece of this.pieces) piece.visible = false;
    this.zIndex = -3;
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.colors = {
      fill: p.color('fill_color', this.colors.fill),
      edge: p.color('edge_color', this.colors.edge),
      accent: p.color('accent_color', this.colors.accent),
    };
    this.built.clear();
  }

  override layout(): void {
    super.layout();
    this.built?.clear();
  }

  cullRect(): Rect2 {
    const r = this.radius + this.thickness;
    const half = r + Math.max(this.floorMargin, this.footRadius + 64);
    return new Rect2(-half, -r * 2 - 8, half * 2, r * 2 + this.floorDepth + 16);
  }

  override draw(g: Gfx): void {
    for (const piece of this.pieces) {
      if (piece.polygons.length === 0) continue;
      let built = this.built.get(piece);
      if (!built) {
        built = buildNeon(piece);
        this.built.set(piece, built);
      }
      g.setTransform(piece.position);
      drawNeon(g, piece, built, this.colors);
      g.resetTransform();
    }
  }
}
