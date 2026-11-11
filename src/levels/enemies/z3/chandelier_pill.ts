// Chandelier pill (Capital Mansion, tier 4): the Dropper behaviour in the
// zone costume: a navy and white capsule hanging inside a crystal
// chandelier, which rattles before it falls. Port of
// levels/enemies/z3/chandelier_pill.gd (+ .tscn: tier 4, a 20x26 hurtbox at
// the origin).

import { PillSprite } from '../pill_sprite';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Dropper } from '../dropper';
import { PillArt, type PillPalette } from '../pill_art';
import { MansionArt } from './mansion_art';

export class ChandelierPill extends Dropper {
  protected override readonly spriteRow: number = PillSprite.chandelier;

  constructor(name = 'ChandelierPill') {
    super(name, new Vec2(20, 26), Vec2.ZERO);
    this.tier = 4;
  }

  override palette(): PillPalette {
    return PillArt.MANSION;
  }

  override draw(g: Gfx): void {
    if (this.drawHangingSprite(g)) return;
    MansionArt.drawChandelier(g, Dropper.RADIUS, this.shake().x);
  }
}
