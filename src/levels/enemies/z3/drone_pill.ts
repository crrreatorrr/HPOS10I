// Drone pill (Capital Mansion, tier 2): the Floater behaviour in the zone
// costume: a navy and white capsule under a rotor, sweeping a searchlight
// cone below it as it drifts. Port of levels/enemies/z3/drone_pill.gd
// (+ .tscn: tier 2, a 24x18 hurtbox at the origin).

import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { Floater } from '../floater';
import { PillArt } from '../pill_art';
import { MansionArt } from './mansion_art';

export class DronePill extends Floater {
  constructor(name = 'DronePill') {
    super(name, new Vec2(24, 18), Vec2.ZERO);
    this.tier = 2;
  }

  override pop(): void {
    this.popAs(PillArt.NAVY, PillArt.WHITE);
  }

  override draw(g: Gfx): void {
    const HL = Floater.HALF_LENGTH;
    const R = Floater.RADIUS;
    MansionArt.drawSearchlight(g, new Vec2(0, R), new Vec2(Math.sin(this.spin * 0.3) * 0.4, 1).normalized(), 56);
    MansionArt.drawRotor(g, R, this.spin);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1, PillArt.MANSION);
    PillArt.drawVisor(g, new Vec2(HL + 1, -1), 6, 1);
    g.resetTransform();
  }
}
