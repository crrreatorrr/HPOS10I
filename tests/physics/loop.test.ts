// Full loop traversal with path switching (src/terrain/loop.ts).

import { afterEach, describe, it } from 'vitest';
import { Tuning } from '../../src/core/tuning';
import { CEILING, LEFT_WALL, PATH_A, PATH_B, RIGHT_WALL, type Player } from '../../src/player/player';
import { wrapf } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import type { TerrainLoop } from '../../src/terrain/loop';
import { checked, type Checks } from '../helpers/check';
import { addFloor, addLoop, centreInTerrain, feetY, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

/** TerrainLoop's smallest radius (MIN_RADIUS in loop.ts). */
const LOOP_MIN_RADIUS = 48;
const radToDeg = (r: number) => (r * 180) / Math.PI;

let world: Node2D;
let player: Player;
let loop: TerrainLoop;

afterEach(() => releaseAll());

function setup(startX: number): void {
  world = newWorld();
  addFloor(world, -3000, 3000);
  loop = addLoop(world, Vec2.ZERO);
  player = spawnPlayer(world, new Vec2(startX, 0));
  settle(player, new Vec2(startX, 0));
}

/** Runs until the player passes `goalX` in `direction` (or the limit). */
function run(direction: number, goalX: number, limit = 600): { modes: Set<number>; airborne: boolean } {
  const modes = new Set<number>();
  let airborne = false;
  for (let i = 0; i < limit; i++) {
    step(1);
    modes.add(player.collisionMode);
    airborne = airborne || !player.grounded;
    if (player.globalPosition.x * direction > goalX * direction) break;
  }
  return { modes, airborne };
}

function exitX(): number {
  return loop.radius + loop.thickness + loop.floorMargin + 40;
}

/** Holds `direction` until Sproto is on the floor beside the loop (or the limit). Returns whether his centre ever entered terrain. */
function runDownTheOutside(direction: number): boolean {
  const action = direction > 0 ? 'move_right' : 'move_left';
  press(action);
  let buried = false;
  for (let i = 0; i < 360; i++) {
    step(1);
    buried = buried || centreInTerrain(player);
    if (player.grounded && Math.abs(feetY(player)) < 0.05 && Math.abs(player.globalPosition.x) > loop.radius + loop.thickness) break;
  }
  release(action);
  return buried;
}

function assertOnTheFloorBeside(c: Checks, label: string): void {
  c.true(player.grounded, `${label}: grounded`);
  c.near(feetY(player), 0, 0.05, `${label}: feet on the floor`);
  c.true(Math.abs(player.globalPosition.x) > loop.radius + loop.thickness, `${label}: beside the loop, not under it (${player.globalPosition})`);
}

/**
 * Runs the loop at `radius` for every speed, direction and entry phase. Each
 * run must exit on the far side on path A without leaving the ground, and the
 * grounded angle may only step by the motion along the curve plus the A/B
 * swap (and a margin): a polygon-vertex normal spike is ~110 deg.
 */
function sweep(c: Checks, radius: number, speeds: number[], phases: number[]): void {
  const swap = radToDeg(2 * Math.asin(Tuning.physics.width_radius / (radius - 19)));
  for (const speed of speeds) {
    for (const dir of [1, -1]) {
      for (const phase of phases) {
        world = newWorld();
        addFloor(world, -5000, 5000);
        loop = addLoop(world, Vec2.ZERO);
        loop.radius = radius;
        loop.layout();
        const start = new Vec2(-(radius + 300 + phase) * dir, 0);
        player = spawnPlayer(world, start);
        settle(player, start);
        player.groundSpeed = speed * dir;
        const action = dir > 0 ? 'move_right' : 'move_left';
        press(action);
        const label = `radius ${radius} speed ${speed} dir ${dir} phase ${phase}`;
        let last = player.groundAngle;
        let worst = 0;
        let airborne = false;
        let done = false;
        for (let i = 0; i < 600; i++) {
          step(1);
          if (player.grounded) {
            const s = Math.abs(wrapf(player.groundAngle - last, -180, 180));
            const motion = radToDeg(Math.abs(player.groundSpeed) / (radius - 19));
            worst = Math.max(worst, s - motion);
          }
          airborne = airborne || !player.grounded;
          last = player.groundAngle;
          if (player.globalPosition.x * dir > exitX()) {
            done = true;
            break;
          }
        }
        release(action);
        c.true(worst < swap + 8, `${label}: angle step ${worst} deg beyond the motion`);
        c.true(done && !airborne, `${label}: exited ${done}, airborne ${airborne}`);
        c.eq(player.collisionPath, PATH_A, `${label}: path A after the loop;`);
      }
    }
  }
}

describe('loop', () => {
  it(
    'loop at top speed left to right',
    checked((c) => {
      setup(-500);
      player.groundSpeed = 6;
      press('move_right');
      const r = run(1, exitX());
      for (const m of [RIGHT_WALL, CEILING, LEFT_WALL]) c.true(r.modes.has(m), `passed through mode ${m}`);
      c.true(!r.airborne, 'never left the ground');
      c.true(player.globalPosition.x > exitX(), 'exited on the far side');
      c.true(player.grounded, 'grounded after the loop');
      c.true(player.groundSpeed > 0, 'moving right');
      c.eq(player.collisionPath, PATH_A, 'back on path A');
    }),
  );

  it(
    'loop right to left',
    checked((c) => {
      setup(500);
      player.groundSpeed = -6;
      press('move_left');
      const r = run(-1, -exitX());
      for (const m of [RIGHT_WALL, CEILING, LEFT_WALL]) c.true(r.modes.has(m), `passed through mode ${m}`);
      c.true(!r.airborne, 'never left the ground');
      c.true(player.globalPosition.x < -exitX(), 'exited on the far side');
      c.true(player.grounded && player.groundSpeed < 0, 'grounded and moving left');
      c.eq(player.collisionPath, PATH_A, 'back on path A');
    }),
  );

  it(
    'loop after a spin dash',
    checked((c) => {
      setup(-400);
      press('move_down');
      step(2);
      // Six presses on the second tick of each pair (the Godot harness saw a
      // press one tick late), the last one right before down is released.
      for (let i = 0; i < 6; i++) {
        step(1);
        press('jump');
        step(1);
        release('jump');
      }
      release('move_down');
      step(1);
      c.near(player.groundSpeed, 12, 1e-6, 'spin dash');
      const r = run(1, exitX());
      for (const m of [RIGHT_WALL, CEILING, LEFT_WALL]) c.true(r.modes.has(m), `passed through mode ${m}`);
      c.true(!r.airborne, 'never left the ground');
      c.true(player.globalPosition.x > exitX() && player.grounded, 'rolled out the far side');
    }),
  );

  it(
    'too slow falls off the loop',
    checked((c) => {
      setup(-100);
      // Enough to climb past the 69 degree fall angle, too little to get round.
      player.groundSpeed = 7;
      let climbed = false;
      let fell = false;
      for (let i = 0; i < 400; i++) {
        step(1);
        if (player.grounded && player.collisionMode === RIGHT_WALL) climbed = true;
        if (climbed && !player.grounded) fell = true;
      }
      c.true(climbed, 'started up the loop');
      c.true(fell, 'detached and fell');
      c.true(player.globalPosition.x < loop.radius, 'did not get round');
      c.true(player.grounded, 'back on the floor');
    }),
  );

  it(
    'ground angle is smooth around the loop',
    checked((c) => {
      setup(-500);
      player.groundSpeed = 6;
      press('move_right');
      let last = player.groundAngle;
      let largestStep = 0;
      let unwrapped = 0;
      for (let i = 0; i < 400; i++) {
        step(1);
        const s = wrapf(player.groundAngle - last, -180, 180);
        last = player.groundAngle;
        unwrapped += s;
        largestStep = Math.max(largestStep, Math.abs(s));
        c.true(s >= -0.5, `angle never steps backwards (${s} at frame ${i})`);
        if (player.globalPosition.x > exitX()) break;
      }
      c.near(unwrapped, 360, 1, 'turned a full circle');
      // Where the nearer of A/B swaps (at 90, 180 and 270 degrees) the reading
      // jumps by about 2 * asin(width / radius), as in the classic games.
      const swap = radToDeg(2 * Math.asin(Tuning.physics.width_radius / (loop.radius - 19))) + 2.5;
      c.true(largestStep < swap, `no angle jumps beyond the A/B swap (largest ${largestStep})`);
    }),
  );

  it(
    'jump into a steep ceiling attaches',
    checked((c) => {
      setup(-500);
      // Inside the loop under its upper-right part (surface angle about 127 degrees).
      player.respawnAt(new Vec2(loop.radius * 0.8, -loop.radius));
      player.velocity = new Vec2(0, -8);
      for (let i = 0; i < 30; i++) {
        step(1);
        if (player.grounded) break;
      }
      c.true(player.grounded, 'landed on the ceiling');
      c.true(player.groundAngle > 90 && player.groundAngle < 135, `steep ceiling angle (${player.groundAngle})`);
      c.true(player.groundSpeed > 0, 'upward speed carried along the ceiling');
    }),
  );

  it(
    'running off the top goes down the outside',
    checked((c) => {
      // Matching paths (A right, B left) use the hill feet; the others drop off
      // at the equator. Either way Sproto ends on the floor beside the loop.
      for (const [dir, path] of [
        [1, PATH_A],
        [-1, PATH_B],
        [1, PATH_B],
        [-1, PATH_A],
      ] as const) {
        for (const speed of [3, 8, 16]) {
          setup(-600);
          player.respawnAt(new Vec2(0, -2 * loop.radius - loop.thickness - 40));
          player.setCollisionPath(path);
          for (let i = 0; i < 60; i++) {
            step(1);
            if (player.grounded) break;
          }
          c.true(player.grounded, 'landed on the loop top');
          player.groundSpeed = speed * dir;
          const label = `dir ${dir} path ${path} speed ${speed}`;
          const buried = runDownTheOutside(dir);
          c.true(!buried, `${label}: never inside terrain`);
          assertOnTheFloorBeside(c, label);
        }
      }
    }),
  );

  it(
    'jump onto the loop top and run off',
    checked((c) => {
      for (const direction of [1, -1]) {
        setup(-600);
        // Mid-jump, rising towards the top of the loop from one side.
        player.respawnAt(new Vec2(-60 * direction, -2 * loop.radius - loop.thickness - 50));
        player.velocity = new Vec2(2 * direction, -3);
        let landed = false;
        for (let i = 0; i < 90; i++) {
          step(1);
          if (player.grounded) {
            landed = true;
            break;
          }
        }
        c.true(landed && feetY(player) < -2 * loop.radius, 'landed on top of the loop');
        const buried = runDownTheOutside(direction);
        c.true(!buried, `dir ${direction}: never inside terrain`);
        assertOnTheFloorBeside(c, `jump, dir ${direction}`);
      }
    }),
  );

  it(
    'minimum radius loop always exits',
    checked((c) => sweep(c, LOOP_MIN_RADIUS, [8, 10, 12, 16], [0, 3, 7])),
  );

  it(
    'loop angle never spikes, radius 64',
    checked((c) => sweep(c, 64, [8, 12, 16], [0, 2.5, 5, 7.5])),
  );

  it(
    'loop angle never spikes, radius 80',
    checked((c) => sweep(c, 80, [8, 12, 16], [0, 2.5, 5, 7.5])),
  );

  it(
    'loop angle never spikes, radius 112',
    checked((c) => sweep(c, 112, [8, 12, 16], [0, 3.5, 7])),
  );

  it(
    'loop angle never spikes, radius 200',
    checked((c) => sweep(c, 200, [8, 12, 16], [0, 5])),
  );

  it(
    'vertex graze normal is rejected',
    checked((c) => {
      // The QA case: entering a radius-64 loop at 10 px/frame from x -400, the B
      // ray grazed an arc vertex and reported an internal edge's normal (125 deg).
      world = newWorld();
      addFloor(world, -5000, 5000);
      loop = addLoop(world, Vec2.ZERO);
      loop.radius = 64;
      loop.layout();
      player = spawnPlayer(world, new Vec2(-400, 0));
      settle(player, new Vec2(-400, 0));
      player.groundSpeed = 10;
      press('move_right');
      let last = player.groundAngle;
      for (let i = 0; i < 60; i++) {
        step(1);
        c.true(Math.abs(wrapf(player.groundAngle - last, -180, 180)) < 40, `frame ${i}: angle ${last} -> ${player.groundAngle}`);
        last = player.groundAngle;
      }
    }),
  );
});
