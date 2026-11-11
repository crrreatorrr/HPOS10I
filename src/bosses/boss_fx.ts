// Code-drawn effects shared by the bosses: the explosion puff of the defeat
// sequence and the telegraph markers (target rings, floor and lane warnings,
// dashed paths). Markers blink every 4 frames between a pale and a strong
// warning colour so they read at a glance against any zone.

import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { clamp } from '../runtime/math';
import { Node, Node2D } from '../runtime/node';
import { Rect2, Vec2 } from '../runtime/vec2';
import { Effects } from '../player/effects';
import { drawBossExplosion } from './boss_sprites';

export const OUTLINE = new Color(0.12, 0.1, 0.18);
export const WARN = new Color(1.0, 0.3, 0.2);
export const WARN_PALE = new Color(1.0, 0.92, 0.45);

const TAU = Math.PI * 2;

function blink(frame: number): boolean {
  return Math.floor(frame / 4) % 2 === 0;
}

/** A fireball that swells and fades (defeat sequence). */
class Explosion extends Node2D {
  static readonly FRAMES = 26;
  size = 1;
  private age = 0;

  override physicsProcess(): void {
    this.age += 1;
    this.position = this.position.add(new Vec2(0, -0.3));
    if (this.age >= Explosion.FRAMES) this.queueFree();
  }

  override draw(g: Gfx): void {
    const t = this.age / Explosion.FRAMES;
    const r = (6 + 14 * Math.sqrt(t)) * this.size;
    const fade = clamp(1.6 - 1.6 * t, 0, 1);
    if (drawBossExplosion(g, this.age, this.size, fade)) return;
    g.circle(Vec2.ZERO, r, new Color(0.95, 0.35, 0.12, fade * 0.9));
    g.circle(Vec2.ZERO, r * 0.7, new Color(1.0, 0.7, 0.2, fade));
    g.circle(Vec2.ZERO, r * 0.4 * (1 - t), new Color(1, 1, 0.85, fade));
    for (let k = 0; k < 6; k++) {
      const dir = Vec2.fromAngle((TAU * k) / 6 + this.age * 0.05);
      g.circle(dir.mul(r * 1.1), 2.5 * this.size * (1 - t), new Color(1, 0.9, 0.5, fade));
    }
  }
}

export const BossFx = {
  explosion(parent: Node | null, at: Vec2, size = 1): void {
    const e = new Explosion();
    e.size = size;
    Effects.spawn(parent, e, at, 45);
  },

  /** Four bright corners trace the weak-point rectangle as it opens. */
  weakPoint(g: Gfx, world: Rect2 | null, origin: Vec2, frame: number): void {
    if (!world) return;
    const r = world.translated(origin.neg()).grow(2);
    const color = blink(frame) ? WARN_PALE : Color.rgb8(255, 191, 92);
    for (const x of [r.x, r.right]) {
      for (const y of [r.y, r.bottom]) {
        const dx = x === r.x ? 1 : -1;
        const dy = y === r.y ? 1 : -1;
        g.rect(Math.round(x + Math.min(0, 5 * dx)), Math.round(y), 6, 1, color);
        g.rect(Math.round(x), Math.round(y + Math.min(0, 5 * dy)), 1, 6, color);
      }
    }
  },

  /** A spinning ring with a cross where an aimed attack will land. */
  targetRing(g: Gfx, at: Vec2, frame: number, radius = 14): void {
    const color = blink(frame) ? WARN_PALE : WARN;
    g.circle(at, radius, color, false, 2);
    for (let k = 0; k < 4; k++) {
      const a = (TAU * k) / 4 + frame * 0.08;
      const d = Vec2.fromAngle(a);
      g.line(at.add(d.mul(radius - 5)), at.add(d.mul(radius + 5)), color, 2);
    }
  },

  /** A blinking band on the floor between x0 and x1 (where something will hit). */
  floorWarning(g: Gfx, x0: number, x1: number, floorY: number, frame: number, height = 6): void {
    const color = (blink(frame) ? WARN_PALE : WARN).withAlpha(0.75);
    g.rect(Math.min(x0, x1), floorY - height, Math.abs(x1 - x0), height, color);
    for (let x = Math.min(x0, x1); x < Math.max(x0, x1) - 4; x += 12) {
      g.line(new Vec2(x, floorY), new Vec2(x + 6, floorY - height), OUTLINE.withAlpha(0.6), 1);
    }
  },

  /** A tall translucent column with chevrons (a lane something falls down). */
  laneWarning(g: Gfx, rect: Rect2, frame: number): void {
    const strong = blink(frame);
    g.rectR(rect, (strong ? WARN : WARN_PALE).withAlpha(0.18));
    g.rect(rect.x, rect.bottom - 5, rect.w, 5, (strong ? WARN_PALE : WARN).withAlpha(0.85));
    const cx = rect.center.x;
    for (let y = rect.y + 18; y < rect.bottom - 16; y += 36) {
      const yy = y + ((frame * 2) % 36);
      if (yy > rect.bottom - 12) continue;
      g.polyline([new Vec2(cx - 6, yy - 4), new Vec2(cx, yy + 2), new Vec2(cx + 6, yy - 4)], WARN.withAlpha(0.7), 2);
    }
  },

  /** A dashed path from a to b (a zip or slide about to come). */
  dashedLine(g: Gfx, a: Vec2, b: Vec2, frame: number, width = 2): void {
    const color = blink(frame) ? WARN_PALE : WARN;
    const d = b.sub(a);
    const len = d.length();
    if (len < 1) return;
    const dir = d.div(len);
    const offset = (frame * 1.5) % 12;
    for (let s = -offset; s < len; s += 12) {
      const s0 = Math.max(0, s);
      const s1 = Math.min(len, s + 6);
      if (s1 > s0) g.line(a.add(dir.mul(s0)), a.add(dir.mul(s1)), color, width);
    }
  },

  /** Little puffs that orbit a point (charging up). */
  sparkles(g: Gfx, at: Vec2, frame: number, radius: number, color: Color): void {
    for (let k = 0; k < 5; k++) {
      const a = (TAU * k) / 5 + frame * 0.2;
      g.circle(at.add(Vec2.fromAngle(a).mul(radius)), 1.5, color);
    }
  },
};
