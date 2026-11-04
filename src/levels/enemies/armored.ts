// Armored pill robot (tier 3, docs/LEVELS.md): a slow walker with a shield
// on its front (the way it faces). From the front the shield hurts Sproto
// even when he jumps or rolls into it, unless he comes down on it from
// above, or rolls into it on the ground at BREAK_SPEED (4.5 px/frame) or
// more; a full spin dash does that. From behind or above it is destroyed
// like any pill. A roll that is too slow bounces off the shield and hurts
// him (knockback and invincibility, so never a double hit). Zone costumes
// extend this class and draw their own look. Port of
// levels/enemies/armored.gd (+ armored.tscn: tier 3, speed 0.5, 26x16 hurtbox).

import type { Player } from '../../player/player';
import type { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import { closed, PillArt } from './pill_art';
import { Walker } from './walker';

export class Armored extends Walker {
  static readonly BREAK_SPEED = 4.5;

  constructor(name = 'Armored', hurtbox = new Vec2(26, 16), hurtboxAt = new Vec2(0, -13)) {
    super(name, hurtbox, hurtboxAt);
    this.tier = 3;
    this.speed = 0.5;
  }

  /** True when this touch meets the shield and doesn't break it. */
  override isHarmful(player: Player): boolean {
    return this.shieldFaces(player) && !this.breaksShield(player);
  }

  /** Sproto is in front of it (the way it faces) and not coming down from above. */
  shieldFaces(player: Player): boolean {
    const dx = player.globalPosition.x - this.globalPosition.x;
    if (this.fromAbove(player)) return false;
    return dx === 0 || Math.sign(dx) === this.direction;
  }

  /** Falling onto it: moving down with his centre above the capsule's middle. */
  fromAbove(player: Player): boolean {
    return player.velocity.y > 0 && !player.grounded && player.globalPosition.y < this.globalPosition.y + Walker.BODY_Y;
  }

  /** Rolling (or spin dashing) along the ground at BREAK_SPEED or more. */
  breaksShield(player: Player): boolean {
    return player.grounded && (player.state === 'roll' || player.state === 'spindash') && Math.abs(player.groundSpeed) >= Armored.BREAK_SPEED;
  }

  protected override drawOverBody(g: Gfx): void {
    this.drawShield(g);
  }

  /** A plain shield on the front (local +x in the body's frame). */
  protected drawShield(g: Gfx): void {
    const x = Walker.HALF_LENGTH + Walker.RADIUS + 2;
    const shield = [
      new Vec2(x, -9),
      new Vec2(x + 4, -8),
      new Vec2(x + 4, 4),
      new Vec2(x + 1, 9),
      new Vec2(x - 1, 4),
      new Vec2(x - 1, -8),
    ];
    g.polygon(shield, this.shieldColor());
    g.polyline(closed(shield), PillArt.OUTLINE, 1);
    g.line(new Vec2(x + 2, -6), new Vec2(x + 2, 3), PillArt.WHITE, 1);
  }

  protected shieldColor(): Color {
    return PillArt.METAL;
  }
}
