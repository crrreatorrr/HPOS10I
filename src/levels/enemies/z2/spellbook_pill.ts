// Spellbook pill (Wizard Academy, tier 2): the Floater behaviour (a sine
// path around where it was placed) in the zone costume: a purple and cream
// capsule riding an enchanted book that flaps its covers like wings.
// Port of levels/enemies/z2/spellbook_pill.gd (+ .tscn: tier 2, a 24x18
// hurtbox 1 px down).

import { drawPillSprite, PillSprite } from '../pill_sprite';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Floater } from '../floater';
import { PillArt } from '../pill_art';
import { SpellbookArt } from './spellbook_art';

export class SpellbookPill extends Floater {
  constructor(name = 'SpellbookPill') {
    super(name, new Vec2(24, 18), new Vec2(0, 1));
    this.tier = 2;
  }

  override pop(): void {
    this.popAs(PillArt.PURPLE, PillArt.CREAM);
  }

  override draw(g: Gfx): void {
    if (drawPillSprite(g, PillSprite.spellbook, 16, this.facing, false, 5)) return;
    const HL = Floater.HALF_LENGTH;
    const R = Floater.RADIUS;
    SpellbookArt.drawBook(g, new Vec2(0, R + 3), this.spin * 0.5);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1, PillArt.WIZARD);
    PillArt.drawVisor(g, new Vec2(HL + 1, -1), 6, 1);
    PillArt.drawAntenna(g, new Vec2(-HL + 1, -R - 1), 4, Math.sin(this.spin * 0.5));
    g.resetTransform();
  }
}
