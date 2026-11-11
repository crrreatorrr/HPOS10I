// Bouncer pill (Capital Mansion, tier 3): the Armored behaviour in the zone
// costume: a navy and white capsule in a dark tie holding a briefcase up as
// its shield. Port of levels/enemies/z3/bouncer_pill.gd (+ .tscn: tier 3,
// speed 0.5, a 30x18 hurtbox 13 px up).

import { PillSprite } from '../pill_sprite';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Armored } from '../armored';
import { PillArt, type PillPalette } from '../pill_art';
import { Walker } from '../walker';
import { MansionArt } from './mansion_art';

export class BouncerPill extends Armored {
  protected override readonly spriteRow: number = PillSprite.bouncer;

  constructor(name = 'BouncerPill') {
    super(name, new Vec2(30, 18), new Vec2(0, -13));
    this.tier = 3;
    this.speed = 0.5;
  }

  override palette(): PillPalette {
    return PillArt.MANSION;
  }

  protected override drawOverBody(g: Gfx): void {
    const R = Walker.RADIUS;
    // A tie down the seam.
    g.polygon([new Vec2(-1.5, -R + 1), new Vec2(1.5, -R + 1), new Vec2(2, R - 2), new Vec2(0, R), new Vec2(-2, R - 2)], PillArt.VISOR);
    this.drawShield(g);
  }

  protected override drawShield(g: Gfx): void {
    MansionArt.drawBriefcase(g, Walker.HALF_LENGTH + Walker.RADIUS + 2);
  }
}
