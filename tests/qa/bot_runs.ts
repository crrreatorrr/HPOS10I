// Shared by the playtest tests: the bot variants played on every act and the
// median clear time over the runs that finished within the time limit.

import { ZoneRegistry } from '../../src/core/zone_registry';
import { TIME_LIMIT } from '../../src/levels/content';
import { loadLevelData, zoneActs, type ActInfo } from '../../tools/qa/level_lint';
import { playAct, summaryLine, type BotResult, type Policy } from '../../tools/qa/playtest_bot';

/** The runner variants of difficulty_bot.sh (jump every 45/90/150/240 frames and never), and the pilot. */
export const VARIANTS: [Policy, number][] = [
  ['runner', 45],
  ['runner', 90],
  ['runner', 150],
  ['runner', 240],
  ['runner', 0],
  ['pilot', 0],
  ['pilot', 150],
];

export interface ActRuns {
  act: ActInfo;
  runs: BotResult[];
  /** Median clear time (s, frames since the act start / 60) of the runs that finished in time; null = none. */
  median: number | null;
}

export const log = (line: string): void => void process.stderr.write(`${line}\n`);

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export const released = (a: ActInfo): boolean => ZoneRegistry.isReleased(a.zone);
export const finishedInTime = (r: BotResult): boolean => r.completed && !r.timeOver && r.levelTime < TIME_LIMIT;

/**
 * The acts the QA bot plays: the ones with a level file. Zone 4 is built in
 * code around timed platforms and reverse runs the QA pilot does not know;
 * its own route pilot plays it in tests/levels/z4.test.ts (with and without
 * the shipped hooks). The level lint covers it.
 */
export function botActs(): ActInfo[] {
  return zoneActs().filter((a) => !a.code);
}

/** Plays every act with every variant. */
export async function playAll(itemBoxes: boolean): Promise<ActRuns[]> {
  const out: ActRuns[] = [];
  for (const act of botActs()) {
    const runs: BotResult[] = [];
    for (const [policy, jumpEvery] of VARIANTS) {
      runs.push(await playAct({ data: loadLevelData(act.file), zone: act.zone, stage: act.stage, policy, jumpEvery, itemBoxes }));
    }
    const times = runs.filter(finishedInTime).map((r) => r.completedFrame / 60);
    out.push({ act, runs, median: times.length ? median(times) : null });
  }
  return out;
}

export function report(title: string, results: ActRuns[]): void {
  log(title);
  for (const r of results) {
    log(`  ${r.act.label} (D${r.act.d})${released(r.act) ? '' : ' [not released: reported only]'}: median clear ${r.median === null ? 'none' : `${r.median.toFixed(1)} s`}`);
    for (const run of r.runs) log(`    ${summaryLine(r.act.label, run)}`);
  }
}

/** Acts (D >= 1, released) whose median clear time is not above the act before them. */
export function orderProblems(results: ActRuns[]): string[] {
  const curve = results.filter((r) => released(r.act) && r.act.d >= 1).sort((a, b) => a.act.d - b.act.d);
  const problems: string[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!;
    const cur = curve[i]!;
    if (cur.median === null || prev.median === null) problems.push(`${cur.act.label} or ${prev.act.label}: no finished run`);
    else if (cur.median <= prev.median) problems.push(`${cur.act.label} (D${cur.act.d}, ${cur.median.toFixed(1)} s) clears no slower than ${prev.act.label} (D${prev.act.d}, ${prev.median.toFixed(1)} s)`);
  }
  return problems;
}
