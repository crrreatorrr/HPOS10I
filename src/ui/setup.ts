// Installs the UI: registers the menu scenes with the scene registry, gives
// every level its HUD and act-clear tally (LevelHooks), and builds the global
// overlays the boot code adds with tree.addAutoload(), in this order (later
// overlays see input first and draw by their layer): sound hint (99), pause
// menu (101), touch controls (102), rotate hint / display watcher (110).

import { ENDING_SCENE, GAME_OVER_SCENE, MAIN_SCENE, Scenes, TITLE_SCENE, ZONE_SELECT_SCENE } from '../core/scenes';
import { LevelHooks } from '../levels/common/level_root';
import type { Node } from '../runtime/node';
import { DevMenu } from './dev_menu';
import { Display } from './display';
import { EndingScreen } from './ending/ending';
import { GameOverScreen } from './game_over/game_over';
import { Hud } from './hud/hud';
import { PauseMenu } from './pause/pause_menu';
import { RotateHint } from './rotate_hint';
import { SoundHint } from './sound_hint/sound_hint';
import { ScoreTally } from './tally/score_tally';
import { TitleScreen } from './title/title_screen';
import { TouchControls } from './touch_controls/touch_controls';
import { ZoneSelect } from './zone_select/zone_select';

export function registerUiScenes(): void {
  Scenes.register(TITLE_SCENE, () => new TitleScreen());
  Scenes.register(ZONE_SELECT_SCENE, () => new ZoneSelect());
  Scenes.register(GAME_OVER_SCENE, () => new GameOverScreen());
  Scenes.register(ENDING_SCENE, () => new EndingScreen());
  Scenes.register(MAIN_SCENE, () => new DevMenu());
}

export function installUi(): { overlays: Node[] } {
  registerUiScenes();
  LevelHooks.hud = () => new Hud();
  LevelHooks.tally = (zoneId: string) => new ScoreTally(zoneId);
  ScoreTally.watchBanks();
  if (typeof window !== 'undefined') Display.attachDom(window);
  return { overlays: [new SoundHint(), new PauseMenu(), new TouchControls(), new RotateHint()] };
}
