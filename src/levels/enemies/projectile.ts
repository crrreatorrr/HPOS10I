// Shared parts of the enemy projectiles (pellet, shot, paper sheet; each was
// its own PlayerArea script in the original with these same pieces): layer 8
// (hazards), mask 5 (player), a circle hurtbox, the "pellets" group, the
// touch rule (hurts Sproto unless he is attacking; either way it pops), the
// pop and the on-screen check. Not enemies: no score.

import { Layers } from '../../core/layers';
import { circleShape } from '../../runtime/physics';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2, type Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';

export const PROJECTILE_TERRAIN_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;

export abstract class EnemyProjectile extends PlayerArea {
  protected age = 0;
  protected done = false;

  constructor(name: string, radius: number) {
    super(name);
    this.collisionLayer = Layers.HAZARDS;
    this.monitorable = true;
    this.addShape(circleShape(radius));
    this.addToGroup('pellets');
  }

  /** The touch rule; true when it popped (the caller stops for this tick). */
  protected touchPlayers(): boolean {
    for (const player of this.playersInside()) {
      if (player.state === 'dead') continue;
      if (!player.isAttacking()) player.hurt(this.globalPosition);
      this.pop();
      return true;
    }
    return false;
  }

  pop(): void {
    if (this.done) return;
    this.done = true;
    this.monitoring = false;
    this.monitorable = false;
    this.queueFree();
  }

  /** Inside the camera view grown by 32 px; true without a camera. */
  protected onScreen(): boolean {
    const cam = tree.camera;
    if (!cam || !cam.isInsideTree()) return true;
    const tl = cam.viewTopLeft(1);
    return new Rect2(tl.x, tl.y, VIEW_W, VIEW_H).grow(32).hasPoint(this.globalPosition);
  }

  protected ray(from: Vec2, to: Vec2): { position: Vec2 } | null {
    return tree.physics.intersectRay(from, to, PROJECTILE_TERRAIN_MASK);
  }
}
