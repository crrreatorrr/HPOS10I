// Moving terrain, the player side (docs/CONTRACTS.md): riding platforms,
// conveyors and crushing.

import { afterEach, describe, it } from 'vitest';
import { Tuning } from '../../src/core/tuning';
import type { Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { addPlatform, addSampler, linear, shuttle, TestConveyor, type Motion, type Sampler, type TestPlatform } from '../helpers/moving';
import { addFloor, addRect, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

const PLATFORM_Y = -200;
/** Player's CRUSH_TOLERANCE (player.ts). */
const CRUSH_TOLERANCE = 1;

afterEach(() => releaseAll());

/** Sproto's offset from the platform, which must not change while he stands. */
function offset(player: Player, body: Node2D): Vec2 {
  return player.globalPosition.sub(body.globalPosition);
}

/**
 * A world with a floor far below and one platform; Sproto stands on it, then
 * the platform starts its motion.
 */
function ride(motion: Motion, size = new Vec2(96, 12)): { world: Node2D; body: TestPlatform; player: Player; sampler: Sampler } {
  const world = newWorld();
  addFloor(world, -3000, 3000, 400);
  const body = addPlatform(world, new Vec2(0, PLATFORM_Y), linear(Vec2.ZERO), size);
  const player = spawnPlayer(world, new Vec2(0, PLATFORM_Y));
  settle(player, new Vec2(0, PLATFORM_Y));
  body.frame = 0;
  body.offsetAt = motion;
  return { world, body, player, sampler: addSampler(world, player, body) };
}

describe('moving terrain', () => {
  it(
    'standing rides horizontal, vertical and diagonal platforms',
    checked((c) => {
      for (const v of [new Vec2(2, 0), new Vec2(-3, 0), new Vec2(0, -2), new Vec2(0, 2.5), new Vec2(2, -2), new Vec2(-1.5, 1.5), new Vec2(6, 0)]) {
        const { player, sampler } = ride(linear(v));
        const x0 = player.globalPosition.x;
        step(60);
        c.true(sampler.drift() < 0.01, `${v}: stays put on the platform (drift ${sampler.drift()} px)`);
        c.eq(sampler.airborne, 0, `${v}: never airborne;`);
        c.eq(player.groundSpeed, 0, `${v}: ground speed untouched;`);
        c.true(Math.abs(player.globalPosition.x - x0) >= Math.abs(v.x) * 58, `${v}: carried`);
      }
    }),
  );

  it(
    'running and rolling on a platform keep their own speed',
    checked((c) => {
      // Two lanes with the same inputs: a moving platform and a still one.
      const world = newWorld();
      const moving = addPlatform(world, new Vec2(0, PLATFORM_Y), linear(Vec2.ZERO), new Vec2(1200, 12));
      const still = addPlatform(world, new Vec2(0, PLATFORM_Y + 1000), linear(Vec2.ZERO), new Vec2(1200, 12));
      const riding = spawnPlayer(world, new Vec2(0, PLATFORM_Y));
      const walking = spawnPlayer(world, new Vec2(0, PLATFORM_Y + 1000));
      step(2);
      riding.respawnAt(new Vec2(0, PLATFORM_Y - 19));
      walking.respawnAt(new Vec2(0, PLATFORM_Y + 1000 - 19));
      step(2);
      moving.frame = 0;
      moving.offsetAt = linear(new Vec2(-2, -0.5));
      const sampler = addSampler(world, riding, moving);
      const walk = addSampler(world, walking, still);
      riding.groundSpeed = 3;
      walking.groundSpeed = 3;
      for (let i = 0; i < 90; i++) {
        if (i === 10) press('move_right');
        if (i === 40) {
          release('move_right');
          press('move_down'); // roll
        }
        if (i === 41) release('move_down');
        step(1);
        c.eq(riding.groundSpeed, walking.groundSpeed, `frame ${i}: same ground speed;`);
        c.eq(riding.state, walking.state, `frame ${i}: same state;`);
        if (riding.groundSpeed !== walking.groundSpeed) break;
      }
      // The same run relative to each platform, tick by tick.
      let worst = 0;
      for (let i = 0; i < Math.min(sampler.offsets.length, walk.offsets.length); i++) {
        worst = Math.max(worst, sampler.offsets[i]!.sub(walk.offsets[i]!).length());
      }
      c.true(worst < 0.001, `the same run relative to the platform (worst ${worst} px)`);
      c.eq(riding.state, 'roll', 'rolling at the end;');
    }),
  );

  it(
    'landing on moving platforms',
    checked((c) => {
      for (const v of [new Vec2(3, 0), new Vec2(0, -2), new Vec2(0, 2), new Vec2(-2, 1)]) {
        const world = newWorld();
        addFloor(world, -3000, 3000, 400);
        const body = addPlatform(world, new Vec2(0, PLATFORM_Y), linear(v), new Vec2(400, 12));
        const player = spawnPlayer(world, new Vec2(0, PLATFORM_Y - 80));
        step(2);
        player.respawnAt(new Vec2(0, PLATFORM_Y - 80));
        let landed = -1;
        for (let i = 0; i < 120; i++) {
          step(1);
          if (player.grounded) {
            landed = i;
            break;
          }
        }
        c.true(landed >= 0, `${v}: landed`);
        c.eq(player.groundSpeed, 0, `${v}: no platform speed in the landing;`);
        step(1);
        const sampler = addSampler(world, player, body);
        step(30);
        c.true(sampler.airborne === 0 && sampler.drift() < 0.01, `${v}: then rides it (drift ${sampler.drift()} px)`);
      }
    }),
  );

  it(
    'jumping off keeps only the jump',
    checked((c) => {
      for (const v of [new Vec2(3, 0), new Vec2(0, -2), new Vec2(-2, -1)]) {
        const { player } = ride(linear(v));
        step(10);
        press('jump');
        for (let i = 0; i < 5; i++) {
          step(1);
          if (!player.grounded) break;
        }
        c.true(!player.grounded, `${v}: jumped`);
        c.true(player.velocity.equals(new Vec2(0, -Tuning.physics.jump_force)), `${v}: the jump only (${player.velocity})`);
        const x = player.globalPosition.x;
        step(10);
        release('jump');
        c.near(player.globalPosition.x, x, 0.001, `${v}: no sideways drift in the air`);
      }
    }),
  );

  it(
    'platforms reversing under him',
    checked((c) => {
      for (const v of [new Vec2(3, 0), new Vec2(0, 2), new Vec2(0, 3), new Vec2(2, 2)]) {
        const { player, sampler } = ride(shuttle(v, 30));
        step(130);
        c.eq(sampler.airborne, 0, `${v}: never thrown off by a turn;`);
        c.true(sampler.drift() < 0.01, `${v}: stays put through the turns (drift ${sampler.drift()} px)`);
        c.eq(player.groundSpeed, 0, `${v}: no speed picked up;`);
      }
    }),
  );

  it(
    'a platform dropping faster than he falls',
    checked((c) => {
      // Still, then 9 px a frame down for 20 frames, then still again.
      const { body, player } = ride(linear(new Vec2(0, 9), 10, 30));
      const start = offset(player, body);
      let lifted = -1;
      let landed = -1;
      let buried = false;
      for (let i = 0; i < 150; i++) {
        step(1);
        if (lifted < 0 && !player.grounded) lifted = i;
        if (lifted >= 0 && landed < 0 && player.grounded) landed = i;
        if (player.globalPosition.y + player.getRadii().y > body.globalPosition.y + 0.5) buried = true;
      }
      c.true(lifted >= 9 && lifted <= 12, `lifts off when it drops (frame ${lifted})`);
      c.true(landed > 30, `lands on it again after it stops (frame ${landed})`);
      c.true(!buried, 'never below its top');
      c.true(player.grounded && offset(player, body).sub(start).length() < 0.01, 'standing on it again');
      // A steady fall is ridden, from a standstill too.
      for (const speed of [2, 4]) {
        const { sampler } = ride(linear(new Vec2(0, speed), 10));
        step(60);
        c.eq(sampler.airborne, 0, `${speed} px/f down: ridden, not lifted off;`);
        c.true(sampler.drift() < 0.01, `${speed} px/f down: stays put (drift ${sampler.drift()} px)`);
      }
    }),
  );

  it(
    'conveyors both ways',
    checked((c) => {
      for (const speed of [2, -2]) {
        const world = newWorld();
        addFloor(world, -3000, 3000, 400);
        const belt = new TestConveyor(new Vec2(1200, 8), speed);
        belt.position = new Vec2(-600, PLATFORM_Y);
        world.addChild(belt);
        addRect(world, new Rect2(-600, PLATFORM_Y + 1000, 1200, 8));
        const riding = spawnPlayer(world, new Vec2(0, PLATFORM_Y));
        const walking = spawnPlayer(world, new Vec2(0, PLATFORM_Y + 1000));
        step(2);
        riding.respawnAt(new Vec2(0, PLATFORM_Y - 19));
        walking.respawnAt(new Vec2(0, PLATFORM_Y + 1000 - 19));
        step(2);
        // Standing still: carried at the belt's speed.
        const x = riding.globalPosition.x;
        step(20);
        c.near(riding.globalPosition.x - x, speed * 20, 0.001, `${speed}: standing still carries him`);
        c.eq(riding.groundSpeed, 0, `${speed}: ground speed untouched;`);
        // Walking against it: his own run, minus the belt.
        const against = speed > 0 ? 'move_left' : 'move_right';
        const rx = riding.globalPosition.x;
        const wx = walking.globalPosition.x;
        press(against);
        for (let i = 0; i < 60; i++) {
          step(1);
          c.eq(riding.groundSpeed, walking.groundSpeed, `${speed} frame ${i}: same ground speed;`);
        }
        release(against);
        const walked = walking.globalPosition.x - wx;
        c.near(riding.globalPosition.x - rx, walked + speed * 60, 0.001, `${speed}: walking against it is slower`);
        c.true(Math.abs(riding.globalPosition.x - rx) < Math.abs(walked), `${speed}: slower than on still ground`);
      }
    }),
  );

  // A block comes down on Sproto standing on the floor: crushed once the gap
  // is shorter than he is; a block that stops just touching his head is not.
  it(
    'crushed between a moving block and the floor',
    checked((c) => {
      for (const stopGap of [30, 38, 37.5]) {
        const world = newWorld();
        addFloor(world);
        const player = spawnPlayer(world, Vec2.ZERO);
        settle(player, Vec2.ZERO);
        // Block bottom from 80 px above the floor down to stopGap, 2 px a frame.
        const size = new Vec2(96, 40);
        const frames = Math.trunc((80 - stopGap) / 2);
        const last = 80 - stopGap;
        addPlatform(world, new Vec2(0, -80 - size.y), (frame) => new Vec2(0, Math.min(frame * 2, last)), size);
        step(frames + 20);
        const crushed = player.state === 'dead';
        if (stopGap < 38 - CRUSH_TOLERANCE) c.true(crushed, `gap ${stopGap}: crushed`);
        else c.true(!crushed, `gap ${stopGap}: only touching, alive`);
      }
    }),
  );

  // Riding a platform up into a ceiling: crushed when it leaves no room, fine
  // when it stops with his head touching.
  it(
    'carried up into a ceiling',
    checked((c) => {
      for (const stopGap of [20, 38]) {
        const world = newWorld();
        addFloor(world, -3000, 3000, 400);
        addRect(world, new Rect2(-300, PLATFORM_Y - 100 - 40, 600, 40)); // ceiling bottom at -300
        const rise = 100 - stopGap;
        const body = addPlatform(world, new Vec2(0, PLATFORM_Y), (frame) => new Vec2(0, -Math.min(frame * 2, rise)));
        const player = spawnPlayer(world, new Vec2(0, PLATFORM_Y));
        settle(player, new Vec2(0, PLATFORM_Y));
        step(80);
        if (stopGap < 37) c.eq(player.state, 'dead', `gap ${stopGap}: crushed against the ceiling;`);
        else {
          c.true(player.state !== 'dead' && player.grounded, `gap ${stopGap}: touching, alive and riding`);
          c.near(player.globalPosition.y - player.getRadii().y, PLATFORM_Y - 100, 0.01, 'head at the ceiling');
          c.near(player.globalPosition.y + player.getRadii().y, body.globalPosition.y, 0.01, 'feet on the platform');
        }
      }
    }),
  );

  // A block sliding into Sproto pushes him along; against a wall it crushes him.
  it(
    'pushed sideways and crushed against a wall',
    checked((c) => {
      for (const wall of [false, true]) {
        const world = newWorld();
        addFloor(world);
        if (wall) addRect(world, new Rect2(60, -200, 40, 200));
        const player = spawnPlayer(world, Vec2.ZERO);
        settle(player, Vec2.ZERO);
        const block = addPlatform(world, new Vec2(-100, -60), linear(new Vec2(3, 0)), new Vec2(40, 59));
        const sampler = addSampler(world, player, block);
        step(60);
        if (wall) c.eq(player.state, 'dead', 'squeezed against the wall: crushed;');
        else {
          c.true(player.state !== 'dead', 'pushed, alive');
          c.true(player.globalPosition.x > 50, `pushed along (x ${player.globalPosition.x})`);
          // At the end of each tick (as drawn), never closer than his push radius.
          let closest = Infinity;
          for (const o of sampler.offsets) closest = Math.min(closest, o.x - 20);
          c.true(closest >= Tuning.physics.push_radius - 0.01, `kept clear of the block (${closest})`);
        }
      }
    }),
  );

  // Sproto and the platform are drawn moving together: at the end of every
  // tick (what the renderer interpolates between) they are the same distance
  // apart, whatever order their scripts run in (the runtime always
  // interpolates).
  it(
    'interpolated ride has no smear',
    checked((c) => {
      for (const priority of [-10, 10]) {
        const world = newWorld();
        addFloor(world, -3000, 3000, 400);
        const body = addPlatform(world, new Vec2(0, PLATFORM_Y), linear(Vec2.ZERO));
        body.processPriority = priority;
        const player = spawnPlayer(world, new Vec2(0, PLATFORM_Y));
        settle(player, new Vec2(0, PLATFORM_Y));
        body.frame = 0;
        body.offsetAt = shuttle(new Vec2(5, -1.5), 25);
        const sampler = addSampler(world, player, body);
        step(80);
        c.true(sampler.airborne === 0 && sampler.drift() < 0.01, `platform priority ${priority}: drawn together (drift ${sampler.drift()} px)`);
      }
    }),
  );
});
