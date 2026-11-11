// Sniper pill robot (tier 4, docs/LEVELS.md): a fixed turret. When Sproto is
// in range, in its line of sight and far enough away (at least MIN_RANGE),
// it locks the spot where he stands, lights its sight for a long telegraph
// (TELEGRAPH, never under 0.35 s) with the telegraph sound, then fires a
// burst of BURST shots in straight lines at that spot. Aimed attacks lock
// their target when the telegraph starts (docs/LEVELS.md fairness), so
// running at the flash always avoids them. Terrain between it and the spot
// at telegraph start cancels the attack; shots pop on terrain. It never
// fires from off screen. A jump or roll destroys it at any time. Zone
// costumes extend this class and draw their own look. The origin is the
// middle of its base, on the floor or ceiling it is mounted on. Port of
// levels/enemies/sniper.gd (+ sniper.tscn: tier 4, an 18x26 hurtbox 14 px up).

import { drawPillSprite, PillSprite } from './pill_sprite';
import type { Player } from '../../player/player';
import type { Gfx } from '../../runtime/gfx';
import type { Node2D } from '../../runtime/node';
import { rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy, WALL_MASK } from './enemy_base';
import { idiv, PillArt, type PillPalette } from './pill_art';
import { Shot } from './shot';

const TAU = Math.PI * 2;

export enum SniperMode {
  IDLE,
  TELEGRAPH,
  FIRING,
  REST,
}

export class Sniper extends Enemy {
  protected readonly spriteRow: number = PillSprite.sniper;
  static readonly HALF_LENGTH = 5.0;
  static readonly RADIUS = 7.0;
  static readonly BODY_Y = -14.0;
  /** Telegraph before a burst, seconds at difficulty 1 (>= 0.6 s base). */
  static readonly TELEGRAPH = 0.8;
  static readonly BURST = 3;
  /** Frames between the shots of a burst. */
  static readonly BURST_GAP = 10;
  /** Rest after a burst, frames at difficulty 1. */
  static readonly REST_FRAMES = 120;
  /** Never fires at a target closer than this (so the flash can be outrun). */
  static readonly MIN_RANGE = 192.0;

  range = 448.0;
  /** Shot speed at difficulty 1, px/frame. */
  shotSpeed = 4.0;

  mode = SniperMode.IDLE;
  /** Where the current (or last) burst aims, global. */
  target = Vec2.ZERO;
  protected timer = 0;
  protected shotsLeft = 0;
  protected aim = Vec2.RIGHT;

  constructor(name = 'Sniper', hurtbox = new Vec2(18, 26), hurtboxAt = new Vec2(0, -14)) {
    super(name);
    this.tier = 4;
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.range = p.num('range', this.range);
    this.shotSpeed = p.num('shot_speed', this.shotSpeed);
  }

  override enemyPhysics(_delta: number): void {
    switch (this.mode) {
      case SniperMode.IDLE: {
        const player = this.spotPlayer();
        if (player) {
          this.target = player.globalPosition;
          this.aim = this.target.sub(this.muzzle()).normalized();
          this.setMode(SniperMode.TELEGRAPH, this.telegraphFrames(Sniper.TELEGRAPH));
          this.playTelegraph();
        } else {
          const watched = this.nearestPlayer(this.range);
          if (watched) this.aim = watched.globalPosition.sub(this.muzzle()).normalized();
        }
        break;
      }
      case SniperMode.TELEGRAPH:
        this.timer -= 1;
        if (this.timer <= 0) {
          this.shotsLeft = Sniper.BURST;
          this.setMode(SniperMode.FIRING, 0);
        }
        break;
      case SniperMode.FIRING:
        if (this.timer <= 0 && this.shotsLeft > 0) {
          this.fire();
          this.shotsLeft -= 1;
          this.timer = Sniper.BURST_GAP;
        } else if (this.shotsLeft <= 0) {
          this.setMode(SniperMode.REST, this.intervalFrames(Sniper.REST_FRAMES));
        }
        this.timer -= 1;
        break;
      case SniperMode.REST:
        this.timer -= 1;
        if (this.timer <= 0) this.setMode(SniperMode.IDLE, 0);
        break;
    }
  }

  private setMode(mode: SniperMode, frames: number): void {
    this.mode = mode;
    this.timer = frames;
  }

  /** The shot origin, global. */
  muzzle(): Vec2 {
    return this.globalPosition.add(new Vec2(0, Sniper.BODY_Y));
  }

  /** A live player in range, at least MIN_RANGE away, in line of sight, while this sniper is on screen. */
  private spotPlayer(): Player | null {
    if (!this.onScreen()) return null;
    const player = this.nearestPlayer(this.range);
    if (!player) return null;
    const d = player.globalPosition.sub(this.muzzle());
    if (d.length() < Sniper.MIN_RANGE || d.length() > this.range) return null;
    if (!this.hasLineOfSight(player.globalPosition)) return null;
    return player;
  }

  hasLineOfSight(point: Vec2): boolean {
    return this.ray(this.muzzle(), point, WALL_MASK) === null;
  }

  /** Fires a shot along the aim into the parent (the level); returns it, or null without a parent. */
  fire(): Node2D | null {
    const parent = this.parent;
    if (!parent) return null;
    const shot = new Shot();
    shot.velocity = this.aim.mul(this.moveSpeed(this.shotSpeed));
    shot.position = this.muzzle().add(this.aim.mul(Sniper.RADIUS + 6));
    parent.addChild(shot);
    shot.resetPhysicsInterpolation();
    return shot;
  }

  isTelegraphing(): boolean {
    return this.mode === SniperMode.TELEGRAPH;
  }

  isFiring(): boolean {
    return this.mode === SniperMode.FIRING;
  }

  override pop(): void {
    const colors = this.palette();
    LevelFx.pillPop(this.parent, this.muzzle(), Vec2.UP, Sniper.HALF_LENGTH, Sniper.RADIUS, colors[0], colors[2], PillArt.OUTLINE);
  }

  /** Body colours (PillArt palette); zone costumes override it. */
  palette(): PillPalette {
    return PillArt.BASIC;
  }

  protected flash(): boolean {
    return this.mode === SniperMode.TELEGRAPH && idiv(this.timer, 3) % 2 === 0;
  }

  /** The aiming line while telegraphing, in local coordinates. */
  protected drawSight(g: Gfx): void {
    if (this.mode !== SniperMode.TELEGRAPH) return;
    const from = new Vec2(0, Sniper.BODY_Y);
    const to = this.target.sub(this.globalPosition);
    const color = this.flash() ? PillArt.FLASH : PillArt.SPIKE;
    const n = Math.trunc(from.distanceTo(to) / 12);
    const dashes = color.withAlpha(0.7);
    for (let k = 0; k < n; k++) {
      const a = from.lerp(to, k / Math.max(n, 1));
      const b = from.lerp(to, (k + 0.5) / Math.max(n, 1));
      g.line(a, b, dashes, 1);
    }
    for (let k = 0; k < 8; k++) {
      const ang = (TAU * k) / 8 + this.timer * 0.1;
      g.line(to.add(Vec2.fromAngle(ang).mul(8)), to.add(Vec2.fromAngle(ang + 0.4).mul(8)), color, 2);
    }
  }

  override draw(g: Gfx): void {
    const BODY_Y = Sniper.BODY_Y;
    this.drawSight(g);
    if (drawPillSprite(g, this.spriteRow, 0, Math.sign(this.aim.x), this.isTelegraphing() || this.isFiring())) return;
    // Base plate, a barrel along the aim, an upright capsule with its visor.
    g.rect(-8, -3, 16, 3, PillArt.OUTLINE);
    g.rect(-7, -2, 14, 1, PillArt.METAL_DARK);
    const barrel = new Vec2(0, BODY_Y);
    const tip = barrel.add(this.aim.mul(14));
    g.line(barrel, tip, PillArt.OUTLINE, 5);
    g.line(barrel, tip, this.flash() ? PillArt.FLASH : PillArt.METAL, 3);
    g.setTransform(barrel, -Math.PI * 0.5);
    PillArt.drawCapsule(g, Sniper.HALF_LENGTH, Sniper.RADIUS, 1, this.palette());
    g.resetTransform();
    PillArt.drawVisor(g, new Vec2(0, BODY_Y - Sniper.HALF_LENGTH - 1), 8, 1, false, this.flash());
  }
}
