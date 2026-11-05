// Spellbook pill, diving kind (Wizard Academy, tier 3): the Diver behaviour
// (marks where Sproto is, telegraphs, swoops at that spot) in the zone
// costume: a purple and cream capsule riding an enchanted book whose covers
// beat faster in a swoop. Port of levels/enemies/z2/spellbook_diver.gd
// (+ .tscn: tier 3, a 24x18 hurtbox 1 px down).

import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Diver } from '../diver';
import { PillArt, type PillPalette } from '../pill_art';
import { SpellbookArt } from './spellbook_art';

export class SpellbookDiver extends Diver {
  constructor(name = 'SpellbookDiver') {
    super(name, new Vec2(24, 18), new Vec2(0, 1));
    this.tier = 3;
  }

  override palette(): PillPalette {
    return PillArt.WIZARD;
  }

  override draw(g: Gfx): void {
    const HL = Diver.HALF_LENGTH;
    const R = Diver.RADIUS;
    this.drawTarget(g);
    SpellbookArt.drawBook(g, new Vec2(0, R + 3), this.flap);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1, PillArt.WIZARD);
    PillArt.drawVisor(g, new Vec2(HL + 1, -1), 6, 2, false, this.visorFlash());
    PillArt.drawAntenna(g, new Vec2(-HL + 1, -R - 1), 4);
    g.resetTransform();
  }
}
