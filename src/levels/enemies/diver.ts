// Diver pill robot (tier 3, docs/LEVELS.md): hovers at its post, bobbing.
// When Sproto comes within range below it, at least `minDiveDrop` px below
// its post (and it is on screen), it marks the spot where he is, flashes its
// visor and a target ring there and plays the telegraph sound for at least
// 0.35 s, then swoops in a straight line at that spot. It never homes:
// running the moment it flashes always avoids it (docs/LEVELS.md fairness).
// That needs a long enough dive, so it never dives at a target less than
// 120 px below its post (BUG-Z2-01): closer, it keeps hovering and turns to
// watch him, with no telegraph. It pulls back up to its post, rests and can
// dive again. A jump or roll destroys it at any time, the swoop included.
// Swoop and return speeds, the rest and the telegraph scale with the local
// difficulty. Zone costumes extend this class and draw their own look. The
// origin is the middle of its post. Port of levels/enemies/diver.gd
// (+ diver.tscn: tier 3, a 24x16 hurtbox at the origin).

import type { Player } from '../../player/player';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { closed, idiv, PillArt, type PillPalette } from './pill_art';

const TAU = Math.PI * 2;

export enum DiverMode {
  HOVER,
  TELEGRAPH,
  SWOOP,
  RETURN,
  REST,
}

export class Diver extends Enemy {
  static readonly HALF_LENGTH = 6.0;
  static readonly RADIUS = 7.0;
  /** Telegraph before a swoop, seconds at difficulty 1. */
  static readonly TELEGRAPH = 0.6;
  /** The fairness floor for minDiveDrop, px. */
  static readonly MIN_DIVE_DROP = 120.0;

  /** How far it notices Sproto: px either side, and px below. */
  rangeX = 128.0;
  rangeY = 224.0;
  private _minDiveDrop = Diver.MIN_DIVE_DROP;
  /** Swoop and return speeds at difficulty 1, px/frame. */
  swoopSpeed = 4.0;
  returnSpeed = 1.5;
  /** Frames it rests at its post after a dive, at difficulty 1. */
  restFrames = 90;
  bobHeight = 6.0;

  mode = DiverMode.HOVER;
  /** Where the current (or last) swoop aims, global. */
  target = Vec2.ZERO;
  protected home = Vec2.ZERO;
  protected timer = 0;
  protected bob = 0;
  protected facing = -1;
  protected flap = 0;

  constructor(name = 'Diver', hurtbox = new Vec2(24, 16), hurtboxAt = Vec2.ZERO) {
    super(name);
    this.tier = 3;
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  /** The shortest dive: it only dives at a target at least this far below its post (never under MIN_DIVE_DROP). */
  get minDiveDrop(): number {
    return this._minDiveDrop;
  }

  set minDiveDrop(value: number) {
    this._minDiveDrop = Math.max(value, Diver.MIN_DIVE_DROP);
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.rangeX = p.num('range_x', this.rangeX);
    this.rangeY = p.num('range_y', this.rangeY);
    this.minDiveDrop = p.num('min_dive_drop', this.minDiveDrop);
    this.swoopSpeed = p.num('swoop_speed', this.swoopSpeed);
    this.returnSpeed = p.num('return_speed', this.returnSpeed);
    this.restFrames = p.int('rest_frames', this.restFrames);
    this.bobHeight = p.num('bob_height', this.bobHeight);
  }

  override ready(): void {
    super.ready();
    this.home = this.globalPosition;
  }

  override enemyPhysics(_delta: number): void {
    this.flap += this.mode === DiverMode.SWOOP ? 0.6 : 0.25;
    switch (this.mode) {
      case DiverMode.HOVER: {
        this.bob += TAU / 90;
        this.globalPosition = this.home.add(new Vec2(0, Math.sin(this.bob) * this.bobHeight));
        const player = this.spotPlayer();
        if (player) {
          this.target = player.globalPosition;
          this.facing = this.target.x > this.globalPosition.x ? 1 : -1;
          this.setMode(DiverMode.TELEGRAPH, this.telegraphFrames(Diver.TELEGRAPH));
          this.playTelegraph();
        }
        break;
      }
      case DiverMode.TELEGRAPH:
        this.timer -= 1;
        if (this.timer <= 0) this.setMode(DiverMode.SWOOP, 0);
        break;
      case DiverMode.SWOOP:
        if (this.stepTowards(this.target, this.moveSpeed(this.swoopSpeed))) this.setMode(DiverMode.RETURN, 0);
        break;
      case DiverMode.RETURN:
        if (this.stepTowards(this.home, this.moveSpeed(this.returnSpeed))) {
          this.bob = 0;
          this.setMode(DiverMode.REST, this.intervalFrames(this.restFrames));
        }
        break;
      case DiverMode.REST:
        this.timer -= 1;
        if (this.timer <= 0) this.setMode(DiverMode.HOVER, 0);
        break;
    }
  }

  private setMode(mode: DiverMode, frames: number): void {
    this.mode = mode;
    this.timer = frames;
  }

  /** Moves `px` towards `point`; true once there. */
  private stepTowards(point: Vec2, px: number): boolean {
    const d = point.sub(this.globalPosition);
    if (d.length() <= px) {
      this.globalPosition = point;
      return true;
    }
    this.globalPosition = this.globalPosition.add(d.normalized().mul(px));
    if (Math.abs(d.x) > 0.5) this.facing = d.x > 0 ? 1 : -1;
    return false;
  }

  /**
   * A live player in range below, far enough below its post to dive at,
   * while this diver is on screen. A player in range but too close is watched.
   */
  private spotPlayer(): Player | null {
    if (!this.onScreen()) return null;
    const player = this.nearestPlayer(this.rangeX + this.rangeY + this.minDiveDrop);
    if (!player) return null;
    const d = player.globalPosition.sub(this.globalPosition);
    if (Math.abs(d.x) > this.rangeX || d.y <= 8 || d.y > Math.max(this.rangeY, this.minDiveDrop)) return null;
    if (player.globalPosition.y - this.home.y < this.minDiveDrop) {
      if (Math.abs(d.x) > 0.5) this.facing = d.x > 0 ? 1 : -1; // keep watching him, no dive
      return null;
    }
    return player;
  }

  isTelegraphing(): boolean {
    return this.mode === DiverMode.TELEGRAPH;
  }

  isSwooping(): boolean {
    return this.mode === DiverMode.SWOOP;
  }

  override pop(): void {
    const colors = this.palette();
    LevelFx.pillPop(
      this.parent,
      this.globalPosition,
      Vec2.RIGHT,
      Diver.HALF_LENGTH,
      Diver.RADIUS,
      this.facing > 0 ? colors[2] : colors[0],
      this.facing > 0 ? colors[0] : colors[2],
      PillArt.OUTLINE,
    );
  }

  /** Body colours (PillArt palette); zone costumes override it. */
  palette(): PillPalette {
    return PillArt.BASIC;
  }

  protected visorFlash(): boolean {
    return this.mode === DiverMode.TELEGRAPH && idiv(this.timer, 4) % 2 === 0;
  }

  /** The target ring while telegraphing, in local coordinates. */
  protected drawTarget(g: Gfx): void {
    if (this.mode !== DiverMode.TELEGRAPH) return;
    const at = this.target.sub(this.globalPosition);
    const color = idiv(this.timer, 4) % 2 === 0 ? PillArt.FLASH : PillArt.SPIKE;
    for (let k = 0; k < 8; k++) {
      const a = (TAU * k) / 8 + this.timer * 0.1;
      g.line(at.add(Vec2.fromAngle(a).mul(9)), at.add(Vec2.fromAngle(a + 0.4).mul(9)), color, 2);
    }
  }

  override draw(g: Gfx): void {
    const HL = Diver.HALF_LENGTH;
    const R = Diver.RADIUS;
    this.drawTarget(g);
    // Two little wings that beat faster in a swoop.
    const beat = Math.sin(this.flap);
    for (const side of [-1, 1]) {
      const wing = [new Vec2(side * 3, -R + 1), new Vec2(side * 13, -R - 5 - beat * 2), new Vec2(side * 9, -R + 2)];
      g.polygon(wing, PillArt.METAL);
      g.polyline(closed(wing), PillArt.OUTLINE, 1);
    }
    g.setTransform(Vec2.ZERO, 0, new Vec2(this.facing, 1));
    PillArt.drawCapsule(g, HL, R, 1, this.palette());
    PillArt.drawVisor(g, new Vec2(HL + 1, 1), 6, 1, false, this.visorFlash());
    g.resetTransform();
  }
}
