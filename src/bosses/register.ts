// Registers the four boss arenas as level scenes (ids from
// src/core/zone_registry.ts). The lead calls registerBosses() at boot.

import { registerLevelScene } from '../levels/scenes';
import { buildBroccoliHeadArena } from './broccoli_head/arena';
import { buildLibraryDemonArena } from './library_demon/arena';
import { buildRugPullArena } from './rug_pull/arena';
import { buildTheExecutiveArena } from './the_executive/arena';

/** Scene id -> arena builder. */
export const BOSS_ARENAS = {
  'boss:rug_pull': buildRugPullArena,
  'boss:library_demon': buildLibraryDemonArena,
  'boss:broccoli_head': buildBroccoliHeadArena,
  'boss:the_executive': buildTheExecutiveArena,
} as const;

export function registerBosses(): void {
  for (const [id, build] of Object.entries(BOSS_ARENAS)) registerLevelScene(id, async () => build());
}
