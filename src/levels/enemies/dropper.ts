// Dropper pill robot (tier 4, docs/LEVELS.md): hangs upright from the ceiling
// by a short chain. When Sproto moves in under it (within `triggerWidth`, and
// within `triggerDepth` below), it shakes and plays the telegraph sound for
// at least 0.35 s, then the chain snaps and it drops straight down. It is
// destroyed when it lands (no score), or by a jump or roll at any time.
// Fair spawns: it never drops because Sproto (re)spawned under it. He must
// move in from outside, and it ignores everyone for its first `armFrames`.
// Fall speed and telegraph scale with the local difficulty. Zone costumes
// extend this class and draw their own look. The origin is the middle of the
// capsule while it hangs. Port of levels/enemies/dropper.gd (+ dropper.tscn:
// tier 4, a 16x24 hurtbox at the origin).

import { Audio } from '../../core/audio';
import type { Player } from '../../player/player';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Signal } from '../../runtime/signal';
import { tree } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { idiv, PillArt, type PillPalette } from './pill_art';

export enum DropperMode {
  HANGING,
  SHAKING,
  FALLING,
}

export class Dropper extends Enemy {
  static readonly HALF_LENGTH = 5.0;
  static readonly RADIUS = 7.0;
  /** Telegraph before the drop, seconds at difficulty 1. */
  static readonly TELEGRAPH = 0.5;
  static readonly DROP_MAX = 10.0;

  readonly landed = new Signal();

  triggerWidth = 56.0;
  triggerDepth = 320.0;
  /** Frames after it appears during which it can't be triggered. */
  armFrames = 60;
  /** Length of the chain up to the ceiling, px (drawn only). */
  chain = 16.0;

  mode = DropperMode.HANGING;
  protected age = 0;
  protected timer = 0;
  private wasUnder = true;

  constructor(name = 'Dropper', hurtbox = new Vec2(16, 24), hurtboxAt = Vec2.ZERO) {
    super(name);
    this.tier = 4;
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.triggerWidth = p.num('trigger_width', this.triggerWidth);
    this.triggerDepth = p.num('trigger_depth', this.triggerDepth);
    this.armFrames = p.int('arm_frames', this.armFrames);
    this.chain = p.num('chain', this.chain);
  }

  override enemyPhysics(_delta: number): void {
    this.age += 1;
    switch (this.mode) {
      case DropperMode.HANGING: {
        const under = this.playerUnder();
        if (under && !this.wasUnder && this.age > this.armFrames) {
          this.mode = DropperMode.SHAKING;
          this.timer = this.telegraphFrames(Dropper.TELEGRAPH);
          this.playTelegraph();
        }
        this.wasUnder = under;
        break;
      }
      case DropperMode.SHAKING:
        this.timer -= 1;
        if (this.timer <= 0) {
          this.mode = DropperMode.FALLING;
          this.fallSpeed = 0;
        }
        break;
      case DropperMode.FALLING: {
        // GRAVITY * Difficulty.speedMult(local difficulty), as in the original.
        this.fallSpeed = Math.min(this.fallSpeed + this.moveSpeed(Enemy.GRAVITY), Dropper.DROP_MAX);
        const bottom = Dropper.HALF_LENGTH + Dropper.RADIUS;
        const floorY = this.floorUnder(this.fallSpeed + bottom + 1);
        if (floorY !== Infinity && floorY - bottom <= this.globalPosition.y + this.fallSpeed) {
          this.globalPosition = this.globalPosition.withY(floorY - bottom);
          this.landed.emit();
          this.breakOnLanding();
          return;
        }
        this.globalPosition = this.globalPosition.withY(this.globalPosition.y + this.fallSpeed);
        break;
      }
    }
  }

  /** True when a live player is in the trigger zone below. */
  private playerUnder(): boolean {
    for (const player of tree.getNodesInGroup<Player>('player')) {
      if (player.state === 'dead') continue;
      const d = player.globalPosition.sub(this.globalPosition);
      if (Math.abs(d.x) <= this.triggerWidth / 2 && d.y > 0 && d.y <= this.triggerDepth) return true;
    }
    return false;
  }

  private floorUnder(reach: number): number {
    const hit = this.ray(this.globalPosition, this.globalPosition.add(new Vec2(0, reach)));
    return hit ? hit.position.y : Infinity;
  }

  /** Breaks on landing: the pop without a score. */
  private breakOnLanding(): void {
    if (!this.alive) return;
    this.alive = false;
    Audio.playSfx('enemy_pop');
    this.pop();
    this.monitoring = false;
    this.monitorable = false;
    this.destroyed.emit();
    this.hide();
    this.queueFree();
  }

  isTelegraphing(): boolean {
    return this.mode === DropperMode.SHAKING;
  }

  isFalling(): boolean {
    return this.mode === DropperMode.FALLING;
  }

  override pop(): void {
    const colors = this.palette();
    LevelFx.pillPop(this.parent, this.globalPosition, Vec2.UP, Dropper.HALF_LENGTH, Dropper.RADIUS, colors[0], colors[2], PillArt.OUTLINE);
  }

  /** Body colours (PillArt palette); zone costumes override it. */
  palette(): PillPalette {
    return PillArt.BASIC;
  }

  protected shake(): Vec2 {
    return this.mode === DropperMode.SHAKING ? new Vec2((this.timer % 2) * 2 - 1, 0) : Vec2.ZERO;
  }

  override draw(g: Gfx): void {
    const HL = Dropper.HALF_LENGTH;
    const R = Dropper.RADIUS;
    const shake = this.shake();
    const top = -HL - R;
    if (this.mode !== DropperMode.FALLING) {
      // The chain up to the ceiling.
      const s = shake.mul(0.5);
      for (let k = 0; k < this.chain; k += 4) {
        g.rect(-1.5 + s.x, top - k - 4 + s.y, 3, 4, PillArt.OUTLINE);
        g.rect(-0.5 + s.x, top - k - 3 + s.y, 1, 2, PillArt.METAL);
      }
    }
    g.setTransform(shake, -Math.PI * 0.5);
    PillArt.drawCapsule(g, HL, R, 1, this.palette());
    g.resetTransform();
    PillArt.drawVisor(g, shake.add(new Vec2(0, 2)), 8, 2, false, this.mode === DropperMode.SHAKING && idiv(this.timer, 3) % 2 === 0);
  }
}
