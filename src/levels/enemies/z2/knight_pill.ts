// Knight pill (Wizard Academy, tier 3): the Armored behaviour (a front
// shield that only a roll at 4.5+, a spin dash or a hit from above or
// behind gets past) in the zone costume: a purple and cream capsule in a
// little knight helmet with a plume, a breastplate and a plain shield.
// Port of levels/enemies/z2/knight_pill.gd (+ .tscn: tier 3, speed 0.5, a
// 30x18 hurtbox 13 px up).

import type { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Armored } from '../armored';
import { PillArt, type PillPalette } from '../pill_art';
import { Walker } from '../walker';
import { SpellbookArt } from './spellbook_art';

export class KnightPill extends Armored {
  constructor(name = 'KnightPill') {
    super(name, new Vec2(30, 18), new Vec2(0, -13));
    this.tier = 3;
    this.speed = 0.5;
  }

  override palette(): PillPalette {
    return PillArt.WIZARD;
  }

  protected override drawOverBody(g: Gfx): void {
    SpellbookArt.drawBreastplate(g, Walker.RADIUS);
    SpellbookArt.drawHelmet(g, Walker.RADIUS, Math.sin(this.roll * 0.2) * 1.5);
    PillArt.drawVisor(g, new Vec2(Walker.HALF_LENGTH + 2, -1.5), 6, 2, false, this.visorFlash());
    this.drawShield(g);
  }

  protected override shieldColor(): Color {
    return SpellbookArt.STEEL;
  }
}
