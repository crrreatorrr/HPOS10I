// Pellet pill robot (tier 2, docs/LEVELS.md): stands still, turns towards
// Sproto when he is in range, and fires a slow pellet along the ground after
// a telegraph (its cannon glows). Jump the pellet, or hit the pill between
// shots. It only shoots while on screen. Shot interval, pellet speed and
// telegraph scale with the local difficulty. The node origin is its feet.
// Port of levels/enemies/pellet_pill.gd (+ pellet_pill.tscn: tier 2, a 14x22
// hurtbox 14 px up).

import { drawPillSprite, PillSprite } from './pill_sprite';
import type { Player } from '../../player/player';
import type { Gfx } from '../../runtime/gfx';
import type { Node2D } from '../../runtime/node';
import { rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import type { Props } from '../common/props';
import { Enemy } from './enemy_base';
import { Pellet } from './pellet';
import { idiv, PillArt } from './pill_art';

export class PelletPill extends Enemy {
  protected readonly spriteRow: number = PillSprite.pellet;
  static readonly HALF_LENGTH = 5.0;
  static readonly RADIUS = 7.0;
  static readonly BODY_Y = -14.0;
  /** Telegraph before each shot, seconds at difficulty 1. */
  static readonly TELEGRAPH = 0.6;
  /** How far it notices Sproto (px up or down). */
  static readonly RANGE_Y = 64.0;

  /** Frames between shots at difficulty 1. */
  fireInterval = 150;
  /** Pellet speed at difficulty 1, px/frame. */
  pelletSpeed = 2.0;
  shotRange = 320.0;
  /** -1 left, 1 right. */
  facing = -1;

  protected timer = 0;
  protected recoil = 0;
  /** Where Sproto stood when the telegraph started (aimed costumes throw there). */
  aim = Vec2.ZERO;

  constructor(name = 'PelletPill', hurtbox = new Vec2(14, 22), hurtboxAt = new Vec2(0, -14)) {
    super(name);
    this.tier = 2;
    this.addShape(rectShape(hurtbox, hurtboxAt));
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.fireInterval = p.int('fire_interval', this.fireInterval);
    this.pelletSpeed = p.num('pellet_speed', this.pelletSpeed);
    this.shotRange = p.num('shot_range', this.shotRange);
    this.facing = p.int('facing', this.facing);
  }

  override ready(): void {
    super.ready();
    this.facing = this.facing < 0 ? -1 : 1;
  }

  override enemyPhysics(_delta: number): void {
    if (this.recoil > 0) this.recoil -= 1;
    if (!this.grounded) {
      this.gravityStep();
      return;
    }
    const target = this.target();
    if (!target) {
      this.timer = 0;
      return;
    }
    if (!this.isTelegraphing()) this.facing = target.globalPosition.x > this.globalPosition.x ? 1 : -1;
    this.timer += 1;
    if (this.timer === this.intervalFrames(this.fireInterval) - this.telegraphFrames(PelletPill.TELEGRAPH)) {
      this.aim = target.globalPosition; // aimed attacks lock their target at telegraph start
      this.playTelegraph();
    }
    if (this.timer >= this.intervalFrames(this.fireInterval)) {
      this.timer = 0;
      this.fire();
    }
  }

  /** Sproto when he is in range and the pill is on screen (no shots from off-screen). */
  protected target(): Player | null {
    if (!this.onScreen()) return null;
    const player = this.nearestPlayer(this.shotRange + PelletPill.RANGE_Y);
    if (!player) return null;
    const d = player.globalPosition.sub(this.globalPosition);
    if (Math.abs(d.x) > this.shotRange || Math.abs(d.y - PelletPill.BODY_Y) > PelletPill.RANGE_Y) return null;
    return player;
  }

  isTelegraphing(): boolean {
    return this.target() !== null && this.timer >= this.intervalFrames(this.fireInterval) - this.telegraphFrames(PelletPill.TELEGRAPH);
  }

  /** Fires a pellet into the parent (the level); returns it, or null without a parent. */
  fire(): Node2D | null {
    const parent = this.parent;
    if (!parent) return null;
    const pellet = new Pellet();
    pellet.direction = this.facing;
    pellet.speed = this.moveSpeed(this.pelletSpeed);
    pellet.position = this.globalPosition.add(new Vec2(this.facing * (PelletPill.HALF_LENGTH + PelletPill.RADIUS + 4), 0));
    parent.addChild(pellet);
    pellet.resetPhysicsInterpolation();
    this.recoil = 6;
    return pellet;
  }

  override pop(): void {
    LevelFx.pillPop(
      this.parent,
      this.globalPosition.add(new Vec2(0, PelletPill.BODY_Y)),
      Vec2.UP,
      PelletPill.HALF_LENGTH,
      PelletPill.RADIUS,
      PillArt.WHITE,
      PillArt.MINT,
      PillArt.OUTLINE,
    );
  }

  /** The cannon (or a costume's wind-up) glows before a shot. */
  protected glowing(): boolean {
    return this.isTelegraphing() && idiv(this.timer, 3) % 2 === 0;
  }

  override draw(g: Gfx): void {
    if (drawPillSprite(g, this.spriteRow, 0, this.facing, this.isTelegraphing())) return;
    const HL = PelletPill.HALF_LENGTH;
    const R = PelletPill.RADIUS;
    const BODY_Y = PelletPill.BODY_Y;
    const recoil = -this.recoil * 0.5;
    // Squat base plate and a cannon tube pointing at Sproto, glowing before a shot.
    g.rect(-7, -3, 14, 3, PillArt.OUTLINE);
    g.rect(-6, -2, 12, 1, PillArt.METAL_DARK);
    const glow = this.glowing();
    g.setTransform(new Vec2(0, -6), 0, new Vec2(this.facing, 1));
    g.rect(2 + recoil, -3, 11, 6, PillArt.OUTLINE);
    g.rect(3 + recoil, -2, 9, 4, glow ? PillArt.FLASH : PillArt.METAL);
    g.resetTransform();
    // Upright capsule, mint on top.
    g.setTransform(new Vec2(0, BODY_Y), -Math.PI * 0.5);
    PillArt.drawCapsule(g, HL, R, 1);
    g.resetTransform();
    PillArt.drawVisor(g, new Vec2(this.facing * 1.5, BODY_Y - HL - 1), 8, 1, false, glow);
    PillArt.drawAntenna(g, new Vec2(0, BODY_Y - HL - R - 1), 4);
  }
}
