// Floater pill robot (tier 2, docs/LEVELS.md): a capsule held up by a little
// propeller, hovering on a sine path: bobbing up and down and drifting side
// to side around where it was placed. The node origin is the middle of its
// path (not a floor point). Beat it by jumping to its height. Its drift speed
// and bob period scale with the local difficulty. Zone costumes extend this
// class. Port of levels/enemies/floater.gd (+ floater.tscn: tier 2, a 24x16
// hurtbox at the origin).

import { drawPillSprite, PillSprite } from './pill_sprite';
import type { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { PillArt } from './pill_art';

const TAU = Math.PI * 2;

export class Floater extends Enemy {
  protected readonly spriteRow: number = PillSprite.floater;
  static readonly HALF_LENGTH = 6.0;
  static readonly RADIUS = 7.0;

  /** Bob height (px each way) and the time of one bob at difficulty 1 (frames). */
  bobHeight = 16.0;
  bobPeriod = 120;
  /** Side-to-side drift (px each way) and its speed at difficulty 1 (px/frame). */
  drift = 32.0;
  driftSpeed = 0.5;
  /** Starting phase, 0..1 (to stagger several). */
  phase = 0.0;

  protected home = Vec2.ZERO;
  protected bob = 0;
  protected driftPhase = 0;
  protected facing = -1;
  protected spin = 0;

  constructor(name = 'Floater', hurtbox = new Vec2(24, 16), hurtboxAt = Vec2.ZERO) {
    super(name);
    this.tier = 2;
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.bobHeight = p.num('bob_height', this.bobHeight);
    this.bobPeriod = p.int('bob_period', this.bobPeriod);
    this.drift = p.num('drift', this.drift);
    this.driftSpeed = p.num('drift_speed', this.driftSpeed);
    this.phase = p.num('phase', this.phase);
  }

  override ready(): void {
    super.ready();
    this.home = this.globalPosition;
    this.bob = this.phase * TAU;
    this.driftPhase = this.phase * TAU;
  }

  override enemyPhysics(_delta: number): void {
    this.bob += TAU / Math.max(this.intervalFrames(this.bobPeriod), 1);
    if (this.drift > 0) this.driftPhase += this.moveSpeed(this.driftSpeed) / this.drift;
    const offset = new Vec2(Math.sin(this.driftPhase) * this.drift, Math.sin(this.bob) * this.bobHeight);
    const previous = this.globalPosition;
    this.globalPosition = this.home.add(offset);
    if (Math.abs(this.globalPosition.x - previous.x) > 0.01) this.facing = this.globalPosition.x > previous.x ? 1 : -1;
    this.spin += 0.6;
  }

  override pop(): void {
    this.popAs(PillArt.MINT, PillArt.WHITE);
  }

  /** The pop with `coloured`/`white` halves, coloured half to the front. */
  protected popAs(coloured: Color, white: Color): void {
    LevelFx.pillPop(
      this.parent,
      this.globalPosition,
      Vec2.RIGHT,
      Floater.HALF_LENGTH,
      Floater.RADIUS,
      this.facing > 0 ? white : coloured,
      this.facing > 0 ? coloured : white,
      PillArt.OUTLINE,
    );
  }

  override draw(g: Gfx): void {
    if (drawPillSprite(g, this.spriteRow, 12, this.facing, false, 4)) return;
    const HL = Floater.HALF_LENGTH;
    const R = Floater.RADIUS;
    // Propeller mast and blades (the blades squash as they spin).
    g.line(new Vec2(0, -R - 1), new Vec2(0, -R - 5), PillArt.OUTLINE, 2);
    const blade = Math.abs(Math.cos(this.spin)) * 9 + 2;
    g.rect(-blade, -R - 7, blade * 2, 2, PillArt.OUTLINE);
    g.rect(-blade + 1, -R - 6.5, blade * 2 - 2, 1, PillArt.METAL);
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1);
    PillArt.drawVisor(g, new Vec2(HL + 1, -1), 6, 1);
    g.resetTransform();
  }
}
