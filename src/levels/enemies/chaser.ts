// Chaser pill robot (tier 2, docs/LEVELS.md): patrols like a walker; when it
// sees Sproto ahead (within SIGHT px, about half a screen, and roughly level
// with it) it flashes its visor for a telegraph, then rushes at him until it
// meets a wall or a ledge or the rush runs out, rests and patrols again.
// Beat it by jumping over it or rolling through it. Patrol and rush speeds,
// the rest time and the telegraph scale with the local difficulty.
// Port of levels/enemies/chaser.gd (+ chaser.tscn: tier 2).

import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import type { Props } from '../common/props';
import { idiv, PillArt } from './pill_art';
import { Walker } from './walker';

export enum ChaserMode {
  PATROL,
  TELEGRAPH,
  RUSH,
  REST,
}

export class Chaser extends Walker {
  /** How far ahead it notices Sproto (px), and how far above or below. */
  static readonly SIGHT = 212.0;
  static readonly SIGHT_HEIGHT = 48.0;
  /** Telegraph before a rush, seconds at difficulty 1. */
  static readonly TELEGRAPH = 0.5;
  static readonly RUSH_FRAMES = 90;
  static readonly REST_FRAMES = 60;

  /** Rush speed at difficulty 1, px/frame. */
  rushSpeed = 3.0;
  mode = ChaserMode.PATROL;
  protected timer = 0;

  constructor(name = 'Chaser') {
    super(name, new Vec2(26, 13), new Vec2(0, -13));
    this.tier = 2;
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.rushSpeed = p.num('rush_speed', this.rushSpeed);
  }

  override enemyPhysics(_delta: number): void {
    if (!this.grounded) {
      this.gravityStep();
      return;
    }
    switch (this.mode) {
      case ChaserMode.PATROL:
        this.patrolStep(this.moveSpeed(this.speed));
        if (this.seesPlayer()) {
          this.setMode(ChaserMode.TELEGRAPH, this.telegraphFrames(Chaser.TELEGRAPH));
          this.playTelegraph();
        }
        break;
      case ChaserMode.TELEGRAPH:
        this.timer -= 1;
        if (this.timer <= 0) this.setMode(ChaserMode.RUSH, Chaser.RUSH_FRAMES);
        break;
      case ChaserMode.RUSH: {
        this.timer -= 1;
        const step = this.moveSpeed(this.rushSpeed) * this.direction;
        if (this.timer <= 0 || this.blocked(step, false)) this.setMode(ChaserMode.REST, this.intervalFrames(Chaser.REST_FRAMES));
        else this.moveAlongFloor(step);
        break;
      }
      case ChaserMode.REST:
        this.timer -= 1;
        if (this.timer <= 0) {
          this.homeX = this.globalPosition.x;
          this.setMode(ChaserMode.PATROL, 0);
        }
        break;
    }
  }

  isTelegraphing(): boolean {
    return this.mode === ChaserMode.TELEGRAPH;
  }

  isRushing(): boolean {
    return this.mode === ChaserMode.RUSH;
  }

  private setMode(mode: ChaserMode, frames: number): void {
    this.mode = mode;
    this.timer = frames;
  }

  /** Sproto ahead (in the way it faces), close and roughly level, and alive. */
  private seesPlayer(): boolean {
    const player = this.nearestPlayer(Chaser.SIGHT + 32);
    if (!player) return false;
    const d = player.globalPosition.sub(this.globalPosition);
    return Math.abs(d.x) <= Chaser.SIGHT && Math.sign(d.x) === this.direction && Math.abs(d.y + 13) <= Chaser.SIGHT_HEIGHT + 19;
  }

  protected override visorFlash(): boolean {
    return this.mode === ChaserMode.TELEGRAPH && idiv(this.timer, 4) % 2 === 0;
  }

  /** A small exhaust flame while rushing. */
  protected override drawBehindBody(g: Gfx): void {
    if (this.mode !== ChaserMode.RUSH) return;
    const back = -Walker.HALF_LENGTH - Walker.RADIUS;
    const flicker = 3 + (this.timer % 3);
    g.polygon([new Vec2(back, -3), new Vec2(back - flicker - 3, 0), new Vec2(back, 3)], PillArt.SPIKE);
  }
}
