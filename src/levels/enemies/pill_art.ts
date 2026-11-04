// Code-drawn pill robots (docs/DESIGN.md, "Pill robots"): a rounded capsule
// split across the middle into two colours, a thick dark outline, a soft
// shadow along the lower side, a white dashed shine on the coloured half, a
// seam band with bolts, a dark visor slit with glowing eye dots and a small
// antenna. No text or markings. Palettes: the basic mint/white set (Zone 1
// and the test zone), Wizard Academy's purple/cream and Capital Mansion's
// navy/white.

import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';

/** [coloured half, its shade, white half, its shade]. */
export type PillPalette = readonly [Color, Color, Color, Color];

const OUTLINE = new Color(0.12, 0.12, 0.2);
const MINT = new Color(0.47, 0.9, 0.68);
const MINT_SHADE = new Color(0.27, 0.66, 0.5);
const WHITE = new Color(0.97, 0.97, 0.95);
const WHITE_SHADE = new Color(0.74, 0.77, 0.86);
const PURPLE = new Color(0.6, 0.38, 0.86);
const PURPLE_SHADE = new Color(0.42, 0.24, 0.66);
const CREAM = new Color(0.98, 0.93, 0.8);
const CREAM_SHADE = new Color(0.84, 0.76, 0.6);
const NAVY = new Color(0.18, 0.26, 0.52);
const NAVY_SHADE = new Color(0.1, 0.15, 0.36);
const BASIC: PillPalette = [MINT, MINT_SHADE, WHITE, WHITE_SHADE];

/** The part of convex polygon `poly` inside the axis-aligned box (Sutherland-Hodgman). */
export function clipToBox(poly: readonly Vec2[], x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const edges: [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2][] = [
    [(p) => p.x >= x0, (a, b) => a.lerp(b, (x0 - a.x) / (b.x - a.x))],
    [(p) => p.x <= x1, (a, b) => a.lerp(b, (x1 - a.x) / (b.x - a.x))],
    [(p) => p.y >= y0, (a, b) => a.lerp(b, (y0 - a.y) / (b.y - a.y))],
    [(p) => p.y <= y1, (a, b) => a.lerp(b, (y1 - a.y) / (b.y - a.y))],
  ];
  let out: Vec2[] = [...poly];
  for (const [inside, cut] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(cut(prev, cur));
      }
    }
  }
  return out;
}

function fill(g: Gfx, poly: readonly Vec2[], color: Color): void {
  if (poly.length >= 3) g.polygon(poly, color);
}

/** A closed outline (Godot: polyline with the first point appended). */
export function closed(points: readonly Vec2[]): Vec2[] {
  return [...points, points[0]!];
}

export const PillArt = {
  OUTLINE,
  MINT,
  MINT_SHADE,
  WHITE,
  WHITE_SHADE,
  SHINE: new Color(1.0, 1.0, 1.0, 0.95),
  SEAM: new Color(0.56, 0.58, 0.68),
  BOLT: new Color(0.88, 0.9, 0.95),
  VISOR: new Color(0.09, 0.09, 0.16),
  EYE: new Color(1.0, 0.3, 0.24),
  EYE_GLOW: new Color(1.0, 0.78, 0.62),
  METAL: new Color(0.62, 0.64, 0.72),
  METAL_DARK: new Color(0.32, 0.33, 0.42),
  /** Telegraph flash (visor, spike tips, cannon glow). */
  FLASH: new Color(1.0, 0.95, 0.55),
  SPIKE: new Color(1.0, 0.56, 0.12),
  SPIKE_DARK: new Color(0.72, 0.3, 0.06),
  // Wizard Academy (docs/DESIGN.md): purple and cream.
  PURPLE,
  PURPLE_SHADE,
  PURPLE_DARK: new Color(0.28, 0.14, 0.44),
  CREAM,
  CREAM_SHADE,
  GOLD: new Color(0.98, 0.8, 0.3),
  // Capital Mansion (docs/DESIGN.md): navy and white.
  NAVY,
  NAVY_SHADE,
  SILVER: new Color(0.8, 0.84, 0.9),

  BASIC,
  WIZARD: [PURPLE, PURPLE_SHADE, CREAM, CREAM_SHADE] as PillPalette,
  MANSION: [NAVY, NAVY_SHADE, WHITE, WHITE_SHADE] as PillPalette,

  /** Points of a horizontal capsule (straight part ±halfLength, end radius r). */
  capsulePoints(halfLength: number, r: number, steps = 8): Vec2[] {
    const points: Vec2[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = -Math.PI * 0.5 + (Math.PI * k) / steps;
      points.push(new Vec2(halfLength + Math.cos(a) * r, Math.sin(a) * r));
    }
    for (let k = 0; k <= steps; k++) {
      const a = Math.PI * 0.5 + (Math.PI * k) / steps;
      points.push(new Vec2(-halfLength + Math.cos(a) * r, Math.sin(a) * r));
    }
    return points;
  },

  /**
   * A capsule body lying along local x, centred at the origin (place and turn
   * it with g.setTransform). `front` is the coloured half: +1 right, -1 left.
   */
  drawCapsule(g: Gfx, halfLength: number, r: number, front: number, palette: PillPalette = BASIC): void {
    g.polygon(PillArt.capsulePoints(halfLength, r + 1.5), OUTLINE);
    const body = PillArt.capsulePoints(halfLength, r);
    const rightHalf = clipToBox(body, 0, -r - 2, halfLength + r + 2, r + 2);
    const leftHalf = clipToBox(body, -halfLength - r - 2, -r - 2, 0, r + 2);
    const mintHalf = front > 0 ? rightHalf : leftHalf;
    const whiteHalf = front > 0 ? leftHalf : rightHalf;
    fill(g, whiteHalf, palette[2]);
    fill(g, mintHalf, palette[0]);
    // Soft shadow along the lower side.
    const lower = (part: Vec2[]): Vec2[] => (part.length >= 3 ? clipToBox(part, -halfLength - r - 2, r * 0.35, halfLength + r + 2, r + 2) : []);
    fill(g, lower(whiteHalf), palette[3]);
    fill(g, lower(mintHalf), palette[1]);
    // White dashed shine on the coloured half.
    const y = -r * 0.55;
    for (let i = 0; i < 3; i++) {
      const x0 = front * (2.5 + i * 3.5);
      g.line(new Vec2(x0, y), new Vec2(x0 + front * 2, y), PillArt.SHINE, 1);
    }
    // Seam band with two bolts.
    g.rect(-1.5, -r, 3, r * 2, PillArt.SEAM);
    g.line(new Vec2(-1.5, -r), new Vec2(-1.5, r), OUTLINE, 1);
    g.line(new Vec2(1.5, -r), new Vec2(1.5, r), OUTLINE, 1);
    g.rect(-0.5, -r * 0.5 - 0.5, 1, 1, PillArt.BOLT);
    g.rect(-0.5, r * 0.5 - 0.5, 1, 1, PillArt.BOLT);
  },

  /** A dark visor slit with one or two glowing eye dots, centred at `at`. `flash` lights the slit (a telegraph). */
  drawVisor(g: Gfx, at: Vec2, width: number, eyes: number, blink = false, flash = false): void {
    g.rect(at.x - (width / 2 + 1), at.y - 2.5, width + 2, 5, OUTLINE);
    g.rect(at.x - width / 2, at.y - 1.5, width, 3, flash ? PillArt.FLASH : PillArt.VISOR);
    if (blink) return;
    const xs = eyes === 1 ? [0] : [-width / 4, width / 4];
    for (const x of xs) {
      g.rect(at.x + x - 1, at.y - 1, 2, 2, PillArt.EYE);
      g.rect(at.x + x - 1, at.y - 1, 1, 1, PillArt.EYE_GLOW);
    }
  },

  /** A small antenna from `base` going `up` px straight up, with a glowing tip. */
  drawAntenna(g: Gfx, base: Vec2, up: number, sway = 0): void {
    const tip = base.add(new Vec2(sway, -up));
    g.line(base, tip, OUTLINE, 2);
    g.line(base, tip, PillArt.METAL, 1);
    g.circle(tip, 2, OUTLINE);
    g.circle(tip, 1.2, PillArt.EYE);
  },
};

/** GDScript integer division (truncates toward zero). */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
