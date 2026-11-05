// Short-lived visual effects for level objects, drawn in code: the ticket
// sparkle, rock debris and the pill-robot pop (two capsule halves and a puff).
// They never collide with anything and are spawned deferred.

import { Audio } from '../../core/audio';
import { Effects } from '../../player/effects';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { clamp, Rng } from '../../runtime/math';
import { Node, Node2D } from '../../runtime/node';
import { Rect2, Vec2 } from '../../runtime/vec2';

class Debris extends Node2D {
  static readonly FRAMES = 48;
  static readonly GRAVITY = 0.21875;
  velocity = Vec2.ZERO;
  spin = 0;
  size = new Vec2(6, 5);
  color = Color.rgb8(150, 90, 50);
  outline = Color.BLACK;
  private age = 0;

  override physicsProcess(): void {
    this.age += 1;
    this.velocity = this.velocity.withY(this.velocity.y + Debris.GRAVITY);
    this.position = this.position.add(this.velocity);
    this.rotation += this.spin;
    this.modulate = this.modulate.withAlpha(clamp(2 - (2 * this.age) / Debris.FRAMES, 0, 1));
    if (this.age >= Debris.FRAMES) this.queueFree();
  }

  override draw(g: Gfx): void {
    const r = new Rect2(-this.size.x / 2, -this.size.y / 2, this.size.x, this.size.y);
    g.rectR(r, this.outline);
    g.rectR(r.grow(-1), this.color);
  }
}

class PillPop extends Node2D {
  static readonly FRAMES = 40;
  static readonly GRAVITY = 0.18;
  axis = Vec2.RIGHT;
  halfLength = 8;
  radius = 6;
  colorA = Color.WHITE;
  colorB = Color.WHITE;
  outline = Color.BLACK;
  private age = 0;
  private offset = [Vec2.ZERO, Vec2.ZERO];
  private vel = [Vec2.ZERO, Vec2.ZERO];
  private angle = [0, 0];

  override ready(): void {
    const side = this.axis.orthogonal();
    this.vel[0] = this.axis.mul(-1.6).add(new Vec2(0, -3.2)).add(side.mul(0.2));
    this.vel[1] = this.axis.mul(1.6).add(new Vec2(0, -3.6)).sub(side.mul(0.2));
  }

  override physicsProcess(): void {
    this.age += 1;
    for (let i = 0; i < 2; i++) {
      this.vel[i] = this.vel[i]!.withY(this.vel[i]!.y + PillPop.GRAVITY);
      this.offset[i] = this.offset[i]!.add(this.vel[i]!);
      this.angle[i] = this.angle[i]! + (i === 0 ? -0.18 : 0.18);
    }
    if (this.age >= PillPop.FRAMES) this.queueFree();
  }

  override draw(g: Gfx): void {
    const t = this.age / PillPop.FRAMES;
    const puffA = Math.max(0, 0.9 - t * 2.2);
    if (puffA > 0) {
      const puff = new Color(1, 1, 1, puffA);
      for (let k = 0; k < 5; k++) {
        const dir = Vec2.fromAngle((Math.PI * 2 * k) / 5 + 0.3);
        g.circle(dir.mul(3 + 10 * t), 3 + 4 * t, puff);
      }
    }
    const fade = clamp(2 - 2 * t, 0, 1);
    for (let i = 0; i < 2; i++) {
      const color = i === 0 ? this.colorA : this.colorB;
      const dir = i === 0 ? this.axis.neg() : this.axis;
      g.setTransform(this.offset[i]!.add(dir.mul(this.halfLength * 0.5)), this.angle[i]! + this.axis.angle());
      this.halfCapsule(g, dir.x < 0 || dir.y < 0, color, fade);
    }
    g.resetTransform();
  }

  private halfCapsule(g: Gfx, left: boolean, color: Color, fade: number): void {
    const s = left ? -1 : 1;
    const hl = this.halfLength * 0.5;
    const pts: Vec2[] = [new Vec2(-s * hl, -this.radius)];
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * 0.5 + (Math.PI * k) / 8;
      pts.push(new Vec2(s * hl + s * Math.cos(a) * this.radius, Math.sin(a) * this.radius));
    }
    pts.push(new Vec2(-s * hl, this.radius));
    g.polygon(pts, color.withAlpha(fade));
    g.polyline([...pts, pts[0]!], this.outline.withAlpha(fade), 1.5);
  }
}

export const LevelFx = {
  /** The telegraph sound for enemies and hazards. */
  playTelegraph(): void {
    Audio.playSfx('enemy_telegraph');
  },

  ticketSparkle(parent: Node | null, at: Vec2): void {
    Effects.ticketSparkle(at, parent);
  },

  /** Bits of a broken wall flying apart from `rect` (global). */
  debris(parent: Node | null, rect: Rect2, color: Color, dark: Color, count = 8): void {
    if (!parent) return;
    const rng = new Rng(Math.floor(rect.x * 73856093) ^ Math.floor(rect.y * 19349663));
    for (let i = 0; i < count; i++) {
      const piece = new Debris();
      piece.color = i % 2 === 0 ? color : color.lerp(dark, 0.4);
      piece.outline = dark;
      piece.size = new Vec2(rng.randfRange(5, 9), rng.randfRange(4, 8));
      const side = i % 2 === 0 ? -1 : 1;
      piece.velocity = new Vec2(side * rng.randfRange(1, 3.5), rng.randfRange(-5, -2));
      piece.spin = rng.randfRange(-0.3, 0.3);
      const at = new Vec2(rect.x + rng.randf() * rect.w, rect.y + rng.randf() * rect.h);
      Effects.spawn(parent, piece, at, 20);
    }
  },

  /** A pill robot popping open: two capsule halves flying apart and a puff. */
  pillPop(parent: Node | null, at: Vec2, axis: Vec2, halfLength: number, radius: number, colorA: Color, colorB: Color, outline: Color): void {
    if (!parent) return;
    const pop = new PillPop();
    pop.axis = axis;
    pop.halfLength = halfLength;
    pop.radius = radius;
    pop.colorA = colorA;
    pop.colorB = colorB;
    pop.outline = outline;
    Effects.spawn(parent, pop, at, 20);
  },
};
