// Helpers for the level tests (port of tests/levels/level_world.gd): a
// minimal LevelRoot built in code, the real acts built from their level
// files, registered objects placed like the level loader does, and waits.

import { GameState } from '../../src/core/game_state';
import { buildLevel } from '../../src/levels/common/level_loader';
import { BoundsRect, Marker } from '../../src/levels/common/level_nodes';
import { LevelRoot } from '../../src/levels/common/level_root';
import { isConfigurable, Props } from '../../src/levels/common/props';
import { ENEMY_SCENES, registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { Node, Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { loadLevelData } from '../../tools/qa/level_lint';
import { addFloor, addRect, releaseAll, step } from '../helpers/world';

export const SCREEN = 424;
export const FEET = 19;
/** 0.35 s, the shortest telegraph allowed at any difficulty. */
export const MIN_TELEGRAPH_FRAMES = 21;

let registered = false;

export function registerAll(): void {
  if (registered) return;
  registered = true;
  registerCoreTypes();
  registerObjects();
  registerEnemies();
}

/** Puts `node` at `at` under `parent` after applying `props`, like the level loader. */
export function place<T extends Node2D>(parent: Node, node: T, at: Vec2, props: Record<string, unknown> = {}): T {
  if (isConfigurable(node)) node.applyProps(Props.of(props));
  node.position = at;
  parent.addChild(node);
  return node;
}

/** An enemy by its scene path ("res://levels/enemies/walker.tscn"). */
export function enemy<T extends Node2D = Node2D>(scene: string): T {
  registerAll();
  const factory = ENEMY_SCENES[scene];
  if (!factory) throw new Error(`no enemy ${scene}`);
  return factory() as T;
}

/**
 * A LevelRoot built in code: flat floor (y = 0) from x0 to x1 with a wall at
 * each end, Bounds from x0 to x1 and y -400 to 64, PlayerStart at `start`
 * (Sproto's centre). `beforeReady` can add terrain and objects before
 * LevelRoot spawns Sproto. Scene changes are off.
 */
export function miniLevel(start = new Vec2(64, -19), x0 = 0, x1 = 2000, beforeReady?: (root: LevelRoot) => void): LevelRoot {
  registerAll();
  releaseAll();
  const level = new LevelRoot('MiniLevel');
  level.useSceneRouter = false;
  level.zoneId = 'test_zone';
  const marker = new Marker('PlayerStart');
  marker.position = start;
  level.addChild(marker);
  const bounds = new BoundsRect('Bounds');
  bounds.rect = new Rect2(x0, -400, x1 - x0, 464);
  level.addChild(bounds);
  const terrain = level.addChild(new Node2D('Terrain'));
  addFloor(terrain, x0, x1);
  addRect(terrain, new Rect2(x0 - 32, -400, 32, 600));
  addRect(terrain, new Rect2(x1, -400, 32, 600));
  beforeReady?.(level);
  tree.changeSceneNow(() => level);
  step(2);
  return level;
}

/** Builds an act from its level file (scene changes off) and makes it the current scene. */
export async function loadAct(file: string, useSceneRouter = false): Promise<LevelRoot> {
  registerAll();
  releaseAll();
  const root = (await buildLevel(loadLevelData(file))) as LevelRoot;
  root.useSceneRouter = useSceneRouter;
  tree.changeSceneNow(() => root);
  step(2);
  return root;
}

/** Builds an act without putting it in the tree (structure checks). */
export async function buildAct(file: string): Promise<LevelRoot> {
  registerAll();
  return (await buildLevel(loadLevelData(file))) as LevelRoot;
}

export const TEST_ZONE = 'src/levels/data/test_zone/test_zone.json';

/** Runs until `cond` holds or `max` ticks pass; the ticks used, or -1. */
export function waitFor(cond: () => boolean, max: number): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    step(1);
  }
  return cond() ? max : -1;
}

/** Lets pending promises (async scene loads) settle. */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Resets the run state the tests touch. */
export function resetRun(): void {
  GameState.resetGame();
  GameState.checkpointPosition = null;
}
