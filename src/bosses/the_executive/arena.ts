// The Executive's arena (scene 'boss:the_executive', Zone 4): a neon
// rooftop at night. In phase 2 its floor splits over a deadly drop (the
// Bounds' bottom edge is just below the roof).

import { Color } from '../../runtime/color';
import { buildArena } from '../arena';
import type { LevelRoot } from '../../levels/common/level_root';
import { TheExecutive } from './the_executive';

export function buildTheExecutiveArena(): LevelRoot {
  return buildArena({
    name: 'TheExecutiveArena',
    zoneId: 'z4_neon_rush_remix',
    makeBoss: () => new TheExecutive(),
    fill: Color.rgb8(50, 44, 80),
    edge: Color.rgb8(255, 70, 190),
    back: Color.rgb8(14, 10, 40, 170),
    gate: Color.rgb8(90, 230, 255),
  });
}
