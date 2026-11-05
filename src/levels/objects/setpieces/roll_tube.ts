// A roll tube (forced-roll tunnel). While a live, unhurt Sproto is inside
// its area on the ground he is curled into a ball (the roll state) and kept
// at MIN_SPEED (6 px/frame) or more along the tube, through
// player.pushGround() with a short control lock, so he can't brake or stand
// up inside; airborne he is only kept moving that way. `direction` 1 or -1
// fixes the way through; 0 keeps the way he entered. Pair it with a low
// ceiling (a roll-only tunnel) or use it on open ground as a speed lane.
// The origin is the floor at the left mouth; the area spans `length` px to
// the right and `height` px up. Drawn as a glass tube with flowing chevrons
// (neon in Neon Rush Remix, `art_zone`). Layer 7 (objects), mask 5 (player).
//
// forceRoll() plays the roll sound and calls Player.forceRoll().

import { Audio } from '../../../core/audio';
import type { Player } from '../../../player/player';
import type { Gfx } from '../../../runtime/gfx';
import { signf } from '../../../runtime/math';
import { rectShape } from '../../../runtime/physics';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';
import { glowLine, resolveArtZone, styleFor, type SetPieceStyle } from './style';

/** Curls `player` into a rolling ball on the ground (no-op when he already is). */
export function forceRoll(player: Player): void {
  if (!player.isBall) Audio.playSfx('roll');
  player.forceRoll();
}

export class RollTube extends PlayerArea implements Configurable {
  static readonly MIN_SPEED = 6.0;
  static readonly LOCK_FRAMES = 4;

  length = 192.0;
  height = 32.0;
  minSpeed = RollTube.MIN_SPEED;
  direction = 0;
  artZone = '';
  private style: SetPieceStyle | null = null;

  constructor(name = 'RollTube') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.rebuildShape();
  }

  applyProps(p: Props): void {
    this.length = Math.max(p.num('length', this.length), 16);
    this.height = Math.max(p.num('height', this.height), 16);
    this.minSpeed = p.num('min_speed', this.minSpeed);
    this.direction = signf(p.int('direction', this.direction));
    this.artZone = p.str('art_zone', this.artZone);
    this.rebuildShape();
  }

  private rebuildShape(): void {
    this.clearShapes();
    this.addShape(rectShape(new Vec2(this.length, this.height), new Vec2(this.length / 2, -this.height / 2)));
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.style = styleFor(resolveArtZone(this, this.artZone));
  }

  override physicsProcess(): void {
    for (const player of this.playersInside()) {
      if (player.state === 'dead' || player.state === 'hurt' || player.frozen) continue;
      this.drive(player);
    }
  }

  /** The way `player` is sent through. */
  wayFor(player: Player): number {
    if (this.direction !== 0) return this.direction;
    const moving = player.grounded ? player.groundSpeed : player.velocity.x;
    return signf(moving) || player.facing || 1;
  }

  drive(player: Player): void {
    const way = this.wayFor(player);
    if (player.grounded) {
      forceRoll(player);
      if (player.groundSpeed * way < this.minSpeed) player.pushGround(way * this.minSpeed, RollTube.LOCK_FRAMES);
      else player.setControlLock(Math.max(player.controlLock, RollTube.LOCK_FRAMES));
    } else if (player.velocity.x * way < this.minSpeed * 0.5) {
      player.velocity = player.velocity.withX(way * this.minSpeed * 0.5);
    }
  }

  cullRect(): Rect2 {
    return new Rect2(-8, -this.height - 8, this.length + 16, this.height + 16);
  }

  override draw(g: Gfx): void {
    const style = this.style ?? styleFor(this.artZone);
    const L = this.length;
    const H = this.height;
    const way = this.direction === 0 ? 1 : this.direction;
    // Glass body.
    g.rect(0, -H, L, H, (style.neon ? style.accent : style.edge).withAlpha(0.08));
    const top = [new Vec2(0, -H), new Vec2(L, -H)];
    const bottom = [new Vec2(0, -1), new Vec2(L, -1)];
    if (style.neon) {
      g.additive(() => {
        glowLine(g, top, style.accent, false, 1.5);
        glowLine(g, bottom, style.accent, false, 1);
      });
    } else {
      g.line(top[0]!, top[1]!, style.outline, 2);
      g.line(new Vec2(0, -H + 2), new Vec2(L, -H + 2), style.edge.withAlpha(0.6), 1);
    }
    // Rings at the mouths and every 64 px.
    for (let x = 0; x <= L; x += 64) {
      const rx = Math.min(x, L);
      g.rect(rx - 1, -H, 2, H, (style.neon ? style.edge : style.shade).withAlpha(0.6));
    }
    // Chevrons flowing the way through.
    const flow = (tree.physicsFrames * 2) % 32;
    const chevron = (style.neon ? style.edge : style.accent).withAlpha(0.55);
    for (let x = 16 + (way > 0 ? flow : 32 - flow); x < L - 8; x += 32) {
      const tip = new Vec2(x + 4 * way, -H / 2);
      g.line(new Vec2(x - 3 * way, -H / 2 - 6), tip, chevron, 2);
      g.line(tip, new Vec2(x - 3 * way, -H / 2 + 6), chevron, 2);
    }
  }
}
