// QA: nothing in or around a loop can trap Sproto (port of
// tests/qa/test_loop_escape.gd, BUG-02-01 and its cousins). Each scenario
// puts him somewhere awkward, then a player holds ONE direction for 8 s: left,
// or right (two separate tries from the same start). He must leave the loop's
// footprint with each of them, and never end up inside terrain.

import { afterEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import type { Player } from '../../src/player/player';
import type { Action } from '../../src/runtime/input';
import { Vec2 } from '../../src/runtime/vec2';
import type { TerrainLoop } from '../../src/terrain/loop';
import { checked } from '../helpers/check';
import { qa } from '../helpers/qa';
import { centreInTerrain, press, release, releaseAll, step } from '../helpers/world';

/** Long enough to rock once and walk out after the turn back. */
const HOLD_FRAMES = 480;

type Setup = (p: Player) => void;

afterEach(() => {
  GameState.tickets = 0;
  releaseAll();
});

/** Half the loop's footprint (as the level lint measures it). */
function halfFootprint(l: TerrainLoop): number {
  const foot = Math.min(l.footRadius, l.radius);
  return l.radius + l.thickness + Math.max(l.floorMargin, foot + 64);
}

/** A floor with one loop at x = 0; returns its half footprint. */
function world(radius: number): { w: ReturnType<typeof qa.world>; half: number } {
  const w = qa.world();
  qa.floorAt(w, -4000, 4000);
  const l = qa.loop(w, Vec2.ZERO, radius);
  step(2);
  return { w, half: halfFootprint(l) };
}

/** Runs `setup`, then holds `hold` for HOLD_FRAMES. Returns '' when he left the footprint, else a description. */
function attempt(radius: number, label: string, setup: Setup, hold: Action): string {
  const { w, half } = world(radius);
  const p = qa.spawn(w, new Vec2(-half - 300, 0));
  setup(p);
  press(hold);
  let out = false;
  let insideTerrain = false;
  for (let i = 0; i < HOLD_FRAMES; i++) {
    step(1);
    if (centreInTerrain(p)) insideTerrain = true;
    if (Math.abs(p.globalPosition.x) > half) {
      out = true;
      break;
    }
  }
  release(hold);
  if (insideTerrain) return `${label} r${radius}: inside terrain while holding ${hold}`;
  if (!out) return `${label} r${radius}: still in the loop after ${HOLD_FRAMES} frames of ${hold} at ${p.globalPosition} path ${p.collisionPath} state ${p.state}`;
  return '';
}

/** Holding EITHER direction must walk him out, at every radius. */
function scenario(radius: number, label: string, setup: Setup): string[] {
  const out: string[] = [];
  for (const hold of ['move_left', 'move_right'] as const) {
    releaseAll();
    const r = attempt(radius, label, setup, hold);
    if (r !== '') out.push(r);
  }
  return out;
}

// --- Setups ---------------------------------------------------------------------

const drop =
  (at: Vec2): Setup =>
  (p) => {
    p.respawnAt(at);
    step(90);
  };

const groundEntry =
  (fromLeft: boolean, speed: number, roll: boolean, half: number): Setup =>
  (p) => {
    const dir = fromLeft ? 1 : -1;
    p.respawnAt(new Vec2(-dir * (half + 40), -19));
    step(2);
    p.groundSpeed = dir * speed;
    if (roll) {
      press('move_down');
      step(1);
      release('move_down');
    }
    step(150);
  };

const spindashInside =
  (dir: number): Setup =>
  (p) => {
    p.respawnAt(new Vec2(0, -19));
    step(10);
    const turn = dir < 0 ? 'move_left' : 'move_right';
    press(turn);
    step(1);
    release(turn);
    press('move_down');
    step(2);
    for (let i = 0; i < 4; i++) {
      press('jump');
      step(2);
      release('jump');
      step(2);
    }
    release('move_down');
    step(120);
  };

const hurtInside =
  (sourceX: number): Setup =>
  (p) => {
    p.respawnAt(new Vec2(0, -19));
    step(10);
    GameState.tickets = 5; // a knockback, not a death
    p.hurt(new Vec2(sourceX, -19));
    step(120);
  };

const jumpIn =
  (fromLeft: boolean, takeoff: number): Setup =>
  (p) => {
    const dir = fromLeft ? 1 : -1;
    p.respawnAt(new Vec2(-dir * (takeoff + 240), -19));
    step(2);
    p.groundSpeed = dir * 6;
    const hold = fromLeft ? 'move_right' : 'move_left';
    press(hold);
    step(40);
    press('jump');
    step(8);
    release('jump');
    // Keep running the way he jumped, like a player would, until he settles.
    step(150);
    release(hold);
  };

// --- Groups ---------------------------------------------------------------------

function drops(radius: number, inside: boolean): string[] {
  const { half } = world(radius);
  const spots = inside
    ? [new Vec2(0, -2 * radius + 40), new Vec2(0, -19), new Vec2(-radius * 0.5, -19 - radius * 0.1), new Vec2(radius * 0.5, -19 - radius * 0.1)]
    : [new Vec2(-(radius + 30), -120), new Vec2(radius + 30, -120), new Vec2(-half + 20, -60), new Vec2(half - 20, -60)];
  return spots.flatMap((spot) => scenario(radius, `drop/respawn at ${spot}`, drop(spot)));
}

function entries(radius: number, fromLeft: boolean): string[] {
  const { half } = world(radius);
  const fails: string[] = [];
  for (const speed of [1.5, 3, 4.5]) {
    for (const roll of [false, true]) {
      fails.push(...scenario(radius, `slow ${roll ? 'roll' : 'run'} entry ${speed} px/f from the ${fromLeft ? 'left' : 'right'}`, groundEntry(fromLeft, speed, roll, half)));
    }
  }
  return fails;
}

function insideActions(radius: number): string[] {
  const fails: string[] = [];
  for (const dir of [-1, 1]) {
    fails.push(...scenario(radius, `spin dash inside, dir ${dir}`, spindashInside(dir)));
    fails.push(...scenario(radius, `hurt inside from ${dir < 0 ? 'left' : 'right'}`, hurtInside(dir * 30)));
  }
  return fails;
}

function jumpsIn(radius: number, fromLeft: boolean): string[] {
  return [radius * 0.5, radius * 1.2, radius * 2, radius * 3].flatMap((takeoff) =>
    scenario(radius, `jump in from the ${fromLeft ? 'left' : 'right'}, take-off ${takeoff} px out`, jumpIn(fromLeft, takeoff)),
  );
}

describe('QA loop escape', { timeout: 60000 }, () => {
  for (const radius of [48, 112, 80, 200]) {
    it(
      `r${radius}: drops inside`,
      checked((c) => drops(radius, true).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: drops on the feet and edges`,
      checked((c) => drops(radius, false).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: slow entries from the left`,
      checked((c) => entries(radius, true).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: slow entries from the right`,
      checked((c) => entries(radius, false).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: spin dash and hurt inside`,
      checked((c) => insideActions(radius).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: jumps in from the left`,
      checked((c) => jumpsIn(radius, true).forEach((f) => c.fail(f))),
    );
    it(
      `r${radius}: jumps in from the right`,
      checked((c) => jumpsIn(radius, false).forEach((f) => c.fail(f))),
    );
  }
});
