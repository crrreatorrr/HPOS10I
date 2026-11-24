// The touch D-pad must not cover Sproto where an act or a boss arena starts
// him (the camera holds still there until he moves).

import { describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Scenes } from '../../src/core/scenes';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { tree } from '../../src/runtime/tree';
import { Rect2 } from '../../src/runtime/vec2';
import { registerBosses } from '../../src/bosses/register';
import type { LevelRoot } from '../../src/levels/common/level_root';
import { registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerSetPieces } from '../../src/levels/registry_setpieces';
import { registerCoreTypes, registerLevelScenes } from '../../src/levels/scenes';
import { PAD_CENTER, PAD_DRAW_RADIUS } from '../../src/ui/touch_controls/touch_controls';
import { step } from '../helpers/world';

const ZONES = ['z1_retro_rush_hills', 'z2_wizard_academy', 'z3_capital_mansion', 'z4_neon_rush_remix'];

describe('touch layout', () => {
  it('the D-pad clears Sproto at the start of every act and arena', async () => {
    registerCoreTypes();
    registerEnemies();
    registerObjects();
    registerSetPieces();
    registerLevelScenes();
    registerNewContent();
    registerBosses();
    for (const zone of ZONES) {
      for (const stage of [1, 2, 3]) {
        SceneRouter.zoneId = zone;
        SceneRouter.stage = stage;
        GameState.startLevel(zone, stage);
        const root = (await Scenes.factory(ZoneRegistry.stagePath(zone, stage))!()) as LevelRoot;
        root.useSceneRouter = false;
        tree.changeSceneNow(() => root);
        step(30);
        const view = root.camera!.viewRect();
        const p = root.player!;
        const box = Rect2.centered(p.globalPosition.sub(view.position), p.getRadii().mul(2));
        const nearest = PAD_CENTER.clamp(box.position, box.end);
        expect(nearest.distanceTo(PAD_CENTER), `${zone} stage ${stage}`).toBeGreaterThan(PAD_DRAW_RADIUS + 2);
      }
    }
    SceneRouter.zoneId = '';
    GameState.resetGame();
  }, 60_000);
});
