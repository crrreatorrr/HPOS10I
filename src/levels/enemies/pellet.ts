// A pellet fired by a pellet pill: rolls slowly along the ground in a
// straight line, following the floor, and pops at walls, ledges, off screen
// or after LIFETIME frames. Touching it hurts Sproto, unless he is attacking
// (jumping or rolling), which pops it harmlessly. Not an enemy: no score.
// Layer 8 (hazards), mask 5 (player). Port of levels/enemies/pellet.gd.

import { drawPropSprite, PropSprite } from '../objects/prop_sprite';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import { PillArt } from './pill_art';
import { EnemyProjectile } from './projectile';

export class Pellet extends EnemyProjectile {
  static readonly LIFETIME = 300;
  static readonly RADIUS = 4.0;
  /** Floats this far above the floor. */
  static readonly HEIGHT = 6.0;

  /** -1 left, 1 right; px/frame (set by the pill, already difficulty-scaled). */
  direction = -1;
  speed = 2.0;

  constructor() {
    super('Pellet', Pellet.RADIUS);
  }

  override physicsProcess(_delta: number): void {
    if (this.done) return;
    this.age += 1;
    if (this.touchPlayers()) return;
    const step = this.direction * this.speed;
    const at = this.globalPosition;
    const wall = this.ray(at, at.add(new Vec2(Math.sign(step) * (Pellet.RADIUS + Math.abs(step)), 0)));
    const floorHit = this.ray(at.add(new Vec2(step, -8)), at.add(new Vec2(step, Pellet.HEIGHT + 12)));
    if (this.age >= Pellet.LIFETIME || wall || !floorHit || !this.onScreen()) {
      this.pop();
      return;
    }
    this.globalPosition = new Vec2(at.x + step, floorHit.position.y - Pellet.HEIGHT);
  }

  override draw(g: Gfx): void {
    if (drawPropSprite(g, PropSprite.bolt, Vec2.ZERO, new Vec2(0.78, 0.78))) return;
    g.circle(Vec2.ZERO, Pellet.RADIUS + 1, PillArt.OUTLINE);
    g.circle(Vec2.ZERO, Pellet.RADIUS, PillArt.SPIKE);
    g.circle(new Vec2(-1, -1), 1.5, PillArt.FLASH);
  }
}
