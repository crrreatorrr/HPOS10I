// Slope factor, rolling on slopes and slipping off steep slopes.

import { afterEach, describe, it } from 'vitest';
import type { Player } from '../../src/player/player';
import { degToRad } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { checked, type Checks } from '../helpers/check';
import {
  addFloor,
  addPolygon,
  addSlope,
  centreInTerrain,
  feetY,
  newWorld,
  press,
  release,
  releaseAll,
  settle,
  spawnPlayer,
  step,
} from '../helpers/world';

let world: Node2D;
let player: Player;
const sin = (d: number) => Math.sin(degToRad(d));
const tan = (d: number) => Math.tan(degToRad(d));

afterEach(() => releaseAll());

/** Puts the player on a straight slope through the origin. */
function onSlope(angle: number, x = 0): void {
  world = newWorld();
  addSlope(world, angle);
  const feet = new Vec2(x, -x * tan(angle) - 2);
  player = spawnPlayer(world, feet);
  settle(player, feet);
}

/**
 * A crest (up) or valley of two straight sides meeting at a sharp vertex,
 * `height` px high or deep, starting at x 100 on a flat floor at y 0.
 * Returns the x where it ends.
 */
function sharpShape(leftDeg: number, rightDeg: number, height: number, up: boolean): number {
  const x1 = 100 + height / tan(leftDeg);
  const x2 = x1 + height / tan(rightDeg);
  const tip = new Vec2(x1, up ? -height : height);
  if (up) {
    addFloor(world);
    addPolygon(world, [new Vec2(100, 0), tip, new Vec2(x2, 0)]);
  } else {
    addFloor(world, -3000, 100);
    addFloor(world, x2, 3000);
    addPolygon(world, [new Vec2(100, 0), tip, new Vec2(x2, 0), new Vec2(x2, 300), new Vec2(100, 300)]);
  }
  return x2;
}

function runOverSharpShapes(c: Checks, up: boolean): void {
  for (const sides of [
    [45, 45],
    [45, 22.5],
    [26.6, 26.6],
  ] as const) {
    for (const dir of [1, -1]) {
      for (const speed of [2, 4, 6, 10, 16]) {
        world = newWorld();
        const far = sharpShape(sides[0], sides[1], 24, up);
        const start = new Vec2(dir > 0 ? 0 : far + 100, 0);
        player = spawnPlayer(world, start);
        settle(player, start);
        player.groundSpeed = speed * dir;
        const action = dir > 0 ? 'move_right' : 'move_left';
        press(action);
        const label = `${up ? 'crest' : 'valley'} ${sides[0]}/${sides[1]} dir ${dir} speed ${speed}`;
        let worst = 0;
        let last = Math.abs(player.groundSpeed);
        for (let i = 0; i < 120; i++) {
          step(1);
          if (player.grounded) worst = Math.max(worst, last - Math.abs(player.groundSpeed));
          last = Math.abs(player.groundSpeed);
        }
        release(action);
        // Holding forward, a frame can lose at most the slope factor on 45 deg.
        c.true(worst <= 0.125 * sin(45) + 0.001, `${label}: lost ${worst} px/frame in one frame`);
        const past = dir > 0 ? player.globalPosition.x > far + 20 : player.globalPosition.x < 80;
        c.true(past && player.grounded, `${label}: got over (x ${player.globalPosition.x})`);
      }
    }
  }
}

const V_DEPTH = 64;

/** A sharp V of `sideDeg` sides, V_DEPTH deep, between two floors at the top. Returns [vertex x, half width]. */
function vValley(sideDeg: number): [number, number] {
  world = newWorld();
  const half = V_DEPTH / tan(sideDeg);
  addFloor(world, -3000, 0, -V_DEPTH);
  addPolygon(world, [new Vec2(0, -V_DEPTH), new Vec2(half, 0), new Vec2(2 * half, -V_DEPTH), new Vec2(2 * half, 300), new Vec2(0, 300)]);
  addFloor(world, 2 * half, 3000, -V_DEPTH);
  return [half, half];
}

/** Drops Sproto into the V and waits for him to come to rest at the bottom. */
function restInV(c: Checks, sideDeg: number): [number, number] {
  const v = vValley(sideDeg);
  player = spawnPlayer(world, new Vec2(-100, -V_DEPTH));
  settle(player, new Vec2(-100, -V_DEPTH));
  player.respawnAt(new Vec2(v[0] - 3, -40));
  let still = 0;
  for (let i = 0; i < 900; i++) {
    step(1);
    still = player.grounded && player.state === 'idle' ? still + 1 : 0;
    if (still >= 10) break;
  }
  c.true(still >= 10, `${sideDeg} deg V: at rest at the bottom (${player.state})`);
  c.eq(player.groundAngle, 0, `${sideDeg} deg V: settled flat`);
  return v;
}

/** Out = standing on the floor at the top, at or beyond the V's rim. */
function assertOutOfV(c: Checks, v: [number, number], label: string): void {
  c.true(player.grounded && Math.abs(feetY(player) + V_DEPTH) < 0.1, `${label}: on the floor at the top (feet ${feetY(player)}, x ${player.globalPosition.x})`);
  c.true(Math.abs(player.globalPosition.x - v[0]) >= v[1] - player.getRadii().x, `${label}: at or beyond the rim (x ${player.globalPosition.x}, vertex ${v[0]})`);
}

/**
 * Rolls or runs into a sharp flat-to-`slopeDeg` corner at every speed and
 * sub-step phase; the loss per frame near the corner must stay within the
 * slope factor (plus friction).
 */
function sharpCornerOntoSlope(c: Checks, slopeDeg: number): void {
  const s = sin(slopeDeg);
  for (const roll of [true, false]) {
    const bound = roll ? 0.078125 * s + 0.0234375 : 0.125 * s + 0.046875;
    for (const speed of [2, 4, 6, 8, 10, 12]) {
      for (let phase = 0; phase < 8; phase++) {
        world = newWorld();
        addFloor(world, -3000, 200);
        const rise = 200 * tan(slopeDeg);
        addPolygon(world, [new Vec2(200, 0), new Vec2(400, -rise), new Vec2(400, 300), new Vec2(200, 300)]);
        addFloor(world, 400, 3000, -rise);
        const start = new Vec2(130 - phase, 0);
        player = spawnPlayer(world, start);
        settle(player, start);
        player.groundSpeed = speed;
        if (roll) {
          press('move_down');
          step(1);
          release('move_down');
        }
        let worst = 0;
        let last = Math.abs(player.groundSpeed);
        for (let i = 0; i < 30; i++) {
          step(1);
          if (player.globalPosition.x > 170 && player.globalPosition.x < 240) worst = Math.max(worst, last - Math.abs(player.groundSpeed));
          last = Math.abs(player.groundSpeed);
        }
        c.true(worst <= bound + 0.001, `${slopeDeg} deg ${roll ? 'roll' : 'run'} at ${speed} px/f, phase ${phase}: lost ${worst} in a frame`);
      }
    }
  }
}

describe('slopes', () => {
  it(
    'running uphill slows by the slope factor',
    checked((c) => {
      onSlope(22);
      c.true(player.grounded, 'on the slope');
      c.near(player.groundAngle, 22, 0.01, 'slope angle');
      player.groundSpeed = 4;
      step(1);
      const before = player.groundSpeed;
      step(1);
      c.near(player.groundSpeed - before, -0.125 * sin(22) - 0.046875, 1e-6, 'uphill: slope factor + friction');
    }),
  );

  it(
    'running downhill speeds up',
    checked((c) => {
      onSlope(22);
      player.groundSpeed = -2;
      press('move_left');
      step(1);
      const before = player.groundSpeed;
      step(1);
      const expected = -0.125 * sin(22) - 0.046875;
      c.near(player.groundSpeed - before, expected, 1e-6, 'downhill: slope factor adds to acceleration');
      c.true(Math.abs(expected) > 0.046875, 'faster than on flat ground');
    }),
  );

  it(
    'rolling uses the up and down factors',
    checked((c) => {
      onSlope(22);
      const s = sin(22);
      player.groundSpeed = 6;
      press('move_down');
      step(1);
      release('move_down');
      c.eq(player.state, 'roll', 'rolling');
      let before = player.groundSpeed;
      step(1);
      c.near(player.groundSpeed - before, -0.078125 * s - 0.0234375, 1e-6, 'rolling uphill');
      player.groundSpeed = -6;
      step(1);
      before = player.groundSpeed;
      step(1);
      c.near(player.groundSpeed - before, -0.3125 * s + 0.0234375, 1e-6, 'rolling downhill');
    }),
  );

  it(
    'standing on a gentle slope does not slip',
    checked((c) => {
      onSlope(22);
      const x = player.globalPosition.x;
      step(120);
      c.true(player.grounded, 'still grounded');
      c.eq(player.groundSpeed, 0, 'not sliding');
      c.near(player.globalPosition.x, x, 0.001, 'did not move');
      c.eq(player.controlLock, 0, 'no slip lock');
    }),
  );

  it(
    'standing on a steep slope slips',
    checked((c) => {
      onSlope(55);
      const x = player.globalPosition.x;
      let locked = false;
      for (let i = 0; i < 60; i++) {
        step(1);
        locked = locked || player.controlLock > 0;
      }
      c.true(locked, 'slipping locks control');
      c.true(player.globalPosition.x < x - 20, `slid down the slope (${x} -> ${player.globalPosition.x})`);
    }),
  );

  it(
    'standing on a very steep slope falls',
    checked((c) => {
      onSlope(75);
      let detached = false;
      for (let i = 0; i < 30; i++) {
        step(1);
        detached = detached || !player.grounded;
      }
      c.true(detached, 'detached and fell off a 75 degree slope');
    }),
  );

  it(
    'slow run up a steep slope slips back',
    checked((c) => {
      world = newWorld();
      addFloor(world, -2000, 0);
      addSlope(world, 55, 300);
      player = spawnPlayer(world, new Vec2(-60, 0));
      settle(player, new Vec2(-60, 0));
      player.groundSpeed = 4;
      let top = 0;
      for (let i = 0; i < 240; i++) {
        step(1);
        top = Math.min(top, feetY(player));
      }
      c.true(top < -5, 'got some way up');
      c.true(top > -150, 'but not over the top');
      c.true(player.globalPosition.x < 0, 'came back down');
    }),
  );

  it(
    'sharp crests keep speed',
    checked((c) => runOverSharpShapes(c, true)),
  );

  it(
    'sharp valleys keep speed',
    checked((c) => runOverSharpShapes(c, false)),
  );

  // Running into a V at 8 px/f carries him out the far side up to 55 degree
  // sides. On 60 degrees and steeper he leaves the lip, lands on the far side
  // and the steep landing sends him back down (the classic bands), so the
  // bounces die out at the bottom and he must jump or spin dash out; he must
  // never end up inside the terrain.
  it(
    'V valleys: run out with momentum',
    checked((c) => {
      for (let side = 30; side < 75; side += 5) {
        for (const dir of [1, -1]) {
          const v = vValley(side);
          const start = new Vec2(dir > 0 ? -150 : 2 * v[1] + 150, -V_DEPTH);
          player = spawnPlayer(world, start);
          settle(player, start);
          player.groundSpeed = 8 * dir;
          const action = dir > 0 ? 'move_right' : 'move_left';
          press(action);
          let buried = false;
          for (let i = 0; i < 90; i++) {
            step(1);
            buried = buried || centreInTerrain(player);
          }
          release(action);
          step(20);
          const label = `${side} deg V running dir ${dir}`;
          if (side < 60) assertOutOfV(c, v, label);
          else {
            // The bounces die out: at rest at the bottom within 10 s.
            for (let i = 0; i < 600; i++) {
              step(1);
              buried = buried || centreInTerrain(player);
              if (player.grounded && player.state === 'idle') break;
            }
            c.true(player.grounded && player.state === 'idle', `${label}: comes to rest in the V (${player.state} ${player.globalPosition})`);
          }
          c.true(!buried, `${label}: never inside the terrain`);
        }
      }
    }),
  );

  it(
    'V valleys: jump out',
    checked((c) => {
      for (let side = 30; side < 75; side += 5) {
        const v = restInV(c, side);
        press('move_right');
        press('jump');
        step(100);
        release('jump');
        release('move_right');
        step(40);
        assertOutOfV(c, v, `${side} deg V jump`);
      }
    }),
  );

  it(
    'V valleys: spin dash out',
    checked((c) => {
      for (let side = 30; side < 75; side += 5) {
        const v = restInV(c, side);
        press('move_down');
        step(2);
        for (let i = 0; i < 3; i++) {
          press('jump');
          step(2);
          release('jump');
          step(2);
        }
        c.eq(player.state, 'spindash', `${side} deg V: spin dash charging`);
        release('move_down');
        step(150);
        assertOutOfV(c, v, `${side} deg V spin dash`);
      }
    }),
  );

  it(
    'sharp corner onto 45 degrees keeps speed',
    checked((c) => sharpCornerOntoSlope(c, 45)),
  );

  it(
    'sharp corner onto 26 degrees keeps speed',
    checked((c) => sharpCornerOntoSlope(c, 26.6)),
  );
});
