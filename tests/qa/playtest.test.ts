// QA playtest bot (ports of the bot checks in tests/levels/test_test_zone.gd,
// test_z1_acts.gd, test_z2_acts.gd and tools/qa/difficulty_bot.sh). The
// headless bot (tools/qa/playtest_bot.ts) must finish the test zone and every
// released act that has a level file (Zones 1 to 3) within the act's time
// limit, and its median clear time must rise from act to act (docs/LEVELS.md,
// "How it's checked"). These runs have the item boxes off, as the curve was
// built without them (tests/qa/playtest_boxes.test.ts plays with them on).
// Zone 4 is built in code: its route pilot plays it in tests/levels/z4.test.ts
// (bot_runs.ts, botActs()). Slow: seven bot variants per act.

import { beforeAll, describe, expect, it } from 'vitest';
import { Difficulty } from '../../src/core/difficulty';
import { registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { summaryLine } from '../../tools/qa/playtest_bot';
import { finishedInTime, log, orderProblems, playAll, released, report, type ActRuns } from './bot_runs';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

let results: ActRuns[] = [];

describe('playtest bot (item boxes off)', () => {
  beforeAll(async () => {
    results = await playAll(false);
    report('playtest bot, item boxes off (frames from the act start; timer = the act clock at the goal):', results);
  }, 1_800_000);

  it('the pilot finishes the test zone and every released act within the time limit', () => {
    const failures: string[] = [];
    for (const r of results.filter((x) => released(x.act))) {
      for (const run of r.runs.filter((x) => x.policy === 'pilot')) {
        if (!finishedInTime(run)) failures.push(summaryLine(r.act.label, run));
        if (run.nanFrames > 0) failures.push(`${r.act.label}: ${run.nanFrames} NaN frames`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('a majority of the runner variants (difficulty_bot.sh) finish every released act, and none sees NaN', () => {
    for (const r of results.filter((x) => released(x.act))) {
      const runners = r.runs.filter((x) => x.policy === 'runner');
      const done = runners.filter(finishedInTime).length;
      expect(done, `${r.act.label}: ${done}/${runners.length} runner variants finished`).toBeGreaterThanOrEqual(Math.ceil(runners.length / 2));
      for (const run of runners) expect(run.nanFrames, r.act.label).toBe(0);
    }
  });

  it('the median clear time rises from act to act (D >= 1, released acts)', () => {
    expect(results.filter((r) => released(r.act) && r.act.d >= 1).length).toBeGreaterThanOrEqual(4);
    expect(orderProblems(results)).toEqual([]);
  });

  it("every act's par follows from this run: 1.5 x the faster deathless clear of the pilot and the naive runner, rounded up to 5 s", () => {
    // Difficulty.BEST_BOT_FRAMES records that clear (src/core/difficulty.ts). When a level, the controller or
    // the camera changes it, re-measure and update the row there; never edit par_seconds by hand.
    const stale: string[] = [];
    for (const r of results.filter((x) => released(x.act))) {
      const clean = r.runs.filter((x) => ((x.policy === 'pilot' && x.jumpEvery === 0) || (x.policy === 'runner' && x.jumpEvery === 90)) && finishedInTime(x) && x.deaths.length === 0);
      expect(clean.length, `${r.act.label}: a deathless clear by the pilot or the naive runner`).toBeGreaterThan(0);
      const best = Math.min(...clean.map((x) => x.completedFrame));
      const par = Difficulty.targets(r.act.d).par_seconds;
      const want = Difficulty.parFromBot(best / 60);
      log(`  ${r.act.label}: best deathless bot ${best} frames (${(best / 60).toFixed(1)} s), par ${par} s, S at or under ${(0.7 * par).toFixed(1)} s`);
      if (par !== want) stale.push(`${r.act.label}: par ${par} s, but the best deathless bot clear is ${best} frames (${(best / 60).toFixed(1)} s) -> ${want} s; BEST_BOT_FRAMES[${r.act.d}] is ${Difficulty.BEST_BOT_FRAMES[r.act.d]}`);
    }
    expect(stale).toEqual([]);
  });

  it('the pilot clears the test zone without a death', () => {
    const tz = results.find((r) => r.act.zone === 'test_zone')!;
    for (const run of tz.runs.filter((x) => x.policy === 'pilot')) {
      expect(run.completed).toBe(true);
      expect(run.deaths).toEqual([]);
    }
  });
});
