// Hopper pill robot (tier 1): a mint/white capsule standing upright on a
// coiled spring foot. It hops straight up in place on a timer. Before each
// hop it crouches for a telegraph, and it squashes when it lands. The hop
// interval and the telegraph scale with the act's difficulty. Port of
// levels/enemies/hopper.gd (+ hopper.tscn: a 14x26 hurtbox 18 px up).

import { drawPillSprite, PillSprite } from './pill_sprite';
import type { Gfx } from '../../runtime/gfx';
import { clamp, lerp } from '../../runtime/math';
import { rectShape } from '../../runtime/physics';
import { tree } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { idiv, PillArt } from './pill_art';

export class Hopper extends Enemy {
  protected readonly spriteRow: number = PillSprite.hopper;
  static readonly HALF_LENGTH = 5.0;
  static readonly RADIUS = 7.0;
  /** Spring foot length at rest, crouched and stretched. */
  static readonly SPRING_REST = 7.0;
  static readonly SPRING_CROUCH = 4.0;
  static readonly SPRING_STRETCH = 11.0;
  static readonly LAND_FRAMES = 8;
  /** Crouch before a hop (seconds at difficulty 1). */
  static readonly TELEGRAPH = 0.4;

  /** Frames on the floor between hops, at difficulty 1. */
  hopInterval = 80;
  /** Take-off speed, px/frame (4.5 hops about 46 px high). */
  hopSpeed = 4.5;
  /** Frames before the first hop (to stagger several hoppers). */
  firstHopDelay = 40;

  private timer = 0;
  private landed = Hopper.LAND_FRAMES;

  constructor(name = 'Hopper') {
    super(name);
    this.addShape(rectShape(new Vec2(14, 26), new Vec2(0, -18)));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.hopInterval = p.int('hop_interval', this.hopInterval);
    this.hopSpeed = p.num('hop_speed', this.hopSpeed);
    this.firstHopDelay = p.int('first_hop_delay', this.firstHopDelay);
  }

  override ready(): void {
    super.ready();
    this.timer = this.intervalFrames(this.hopInterval) - this.firstHopDelay;
  }

  override enemyPhysics(_delta: number): void {
    if (!this.grounded) {
      this.gravityStep();
      if (this.grounded) this.landed = 0;
      return;
    }
    this.landed += 1;
    this.timer += 1;
    if (this.timer >= this.intervalFrames(this.hopInterval)) {
      this.timer = 0;
      this.fallSpeed = -this.hopSpeed;
      this.grounded = false;
      this.globalPosition = this.globalPosition.withY(this.globalPosition.y + this.fallSpeed);
    }
  }

  /** True while crouching before a hop. */
  isTelegraphing(): boolean {
    return this.grounded && this.timer > this.intervalFrames(this.hopInterval) - this.telegraphFrames(Hopper.TELEGRAPH);
  }

  private springLength(): number {
    if (!this.grounded) {
      return this.fallSpeed < 0
        ? Hopper.SPRING_STRETCH
        : lerp(Hopper.SPRING_STRETCH, Hopper.SPRING_REST, clamp(this.fallSpeed / 3, 0, 1));
    }
    if (this.landed < Hopper.LAND_FRAMES || this.isTelegraphing()) return Hopper.SPRING_CROUCH;
    return Hopper.SPRING_REST;
  }

  private bodyCentre(): Vec2 {
    return new Vec2(0, -this.springLength() - Hopper.HALF_LENGTH - Hopper.RADIUS);
  }

  override pop(): void {
    LevelFx.pillPop(
      this.parent,
      this.globalPosition.add(this.bodyCentre()),
      Vec2.UP,
      Hopper.HALF_LENGTH,
      Hopper.RADIUS,
      PillArt.WHITE,
      PillArt.MINT,
      PillArt.OUTLINE,
    );
  }

  override draw(g: Gfx): void {
    if (drawPillSprite(g, this.spriteRow, 0, 1, this.isTelegraphing(), this.grounded ? 6 : 3)) return;
    const HL = Hopper.HALF_LENGTH;
    const R = Hopper.RADIUS;
    const length = this.springLength();
    // Coiled spring foot on a small base plate.
    g.rect(-6, -2, 12, 2, PillArt.OUTLINE);
    const coils = 3;
    for (let k = 0; k < coils; k++) {
      const y0 = -2 - ((length - 2) * k) / coils;
      const y1 = -2 - ((length - 2) * (k + 1)) / coils;
      g.line(new Vec2(-4, y0), new Vec2(4, (y0 + y1) / 2), PillArt.METAL_DARK, 2);
      g.line(new Vec2(4, (y0 + y1) / 2), new Vec2(-4, y1), PillArt.METAL, 2);
    }
    // Upright capsule: mint half on top.
    const centre = this.bodyCentre();
    g.setTransform(centre, -Math.PI * 0.5);
    PillArt.drawCapsule(g, HL, R, 1);
    g.resetTransform();
    const blink = !this.isTelegraphing() && idiv(tree.physicsFrames, 7) % 23 === 0;
    PillArt.drawVisor(g, centre.add(new Vec2(0, -HL - 1)), 9, 2, blink);
    PillArt.drawAntenna(g, centre.add(new Vec2(0, -HL - R - 1)), 4);
  }
}
