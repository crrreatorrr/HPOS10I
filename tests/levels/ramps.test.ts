// The slopes of the flow pass (docs/gameplay-improvement-plan.md, D2 and D3;
// docs/LEVELS.md principle 4).
//
// Holding a direction cannot climb a 1:2 slope tile ramp (26.6 deg) from rest:
// the slope's pull, 0.125 x sin 26.6 deg = 0.056, beats the 0.047 acceleration.
// A 1:4 slope (14 deg) pulls 0.030, so it is climbed from a standstill anywhere
// on it, at about a third of flat acceleration. So in Zones 2 and 3:
//   - every climb is a 1:4 CurveTerrain ramp ("gentle"), walked here from a
//     standstill at its foot and again from a standstill half way up;
//   - 1:2 tile ramps only run DOWN the way the act runs; each is walked from a
//     standstill at its top: past its foot within 2 s (a longer banister:
//     1 s plus a frame for every 2 px of drop), faster than he started, still
//     on the ground.

import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { AutoscrollSection } from '../../src/levels/objects/z2/autoscroll_section';
import { Vec2 } from '../../src/runtime/vec2';
import { press, releaseAll, step } from '../helpers/world';
import { FEET, loadAct } from './level_world';

/** 1:2 ramps: [x where he stands at the top, y of the floor there, the drop in px to the lower floor]. */
const DOWN: Record<string, [number, number, number][]> = {
  'src/levels/data/z2_wizard_academy/act1.json': [
    [2080, -192, 96],
    [6224, -480, 96],
    [11072, -736, 96],
    [11776, -640, 128],
    [14064, -544, 96],
    [20640, -704, 96],
    [24384, -800, 96],
    [26240, -480, 160],
    [26752, -320, 160],
    // From the launch lip at the head of the last old ramp.
    [27342, -192, 192],
    [30960, -288, 288],
  ],
  'src/levels/data/z2_wizard_academy/act2.json': [
    [19792, -832, 128],
    [20624, -704, 96],
    [21200, -608, 96],
    [28064, -768, 128],
    [29024, -640, 128],
  ],
  // Zone 3 Act 1: the roofs pitch down (they were steps).
  'src/levels/data/z3_capital_mansion/act1.json': [
    [11392, -528, 128],
    [13792, -400, 128],
    [20288, -272, 128],
    [24352, -144, 128],
  ],
};

/** 1:4 climbs: [x of the foot, y of the floor there, the run in px, the rise in px]. */
const UP: Record<string, [number, number, number, number][]> = {
  'src/levels/data/z2_wizard_academy/act1.json': [
    [864, 0, 384, 96],
    [1568, -96, 384, 96],
    [5712, -384, 384, 96],
    [6768, -384, 512, 128],
    [10560, -640, 384, 96],
    [13808, -512, 128, 32],
    [15360, -448, 768, 192],
    [16480, -640, 128, 32],
    [20128, -608, 384, 96],
    [23872, -704, 384, 96],
    [27200, -160, 128, 32],
    [29200, 0, 640, 160],
    [30160, -160, 512, 128],
    [32320, 0, 128, 32],
  ],
  'src/levels/data/z2_wizard_academy/act2.json': [
    [1184, 0, 384, 96],
    [12608, -384, 512, 128],
  ],
  'src/levels/data/z3_capital_mansion/act1.json': [
    [1024, 0, 256, 64],
    [4480, -320, 512, 128],
    [5728, -448, 896, 224],
  ],
};

afterEach(releaseAll);

async function quietAct(file: string) {
  GameState.resetGame();
  const root = await loadAct(file);
  for (const node of root.findChildren((n) => n instanceof Enemy || n instanceof AutoscrollSection)) node.queueFree();
  step(1);
  return root.player!;
}

for (const [file, ramps] of Object.entries(DOWN)) {
  describe(`1:2 ramps run down: ${file.split('/data/')[1]}`, () => {
    it('each is walked from a standstill at its top to past its foot', async () => {
      const p = await quietAct(file);
      for (const [x, y, drop] of ramps) {
        releaseAll();
        p.respawnAt(new Vec2(x - 6, y - FEET));
        step(3);
        expect(p.grounded, `standing at the top of the ramp at x ${x}`).toBe(true);
        expect(Math.abs(p.groundSpeed)).toBeLessThan(0.01);
        press('move_right');
        const foot = x + drop * 2;
        let frames = 0;
        const limit = Math.max(120, 60 + drop / 2);
        while (p.globalPosition.x < foot + 8 && frames < limit + 60) {
          step(1);
          frames++;
        }
        expect(frames, `ramp at x ${x}: ${frames} frames to its foot`).toBeLessThan(limit);
        expect(p.grounded, `ramp at x ${x}: on the ground at the foot`).toBe(true);
        expect(p.globalPosition.y + p.getRadii().y, `ramp at x ${x}: at the lower floor`).toBeCloseTo(y + drop, 0);
        expect(p.groundSpeed).toBeGreaterThan(3);
        expect(p.state).not.toBe('dead');
      }
    }, 60_000);
  });
}

for (const [file, ramps] of Object.entries(UP)) {
  describe(`1:4 climbs: ${file.split('/data/')[1]}`, () => {
    it('each is climbed from a standstill at its foot, holding right', async () => {
      const p = await quietAct(file);
      for (const [x, y, run, rise] of ramps) {
        releaseAll();
        p.respawnAt(new Vec2(x - 6, y - FEET));
        step(3);
        expect(p.grounded, `standing at the foot of the climb at x ${x}`).toBe(true);
        press('move_right');
        const limit = 140 + Math.ceil(0.45 * run);
        let frames = 0;
        let slowest = Infinity;
        while (p.globalPosition.x < x + run + 8 && frames < limit + 60) {
          step(1);
          frames++;
          if (frames > 20) slowest = Math.min(slowest, p.groundSpeed);
        }
        expect(frames, `climb at x ${x}: ${frames} frames to its top`).toBeLessThan(limit);
        expect(slowest, `climb at x ${x}: never slides back`).toBeGreaterThan(0);
        expect(p.grounded, `climb at x ${x}: on the ground at the top`).toBe(true);
        expect(Math.abs(p.globalPosition.y + p.getRadii().y - (y - rise)), `climb at x ${x}: at the upper floor`).toBeLessThan(2);
      }
    }, 60_000);

    it('a standstill half way up neither slides back nor stalls', async () => {
      const p = await quietAct(file);
      for (const [x, y, run, rise] of ramps) {
        releaseAll();
        const mid = x + run / 2;
        p.respawnAt(new Vec2(mid, y - rise / 2 - FEET - 3));
        step(30);
        expect(p.grounded, `standing on the climb at x ${mid}`).toBe(true);
        expect(Math.abs(p.groundSpeed), `climb at x ${x}: holds still on the slope`).toBeLessThan(0.01);
        expect(Math.abs(p.globalPosition.x - mid), `climb at x ${x}: has not slid`).toBeLessThan(1);
        press('move_right');
        const limit = 140 + Math.ceil(0.45 * run);
        let frames = 0;
        while (p.globalPosition.x < x + run + 8 && frames < limit) {
          step(1);
          frames++;
        }
        expect(frames, `climb at x ${x}: ${frames} frames from half way to its top`).toBeLessThan(limit);
        expect(p.grounded).toBe(true);
      }
    }, 60_000);
  });
}
