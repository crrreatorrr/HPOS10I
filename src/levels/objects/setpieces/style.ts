// Shared look of the set pieces (bumpers, crumble ledges, roll tubes,
// vanishing and timed platforms). Each piece is drawn in code in the style
// of its art zone: neon in Neon Rush Remix (dark bodies with glowing magenta
// and cyan outlines, docs/DESIGN.md), natural elsewhere (wood, stone, brass).
// A piece reads its `art_zone` prop; when it is empty it asks the level root
// once it is in the tree.

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import type { Node } from '../../../runtime/node';
import type { Vec2 } from '../../../runtime/vec2';
import { LevelRoot } from '../../common/level_root';

export const NEON_ZONE = 'z4_neon_rush_remix';

export interface SetPieceStyle {
  neon: boolean;
  /** Body fill. */
  body: Color;
  /** Darker body shade (lower half, inner parts). */
  shade: Color;
  /** Main outline / glow colour. */
  edge: Color;
  /** Second accent (stripes, lights). */
  accent: Color;
  /** A warning colour for telegraphs (blinks, countdowns). */
  warn: Color;
  /** Thin dark outline (natural pieces; neon pieces glow instead). */
  outline: Color;
}

export const NEON_STYLE: SetPieceStyle = {
  neon: true,
  body: new Color(0.08, 0.05, 0.16),
  shade: new Color(0.04, 0.02, 0.09),
  edge: new Color(1.0, 0.24, 0.78),
  accent: new Color(0.2, 0.95, 1.0),
  warn: new Color(1.0, 0.92, 0.3),
  outline: new Color(0.02, 0.0, 0.06),
};

export const NATURAL_STYLE: SetPieceStyle = {
  neon: false,
  body: new Color(0.62, 0.42, 0.24),
  shade: new Color(0.42, 0.27, 0.15),
  edge: new Color(0.84, 0.66, 0.38),
  accent: new Color(0.95, 0.8, 0.3),
  warn: new Color(0.95, 0.3, 0.22),
  outline: new Color(0.16, 0.1, 0.06),
};

/** True for the neon art zone (and its variants, e.g. a "z4_..._night" art zone). */
export function isNeonZone(artZone: string): boolean {
  return artZone === NEON_ZONE || artZone.startsWith('z4_');
}

export function styleFor(artZone: string): SetPieceStyle {
  return isNeonZone(artZone) ? NEON_STYLE : NATURAL_STYLE;
}

/** The art zone a piece should use: its own prop, else its level root's, else ''. */
export function resolveArtZone(node: Node, own: string): string {
  if (own !== '') return own;
  const root = LevelRoot.find(node);
  return root ? root.currentArtZoneId() : '';
}

/** A glowing line: a wide faint stroke, a medium one and a bright core. */
export function glowLine(g: Gfx, points: readonly Vec2[], color: Color, closed = false, core = 1.5): void {
  if (points.length < 2) return;
  g.polyline(points, color.withAlpha(0.18), core + 5, closed);
  g.polyline(points, color.withAlpha(0.45), core + 2, closed);
  g.polyline(points, color.lightened(0.45), core, closed);
}

/** A box outline in the piece's style: neon glow, or a 1 px dark outline. */
export function styledBox(g: Gfx, x: number, y: number, w: number, h: number, style: SetPieceStyle, edge: Color = style.edge): void {
  if (style.neon) {
    g.rect(x, y, w, h, style.body);
    g.rect(x, y + h * 0.55, w, h * 0.45, style.shade);
    g.additive(() => g.rect(x - 2, y - 2, w + 4, h + 4, edge.withAlpha(0.18), false, 4));
    g.rect(x, y, w, h, edge, false, 1.5);
    g.rect(x + 2, y + 1, w - 4, 1, edge.lightened(0.5).withAlpha(0.9));
  } else {
    g.rect(x, y, w, h, style.outline);
    g.rect(x + 1, y + 1, w - 2, h - 2, style.body);
    g.rect(x + 1, y + h * 0.6, w - 2, h * 0.4 - 1, style.shade);
    g.rect(x + 1, y + 1, w - 2, 2, edge);
  }
}
