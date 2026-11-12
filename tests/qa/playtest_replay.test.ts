// Replays the recorded runs (tests/levels/inputs/*_run.json) through Dev's
// timeline player into a headless act, the way Dev replays ?inputs= in the
// game. Item boxes are off.
//   - The act runs (Zones 1 to 3) are the QA pilot's own inputs, recorded in
//     this runtime (meta.tool names tools/qa/playtest_bot.ts). The simulation
//     is deterministic, so each must reach the goal without a death; one that
//     does not means the level, the controller or the camera changed since:
//     record it again.
//   - The test zone run was recorded in Godot. This runtime is not
//     bit-identical to Godot, so it may desync: that is reported, not failed,
//     and when it does reach the goal it must show the features it was
//     recorded for.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CEILING, type Player } from '../../src/player/player';
import { registerNewContent } from '../../src/levels/content';
import { BreakableWall } from '../../src/levels/objects/breakable_wall';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { tree } from '../../src/runtime/tree';
import { loadLevelData, ROOT_DIR, zoneActs } from '../../tools/qa/level_lint';
import { playAct, type BotResult } from '../../tools/qa/playtest_bot';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

const log = (line: string): void => void process.stderr.write(`${line}\n`);
const INPUTS = path.join(ROOT_DIR, 'tests/levels/inputs');

interface Replay {
  file: string;
  /** meta.tool of the recording. */
  tool: string;
  label: string;
  goalFrame: number;
  result: BotResult;
  progress: number;
  features: Record<string, boolean>;
  wallBroken: boolean;
  survivors: number;
}

const replays: Replay[] = [];

describe('recorded runs, replayed', () => {
  beforeAll(async () => {
    const files = fs.readdirSync(INPUTS).filter((f) => f.endsWith('_run.json')).sort();
    for (const file of files) {
      const json = JSON.parse(fs.readFileSync(path.join(INPUTS, file), 'utf8')) as { meta: { goal_frame: number; zone?: string; stage?: number; scene?: string; tool?: string } };
      const zone = json.meta.zone ?? 'test_zone';
      const stage = json.meta.stage ?? 1;
      const act = zoneActs().find((a) => a.zone === zone && a.stage === stage);
      if (!act) continue;
      const features = { spring_up: false, spring_diagonal: false, booster: false, loop: false };
      let progress = 0;
      let wallBroken = false;
      let survivors = -1;
      let watched: Player | null = null;
      const result = await playAct({
        data: loadLevelData(act.file),
        zone,
        stage,
        timeline: json,
        itemBoxes: false,
        stopOnDeath: true,
        frames: json.meta.goal_frame + 900,
        onTick: (_f, root, p) => {
          progress = Math.max(progress, root.progressAt(p.globalPosition.x));
          if (watched !== p) {
            watched = p;
            p.stateChanged.connect((_old, next) => {
              if (next !== 'spring') return;
              const v = p.velocity;
              if (Math.abs(v.y + 10) < 0.01 && Math.abs(v.x) < 9) features.spring_up = true;
              if (Math.abs(v.x - 10) < 0.01 && Math.abs(v.y + 10) < 0.01) features.spring_diagonal = true;
            });
          }
          if (p.grounded && p.groundSpeed >= 11.9 && p.controlLock > 0) features.booster = true;
          if (p.grounded && p.collisionMode === CEILING) features.loop = true;
          wallBroken = root.findChildren<BreakableWall>((n) => n instanceof BreakableWall).some((w) => w.isBroken());
          survivors = tree.getNodesInGroup<Enemy>('enemies').filter((e) => e.alive).length;
        },
      });
      replays.push({ file, tool: json.meta.tool ?? '', label: act.label, goalFrame: json.meta.goal_frame, result, progress, features, wallBroken, survivors });
    }
    log('recorded runs replayed headless, item boxes off:');
    for (const r of replays) {
      const res = r.result;
      const end = res.completed
        ? `reached the goal at frame ${res.completedFrame} (recorded ${r.goalFrame}, Dev frame ${res.devCompletedFrame})`
        : res.deaths.length
          ? `desynced: died at frame ${res.deaths[0]!.frame} (${res.deaths[0]!.cause}) at x ${res.deaths[0]!.x.toFixed(0)}`
          : `desynced: no goal by frame ${res.frames}, ended ${res.final.state} at x ${res.final.x.toFixed(0)}`;
      log(`  ${r.file} (${r.label}): ${end}; ${(r.progress * 100).toFixed(0)} % of the route`);
    }
  }, 900_000);

  it('replays every recording', () => {
    expect(replays.length).toBeGreaterThanOrEqual(7);
  });

  it('every run recorded in this runtime reaches the goal, at the frame it was recorded', () => {
    const own = replays.filter((r) => r.tool.includes('playtest_bot'));
    expect(own.map((r) => r.file).sort()).toEqual(['z1_act1_run.json', 'z1_act2_run.json', 'z2_act1_run.json', 'z2_act2_run.json', 'z3_act1_run.json', 'z3_act2_run.json']);
    for (const r of own) {
      expect(r.result.completed, `${r.file}: ended ${r.result.final.state} at x ${r.result.final.x.toFixed(0)} (${(r.progress * 100).toFixed(0)} % of the route); record it again`).toBe(true);
      expect(r.result.completedFrame, r.file).toBe(r.goalFrame);
    }
  });

  it('a recording that reaches the goal does it without a death or NaN', () => {
    for (const r of replays.filter((x) => x.result.completed)) {
      expect(r.result.deaths, r.file).toEqual([]);
      expect(r.result.nanFrames, r.file).toBe(0);
    }
  });

  it('the test zone recording, when it reaches the goal, used every feature and beat every enemy', () => {
    const tz = replays.find((r) => r.file === 'test_zone_run.json');
    expect(tz).toBeDefined();
    if (!tz!.result.completed) {
      log(`  test_zone_run.json desynced (${(tz!.progress * 100).toFixed(0)} %): feature checks skipped`);
      return;
    }
    log(`  test zone run: features ${JSON.stringify(tz!.features)}, wall broken ${tz!.wallBroken}, enemies left ${tz!.survivors}`);
    expect(tz!.features).toEqual({ spring_up: true, spring_diagonal: true, booster: true, loop: true });
    expect(tz!.wallBroken).toBe(true);
    expect(tz!.survivors).toBe(0);
    expect(tz!.result.completedFrame).toBeLessThan(1800);
  });
});
