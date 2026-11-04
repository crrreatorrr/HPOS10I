// Capital Mansion costume pieces (docs/DESIGN.md "Pill robots"), drawn in
// code: the drone pill's rotor and searchlight, the clerk's paper stacks,
// the bouncer's briefcase shield, the chandelier the ceiling pill hangs in
// and the camera housing. Navy and white; no seals, flags, logos or text.
// Port of levels/enemies/z3/mansion_art.gd.

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { closed, PillArt } from '../pill_art';

const LIGHT = new Color(1.0, 0.95, 0.7, 0.35);

export const MansionArt = {
  ROTOR: new Color(0.3, 0.32, 0.4),
  LIGHT,
  LIGHT_CORE: new Color(1.0, 1.0, 0.85),
  PAPER: new Color(0.97, 0.97, 0.95),
  PAPER_SHADE: new Color(0.78, 0.8, 0.86),
  LEATHER: new Color(0.36, 0.2, 0.12),
  LEATHER_LIGHT: new Color(0.52, 0.32, 0.2),
  BRASS: new Color(0.95, 0.8, 0.4),
  CRYSTAL: new Color(0.85, 0.92, 1.0),
  CRYSTAL_SHADE: new Color(0.6, 0.72, 0.9),

  /** A rotor on a mast above a capsule of radius `r`; `spin` is a phase. */
  drawRotor(g: Gfx, r: number, spin: number): void {
    g.line(new Vec2(0, -r - 1), new Vec2(0, -r - 5), PillArt.OUTLINE, 2);
    const blade = Math.abs(Math.cos(spin)) * 11 + 2;
    g.rect(-blade, -r - 7, blade * 2, 2, PillArt.OUTLINE);
    g.rect(-blade + 1, -r - 6.5, blade * 2 - 2, 1, MansionArt.ROTOR);
  },

  /** A searchlight cone from `from` towards `dir` (unit), `length` px long. */
  drawSearchlight(g: Gfx, from: Vec2, dir: Vec2, length: number, lit = true): void {
    const side = dir.orthogonal().mul(length * 0.22);
    const end = from.add(dir.mul(length));
    g.polygon([from, end.add(side), end.sub(side)], lit ? LIGHT : LIGHT.withAlpha(0.15));
    g.circle(from, 2.5, PillArt.OUTLINE);
    g.circle(from, 1.5, lit ? MansionArt.LIGHT_CORE : PillArt.METAL);
  },

  /** Stacks of paper balanced on the clerk's base, in the body frame (facing +x). */
  drawPaperStacks(g: Gfx, shake: number): void {
    for (let k = 0; k < 2; k++) {
      const x = -12 + k * 20 + shake * (k === 0 ? 1 : -1);
      g.rect(x - 5, -9 - k * 2, 10, 9 + k * 2, PillArt.OUTLINE);
      g.rect(x - 4, -8 - k * 2, 8, 8 + k * 2, MansionArt.PAPER);
      for (let y = -7 - k * 2; y < -1; y += 2) {
        g.line(new Vec2(x - 4, y), new Vec2(x + 4, y), MansionArt.PAPER_SHADE, 1);
      }
    }
  },

  /** A briefcase held up as a shield on the front (body frame, facing +x). */
  drawBriefcase(g: Gfx, x: number): void {
    const r = new Rect2(x - 1, -10, 7, 20);
    g.rectR(r.grow(1), PillArt.OUTLINE);
    g.rectR(r, MansionArt.LEATHER);
    g.rect(r.x + 1, r.y + 1, 5, 2, MansionArt.LEATHER_LIGHT);
    g.rect(x + 1, -1.5, 3, 3, MansionArt.BRASS);
    g.rect(x + 1, -13, 3, 3, PillArt.OUTLINE, false, 1);
  },

  /** A crystal chandelier around a hanging capsule (centre at the origin). */
  drawChandelier(g: Gfx, _r: number, sway: number): void {
    const armY = 2;
    g.line(new Vec2(-16 + sway, armY), new Vec2(16 + sway, armY), PillArt.OUTLINE, 4);
    g.line(new Vec2(-16 + sway, armY), new Vec2(16 + sway, armY), MansionArt.BRASS, 2);
    for (const x of [-16, -8, 8, 16]) {
      const top = new Vec2(x + sway, armY);
      const crystal = [top.add(new Vec2(-2.5, 1)), top.add(new Vec2(2.5, 1)), top.add(new Vec2(0, 9))];
      g.polygon(crystal, MansionArt.CRYSTAL);
      g.polyline(closed(crystal), MansionArt.CRYSTAL_SHADE, 1);
      g.circle(top.add(new Vec2(0, -4)), 2, PillArt.OUTLINE);
      g.circle(top.add(new Vec2(0, -4)), 1.2, MansionArt.LIGHT_CORE);
    }
  },

  /** A dark camera housing with a lens ring, in the turret's frame (origin at its base). */
  drawCameraHousing(g: Gfx, bodyY: number, aim: Vec2): void {
    g.rect(-10, bodyY - 11, 20, 22, PillArt.OUTLINE);
    g.rect(-9, bodyY - 10, 18, 20, MansionArt.ROTOR);
    g.rect(-9, bodyY - 10, 18, 3, PillArt.METAL);
    const lens = new Vec2(0, bodyY).add(aim.mul(9));
    g.circle(lens, 4.5, PillArt.OUTLINE);
    g.circle(lens, 3.5, PillArt.VISOR);
    g.circle(lens.add(new Vec2(-1, -1)), 1, MansionArt.CRYSTAL);
  },
};
