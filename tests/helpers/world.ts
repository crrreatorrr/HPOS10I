// Helpers for the physics tests: build terrain in code and spawn Sproto in a
// fresh scene of the shared tree, then step it tick by tick.

import { Layers } from '../../src/core/layers';
import { Tuning } from '../../src/core/tuning';
import { Moves } from '../../src/player/moves';
import { Player } from '../../src/player/player';
import { Input, type Action } from '../../src/runtime/input';
import { degToRad } from '../../src/runtime/math';
import { Node2D } from '../../src/runtime/node';
import { polygonShape, StaticBody2D } from '../../src/runtime/physics';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';

export const SOLID = Layers.TERRAIN_SOLID;

/** A fresh empty scene; returns its root. Extra moves are off (classic physics). */
export function newWorld(): Node2D {
  releaseAll();
  Tuning.reset();
  Moves.extraMovesOverride = false;
  const root = new Node2D('TestWorld');
  tree.changeSceneNow(() => root);
  return root;
}

export function addPolygon(world: Node2D, points: Vec2[], layer: number = SOLID): StaticBody2D {
  const body = new StaticBody2D('Poly');
  body.collisionLayer = layer;
  body.addShape(polygonShape(points));
  world.addChild(body);
  return body;
}

export function addRect(world: Node2D, rect: Rect2, layer: number = SOLID): StaticBody2D {
  return addPolygon(
    world,
    [rect.position, new Vec2(rect.right, rect.y), rect.end, new Vec2(rect.x, rect.bottom)],
    layer,
  );
}

/** Flat floor with its top at y. */
export function addFloor(world: Node2D, fromX = -4000, toX = 4000, y = 0): StaticBody2D {
  return addRect(world, new Rect2(fromX, y, toX - fromX, 200));
}

/** Straight slope through (0, 0) rising to the right at angleDeg (positive = "/"). */
export function addSlope(world: Node2D, angleDeg: number, halfLength = 600): StaticBody2D {
  const d = new Vec2(Math.cos(degToRad(angleDeg)), -Math.sin(degToRad(angleDeg))).mul(halfLength);
  const bottom = Math.abs(d.y) + 300;
  return addPolygon(world, [d.neg(), d, new Vec2(d.x, bottom), new Vec2(-d.x, bottom)]);
}

export function spawnPlayer(world: Node2D, feet: Vec2): Player {
  const player = new Player();
  world.addChild(player);
  player.respawnAt(feet.sub(new Vec2(0, Tuning.physics.height_radius)));
  return player;
}

/** Lets new bodies register, puts the player back with its feet at `feet` and lets it land. */
export function settle(player: Player, feet: Vec2): void {
  step(2);
  player.respawnAt(feet.sub(new Vec2(0, Tuning.physics.height_radius)));
  step(2);
}

export function feetY(player: Player): number {
  return player.globalPosition.y + player.getRadii().y;
}

/** Runs n physics ticks. */
export function step(n = 1): void {
  for (let i = 0; i < n; i++) tree.physicsStep();
}

export function press(action: Action): void {
  Input.actionPress(action, 'test');
}

export function release(action: Action): void {
  Input.actionRelease(action, 'test');
}

export function releaseAll(): void {
  for (const a of ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'pause', 'focus'] as Action[]) release(a);
  tree.physicsStep();
}

/** Presses jump for one tick (a tap). */
export function tapJump(): void {
  press('jump');
  step(1);
  release('jump');
}
