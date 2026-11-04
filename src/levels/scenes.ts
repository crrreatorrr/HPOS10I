// Registers every level, arena and playground as a scene, loading its data
// on demand (each level is its own chunk in the build).

import { Scenes } from '../core/scenes';
import { GameCamera } from '../camera/game_camera';
import { Player } from '../player/player';
import { TerrainLoop } from '../terrain/loop';
import { CurveTerrain } from '../terrain/curve_terrain';
import { PathSwitcher } from '../terrain/path_switcher';
import { LoopGuard } from '../terrain/loop_guard';
import { buildLevel, LevelTypes, type LevelData } from './common/level_loader';
import { LevelRoot } from './common/level_root';
import { PhysicsPlayground } from './playground/physics_playground';

const LEVEL_FILES = import.meta.glob(['./data/**/*.json', '!./data/tilesets/**'], { import: 'default' }) as Record<
  string,
  () => Promise<LevelData>
>;

/** Scene ids of the playgrounds (the dev menu lists them). */
export const PLAYGROUNDS: { id: string; label: string }[] = [{ id: 'playground:physics', label: 'Physics Playground' }];

export function registerCoreTypes(): void {
  LevelTypes.register('res://levels/common/level_root.gd', () => new LevelRoot());
  LevelTypes.register('res://terrain/curve_terrain.gd', () => new CurveTerrain());
  LevelTypes.register('res://terrain/loop.tscn', () => new TerrainLoop());
  LevelTypes.register('res://terrain/loop.gd', () => new TerrainLoop());
  LevelTypes.register('res://terrain/path_switcher.gd', () => new PathSwitcher());
  LevelTypes.register('res://terrain/loop_guard.gd', () => new LoopGuard());
  LevelTypes.register('res://player/player.tscn', () => new Player());
  LevelTypes.register('res://camera/game_camera.tscn', () => new GameCamera());
  LevelTypes.register('res://playground/physics_playground.gd', () => new PhysicsPlayground());
}

/** Extra level sources added in code (new acts, arenas). */
const extraLevels = new Map<string, () => Promise<import('../runtime/node').Node>>();

export function registerLevelScene(id: string, factory: () => Promise<import('../runtime/node').Node>): void {
  extraLevels.set(id, factory);
  Scenes.register(id, factory);
}

export function registerLevelScenes(): void {
  registerCoreTypes();
  for (const [path, load] of Object.entries(LEVEL_FILES)) {
    const rel = path.replace('./data/', '').replace(/\.json$/, '');
    const id = rel === 'playground/physics_playground' ? 'playground:physics' : rel === 'test_zone/test_zone' ? 'level:test_zone' : `level:${rel}`;
    if (extraLevels.has(id)) continue;
    Scenes.register(id, async () => buildLevel(await load()));
  }
}
