// Walker pill robot (tier 1): a mint/white capsule lying on its side on two
// wheels. It rolls along the floor (following gentle slopes) and turns
// around at walls, at ledges (it never drives off one) and, if set, at the
// ends of its patrol range. Spawned in the air, it drops to the floor first.
// Its speed scales with the act's difficulty. Port of levels/enemies/walker.gd
// (+ walker.tscn: a 26x13 hurtbox 13 px above the feet).

import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { PillArt, type PillPalette } from './pill_art';

export class Walker extends Enemy {
  static readonly HALF_LENGTH = 7.0;
  static readonly RADIUS = 7.0;
  static readonly WHEEL = 3.0;
  static readonly BODY_Y = -13.0;
  /** Half the body length, for wall and ledge probes. */
  static readonly HALF_WIDTH = 14.0;

  /** Patrol speed at difficulty 1, px/frame. */
  speed = 0.75;
  /** Turns this far (px) either side of its start point; 0 = only at walls and ledges. */
  patrolDistance = 0.0;
  /** -1 left, 1 right. */
  direction = -1;

  protected homeX = 0;
  protected roll = 0;

  /** `hurtbox`/`hurtboxAt`: the scene's CollisionShape2D (size, position). */
  constructor(name = 'Walker', hurtbox = new Vec2(26, 13), hurtboxAt = new Vec2(0, -13)) {
    super(name);
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.speed = p.num('speed', this.speed);
    this.patrolDistance = p.num('patrol_distance', this.patrolDistance);
    this.direction = p.int('direction', this.direction);
  }

  override ready(): void {
    super.ready();
    this.homeX = this.globalPosition.x;
    this.direction = this.direction < 0 ? -1 : 1;
  }

  override enemyPhysics(_delta: number): void {
    if (!this.grounded) {
      this.gravityStep();
      return;
    }
    this.patrolStep(this.moveSpeed(this.speed));
  }

  /**
   * One patrol step of `px` (already difficulty-scaled): turns at walls,
   * ledges and the patrol range, follows the floor. False when boxed in.
   */
  patrolStep(px: number, useRange = true): boolean {
    let step = px * this.direction;
    if (this.blocked(step, useRange)) {
      this.direction = -this.direction;
      step = -step;
      if (this.blocked(step, useRange)) return false; // boxed in: wait
    }
    this.moveAlongFloor(step);
    return true;
  }

  /** Moves `step` px along x and settles on the floor (or starts falling). */
  moveAlongFloor(step: number): void {
    this.globalPosition = this.globalPosition.withX(this.globalPosition.x + step);
    this.roll += step;
    const floorY = this.floorBelow(0, 8, 12);
    if (floorY === Infinity) this.grounded = false;
    else this.globalPosition = this.globalPosition.withY(floorY);
  }

  /** True when a step of `step` px would hit a wall, run off a ledge or (with `useRange`) leave the patrol range. */
  blocked(step: number, useRange = true): boolean {
    const dir = Math.sign(step);
    if (this.wallAhead(dir, Walker.HALF_WIDTH + Math.abs(step) + 1, 6)) return true;
    if (this.floorBelow(dir * (Walker.HALF_WIDTH - 2) + step, 8, 20) === Infinity) return true; // ledge ahead
    return useRange && this.patrolDistance > 0 && (this.globalPosition.x + step - this.homeX) * dir > this.patrolDistance;
  }

  override pop(): void {
    const colors = this.palette();
    LevelFx.pillPop(
      this.parent,
      this.globalPosition.add(new Vec2(0, Walker.BODY_Y)),
      Vec2.RIGHT,
      Walker.HALF_LENGTH,
      Walker.RADIUS,
      this.direction > 0 ? colors[2] : colors[0],
      this.direction > 0 ? colors[0] : colors[2],
      PillArt.OUTLINE,
    );
  }

  override draw(g: Gfx): void {
    const HL = Walker.HALF_LENGTH;
    const R = Walker.RADIUS;
    const WHEEL = Walker.WHEEL;
    const flip = new Vec2(this.direction, 1);
    g.setTransform(Vec2.ZERO, 0, flip);
    // Wheels with spokes that turn as it rolls.
    for (const x of [-HL, HL]) {
      const hub = new Vec2(x, -WHEEL);
      g.circle(hub, WHEEL + 1, PillArt.OUTLINE);
      g.circle(hub, WHEEL, PillArt.METAL_DARK);
      const spoke = Vec2.fromAngle((this.roll / WHEEL) * this.direction).mul(WHEEL - 0.5);
      g.line(hub.sub(spoke), hub.add(spoke), PillArt.METAL, 1);
    }
    // Body, facing its direction of travel (mint half in front).
    g.setTransform(new Vec2(0, Walker.BODY_Y), 0, flip);
    this.drawBehindBody(g);
    PillArt.drawCapsule(g, HL, R, 1, this.palette());
    PillArt.drawVisor(g, new Vec2(HL + 2, -1.5), 6, 2, false, this.visorFlash());
    PillArt.drawAntenna(g, new Vec2(-HL + 1, -R - 1), 5, Math.sin(this.roll * 0.3) * 1.5);
    this.drawOverBody(g);
    g.resetTransform();
  }

  /** Drawing hooks for variants, in the body's frame (origin at its centre, facing +x). */
  protected drawBehindBody(_g: Gfx): void {}

  protected drawOverBody(_g: Gfx): void {}

  protected visorFlash(): boolean {
    return false;
  }

  /** Body colours (PillArt palette); zone costumes override it. */
  palette(): PillPalette {
    return PillArt.BASIC;
  }
}
