// The Executive's rooftop in phase 2: the arena floor splits into two
// ledges by the walls (always solid: the safe spots) and three floating
// platforms over a deadly drop. A platform can be knocked loose (it falls,
// then respawns on a timer) or crumble a second after Sproto lands on it
// (desperation; it shakes first). Platforms are plain solid blocks.

import { Layers } from '../../core/layers';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Node2D } from '../../runtime/node';
import { rectShape, StaticBody2D } from '../../runtime/physics';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { OUTLINE } from '../boss_fx';

export type PlatformState = 'solid' | 'shaking' | 'falling' | 'gone';

const NEON = Color.rgb8(255, 70, 190);
const DECK = Color.rgb8(70, 60, 110);
const DECK_LIGHT = Color.rgb8(120, 110, 170);

/** One floating platform. Origin: top-left of its top surface. */
export class RoofPlatform extends Node2D {
  static readonly CRUMBLE_FRAMES = 60;
  static readonly FALL_FRAMES = 40;
  static readonly RESPAWN_FRAMES = 150;

  state: PlatformState = 'solid';
  private timer = 0;
  private drop = 0;
  private dropSpeed = 0;
  private body: StaticBody2D | null = null;
  private flicker = 0;

  constructor(
    name: string,
    readonly size: Vec2,
  ) {
    super(name);
    this.zIndex = 1;
    this.addBody();
  }

  rect(): Rect2 {
    const o = this.globalPosition;
    return new Rect2(o.x, o.y, this.size.x, this.size.y);
  }

  isSolid(): boolean {
    return this.state === 'solid' || this.state === 'shaking';
  }

  /** Knocked loose: falls now, respawns later. */
  knock(): void {
    if (!this.isSolid()) return;
    this.removeBody();
    this.state = 'falling';
    this.timer = RoofPlatform.FALL_FRAMES;
    this.drop = 0;
    this.dropSpeed = 0.5;
  }

  /** Starts the one-second crumble (it shakes, then falls). */
  crumble(): void {
    if (this.state !== 'solid') return;
    this.state = 'shaking';
    this.timer = RoofPlatform.CRUMBLE_FRAMES;
  }

  /** Back in place now (before the boss lands on it). */
  restore(): void {
    if (this.state === 'solid') return;
    if (this.state === 'shaking') {
      this.state = 'solid';
      return;
    }
    this.state = 'solid';
    this.drop = 0;
    this.flicker = 24;
    this.addBody();
  }

  /** Sproto standing on it. */
  carries(player: Player): boolean {
    if (!this.isSolid() || !player.grounded) return false;
    const r = this.rect();
    const feet = player.globalPosition.y + player.getRadii().y;
    return Math.abs(feet - r.y) < 3 && player.globalPosition.x > r.x - 2 && player.globalPosition.x < r.right + 2;
  }

  override physicsProcess(): void {
    if (this.flicker > 0) this.flicker -= 1;
    switch (this.state) {
      case 'shaking':
        this.timer -= 1;
        if (this.timer <= 0) this.knock();
        break;
      case 'falling':
        this.dropSpeed += 0.35;
        this.drop += this.dropSpeed;
        this.timer -= 1;
        if (this.timer <= 0) {
          this.state = 'gone';
          this.timer = RoofPlatform.RESPAWN_FRAMES;
        }
        break;
      case 'gone':
        this.timer -= 1;
        if (this.timer <= 0) this.restore();
        break;
      default:
        break;
    }
  }

  private addBody(): void {
    if (this.body) return;
    const body = new StaticBody2D('PlatformBody');
    body.collisionLayer = Layers.TERRAIN_SOLID;
    body.addShape(rectShape(this.size, this.size.div(2)));
    this.body = body;
    this.addChild(body);
  }

  private removeBody(): void {
    this.body?.queueFree();
    this.body = null;
  }

  cullRect(): Rect2 {
    return new Rect2(-4, -8, this.size.x + 8, this.size.y + 400);
  }

  override draw(g: Gfx): void {
    if (this.state === 'gone') {
      // Where it will come back: a faint outline.
      g.rect(0, 0, this.size.x, 2, NEON.withAlpha(0.25 + 0.15 * Math.sin(this.timer * 0.3)));
      return;
    }
    if (this.flicker > 0 && this.flicker % 4 < 2) return;
    const shake = this.state === 'shaking' ? Math.sin(this.timer * 2.1) * 1.5 : 0;
    const y = this.drop;
    const a = this.state === 'falling' ? Math.max(0, this.timer / RoofPlatform.FALL_FRAMES) : 1;
    g.rect(shake - 1, y - 1, this.size.x + 2, this.size.y + 2, OUTLINE.withAlpha(a));
    g.rect(shake, y, this.size.x, this.size.y, DECK.withAlpha(a));
    g.rect(shake, y, this.size.x, 3, (this.state === 'shaking' ? Color.rgb8(255, 220, 90) : NEON).withAlpha(a));
    for (let x = 6; x < this.size.x - 4; x += 12) g.rect(shake + x, y + 6, 6, 2, DECK_LIGHT.withAlpha(a));
    if (this.state === 'shaking') {
      for (let k = 0; k < 3; k++) {
        const cx = shake + this.size.x * (0.25 + k * 0.25);
        g.polyline([new Vec2(cx, y + 3), new Vec2(cx + 3, y + 7), new Vec2(cx - 2, y + 11), new Vec2(cx + 1, y + this.size.y)], OUTLINE, 1);
      }
    }
  }
}
