// A sheet of paper thrown by a clerk pill: flies in an arc under gravity
// towards where Sproto stood when the throw was telegraphed, drifting a
// little, and pops on terrain, off screen or after LIFETIME frames. Touching
// it hurts Sproto unless he is attacking (jumping or rolling), which pops it
// harmlessly. Not an enemy: no score. Layer 8 (hazards), mask 5 (player).
// Port of levels/enemies/paper_sheet.gd.

import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import { PillArt } from './pill_art';
import { EnemyProjectile } from './projectile';

export class PaperSheet extends EnemyProjectile {
  static readonly LIFETIME = 240;
  static readonly GRAVITY = 0.14;
  static readonly PAPER = new Color(0.97, 0.97, 0.95);
  static readonly PAPER_SHADE = new Color(0.78, 0.8, 0.86);
  static readonly INK = new Color(0.3, 0.34, 0.5);

  /** Set by the clerk before it is added, px/frame. */
  velocity = Vec2.ZERO;
  private spin = 0;

  constructor() {
    super('PaperSheet', 5.0);
  }

  override physicsProcess(_delta: number): void {
    if (this.done) return;
    this.age += 1;
    if (this.touchPlayers()) return;
    this.velocity = this.velocity.withY(this.velocity.y + PaperSheet.GRAVITY);
    const next = this.globalPosition.add(this.velocity);
    const hit = this.ray(this.globalPosition, next.add(this.velocity.normalized().mul(4)));
    if (this.age >= PaperSheet.LIFETIME || hit || !this.onScreen()) {
      this.pop();
      return;
    }
    this.globalPosition = next;
    this.spin += 0.15;
  }

  override draw(g: Gfx): void {
    g.setTransform(Vec2.ZERO, Math.sin(this.spin) * 0.6);
    g.rect(-5, -6, 10, 12, PillArt.OUTLINE);
    g.rect(-4, -5, 8, 10, PaperSheet.PAPER);
    g.rect(2, -5, 2, 10, PaperSheet.PAPER_SHADE);
    for (let k = 0; k < 3; k++) {
      g.line(new Vec2(-2.5, -2.5 + k * 2.5), new Vec2(1.5, -2.5 + k * 2.5), PaperSheet.INK, 1);
    }
    g.resetTransform();
  }
}
