// Records the act runs in tests/levels/inputs/ again (skipped unless
// RECORD_RUNS is set: `npm run record:runs`, or RECORD_RUNS=z2_act1,z3_act2
// for some of them). Each run is the QA pilot's own inputs on the act with
// item boxes off, written as a Dev timeline and replayed once to check it
// reaches the goal on the same frame. Run it after a change to a level, the
// controller or the camera makes tests/qa/playtest_replay.test.ts fail.
//
// The pilot sends an input before the tick that reads it; Dev's timeline
// shows a press sent on frame N to gameplay on tick N + 1, so events are
// written one frame early.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerNewContent } from '../../src/levels/content';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { Input, type Action } from '../../src/runtime/input';
import { loadLevelData, ROOT_DIR } from '../../tools/qa/level_lint';
import { playAct } from '../../tools/qa/playtest_bot';
import { botActs, log } from './bot_runs';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

const WANT = process.env.RECORD_RUNS ?? '';
const NOTE = 'Dev timeline: frame 0 is the first tick the act is the current scene; replay with --zone, --stage and --inputs';
const TOOL = 'tools/qa/playtest_bot.ts (the pilot, item boxes off); tests/qa/record_runs.test.ts';

type Event = [number, Action, boolean];

describe.skipIf(!WANT)('record the act runs', () => {
  it('writes the pilot run of every act as a timeline that replays to the goal', async () => {
    for (const act of botActs().filter((a) => a.zone !== 'test_zone')) {
      const name = `${act.zone.slice(0, 2)}_act${act.stage}`;
      if (WANT !== '1' && !WANT.split(',').includes(name)) continue;
      const data = loadLevelData(act.file);
      const events: Event[] = [];
      const held = new Set<Action>();
      let frame = 0;
      const press = Input.actionPress;
      const release = Input.actionRelease;
      Input.actionPress = (action: Action, source?: string): void => {
        if (source === 'bot' && !held.has(action)) {
          held.add(action);
          events.push([frame, action, true]);
        }
        press.call(Input, action, source);
      };
      Input.actionRelease = (action: Action, source?: string): void => {
        if (source === 'bot' && held.has(action)) {
          held.delete(action);
          events.push([frame, action, false]);
        }
        release.call(Input, action, source);
      };
      let run;
      try {
        run = await playAct({ data, zone: act.zone, stage: act.stage, policy: 'pilot', jumpEvery: 0, itemBoxes: false, onTick: (f) => (frame = f + 1) });
      } finally {
        Input.actionPress = press;
        Input.actionRelease = release;
      }
      expect(run.completed && run.deaths.length === 0, `${act.label}: the pilot clears it without a death`).toBe(true);
      const shifted: Event[] = events.filter((e) => e[0] <= run.completedFrame).map((e) => [Math.max(e[0] - 1, 0), e[1], e[2]]);
      const meta = { deaths: 0, goal_frame: run.completedFrame, note: NOTE, stage: act.stage, tool: TOOL, zone: act.zone };
      const replay = await playAct({ data, zone: act.zone, stage: act.stage, timeline: { meta, events: shifted }, itemBoxes: false, stopOnDeath: true, frames: run.completedFrame + 900 });
      expect(replay.completed, `${act.label}: the recording replays to the goal`).toBe(true);
      expect(replay.completedFrame, `${act.label}: on the frame the pilot reached it`).toBe(run.completedFrame);
      const text = ['{', `  "meta": ${JSON.stringify(meta)},`, '  "events": [', shifted.map((e) => `    ${JSON.stringify(e)}`).join(',\n'), '  ]', '}', ''].join('\n');
      fs.writeFileSync(path.join(ROOT_DIR, 'tests/levels/inputs', `${name}_run.json`), text);
      log(`  recorded ${name}_run.json: ${shifted.length} events, goal at frame ${run.completedFrame}`);
    }
  }, 1_800_000);
});
