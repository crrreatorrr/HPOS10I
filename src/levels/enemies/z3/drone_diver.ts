// Drone pill, diving kind (Capital Mansion, tier 3): the Diver behaviour in
// the zone costume: a navy and white capsule under a rotor whose searchlight
// snaps onto the marked spot during the telegraph. Port of
// levels/enemies/z3/drone_diver.gd (+ .tscn: tier 3, a 24x18 hurtbox at the origin).

import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Diver, DiverMode } from '../diver';
import { PillArt, type PillPalette } from '../pill_art';
import { MansionArt } from './mansion_art';

export class DroneDiver extends Diver {
  constructor(name = 'DroneDiver') {
    super(name, new Vec2(24, 18), Vec2.ZERO);
    this.tier = 3;
  }

  override palette(): PillPalette {
    return PillArt.MANSION;
  }

  override draw(g: Gfx): void {
    const HL = Diver.HALF_LENGTH;
    const R = Diver.RADIUS;
    this.drawTarget(g);
    const telegraph = this.mode === DiverMode.TELEGRAPH;
    const dir = telegraph
      ? this.target.sub(this.globalPosition).normalized()
      : new Vec2(Math.sin(this.flap * 0.5) * 0.4, 1).normalized();
    MansionArt.drawSearchlight(g, new Vec2(0, R), dir, telegraph ? 64 : 48, this.mode !== DiverMode.REST);
    MansionArt.drawRotor(g, R, this.flap * 2);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1, PillArt.MANSION);
    PillArt.drawVisor(g, new Vec2(HL + 1, -1), 6, 2, false, this.visorFlash());
    g.resetTransform();
  }
}
