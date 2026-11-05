// Base for moving terrain pieces (docs/CONTRACTS.md, "Moving terrain"): moved
// only from physicsProcess through moveTo(), exposing platformDelta() (which
// marks it as moving terrain for the player) and targetPosition(). Teleports
// go through teleport(), which doesn't carry the player.

import { Layers } from '../../core/layers';
import { AnimatableBody2D, rectShape } from '../../runtime/physics';
import { Vec2 } from '../../runtime/vec2';

export class MovingBody extends AnimatableBody2D {
  /** Jump-through from below (TERRAIN_TOP_ONLY) instead of solid. */
  topOnly = false;
  private target = Vec2.ZERO;
  private delta = Vec2.ZERO;

  override enterTree(): void {
    this.collisionLayer = this.topOnly ? Layers.TERRAIN_TOP_ONLY : Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    super.enterTree();
  }

  override ready(): void {
    this.target = this.position;
  }

  /** The displacement applied this physics tick (the contract). */
  platformDelta(): Vec2 {
    return this.delta;
  }

  /** Where the body is going this tick (its local position). */
  targetPosition(): Vec2 {
    return this.target;
  }

  /** Moves to `localPosition` this tick (call from physicsProcess every tick). */
  moveTo(localPosition: Vec2): void {
    this.delta = localPosition.sub(this.target);
    this.target = localPosition;
    this.position = localPosition;
  }

  /** Jumps to `localPosition` without carrying anything. */
  teleport(localPosition: Vec2): void {
    this.delta = Vec2.ZERO;
    this.target = localPosition;
    this.position = localPosition;
    this.resetPhysicsInterpolation();
  }

  /** Adds a rectangle collision shape of `size` with its top-left at `topLeft`. */
  addBox(size: Vec2, topLeft: Vec2 = Vec2.ZERO): void {
    this.addShape(rectShape(size, topLeft.add(size.div(2))));
  }
}
