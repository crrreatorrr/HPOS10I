// Ground movement on flat floor: acceleration, deceleration, friction,
// skidding, rolling, spin dash and walls.

import { afterEach, describe, it } from 'vitest';
import { Tuning } from '../../src/core/tuning';
import type { Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked, type Checks } from '../helpers/check';
import { addFloor, addRect, feetY, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

let world: Node2D;
let player: Player;

function flat(feet = Vec2.ZERO): void {
  world = newWorld();
  addFloor(world);
  player = spawnPlayer(world, feet);
  settle(player, feet);
}

afterEach(() => releaseAll());

/**
 * Presses jump `count` times, one press every other frame, while crouched in
 * a spin dash. The Godot harness saw a test's press one tick late, so each
 * press landed on the second tick of its pair (the last one right before the
 * caller releases down); the same tick timeline is reproduced here.
 */
function charge(count: number): void {
  press('move_down');
  step(2);
  step(1);
  press('jump');
  step(1);
  release('jump');
  for (let i = 0; i < count; i++) {
    step(1);
    press('jump');
    step(1);
    release('jump');
  }
}

/** Rolls Sproto into a 32 px dead end closed by a wall on `side` (1 right, -1 left); returns once at the wall. */
function intoLowDeadEnd(c: Checks, side: number): void {
  world = newWorld();
  addFloor(world);
  // Tunnel from x 100 to 400 (mirrored for the left), closed at the far end.
  addRect(world, new Rect2(side > 0 ? 100 : -400, -332, 300, 300));
  addRect(world, new Rect2(side > 0 ? 400 : -500, -400, 100, 400));
  player = spawnPlayer(world, Vec2.ZERO);
  settle(player, Vec2.ZERO);
  player.groundSpeed = 4 * side;
  press('move_down');
  step(1);
  release('move_down');
  for (let i = 0; i < 400; i++) {
    step(1);
    if (Math.abs(player.globalPosition.x) > 380) break;
  }
  c.eq(player.state, 'roll', `side ${side}: rolled into the dead end`);
  c.true(Math.abs(player.globalPosition.x) > 380, `side ${side}: at the end wall`);
}

function assertOutAndStanding(c: Checks, side: number, label: string): void {
  c.true(player.globalPosition.x * side < 100 - 9, `${label}: out of the tunnel (x ${player.globalPosition.x})`);
  c.true(player.state === 'idle' || player.state === 'run', `${label}: standing (${player.state})`);
}

describe('ground movement', () => {
  it(
    'stands on a flat floor',
    checked((c) => {
      flat();
      c.true(player.grounded, 'grounded');
      c.near(feetY(player), 0, 1e-6, 'feet on the floor');
      c.eq(player.state, 'idle', 'state');
    }),
  );

  it(
    'reaches top speed after exactly 128 frames',
    checked((c) => {
      flat();
      c.true(player.grounded, 'grounded before running');
      press('move_right');
      step(127);
      c.true(player.groundSpeed < 6 - 0.01, `below top speed after 127 frames (${player.groundSpeed})`);
      c.near(player.groundSpeed, 127 * 0.046875, 1e-6, '127 frames of acceleration');
      step(1);
      c.near(player.groundSpeed, 6, 1e-6, 'top speed at frame 128');
      step(60);
      c.near(player.groundSpeed, 6, 1e-9, 'stays at top speed');
      c.eq(player.state, 'run', 'state');
    }),
  );

  it(
    'deceleration and turnaround quirk',
    checked((c) => {
      flat();
      player.groundSpeed = 2;
      press('move_left');
      step(1);
      c.near(player.groundSpeed, 1.5, 1e-6, 'one frame of deceleration');
      step(3);
      // 1.5 -> 1.0 -> 0.5 -> 0.0 flips: the classic quirk sets -0.5 instead of 0.
      c.near(player.groundSpeed, -0.5, 1e-6, 'turnaround at 0.5 the other way');
      c.eq(player.facing, -1, 'facing left after turning');
    }),
  );

  it(
    'friction to zero',
    checked((c) => {
      flat();
      player.groundSpeed = 1;
      step(1);
      c.near(player.groundSpeed, 1 - 0.046875, 1e-6, 'one frame of friction');
      step(30);
      c.eq(player.groundSpeed, 0, 'friction stops at exactly zero');
      c.eq(player.state, 'idle', 'idle when stopped');
    }),
  );

  it(
    'skid when reversing fast',
    checked((c) => {
      flat();
      player.groundSpeed = 6;
      press('move_left');
      step(1);
      c.eq(player.state, 'skid', 'skids at speed 6');
      step(12);
      c.true(player.groundSpeed < 0, 'turned around');
      c.true(player.state !== 'skid', 'skid ends after turning');
    }),
  );

  it(
    'roll friction and unroll',
    checked((c) => {
      flat();
      player.groundSpeed = 3;
      press('move_down');
      step(1);
      c.eq(player.state, 'roll', 'down while moving rolls');
      release('move_down');
      let before = player.groundSpeed;
      step(1);
      c.near(before - player.groundSpeed, 0.0234375, 1e-6, 'roll friction per frame');
      c.true(player.isAttacking(), 'rolling attacks');
      let frames = 0;
      while (player.state === 'roll' && frames < 400) {
        before = player.groundSpeed;
        step(1);
        frames += 1;
      }
      c.eq(player.state, 'run', 'unrolled');
      c.true(before >= 0.5 && player.groundSpeed < 0.5, `unrolls when dropping below 0.5 (${player.groundSpeed})`);
    }),
  );

  it(
    'roll needs minimum speed',
    checked((c) => {
      flat();
      player.groundSpeed = 0.9;
      press('move_down');
      step(1);
      c.true(player.state !== 'roll', 'too slow to roll');
    }),
  );

  it(
    'spin dash with zero presses is base speed',
    checked((c) => {
      flat();
      press('move_down');
      step(2);
      c.true(player.crouching, 'down while idle crouches');
      press('jump');
      step(2);
      release('jump');
      c.eq(player.state, 'spindash', 'jump while crouching starts the spin dash');
      c.eq(player.spindashCharge, 0, 'starts uncharged');
      step(1);
      release('move_down');
      step(1);
      c.eq(player.state, 'roll', 'released into a roll');
      c.near(player.groundSpeed, 8, 1e-6, 'base speed');
    }),
  );

  it(
    'spin dash four presses',
    checked((c) => {
      flat();
      charge(4);
      // 4 x 2 = 8, but the classic per-frame decay runs between presses, so the
      // charge is 7.29... and floor(charge) / 2 adds 3.5, not 4.
      c.true(player.spindashCharge > 7 && player.spindashCharge < 8, `charge after 4 presses (${player.spindashCharge})`);
      release('move_down');
      step(1);
      c.near(player.groundSpeed, 11.5, 1e-6, '8 + floor(charge) / 2');
    }),
  );

  it(
    'spin dash full charge is 12',
    checked((c) => {
      flat();
      charge(6);
      release('move_down');
      step(1);
      c.near(player.groundSpeed, 12, 1e-6, 'fully charged spin dash');
      c.eq(player.state, 'roll', 'rolling');
    }),
  );

  it(
    'spin dash charge decays',
    checked((c) => {
      flat();
      charge(3);
      let ch = player.spindashCharge;
      step(10);
      c.true(player.spindashCharge < ch, 'charge decays while held');
      // One classic decay step: charge -= floor(charge / 0.125) / 256.
      ch = player.spindashCharge;
      step(1);
      c.near(player.spindashCharge, ch - Math.floor(ch / 0.125) / 256, 1e-9, 'decay formula');
    }),
  );

  it(
    'spin dash left',
    checked((c) => {
      flat();
      press('move_left');
      step(1);
      release('move_left');
      step(20);
      charge(0);
      release('move_down');
      step(1);
      c.near(player.groundSpeed, -8, 1e-6, 'spin dash goes the way Sproto faces');
    }),
  );

  it(
    'wall stops ground speed',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(200, -100, 50, 100));
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      player.groundSpeed = 6;
      press('move_right');
      step(60);
      c.eq(player.groundSpeed, 0, 'wall stopped the run');
      c.near(player.globalPosition.x, 200 - Tuning.physics.push_radius, 0.01, 'pushed out to the wall');
      c.true(player.grounded, 'still grounded');
    }),
  );

  it(
    'wall at speed 16: no tunnelling',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(300, -100, 12, 100));
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      player.groundSpeed = 16;
      step(40);
      c.true(player.globalPosition.x < 300, 'did not pass through a thin wall');
      c.eq(player.groundSpeed, 0, 'stopped');
    }),
  );

  it(
    'jumps to an apex of 99.84 px',
    checked((c) => {
      flat();
      const startY = player.globalPosition.y;
      press('jump');
      let minY = startY;
      let landed = false;
      for (let i = 0; i < 120; i++) {
        step(1);
        minY = Math.min(minY, player.globalPosition.y);
        if (i > 5 && player.grounded) {
          landed = true;
          break;
        }
      }
      release('jump');
      c.true(landed, 'landed');
      // Centre moved up by the apex height, plus the 5 px ball shift.
      c.near(startY + 5 - minY, 99.84, 0.05, 'apex');
    }),
  );

  it(
    'no unroll under a low ceiling',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(100, -332, 160, 300)); // 32 px tunnel from x 100 to 260
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      player.groundSpeed = 3;
      press('move_down');
      step(1);
      release('move_down');
      let crept = false;
      for (let i = 0; i < 400; i++) {
        step(1);
        const head = player.globalPosition.y - player.getRadii().y;
        const x = player.globalPosition.x;
        if (x > 91 && x < 269) {
          c.true(head >= -32.01, `head below the ceiling at x ${x} (${player.state})`);
          crept = crept || (player.state === 'roll' && Math.abs(player.groundSpeed) <= 0.5);
        }
        if (x > 300) break;
      }
      c.true(crept, 'kept rolling slowly under the ceiling');
      c.true(player.globalPosition.x > 269, 'rolled out of the tunnel');
      step(5);
      c.eq(player.state, 'idle', 'stood up once there was room');
    }),
  );

  it(
    'force roll backs out of a low dead end',
    checked((c) => {
      for (const side of [1, -1]) {
        intoLowDeadEnd(c, side);
        const away = side > 0 ? 'move_left' : 'move_right';
        press(away);
        for (let i = 0; i < 900; i++) {
          step(1);
          if (player.globalPosition.x * side < 80) break;
        }
        release(away);
        step(30);
        assertOutAndStanding(c, side, `side ${side} holding away`);
      }
    }),
  );

  it(
    'force roll turns back off the wall by itself',
    checked((c) => {
      for (const side of [1, -1]) {
        intoLowDeadEnd(c, side);
        for (let i = 0; i < 900; i++) {
          step(1);
          if (player.globalPosition.x * side < 80) break;
        }
        step(30);
        assertOutAndStanding(c, side, `side ${side}, no input`);
      }
    }),
  );

  it(
    'spin dash from a force roll',
    checked((c) => {
      intoLowDeadEnd(c, 1);
      press('move_left');
      step(2);
      release('move_left');
      press('move_down');
      press('jump');
      step(2);
      release('jump');
      c.eq(player.state, 'spindash', 'down + jump in a force-roll charges a spin dash');
      release('move_down');
      step(1);
      c.near(player.groundSpeed, -8, 1e-6, 'released away from the wall');
    }),
  );

  it(
    'walking into a low tunnel is blocked',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(100, -332, 200, 300)); // 32 px tunnel from x 100
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      press('move_right');
      step(120);
      c.near(player.globalPosition.x, 100 - Tuning.physics.push_radius, 0.01, 'stopped at the tunnel mouth');
      c.eq(player.groundSpeed, 0, 'blocked like a wall');
      // Rolling still gets in.
      release('move_right');
      step(5);
      player.respawnAt(new Vec2(0, -19));
      step(2);
      player.groundSpeed = 4;
      press('move_down');
      step(1);
      release('move_down');
      step(60);
      c.true(player.globalPosition.x > 120, `rolled into the tunnel (x ${player.globalPosition.x})`);
    }),
  );
});
