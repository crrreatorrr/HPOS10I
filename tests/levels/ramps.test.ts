// The ramps the flow pass built from slope tiles (docs/gameplay-improvement-plan.md,
// D2 and D3). Holding a direction cannot climb a 1:2 slope from rest (the
// slope's pull, 0.125 x sin 26.6 deg = 0.056, beats the 0.047 acceleration:
// docs/LEVELS.md principle 4), so no climb was turned into a 1:2 ramp: every
// new ramp runs DOWN the way the act runs. Each is walked from a standstill
// at its top, holding right: Sproto must be past its foot within 2 s, faster
// than he started, and still on the ground.

import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { AutoscrollSection } from '../../src/levels/objects/z2/autoscroll_section';
import { Vec2 } from '../../src/runtime/vec2';
import { press, releaseAll, step } from '../helpers/world';
import { FEET, loadAct } from './level_world';

/** [x of the ramp's top, y of the floor there, the drop in px]. Each falls 1:2 to the right. */
const RAMPS: Record<string, [number, number, number][]> = {
  'src/levels/data/z2_wizard_academy/act1.json': [
    [2080, -192, 96],
    [6224, -480, 96],
    [11072, -736, 96],
    [11776, -640, 128],
    [14064, -544, 96],
    [20640, -704, 96],
    [24384, -800, 96],
    [27328, -160, 160],
  ],
  'src/levels/data/z2_wizard_academy/act2.json': [[19792, -832, 128]],
};

afterEach(releaseAll);

for (const [file, ramps] of Object.entries(RAMPS)) {
  describe(`new ramps: ${file.split('/data/')[1]}`, () => {
    it('each is walked from a standstill at its top to past its foot in under 2 s', async () => {
      GameState.resetGame();
      const root = await loadAct(file);
      for (const node of root.findChildren((n) => n instanceof Enemy || n instanceof AutoscrollSection)) node.queueFree();
      step(1);
      const p = root.player!;
      for (const [x, y, drop] of ramps) {
        releaseAll();
        p.respawnAt(new Vec2(x - 6, y - FEET));
        step(3);
        expect(p.grounded, `standing at the top of the ramp at x ${x}`).toBe(true);
        expect(Math.abs(p.groundSpeed)).toBeLessThan(0.01);
        press('move_right');
        const foot = x + drop * 2;
        let frames = 0;
        while (p.globalPosition.x < foot + 8 && frames < 240) {
          step(1);
          frames++;
        }
        expect(frames, `ramp at x ${x}: ${frames} frames to its foot`).toBeLessThan(120);
        expect(p.grounded, `ramp at x ${x}: on the ground at the foot`).toBe(true);
        expect(p.globalPosition.y + p.getRadii().y, `ramp at x ${x}: at the lower floor`).toBeCloseTo(y + drop, 0);
        expect(p.groundSpeed).toBeGreaterThan(3);
        expect(p.state).not.toBe('dead');
      }
    });
  });
}
