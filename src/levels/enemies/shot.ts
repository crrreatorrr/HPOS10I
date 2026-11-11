// A sniper's shot: a bolt flying in a straight line at `velocity` (px/frame,
// set before it is added). It pops on terrain, off screen or after LIFETIME
// frames. Touching it hurts Sproto unless he is attacking (jumping or
// rolling), which pops it harmlessly. Not an enemy: no score. Layer 8
// (hazards), mask 5 (player). Port of levels/enemies/shot.gd.

import { drawPropSprite, PropSprite } from '../objects/prop_sprite';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import { PillArt } from './pill_art';
import { EnemyProjectile } from './projectile';

export class Shot extends EnemyProjectile {
  static readonly LIFETIME = 180;

  velocity = Vec2.RIGHT.mul(4);

  constructor() {
    super('Shot', 3.0);
  }

  override physicsProcess(_delta: number): void {
    if (this.done) return;
    this.age += 1;
    if (this.touchPlayers()) return;
    const next = this.globalPosition.add(this.velocity);
    const hit = this.ray(this.globalPosition, next.add(this.velocity.normalized().mul(3)));
    if (this.age >= Shot.LIFETIME || hit || !this.onScreen()) {
      this.pop();
      return;
    }
    this.globalPosition = next;
  }

  override draw(g: Gfx): void {
    g.setTransform(Vec2.ZERO, this.velocity.angle());
    const loaded = drawPropSprite(g, PropSprite.bolt, Vec2.ZERO, new Vec2(0.68, 0.7));
    g.resetTransform();
    if (loaded) return;
    const dir = this.velocity.normalized();
    g.line(dir.mul(-8), dir.mul(3), PillArt.OUTLINE, 4);
    g.line(dir.mul(-7), dir.mul(2), PillArt.SPIKE, 2);
    g.circle(dir.mul(2), 2, PillArt.FLASH);
  }
}
