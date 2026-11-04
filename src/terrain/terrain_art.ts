// Terrain look for curved pieces: the fill (zone fill texture tiled in world
// space, or a flat tint), a grass lip along top-facing open edges (the zone's
// top.png strip, or a bright-over-dark band) and rock bands on steep open
// sides when the zone has side.png. Purely visual: collision is untouched.
// An edge is "open" when no other terrain lies just outside it, so pieces
// butting against tiles or each other don't draw a lip inside the ground.

import { Layers } from '../core/layers';
import { assetImage } from '../runtime/assets';
import { Color } from '../runtime/color';
import type { Gfx, Texture } from '../runtime/gfx';
import { degToRad } from '../runtime/math';
import { polygonArea } from '../runtime/physics';
import { tree } from '../runtime/tree';
import { Vec2 } from '../runtime/vec2';
import type { CurveTerrain } from './curve_terrain';

export const FILL_Z = -3;
export const SIDE_Z = -2;
export const LIP_Z = -1;
const LIP_MAX_ANGLE = 60;
const SIDE_BAND = 16;
const EDGE_PART = 8;
const COVER_PROBE = 2;
const FALLBACK_LIGHT = new Color(0.56, 0.9, 0.36);
const FALLBACK_DARK = new Color(0.24, 0.62, 0.26);
const TERRAIN_BITS = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B | Layers.TERRAIN_TOP_ONLY;

interface Chain {
  points: Vec2[];
  normals: Vec2[];
}

interface Built {
  fills: Vec2[][];
  lips: Chain[];
  sides: Chain[];
  tint: Color;
  surface: Vec2[];
}

export interface Materials {
  fill: Texture | null;
  top: Texture | null;
  side: Texture | null;
}

const patternCache = new WeakMap<object, CanvasPattern | null>();

export const TerrainArt = {
  FILL_Z,
  SIDE_Z,
  LIP_Z,

  materials(zone: string): Materials {
    if (!zone) return { fill: null, top: null, side: null };
    return {
      fill: assetImage(`assets/terrain/${zone}/fill.png`),
      top: assetImage(`assets/terrain/${zone}/top.png`),
      side: assetImage(`assets/terrain/${zone}/side.png`),
    };
  },

  isTopFacing(normal: Vec2): boolean {
    return -normal.y >= Math.cos(degToRad(LIP_MAX_ANGLE)) - 0.0001;
  },

  isSideFacing(normal: Vec2): boolean {
    return Math.abs(normal.y) < Math.cos(degToRad(LIP_MAX_ANGLE)) - 0.0001;
  },

  subdivide(polygon: Vec2[], part: number): Vec2[] {
    const out: Vec2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const pieces = Math.max(1, Math.ceil(a.distanceTo(b) / part));
      for (let k = 0; k < pieces; k++) out.push(a.lerp(b, k / pieces));
    }
    return out;
  },

  outwardNormals(polygon: Vec2[]): Vec2[] {
    const ccw = polygonArea(polygon) > 0;
    return polygon.map((p, i) => {
      const d = polygon[(i + 1) % polygon.length]!.sub(p);
      return (ccw ? new Vec2(d.y, -d.x) : new Vec2(-d.y, d.x)).normalized();
    });
  },

  edgeChains(polygon: Vec2[], normals: Vec2[], selected: boolean[]): Chain[] {
    const count = polygon.length;
    const chains: Chain[] = [];
    if (count < 2 || !selected.includes(true)) return chains;
    let start = 0;
    if (selected.includes(false)) {
      while (selected[start]) start++;
      start = (start + 1) % count;
    }
    let points: Vec2[] = [];
    let ns: Vec2[] = [];
    for (let k = 0; k < count; k++) {
      const i = (start + k) % count;
      if (selected[i]) {
        if (points.length === 0) points.push(polygon[i]!);
        points.push(polygon[(i + 1) % count]!);
        ns.push(normals[i]!);
      } else if (points.length > 0) {
        chains.push({ points, normals: ns });
        points = [];
        ns = [];
      }
    }
    if (points.length > 0) chains.push({ points, normals: ns });
    return chains;
  },

  /** Precomputes fills and edge chains (local space) for a piece. */
  build(piece: CurveTerrain): Built {
    const toWorld = piece.globalTransform;
    let tint = piece.fillColor;
    if (piece.pathLayer === 1) tint = tint.lerp(new Color(0.3, 0.45, 0.9), 0.18);
    else if (piece.pathLayer === 2) tint = tint.lerp(new Color(0.9, 0.35, 0.3), 0.18);
    if (piece.topOnly) tint = tint.lightened(0.25).withAlpha(0.85);
    const mats = TerrainArt.materials(piece.artZone);
    const lips: Chain[] = [];
    const sides: Chain[] = [];
    for (const polygon of piece.polygons) {
      const outline = TerrainArt.subdivide(polygon, EDGE_PART);
      const normals = TerrainArt.outwardNormals(outline);
      const lipSel: boolean[] = [];
      const sideSel: boolean[] = [];
      for (let i = 0; i < outline.length; i++) {
        const mid = outline[i]!.add(outline[(i + 1) % outline.length]!).div(2);
        const probe = toWorld.xform(mid.add(normals[i]!.mul(COVER_PROBE)));
        const open = !covered(probe, piece);
        const lip = open && piece.isLipEdge(outline, i, normals[i]!);
        lipSel.push(lip);
        sideSel.push(open && mats.side !== null && !lip && TerrainArt.isSideFacing(normals[i]!));
      }
      lips.push(...TerrainArt.edgeChains(outline, normals, lipSel));
      sides.push(...TerrainArt.edgeChains(outline, normals, sideSel));
    }
    return { fills: piece.polygons, lips, sides, tint, surface: piece.buildSurface() };
  },

  draw(g: Gfx, piece: CurveTerrain, built: Built): void {
    const mats = TerrainArt.materials(piece.artZone);
    const ctx = g.ctx;
    // Fill.
    for (const poly of built.fills) {
      if (mats.fill) {
        const pattern = worldPattern(ctx, mats.fill);
        if (pattern) {
          ctx.beginPath();
          poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.closePath();
          // Align the pattern to world space so neighbours line up.
          const o = piece.globalPosition;
          pattern.setTransform(new DOMMatrix([1, 0, 0, 1, -o.x, -o.y]));
          ctx.fillStyle = pattern;
          ctx.globalAlpha = g.alpha * (piece.topOnly ? 0.85 : 1);
          ctx.fill();
          ctx.globalAlpha = g.alpha;
          continue;
        }
      }
      g.polygon(poly, built.tint);
    }
    // Side bands.
    if (mats.side) for (const chain of built.sides) strip(g, chain, SIDE_BAND, null, mats.side);
    // Lips.
    for (const chain of built.lips) {
      if (mats.top) strip(g, chain, mats.top.height, null, mats.top);
      else {
        strip(g, chain, 8, FALLBACK_DARK, null);
        strip(g, chain, 3, FALLBACK_LIGHT, null);
      }
    }
    if (!mats.fill && built.surface.length >= 2 && built.lips.length === 0 && !piece.topOnly) {
      g.polyline(built.surface, piece.edgeColor, 3);
    }
  },
};

/** True when a world point lies inside other terrain (another piece, tiles). */
function covered(point: Vec2, self: CurveTerrain): boolean {
  for (const body of tree.physics.intersectPoint(point, TERRAIN_BITS, 4)) {
    if (body !== self) return true;
  }
  return false;
}

function worldPattern(ctx: CanvasRenderingContext2D, tex: Texture): CanvasPattern | null {
  let p = patternCache.get(tex as object);
  if (p === undefined) {
    p = ctx.createPattern(tex as CanvasImageSource, 'repeat');
    patternCache.set(tex as object, p);
  }
  return p;
}

/** A band `depth` px deep running inward from a chain of surface points. */
function strip(g: Gfx, chain: Chain, depth: number, color: Color | null, tex: Texture | null): void {
  const pts = chain.points;
  if (pts.length < 2) return;
  // Vertex normals: average of neighbouring edge normals.
  const vn: Vec2[] = pts.map((_, i) => {
    const a = chain.normals[Math.max(0, i - 1)]!;
    const b = chain.normals[Math.min(chain.normals.length - 1, i)]!;
    const n = a.add(b);
    return n.lengthSquared() < 1e-6 ? a : n.normalized();
  });
  const inner = pts.map((p, i) => p.sub(vn[i]!.mul(depth)));
  const poly = [...pts, ...inner.reverse()];
  if (color) {
    g.polygon(poly, color);
    return;
  }
  if (tex) {
    // Textured strips: draw each segment as a rotated slice of the texture.
    const ctx = g.ctx;
    let u = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = a.distanceTo(b);
      if (len < 0.01) continue;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(angle);
      const tw = tex.width;
      let x = 0;
      while (x < len + 0.5) {
        const sx = (u + x) % tw;
        const w = Math.min(tw - sx, len + 0.5 - x);
        ctx.drawImage(tex as CanvasImageSource, sx, 0, w, tex.height, x, 0, w, depth);
        x += w;
      }
      ctx.restore();
      u += len;
    }
    g.resetTransform();
  }
}
