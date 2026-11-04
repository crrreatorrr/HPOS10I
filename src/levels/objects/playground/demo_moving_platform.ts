// A minimal moving platform for the physics playground and tests, and a
// reference for the zones' moving objects (docs/CONTRACTS.md, "Moving
// terrain"): moving terrain moved only in physicsProcess, exposing
// platformDelta() (through MovingBody). It shuttles between its start and
// start + `travel`: linear with an instant turn, or eased (sine). Tests can
// drive it frame by frame with `offsetAt`. The origin is the middle of the
// top surface.

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { MovingBody } from '../../common/moving_body';
import type { Configurable, Props } from '../../common/props';

export class DemoMovingPlatform extends MovingBody implements Configurable {
  /** Size of the platform (the top surface is the origin's y). */
  size = new Vec2(64, 12);
  /** Offset of the far end of the trip. */
  travel = new Vec2(160, 0);
  /** Frames for a full trip there and back. */
  periodFrames = 240;
  /** Ease in and out (sine) instead of turning instantly. */
  eased = false;
  color = new Color(0.85, 0.55, 0.25);
  /** Optional script: frame number -> offset from the start (overrides travel). */
  offsetAt: ((frame: number) => Vec2) | null = null;
  /** Physics ticks since it started (tests may reset it to 0). */
  frame = 0;

  private start = Vec2.ZERO;
  private shapeAdded = false;

  constructor(name = 'DemoMovingPlatform') {
    super(name);
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this.size);
    this.travel = p.vec('travel', this.travel);
    this.periodFrames = p.int('period_frames', this.periodFrames);
    this.eased = p.bool('eased', this.eased);
    this.topOnly = p.bool('top_only', this.topOnly);
    this.color = p.color('color', this.color);
  }

  override ready(): void {
    super.ready();
    if (!this.shapeAdded) {
      this.shapeAdded = true;
      this.addShape(rectShape(this.size, new Vec2(0, this.size.y / 2)));
    }
    this.start = this.position;
  }

  override physicsProcess(): void {
    this.frame += 1;
    this.moveTo(this.start.add(this.offset(this.frame)));
  }

  private offset(at: number): Vec2 {
    if (this.offsetAt) return this.offsetAt(at);
    if (this.periodFrames <= 0) return Vec2.ZERO;
    const phase = (at % this.periodFrames) / this.periodFrames;
    const amount = this.eased ? (1 - Math.cos(phase * Math.PI * 2)) / 2 : 1 - Math.abs(1 - 2 * phase);
    return this.travel.mul(amount);
  }

  cullRect(): Rect2 {
    return new Rect2(-this.size.x / 2, -1, this.size.x, this.size.y + 2);
  }

  override draw(g: Gfx): void {
    const hx = this.size.x / 2;
    g.rect(-hx, 0, this.size.x, this.size.y, this.color);
    g.line(new Vec2(-hx, 1), new Vec2(hx, 1), this.color.lightened(0.4), 2);
  }
}
