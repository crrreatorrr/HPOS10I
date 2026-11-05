// The Rug Pull's arena (scene 'boss:rug_pull', Zone 1): grassy hills.

import { Color } from '../../runtime/color';
import { buildArena } from '../arena';
import type { LevelRoot } from '../../levels/common/level_root';
import { RugPull } from './rug_pull';

export function buildRugPullArena(): LevelRoot {
  return buildArena({
    name: 'RugPullArena',
    zoneId: 'z1_retro_rush_hills',
    makeBoss: () => new RugPull(),
    fill: new Color(0.45, 0.32, 0.22),
    edge: new Color(0.36, 0.78, 0.36),
    back: new Color(0.55, 0.78, 0.95, 0.35),
    gate: Color.rgb8(150, 110, 70),
  });
}
