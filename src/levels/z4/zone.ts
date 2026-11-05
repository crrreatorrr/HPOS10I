// Neon Rush Remix (Zone 4) constants and the builder set-up both acts share:
// neon terrain and loops (dark fill, magenta lips, cyan sides), the neon
// pill costumes for the T2-T4 kinds that have one, and set pieces in the
// zone's art.

import { Color } from '../../runtime/color';
import { LevelBuilder, type EnemyKind } from '../builder/level_builder';
import { NEON_ENEMY } from './neon_pills';
import { NEON_ACCENT, NEON_EDGE, NEON_FILL } from './neon_terrain';

export const Z4_ZONE = 'z4_neon_rush_remix';
export const Z4_ACT1 = `level:${Z4_ZONE}/act1`;
export const Z4_ACT2 = `level:${Z4_ZONE}/act2`;
export const NEON_TERRAIN_KEY = 'hpos://z4/neon_terrain';
export const NEON_LOOP_KEY = 'hpos://z4/neon_loop';

/**
 * The backdrop palette the lead may want for the neon style (the backdrop
 * is src/levels/common/backdrop.ts, owned elsewhere; it already has a
 * 'neon' placeholder style for this zone). Far to near.
 */
export const Z4_BACKDROP_PALETTE = {
  skyTop: new Color(0.03, 0.01, 0.09),
  skyHorizon: new Color(0.36, 0.05, 0.42),
  sun: [new Color(1.0, 0.86, 0.3), new Color(1.0, 0.3, 0.62)],
  farGrid: new Color(0.62, 0.2, 0.9, 0.5),
  skyline: new Color(0.1, 0.04, 0.2),
  skylineWindows: [new Color(0.18, 0.92, 1.0), new Color(1.0, 0.22, 0.78)],
  nearRim: NEON_EDGE,
};

const NEON_KINDS: Partial<Record<EnemyKind, string>> = {
  chaser: NEON_ENEMY.CHASER,
  armored: NEON_ENEMY.ARMORED,
  spike: NEON_ENEMY.SPIKE_PILL,
  diver: NEON_ENEMY.DIVER,
  sniper: NEON_ENEMY.SNIPER,
  dropper: NEON_ENEMY.DROPPER,
};

export function z4Builder(name: string, top = -720): LevelBuilder {
  return new LevelBuilder({
    name,
    zoneId: Z4_ZONE,
    artZoneId: Z4_ZONE,
    top,
    bottom: 64,
    fillBottom: 80,
    terrainKey: NEON_TERRAIN_KEY,
    loopKey: NEON_LOOP_KEY,
    fill: NEON_FILL,
    edge: NEON_EDGE,
    accent: NEON_ACCENT,
    enemyKeys: NEON_KINDS,
    music: 'z4',
  });
}
