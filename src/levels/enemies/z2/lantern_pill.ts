// Lantern pill (Wizard Academy, tier 4): the Dropper behaviour (hangs from
// the ceiling, shakes when Sproto moves in under it, then drops) in the zone
// costume: a purple and cream capsule in a little gold lantern cage that
// glows warmer while it shakes. Port of levels/enemies/z2/lantern_pill.gd
// (+ .tscn: tier 4, a 16x24 hurtbox at the origin).

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Dropper, DropperMode } from '../dropper';
import { PillArt, type PillPalette } from '../pill_art';
import { SpellbookArt } from './spellbook_art';

export class LanternPill extends Dropper {
  static readonly GLOW = new Color(1.0, 0.78, 0.36, 0.35);

  constructor(name = 'LanternPill') {
    super(name, new Vec2(16, 24), Vec2.ZERO);
    this.tier = 4;
  }

  override palette(): PillPalette {
    return PillArt.WIZARD;
  }

  override draw(g: Gfx): void {
    const shake = this.shake();
    const glowR = 13 + (this.mode === DropperMode.SHAKING ? 2 : 0);
    g.circle(shake, glowR, LanternPill.GLOW);
    super.draw(g);
    // The cage: a cap, a base and four bars, in gold.
    const top = -Dropper.HALF_LENGTH - Dropper.RADIUS - 3;
    const bottom = Dropper.HALF_LENGTH + Dropper.RADIUS + 2;
    const gold = SpellbookArt.GOLD;
    g.rect(shake.x - 8, shake.y + top - 1, 16, 3, PillArt.OUTLINE);
    g.rect(shake.x - 7, shake.y + top, 14, 1, gold);
    g.rect(shake.x - 8, shake.y + bottom - 1, 16, 3, PillArt.OUTLINE);
    g.rect(shake.x - 7, shake.y + bottom, 14, 1, gold);
    for (const x of [-9, 8]) {
      g.line(shake.add(new Vec2(x + 0.5, top + 1)), shake.add(new Vec2(x + 0.5, bottom)), gold, 1);
    }
  }
}
