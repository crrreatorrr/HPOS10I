// Camera pill (Capital Mansion, tier 4): the Sniper behaviour in the zone
// costume: a navy and white capsule inside a security-camera housing whose
// lens turns to follow Sproto and glows during the telegraph. Port of
// levels/enemies/z3/camera_pill.gd (+ .tscn: tier 4, a 20x26 hurtbox 14 px up).

import { drawPillSprite, PillSprite } from '../pill_sprite';
import type { Gfx } from '../../../runtime/gfx';
import { Vec2 } from '../../../runtime/vec2';
import { PillArt, type PillPalette } from '../pill_art';
import { Sniper } from '../sniper';
import { MansionArt } from './mansion_art';

export class CameraPill extends Sniper {
  constructor(name = 'CameraPill') {
    super(name, new Vec2(20, 26), new Vec2(0, -14));
    this.tier = 4;
  }

  override palette(): PillPalette {
    return PillArt.MANSION;
  }

  override draw(g: Gfx): void {
    const BODY_Y = Sniper.BODY_Y;
    this.drawSight(g);
    if (drawPillSprite(g, PillSprite.camera, 0, Math.sign(this.aim.x), this.isTelegraphing() || this.isFiring())) return;
    g.rect(-8, -3, 16, 3, PillArt.OUTLINE);
    g.rect(-7, -2, 14, 1, PillArt.METAL_DARK);
    g.line(new Vec2(0, -3), new Vec2(0, BODY_Y + 8), PillArt.OUTLINE, 4);
    g.line(new Vec2(0, -3), new Vec2(0, BODY_Y + 8), PillArt.METAL, 2);
    MansionArt.drawCameraHousing(g, BODY_Y, this.aim);
    g.setTransform(new Vec2(0, BODY_Y), -Math.PI * 0.5, new Vec2(0.8, 0.8));
    PillArt.drawCapsule(g, Sniper.HALF_LENGTH, Sniper.RADIUS, 1, PillArt.MANSION);
    g.resetTransform();
    const lens = new Vec2(0, BODY_Y).add(this.aim.mul(9));
    if (this.flash()) g.circle(lens, 3, PillArt.FLASH);
  }
}
