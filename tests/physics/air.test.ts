// Airborne physics: jump height, variable jump, air drag, ceilings,
// top-only platforms and landing speed conversion.

import { afterEach, describe, it } from 'vitest';
import { Layers } from '../../src/core/layers';
import { Tuning } from '../../src/core/tuning';
import { COYOTE_FRAMES, JUMP_BUFFER_FRAMES, Moves } from '../../src/player/moves';
import { RIGHT_WALL, type Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { addFloor, addRect, addSlope, feetY, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

let world: Node2D;
let player: Player;

afterEach(() => releaseAll());

function spawn(feet = Vec2.ZERO): void {
  player = spawnPlayer(world, feet);
  settle(player, feet);
}

/** Presses jump and waits until the player has left the ground. */
function jump(): void {
  press('jump');
  for (let i = 0; i < 3; i++) {
    step(1);
    if (!player.grounded) return;
  }
}

/** Steps until grounded (or the limit). Returns the velocity of the frame before landing. */
function fallUntilGrounded(limit = 300): Vec2 {
  let before = player.velocity;
  for (let i = 0; i < limit; i++) {
    before = player.velocity;
    step(1);
    if (player.grounded) break;
  }
  return before;
}

describe('air', () => {
  it(
    'jump apex height',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      spawn();
      const startFeet = feetY(player);
      jump();
      c.near(player.velocity.y, -6.5, 1e-6, 'jump force');
      let top = startFeet;
      for (let i = 0; i < 80; i++) {
        top = Math.min(top, feetY(player));
        step(1);
      }
      // The Guide's discrete arc: 30 frames of 6.5 - 0.21875 k = 99.84 px.
      c.near(startFeet - top, 99.84375, 0.01, 'apex height');
      c.true(player.grounded, 'landed again');
      c.near(feetY(player), startFeet, 0.01, 'back on the floor');
    }),
  );

  it(
    'releasing jump cuts speed to 4',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      spawn();
      jump();
      step(4);
      c.true(player.velocity.y < -4, 'still rising fast');
      release('jump');
      step(1);
      // Cut to -4 at the start of the frame, then one frame of gravity.
      c.near(player.velocity.y, -4 + 0.21875, 1e-6, 'upward speed cut to 4');
    }),
  );

  it(
    'air drag only while rising slowly',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      spawn();
      player.groundSpeed = 6;
      jump();
      let dragged = 0;
      let count = 0;
      while (!player.grounded && count < 120) {
        const before = player.velocity;
        step(1);
        count += 1;
        if (player.grounded) break;
        if (before.y < 0 && before.y > -4) {
          c.near(player.velocity.x, before.x - Math.trunc(before.x / 0.125) / 256, 1e-6, `drag at y speed ${before.y}`);
          dragged += 1;
        } else {
          c.near(player.velocity.x, before.x, 1e-9, `no drag at y speed ${before.y}`);
        }
      }
      c.true(dragged >= 15, `drag applied on the frames with -4 < y < 0 (${dragged})`);
    }),
  );

  it(
    'ceiling stops upward speed',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(-200, -200, 400, 120)); // bottom at y = -80
      spawn();
      jump();
      let stopped = false;
      for (let i = 0; i < 60; i++) {
        const before = player.velocity.y;
        step(1);
        const head = player.globalPosition.y - player.getRadii().y;
        c.true(head >= -80.01, `head stays below the ceiling (${head})`);
        if (before < -2 && player.velocity.y >= 0) {
          stopped = true;
          break;
        }
      }
      c.true(stopped, 'upward speed set to 0 by the ceiling');
    }),
  );

  it(
    'top-only platform: jump through and land',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(-120, -60, 240, 12), Layers.TERRAIN_TOP_ONLY);
      spawn();
      jump();
      let passedAbove = false;
      for (let i = 0; i < 100; i++) {
        step(1);
        if (feetY(player) < -60) passedAbove = true;
        if (passedAbove && player.grounded) break;
      }
      c.true(passedAbove, 'jumped up through the platform');
      c.true(player.grounded, 'landed');
      c.near(feetY(player), -60, 0.05, 'standing on the platform');
      // And it stays solid to walk on.
      press('move_right');
      step(30);
      c.true(player.grounded, 'running along the top-only platform');
      c.near(feetY(player), -60, 0.05, 'still on top');
    }),
  );

  it(
    'land on flat keeps x speed',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      spawn(new Vec2(0, -40));
      player.respawnAt(new Vec2(0, -80));
      player.velocity = new Vec2(3, 1);
      fallUntilGrounded();
      c.true(player.grounded, 'landed');
      c.near(player.groundSpeed, 3, 1e-6, 'flat landing: ground speed = x speed');
    }),
  );

  it(
    'land on a slope halves y speed',
    checked((c) => {
      world = newWorld();
      addSlope(world, 30);
      spawn(new Vec2(0, -60));
      player.respawnAt(new Vec2(0, -120));
      player.velocity = new Vec2(0, 2);
      const before = fallUntilGrounded();
      c.true(player.grounded, 'landed');
      c.near(player.groundAngle, 30, 0.01, 'slope angle');
      // 24-45 degrees, |x| <= y: gsp = y * 0.5 * -sign(sin(angle)).
      const yAtLanding = before.y + Tuning.physics.gravity;
      c.near(player.groundSpeed, -0.5 * yAtLanding, 1e-3, 'slope landing');
    }),
  );

  it(
    'land on a slope with fast x keeps x',
    checked((c) => {
      world = newWorld();
      addSlope(world, 30);
      spawn(new Vec2(0, -60));
      // Just above the slope (surface y = 23 at x = -40), so y speed stays below x.
      player.respawnAt(new Vec2(-40, 23 - 19 - 12));
      player.velocity = new Vec2(5, 0.5);
      const before = fallUntilGrounded();
      c.true(before.y + Tuning.physics.gravity < 5, 'y speed below x speed at landing');
      c.true(player.grounded, 'landed');
      c.near(player.groundSpeed, 5, 1e-6, '|x| > y keeps x speed');
    }),
  );

  it(
    'land on a steep slope with the full y speed',
    checked((c) => {
      world = newWorld();
      addSlope(world, 60);
      spawn(new Vec2(0, -60));
      player.respawnAt(new Vec2(-40, -140));
      player.velocity = new Vec2(0, 3);
      const before = fallUntilGrounded();
      c.true(player.grounded, 'landed');
      c.near(player.groundAngle, 60, 0.01, 'steep angle');
      c.eq(player.collisionMode, RIGHT_WALL, 'wall mode on 60 degrees');
      const yAtLanding = before.y + Tuning.physics.gravity;
      c.near(player.groundSpeed, -yAtLanding, 1e-3, 'steep landing: full y speed');
    }),
  );

  it(
    'fast fall does not tunnel',
    checked((c) => {
      world = newWorld();
      addRect(world, new Rect2(-200, 0, 400, 10)); // thin floor
      spawn();
      player.respawnAt(new Vec2(0, -400));
      player.velocity = new Vec2(0, 16);
      fallUntilGrounded(60);
      c.true(player.grounded, 'landed at 16 px/frame on a 10 px floor');
      c.near(feetY(player), 0, 0.05, 'on top of it');
    }),
  );

  it(
    'land on narrow pillars',
    checked((c) => {
      for (const width of [8, 16]) {
        world = newWorld();
        addFloor(world, -2000, 2000, 300);
        addRect(world, new Rect2(-width / 2, 0, width, 300));
        spawn(new Vec2(0, 300));
        player.respawnAt(new Vec2(0, -80));
        fallUntilGrounded(90);
        c.true(player.grounded, `${width} px pillar: landed`);
        c.near(feetY(player), 0, 0.05, `${width} px pillar: on top`);
        step(30);
        c.near(feetY(player), 0, 0.05, `${width} px pillar: stays on top`);
      }
    }),
  );

  it(
    'spring under a narrow column stops at its bottom',
    checked((c) => {
      for (const width of [8, 16]) {
        world = newWorld();
        addFloor(world);
        addRect(world, new Rect2(-width / 2, -400, width, 300)); // hangs down to y -100
        spawn();
        player.launch(new Vec2(0, -10));
        let stopped = false;
        for (let i = 0; i < 60; i++) {
          const before = player.velocity.y;
          step(1);
          const head = player.globalPosition.y - player.getRadii().y;
          c.true(head >= -100.01, `${width} px column: head ${head} stays below it`);
          if (before < -1 && player.velocity.y >= 0) {
            stopped = true;
            break;
          }
        }
        c.true(stopped, `${width} px column: upward speed stopped by it`);
      }
    }),
  );

  it(
    'launch under a ceiling never penetrates',
    checked((c) => {
      for (const speed of [6, 10, 16]) {
        for (const height of [40, 60, 90, 130]) {
          for (const phase of [0, 2, 4]) {
            world = newWorld();
            addFloor(world);
            const bottom = -height - phase;
            addRect(world, new Rect2(-100, bottom - 200, 200, 200));
            spawn();
            player.launch(new Vec2(0, -speed));
            let deepest = 0;
            for (let i = 0; i < 30; i++) {
              step(1);
              deepest = Math.max(deepest, bottom - (player.globalPosition.y - player.getRadii().y));
            }
            c.true(deepest <= 0.01, `launch ${speed} under a ceiling ${-bottom} up: head ${deepest} px inside`);
          }
        }
      }
    }),
  );
});

describe('jump assist (extra moves on)', () => {
  /** A ledge: floor up to x = 0, then a drop. Sproto runs right off it at 4 px/frame. */
  function runOffLedge(extras: boolean): number {
    world = newWorld();
    Moves.extraMovesOverride = extras;
    addFloor(world, -4000, 0);
    addFloor(world, -4000, 4000, 600);
    spawn(new Vec2(-60, 0));
    press('move_right');
    for (let i = 0; i < 200 && player.grounded; i++) {
      player.groundSpeed = 4;
      step(1);
    }
    return player.globalPosition.y;
  }

  afterEach(() => {
    Moves.extraMovesOverride = false;
  });

  it(
    'a jump pressed up to 5 frames after running off a ledge still jumps; later it does not',
    checked((c) => {
      for (const late of [1, 3, 5, 6, 9]) {
        runOffLedge(true);
        c.true(!player.grounded, `late ${late}: off the ledge`);
        step(late - 1);
        const vx = player.velocity.x;
        press('jump');
        step(1);
        if (late <= COYOTE_FRAMES) {
          c.eq(player.state, 'jump', `late ${late}: jumps`);
          c.true(player.velocity.y < -6, `late ${late}: full jump force (${player.velocity.y})`);
          c.near(player.velocity.x, vx, 0.3, `late ${late}: keeps its horizontal speed`);
          c.true(player.isBall, `late ${late}: in a ball`);
          // Variable height still works: letting go cuts the rise.
          release('jump');
          step(2);
          c.true(player.velocity.y >= -4.01, `late ${late}: release cuts the jump (${player.velocity.y})`);
        } else {
          c.true(player.state !== 'jump', `late ${late}: too late, no jump (${player.state})`);
          c.true(player.velocity.y > 0, `late ${late}: still falling`);
        }
        releaseAll();
      }
    }),
  );

  it(
    'only one late jump, and never after a real jump',
    checked((c) => {
      runOffLedge(true);
      press('jump');
      step(1);
      release('jump');
      step(1);
      const vy = player.velocity.y;
      press('jump');
      step(1);
      c.true(player.velocity.y > vy, 'a second press right after does not jump again');
      releaseAll();
      // A real jump next to a ledge: pressing again in its first frames is not a late jump.
      world = newWorld();
      Moves.extraMovesOverride = true;
      addFloor(world);
      spawn();
      jump();
      release('jump');
      step(1);
      const rising = player.velocity.y;
      press('jump');
      step(1);
      c.true(player.velocity.y > rising, 'no double jump out of a jump');
    }),
  );

  it(
    'a jump pressed up to 6 frames before landing jumps on the first grounded frame; earlier it is forgotten',
    checked((c) => {
      for (const early of [1, 4, 6, 8]) {
        world = newWorld();
        Moves.extraMovesOverride = true;
        addFloor(world);
        spawn();
        // Find the landing frame of a plain jump, then repeat it with an early press.
        jump();
        release('jump');
        let airFrames = 0;
        while (!player.grounded && airFrames < 200) {
          step(1);
          airFrames++;
        }
        step(5);
        jump();
        release('jump');
        step(airFrames - early);
        c.true(!player.grounded, `early ${early}: still in the air`);
        press('jump');
        step(early);
        release('jump');
        let jumpedAgain = false;
        for (let i = 0; i < 3; i++) {
          if (!player.grounded && player.velocity.y < -3) jumpedAgain = true;
          step(1);
        }
        c.eq(jumpedAgain, early <= JUMP_BUFFER_FRAMES, `early ${early}: buffered jump`);
        releaseAll();
      }
    }),
  );

  it(
    'with the extra moves off neither assist exists (classic)',
    checked((c) => {
      runOffLedge(false);
      press('jump');
      step(1);
      c.true(player.state !== 'jump' && player.velocity.y > 0, 'no late jump');
      releaseAll();
      world = newWorld();
      addFloor(world);
      spawn();
      jump();
      release('jump');
      let airFrames = 0;
      while (!player.grounded && airFrames < 200) {
        step(1);
        airFrames++;
      }
      step(5);
      jump();
      release('jump');
      step(airFrames - 3);
      press('jump');
      step(3);
      release('jump');
      step(2);
      c.true(player.grounded, 'no early jump: he stays on the ground');
    }),
  );
});
