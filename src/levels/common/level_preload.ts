// Art a level draws from its first frame: the zone's tile atlas, terrain
// materials and backdrop layers, the props, enemies and floor hazards, the
// zone's accessory for Sproto, the Zone 4 enemy atlas and the boss sheets. A level's scene factory loads these before the scene
// swaps in (the old scene keeps running meanwhile), so nothing pops in.
// Capped: a slow or failing image never holds the level back for long.

import { assetUrl, preload } from '../../runtime/assets';
import type { Node } from '../../runtime/node';
import { materialPath } from '../../terrain/terrain_art';
import { SHEET_PATHS as ACCESSORY_SHEETS } from '../../player/accessory';
import { PILLS_SHEET } from '../enemies/pill_sprite';
import { PROPS_SHEET } from '../objects/prop_sprite';
import { HAZARD_ATLAS } from '../objects/hazards/hazard_art';
import { REMIX_ATLAS } from '../enemies/neon/remix_art';
import { backdropPaths } from './backdrop';
import { LevelRoot } from './level_root';
import { TileLayer } from './level_nodes';

/** Longest a level waits for its art before it starts anyway (images still arrive later). */
export const LEVEL_ART_WAIT_MS = 2500;

const BOSS_SHEETS = ['bosses_sheet.png', 'boss_moves_sheet.png', 'attacks_sheet.png'].map((f) => `assets/sprites/common/bosses/${f}`);

/** Repository paths of the art `level` (scene `sceneId`) draws from its first frame. */
export function levelArtPaths(level: Node, sceneId: string): string[] {
  const paths = new Set<string>([HAZARD_ATLAS, PROPS_SHEET, PILLS_SHEET]);
  if (sceneId.includes('z4_')) paths.add(REMIX_ATLAS);
  if (sceneId.startsWith('boss:')) for (const p of BOSS_SHEETS) paths.add(p);
  if (level instanceof LevelRoot) {
    const zone = level.currentArtZoneId();
    if (zone !== '') {
      for (const p of backdropPaths(zone, level.backdropVariant)) paths.add(p);
      for (const part of ['fill', 'top', 'side'] as const) paths.add(materialPath(zone, part));
      for (const sheet of Object.values(ACCESSORY_SHEETS)) if (sheet.includes(`/${zone}/`)) paths.add(sheet);
    }
    // LevelRoot.ready() gives every tile layer the level's art zone; the same atlas here.
    for (const layer of level.findChildren<TileLayer>((n) => n instanceof TileLayer)) {
      paths.add(TileLayer.atlasPathFor(zone || layer.artZone || layer.tilesetId));
    }
  }
  return [...paths];
}

/** Loads a level's first-frame art (at most `waitMs`). */
export async function preloadLevelArt(level: Node, sceneId: string, waitMs = LEVEL_ART_WAIT_MS): Promise<void> {
  const urls = levelArtPaths(level, sceneId)
    .map((p) => assetUrl(p))
    .filter((u): u is string => !!u);
  if (urls.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([preload(urls), new Promise<void>((resolve) => (timer = setTimeout(resolve, waitMs)))]);
  if (timer) clearTimeout(timer);
}
