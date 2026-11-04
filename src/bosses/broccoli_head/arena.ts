// Broccoli Head's arena (scene 'boss:broccoli_head', Zone 3): a mansion
// ballroom with a chandelier.

import { Color } from '../../runtime/color';
import { buildArena } from '../arena';
import type { LevelRoot } from '../../levels/common/level_root';
import { BroccoliHead } from './broccoli_head';

export function buildBroccoliHeadArena(): LevelRoot {
  return buildArena({
    name: 'BroccoliHeadArena',
    zoneId: 'z3_capital_mansion',
    makeBoss: () => new BroccoliHead(),
    fill: Color.rgb8(200, 196, 210),
    edge: Color.rgb8(60, 70, 130),
    back: Color.rgb8(30, 40, 84, 160),
    gate: Color.rgb8(210, 180, 90),
  });
}
