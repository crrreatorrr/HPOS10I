// QA boss bot: an honest scripted player (tests/bosses/helpers.ts BossBot:
// the controls only, no ticket top-ups, no teleports) plays each boss arena
// from its start, walking through the corridor tickets, and retries like a
// player does after a death (the checkpoint stands before the tickets, so a
// retry picks them up again). Each boss must fall within a few attempts, the
// Executive (Zone 4) taking the most, and a player who stands still must lose.
// Each attempt enters the arena a little later than the last, so the fights
// differ. Slow (minutes): run with `npm run test:bots`, not in `npm test`.

import { afterEach, describe, expect, it } from 'vitest';
import { SceneRouter } from '../../src/core/scene_router';
import { tree } from '../../src/runtime/tree';
import { BOSS_ARENAS } from '../../src/bosses/register';
import { press, release, releaseAll, step } from '../helpers/world';
import { BossBot, openArena, type ArenaWorld } from '../bosses/helpers';

afterEach(() => {
  releaseAll();
  tree.timeScale = 1;
});

const LIMIT = 60 * 400;

interface Attempt {
  won: boolean;
  hits: number;
  hurts: number;
  seconds: number;
}

async function attempt(scene: keyof typeof BOSS_ARENAS, k: number, idle = false): Promise<Attempt> {
  const w: ArenaWorld = await openArena(async () => BOSS_ARENAS[scene]());
  SceneRouter.zoneId = w.root.zoneId;
  const bot = new BossBot(w, k);
  step(k * 23);
  const f0 = tree.physicsFrames;
  for (let i = 0; i < LIMIT && !w.boss.isDefeated && w.player.state !== 'dead'; i++) {
    if (!idle) bot.step();
    else if (!w.boss.engaged) press('move_right');
    else release('move_right');
    step(1);
  }
  bot.stop();
  release('move_right');
  SceneRouter.zoneId = '';
  return { won: w.boss.isDefeated, hits: w.boss.hitsTaken, hurts: w.hurts, seconds: (tree.physicsFrames - f0) / 60 };
}

/** Attempts until the first win (at most `max`); the attempts played. */
async function untilWin(scene: keyof typeof BOSS_ARENAS, max: number): Promise<Attempt[]> {
  const out: Attempt[] = [];
  for (let k = 0; k < max; k++) {
    const a = await attempt(scene, k);
    out.push(a);
    if (a.won) break;
  }
  console.info(`[boss bot] ${scene}: ${out.map((a) => `${a.won ? 'WON' : 'lost'} ${a.hits}/8 hits, ${a.hurts} hurts, ${a.seconds.toFixed(0)} s`).join('; ')}`);
  return out;
}

const CASES: { scene: keyof typeof BOSS_ARENAS; attempts: number }[] = [
  { scene: 'boss:rug_pull', attempts: 3 },
  { scene: 'boss:library_demon', attempts: 3 },
  { scene: 'boss:broccoli_head', attempts: 3 },
  { scene: 'boss:the_executive', attempts: 5 },
];

describe('boss bot (honest: no top-ups)', () => {
  const firstWin: Record<string, number> = {};

  it.each(CASES)('beats $scene within $attempts attempts', async ({ scene, attempts }) => {
    const runs = await untilWin(scene, attempts);
    expect(runs.at(-1)!.won).toBe(true);
    firstWin[scene] = runs.length;
  }, 1_800_000);

  it('the Executive takes the most attempts', () => {
    const exec = firstWin['boss:the_executive'];
    expect(exec).toBeDefined();
    for (const c of CASES) if (firstWin[c.scene] !== undefined) expect(firstWin[c.scene]!).toBeLessThanOrEqual(exec!);
  });

  it.each(CASES)('a player who walks in and stands still loses to $scene', async ({ scene }) => {
    const a = await attempt(scene, 0, true);
    expect(a.won).toBe(false);
    expect(a.hits).toBe(0);
  }, 300_000);
});
