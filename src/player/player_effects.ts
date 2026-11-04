// Watches Sproto and spawns feel effects: dust on skids, hard landings,
// spin dash charges and releases, and the charge run. It only reads the
// player's public state, after the player has moved each tick (it is the
// player's child, so it runs after him), so physics is never affected.

import { Node } from '../runtime/node';
import { Vec2 } from '../runtime/vec2';
import { Effects } from './effects';
import { Player, type PlayerState } from './player';

/** A landing faster than this (px/frame, downwards) raises dust. */
export const HARD_LANDING_SPEED = 6;
/** While skidding, a puff every this many frames. */
export const SKID_PUFF_FRAMES = 4;
/** Charge run: a puff every this many frames once half charged. */
const PEELOUT_PUFF_FRAMES = 6;

export class PlayerEffects extends Node {
  private wasGrounded = true;
  private fallSpeed = 0;
  private charge = 0;
  private frame = 0;

  constructor(private readonly player: Player) {
    super('Effects');
    this.processPriority = 50; // after the player, before the camera
  }

  override ready(): void {
    this.player.stateChanged.connect((old, next) => this.onStateChanged(old, next), { owner: this });
  }

  override physicsProcess(): void {
    const p = this.player;
    this.frame += 1;
    if (Effects.enabled && p.state !== 'dead') {
      const parent = p.parent;
      const feet = this.feet();
      if (p.state === 'skid' && this.frame % SKID_PUFF_FRAMES === 0) Effects.dust(parent, feet, p.facing, 1);
      if (p.grounded && !this.wasGrounded && this.fallSpeed >= HARD_LANDING_SPEED) {
        Effects.dust(parent, feet.add(new Vec2(-5, 0)), -1, 2);
        Effects.dust(parent, feet.add(new Vec2(5, 0)), 1, 2);
      }
      if (p.state === 'spindash' && p.spindashCharge > this.charge + 0.5) Effects.dust(parent, feet, -p.facing, 2);
      if (p.state === 'peelout' && p.moves.peelOutCharge() >= 0.5 && this.frame % PEELOUT_PUFF_FRAMES === 0) {
        Effects.dust(parent, feet.sub(new Vec2(p.facing * 4, 0)), -p.facing, 1);
      }
    }
    this.charge = p.spindashCharge;
    this.wasGrounded = p.grounded;
    this.fallSpeed = p.velocity.y;
  }

  private onStateChanged(old: PlayerState, next: PlayerState): void {
    const p = this.player;
    if (!Effects.enabled) return;
    if ((old === 'spindash' && next === 'roll') || (old === 'peelout' && next === 'run')) {
      Effects.dust(p.parent, this.feet().sub(new Vec2(p.facing * 6, 0)), -p.facing, 4, 1.4);
    }
  }

  /** Bottom of the hitbox, on the side of the current floor. */
  private feet(): Vec2 {
    const p = this.player;
    return p.globalPosition.add(Player.modeDown(p.collisionMode).mul(p.getRadii().y));
  }
}
