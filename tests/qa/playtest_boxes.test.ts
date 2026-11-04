// Item boxes (new in the TypeScript build) are solid until a jump or a roll
// breaks them. QA: placed boxes must never block the route. Every act is
// played by the same bot variants as tests/qa/playtest.test.ts with the boxes
// on: an act the pilot clears with boxes off must still be cleared with them
// on, and every stall near a box (5 s or more without progress, a box within
// 320 px) is reported with the box position. The placement is also
// checked statically (reported): no box inside a loop's footprint or on a
// forced leftward stretch, where Sproto arrives at speed. The bot's median
// clear times with boxes on are reported against the curve too.

import { beforeAll, describe, expect, it } from 'vitest';
import { SceneRouter } from '../../src/core/scene_router';
import { Settings } from '../../src/core/settings';
import { BoundsRect } from '../../src/levels/common/level_nodes';
import { placeItemBoxes, registerNewContent } from '../../src/levels/content';
import { ItemBox } from '../../src/levels/objects/item_box';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { findLoops, loadLevelData, prepare, zoneActs } from '../../tools/qa/level_lint';
import { playAct, summaryLine, type BotResult } from '../../tools/qa/playtest_bot';
import { finishedInTime, log, orderProblems, playAll, report, type ActRuns } from './bot_runs';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

let results: ActRuns[] = [];
const pilotOff = new Map<string, BotResult>();
const misplaced: string[] = [];

describe('item boxes never block the route', () => {
  beforeAll(async () => {
    Settings.reset();
    for (const act of zoneActs()) {
      SceneRouter.zoneId = act.zone;
      SceneRouter.stage = act.stage;
      const root = await prepare(loadLevelData(act.file));
      placeItemBoxes(root);
      const loops = findLoops(root);
      const leftward = root.findChildren<BoundsRect>((n) => n instanceof BoundsRect && /leftward|reverse/i.test(n.name)).map((n) => n.globalRect());
      for (const box of root.findChildren<ItemBox>((n) => n instanceof ItemBox)) {
        const at = box.globalPosition;
        const where = `${act.label}: ${box.name} at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`;
        for (const lp of loops) {
          if (Math.abs(at.x - lp.at.x) < lp.half && Math.abs(at.y - lp.at.y) < 2 * lp.outer) misplaced.push(`${where} is inside the loop footprint at x ${lp.at.x.toFixed(0)} (±${lp.half.toFixed(0)})`);
        }
        for (const r of leftward) if (r.grow(16).hasPoint(at)) misplaced.push(`${where} is on the leftward stretch ${r}`);
      }
      pilotOff.set(act.label, await playAct({ data: loadLevelData(act.file), zone: act.zone, stage: act.stage, policy: 'pilot', jumpEvery: 0, itemBoxes: false }));
    }
    SceneRouter.zoneId = '';
    results = await playAll(true);
    report('playtest bot, item boxes on:', results);
    // A stall with a box nearby that the same pilot does not have with the boxes off.
    for (const r of results) {
      const off = pilotOff.get(r.act.label)!;
      for (const run of r.runs) {
        for (const s of run.stuck.filter((x) => x.box)) {
          const alsoOff = off.stuck.some((o) => Math.abs(o.x - s.x) < 200);
          log(`  WARN ${r.act.label} ${run.policy} j${run.jumpEvery}: stalled ${s.seconds} s at x ${s.x}, ${s.box!.distance} px from the item box at (${s.box!.x}, ${s.box!.y})${alsoOff ? ' (the pilot also stalls here with boxes off)' : ''}`);
        }
      }
    }
    for (const m of misplaced) log(`  WARN ${m}`);
    for (const p of orderProblems(results)) log(`  WARN with boxes on, the bot's median clear time does not rise: ${p}`);
  }, 1_800_000);

  it('boxes never make an act unfinishable for the pilot', () => {
    const broken: string[] = [];
    for (const r of results) {
      const off = pilotOff.get(r.act.label)!;
      const on = r.runs.find((x) => x.policy === 'pilot' && x.jumpEvery === 0)!;
      if (finishedInTime(off) && !finishedInTime(on)) broken.push(`${r.act.label}: clears with boxes off, not with them on (${summaryLine(r.act.label, on)})`);
    }
    expect(broken).toEqual([]);
  });

  it('boxes are placed on every act and broken on the way', () => {
    for (const r of results) for (const run of r.runs) expect(run.boxesPlaced, r.act.label).toBeGreaterThan(0);
    for (const off of pilotOff.values()) expect(off.boxesPlaced).toBe(0);
    expect(results.reduce((n, r) => n + r.runs.reduce((m, x) => m + x.boxesBroken, 0), 0)).toBeGreaterThan(0);
  });
});
