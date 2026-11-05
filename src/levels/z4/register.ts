// Zone 4 (Neon Rush Remix) registration: its level types (neon terrain and
// loops, neon pills, the set pieces) and the two act scenes,
// 'level:z4_neon_rush_remix/act1' and '/act2', built in code by the level
// builder. The zone stays out of the zone registry until QA signs it off;
// the lead wires registerZone4() in at boot.

import { buildLevel, LevelTypes } from '../common/level_loader';
import { registerSetPieces } from '../registry_setpieces';
import { registerLevelScene } from '../scenes';
import { act1Data } from './act1';
import { act2Data } from './act2';
import { registerNeonPills } from './neon_pills';
import { NeonLoop, NeonTerrain } from './neon_terrain';
import { NEON_LOOP_KEY, NEON_TERRAIN_KEY, Z4_ACT1, Z4_ACT2 } from './zone';

/** The level types Zone 4's acts use (set pieces, neon terrain, loops and pills). */
export function registerZone4Types(): void {
  registerSetPieces();
  registerNeonPills();
  LevelTypes.register(NEON_TERRAIN_KEY, () => new NeonTerrain());
  LevelTypes.register(NEON_LOOP_KEY, () => new NeonLoop());
}

export function registerZone4(): void {
  registerZone4Types();
  registerLevelScene(Z4_ACT1, async () => buildLevel(act1Data()));
  registerLevelScene(Z4_ACT2, async () => buildLevel(act2Data()));
}
