// Level types for the classic set pieces (src/levels/objects/setpieces),
// keyed 'hpos://setpieces/<name>' (they have no original Godot scene). The
// level builder (src/levels/builder) places them by these keys.

import { LevelTypes } from './common/level_loader';
import { Bumper } from './objects/setpieces/bumper';
import { CrumbleLedge } from './objects/setpieces/crumble_ledge';
import { RollTube } from './objects/setpieces/roll_tube';
import { TimedPlatform } from './objects/setpieces/timed_platform';
import { VanishingPlatform } from './objects/setpieces/vanishing_platform';
import { VoidZone } from './objects/setpieces/void_zone';

export const SETPIECE = {
  BUMPER: 'hpos://setpieces/bumper',
  CRUMBLE_LEDGE: 'hpos://setpieces/crumble_ledge',
  ROLL_TUBE: 'hpos://setpieces/roll_tube',
  VANISHING_PLATFORM: 'hpos://setpieces/vanishing_platform',
  TIMED_PLATFORM: 'hpos://setpieces/timed_platform',
  VOID_ZONE: 'hpos://setpieces/void_zone',
} as const;

export function registerSetPieces(): void {
  LevelTypes.register(SETPIECE.BUMPER, () => new Bumper());
  LevelTypes.register(SETPIECE.CRUMBLE_LEDGE, () => new CrumbleLedge());
  LevelTypes.register(SETPIECE.ROLL_TUBE, () => new RollTube());
  LevelTypes.register(SETPIECE.VANISHING_PLATFORM, () => new VanishingPlatform());
  LevelTypes.register(SETPIECE.TIMED_PLATFORM, () => new TimedPlatform());
  LevelTypes.register(SETPIECE.VOID_ZONE, () => new VoidZone());
}
