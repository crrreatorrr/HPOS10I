// The Library Demon's arena (scene 'boss:library_demon', Zone 2): a stone
// reading hall of the Wizard Academy.

import { Color } from '../../runtime/color';
import { buildArena } from '../arena';
import type { LevelRoot } from '../../levels/common/level_root';
import { LibraryDemon } from './library_demon';

export function buildLibraryDemonArena(): LevelRoot {
  return buildArena({
    name: 'LibraryDemonArena',
    zoneId: 'z2_wizard_academy',
    makeBoss: () => new LibraryDemon(),
    fill: Color.rgb8(92, 80, 110),
    edge: Color.rgb8(186, 150, 96),
    back: Color.rgb8(40, 26, 60, 150),
    gate: Color.rgb8(120, 90, 160),
  });
}
