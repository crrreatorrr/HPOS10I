// Wizard Academy costume pieces (docs/DESIGN.md "Pill robots"), drawn in
// code: the enchanted book a spellbook pill rides, and the knight pill's
// helmet and breastplate. Purple and cream; no lettering, crests or symbols.
// Port of levels/enemies/z2/spellbook_art.gd.

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { degToRad } from '../../../runtime/math';
import { Vec2 } from '../../../runtime/vec2';
import { closed, PillArt } from '../pill_art';

export const SpellbookArt = {
  COVER: new Color(0.42, 0.24, 0.66),
  COVER_LIGHT: new Color(0.6, 0.38, 0.86),
  PAGES: new Color(0.98, 0.93, 0.8),
  PAGES_SHADE: new Color(0.84, 0.76, 0.6),
  GOLD: new Color(0.98, 0.8, 0.3),
  STEEL: new Color(0.72, 0.74, 0.82),
  STEEL_DARK: new Color(0.44, 0.46, 0.56),

  /**
   * An open book flapping its covers like wings, its spine at `at`. `flap` is
   * a phase (radians); the halves swing between about -10 and +30 degrees above flat.
   */
  drawBook(g: Gfx, at: Vec2, flap: number): void {
    const A = SpellbookArt;
    const angle = degToRad(10 + Math.sin(flap) * 20);
    for (const side of [-1, 1]) {
      const dir = new Vec2(Math.cos(angle) * side, -Math.sin(angle));
      const up = new Vec2(-dir.y, dir.x).mul(-side); // perpendicular, pointing up
      // Cover (purple, thick) with the pages (cream) lying on top of it.
      const cover = [at, at.add(dir.mul(14)), at.add(dir.mul(14)).sub(up.mul(4)), at.sub(up.mul(4))];
      const pages = [at.add(up.mul(0.5)), at.add(dir.mul(12)).add(up.mul(0.5)), at.add(dir.mul(12)).add(up.mul(3.5)), at.add(up.mul(3.5))];
      g.polygon(cover, A.COVER);
      g.polyline(closed(cover), PillArt.OUTLINE, 1);
      g.polygon(pages, A.PAGES);
      g.polyline(closed(pages), PillArt.OUTLINE, 1);
      g.line(at.add(dir.mul(3)).add(up.mul(2)), at.add(dir.mul(10)).add(up.mul(2)), A.PAGES_SHADE, 1);
      g.line(at.add(dir.mul(2)).sub(up.mul(2)), at.add(dir.mul(13)).sub(up.mul(2)), A.COVER_LIGHT, 1);
    }
    g.rect(at.x - 1.5, at.y - 1, 3, 4, A.GOLD);
  },

  /** A rounded knight helmet over a capsule of radius `r` (body frame, facing +x), with a purple plume. */
  drawHelmet(g: Gfx, r: number, sway: number): void {
    const A = SpellbookArt;
    const dome: Vec2[] = [];
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (Math.PI * k) / 8;
      dome.push(new Vec2(Math.cos(a) * (r + 3) - 1, Math.sin(a) * (r + 2) - 1));
    }
    g.polygon(dome, A.STEEL);
    g.polyline(dome, PillArt.OUTLINE, 1);
    g.line(new Vec2(-r - 4, -1), new Vec2(r + 2, -1), A.STEEL_DARK, 2);
    const plume = [new Vec2(-2, -r - 2), new Vec2(-6 + sway, -r - 9), new Vec2(-11 + sway, -r - 7), new Vec2(-6, -r - 1)];
    g.polygon(plume, A.COVER_LIGHT);
    g.polyline(closed(plume), PillArt.OUTLINE, 1);
  },

  /** A breastplate band around the capsule's middle. */
  drawBreastplate(g: Gfx, r: number): void {
    const A = SpellbookArt;
    g.rect(-4, -r + 1, 8, r * 2 - 2, A.STEEL);
    g.rect(-4, -r + 1, 8, 1, Color.WHITE);
    g.line(new Vec2(-4, -r + 1), new Vec2(-4, r - 1), PillArt.OUTLINE, 1);
    g.line(new Vec2(4, -r + 1), new Vec2(4, r - 1), PillArt.OUTLINE, 1);
    g.rect(-1, 1, 2, 2, A.GOLD);
  },
};
