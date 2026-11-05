// QA physics accuracy audit against the community Physics Guide
// (port of tests/qa/test_physics_accuracy.gd). Independent of the reference
// simulator: every expected value is written straight from the Guide's rules
// (closed forms and one-frame deltas), then measured on the real Player.
// Tolerance 1/256 px (or px/frame).

import { afterEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Tuning } from '../../src/core/tuning';
import type { Player } from '../../src/player/player';
import type { Node, Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { checked, type Checks } from '../helpers/check';
import { addFloor, addLoop, addPolygon, addSlope, feetY, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

const EPS = 1 / 256;
const sin = (d: number) => Math.sin((d * Math.PI) / 180);
const tan = (d: number) => Math.tan((d * Math.PI) / 180);

let world: Node2D;
let player: Player;

afterEach(() => {
  GameState.tickets = 0;
  releaseAll();
});

function flat(feet = Vec2.ZERO): void {
  world = newWorld();
  addFloor(world);
  player = spawnPlayer(world, feet);
  settle(player, feet);
}

/** Guide model of spinrev for a frame: decay, then an optional press. */
function revFrame(rev: number, pressed: boolean): number {
  rev -= Math.floor(rev / 0.125) / 256;
  if (pressed) rev = Math.min(rev + 2, 8);
  return rev;
}

/** Flat run-up into a "/" slope of `angle` at x = 0; Sproto ends on the slope, grounded, with `speed` set for the next frame. */
function climbing(c: Checks, angle: number, speed: number): void {
  world = newWorld();
  const h = 600 * tan(angle);
  addPolygon(world, [new Vec2(-3000, 0), new Vec2(0, 0), new Vec2(600, -h), new Vec2(3000, -h), new Vec2(3000, 300), new Vec2(-3000, 300)]);
  player = spawnPlayer(world, new Vec2(-200, 0));
  settle(player, new Vec2(-200, 0));
  press('move_right');
  player.groundSpeed = 6;
  for (let i = 0; i < 90; i++) {
    step(1);
    if (player.globalPosition.x > 40 && player.grounded) break;
  }
  release('move_right');
  c.true(
    player.grounded && Math.abs(player.groundAngle - angle) < 2 && player.controlLock === 0,
    `on the ${angle} deg slope at speed (angle ${player.groundAngle}, grounded ${player.grounded}, lock ${player.controlLock})`,
  );
  player.groundSpeed = speed;
}

/**
 * Guide rules on a circle: per frame slope factor (none in the ceiling range),
 * acceleration while below top speed with the direction held, move gsp along
 * the ring. Returns the exit speed after one full turn.
 */
function guideLap(radius: number, entry: number, held: boolean): number {
  let gsp = entry;
  let s = 0;
  const circumference = Math.PI * 2 * radius;
  for (let i = 0; i < 2000; i++) {
    const angle = ((s / radius) * 180) / Math.PI % 360;
    if (!(angle >= 135 && angle <= 225)) gsp -= 0.125 * sin(angle);
    if (held && gsp < 6) gsp = Math.min(gsp + 0.046875, 6);
    s += gsp;
    if (gsp <= 0) return NaN;
    if (s >= circumference) return gsp;
  }
  return NaN;
}

describe('QA physics accuracy', () => {
  // --- Running (closed forms) ----------------------------------------------------

  it(
    'acceleration reaches top speed in 128 frames',
    checked((c) => {
      flat();
      press('move_right');
      let frames = 0;
      let exact = true;
      for (let i = 0; i < 200; i++) {
        step(1);
        frames += 1;
        if (Math.abs(player.groundSpeed - Math.min(0.046875 * frames, 6)) > EPS) exact = false;
        if (player.groundSpeed >= 6) break;
      }
      release('move_right');
      c.eq(frames, 128, 'frames from rest to top speed');
      c.true(exact, 'gsp = k * 0.046875 on every frame of the run-up');
      c.near(player.groundSpeed, 6, EPS, 'gsp clamps to exactly 6.0 (accelerate, then clamp)');
    }),
  );

  it(
    'top speed clamp happens after acceleration',
    checked((c) => {
      flat();
      player.groundSpeed = 6 - 1 / 128;
      press('move_right');
      step(1);
      release('move_right');
      c.near(player.groundSpeed, 6, EPS, 'one accel frame from just under top speed lands exactly on 6.0');
      // Above top speed with the direction held: never slowed to 6.
      player.groundSpeed = 9;
      press('move_right');
      step(1);
      release('move_right');
      c.near(player.groundSpeed, 9, EPS, 'holding forward above top speed does not reduce it');
    }),
  );

  it(
    'friction stops from top speed in 128 frames over 381 px',
    checked((c) => {
      flat();
      player.groundSpeed = 6;
      const x0 = player.globalPosition.x;
      let frames = 0;
      for (let i = 0; i < 200; i++) {
        step(1);
        frames += 1;
        if (player.groundSpeed === 0) break;
      }
      // Guide: friction first, then the frame moves at the new speed:
      // distance = sum_{k=1..128} (6 - k * 0.046875) = 381 px.
      c.eq(frames, 128, 'frames to stop by friction from 6');
      c.near(player.globalPosition.x - x0, 381, EPS, 'friction stop distance from 6');
    }),
  );

  it(
    'deceleration from 6 to the turnaround in 12 frames',
    checked((c) => {
      flat();
      player.groundSpeed = 6;
      press('move_left');
      let ok = true;
      for (let k = 1; k < 12; k++) {
        step(1);
        if (Math.abs(player.groundSpeed - (6 - 0.5 * k)) > EPS) ok = false;
      }
      step(1);
      release('move_left');
      c.true(ok, 'gsp = 6 - 0.5 k for k < 12 while skidding');
      c.near(player.groundSpeed, -0.5, EPS, 'frame 12: speed reaches 0 and turns around to 0.5 the other way');
    }),
  );

  // --- Jump and gravity (order of operations) ----------------------------------------

  it(
    'jump frame moves nothing, then rises by 6.5',
    checked((c) => {
      flat();
      press('jump');
      let feet0 = feetY(player);
      for (let i = 0; i < 4; i++) {
        if (player.state === 'jump') break;
        feet0 = feetY(player);
        step(1);
      }
      c.eq(player.state, 'jump', 'jumped');
      const feet1 = feetY(player); // end of the jump frame
      step(1);
      const feet2 = feetY(player); // end of the first air frame
      release('jump');
      c.near(feet1 - feet0, 0, EPS, 'the jump frame itself does not move');
      c.near(feet2 - feet1, -6.5, EPS, 'first air frame: position += ysp (-6.5), THEN gravity');
    }),
  );

  it(
    'jump apex height and variable jump',
    checked((c) => {
      flat();
      const feet0 = feetY(player);
      press('jump');
      let top = feet0;
      for (let i = 0; i < 60; i++) {
        step(1);
        top = Math.min(top, feetY(player));
        if (player.grounded && i > 5) break;
      }
      release('jump');
      // Guide (position then gravity): height = sum_{k=0..29} (6.5 - 0.21875 k) = 99.84375.
      c.near(feet0 - top, 99.84375, EPS, 'full jump apex height');
      // Variable jump: releasing while ysp < -4 sets ysp to -4.
      flat();
      press('jump');
      step(4);
      release('jump');
      const yBefore = feetY(player);
      step(1);
      c.near(feetY(player) - yBefore, -4, EPS, 'the release frame moves by the capped ysp (-4)');
      c.near(player.velocity.y, -4 + 0.21875, EPS, 'then gravity is added to the capped -4');
    }),
  );

  it(
    'gravity is applied after the move',
    checked((c) => {
      flat();
      player.launch(new Vec2(0, -6.5));
      const y0 = player.globalPosition.y;
      step(1);
      c.near(player.globalPosition.y - y0, -6.5, EPS, 'position += ysp before ysp += gravity');
      c.near(player.velocity.y, -6.5 + 0.21875, EPS, 'gravity 0.21875 added after the move');
    }),
  );

  it(
    'air drag formula and conditions',
    checked((c) => {
      // Guide: when ysp < 0 and ysp > -4 and |xsp| >= 0.125: xsp -= trunc(xsp / 0.125) / 256.
      for (const [x, y, expected] of [
        [3, -2, 3 - 24 / 256],
        [-1, -1, -1 + 8 / 256],
        [0.1, -2, 0.1],
        [3, -4, 3],
        [3, 1, 3],
      ] as const) {
        flat();
        player.launch(new Vec2(x, y));
        step(1);
        c.near(player.velocity.x, expected, EPS, `air drag with xsp ${x}, ysp ${y}`);
      }
    }),
  );

  it(
    'air drag applies before gravity and after air acceleration',
    checked((c) => {
      // Air accel first (0.09375), then drag on the new xsp.
      flat();
      player.launch(new Vec2(2, -2));
      press('move_right');
      step(1);
      release('move_right');
      const afterAccel = 2 + 0.09375;
      c.near(player.velocity.x, afterAccel - Math.trunc(afterAccel / 0.125) / 256, EPS, 'air accel, then drag on the accelerated xsp');
    }),
  );

  // --- Spin dash -------------------------------------------------------------------

  it(
    'spin dash release speeds and decay',
    checked((c) => {
      for (let presses = 0; presses < 8; presses++) {
        flat();
        press('move_down');
        step(3);
        press('jump');
        step(2);
        release('jump');
        step(1);
        c.eq(player.state, 'spindash', `${presses} presses: charging`);
        // Frames so far since the start: one held, one released (decay only).
        let rev = revFrame(revFrame(0, false), false);
        let exact = true;
        for (let k = 0; k < presses; k++) {
          press('jump');
          step(2);
          rev = revFrame(revFrame(rev, true), false);
          if (Math.abs(player.spindashCharge - rev) > EPS) exact = false;
          release('jump');
          step(1);
          rev = revFrame(rev, false);
          if (Math.abs(player.spindashCharge - rev) > EPS) exact = false;
        }
        const charge = player.spindashCharge;
        release('move_down');
        let released = NaN;
        for (let i = 0; i < 4; i++) {
          step(1);
          if (player.state === 'roll') {
            released = Math.abs(player.groundSpeed);
            break;
          }
        }
        c.true(exact, `${presses} presses: charge follows the Guide frame model`);
        c.near(released, 8 + Math.floor(charge) / 2, EPS, `${presses} presses: release speed from the charge`);
      }
      // Decay alone from rev 2 over 60 frames.
      flat();
      press('move_down');
      step(3);
      press('jump');
      step(2);
      release('jump');
      step(1);
      press('jump');
      step(2);
      release('jump');
      let rev = player.spindashCharge; // just after a press (about 2)
      c.true(rev >= 1.9, `charge is about 2 after one press (got ${rev})`);
      let worst = 0;
      for (let i = 0; i < 60; i++) {
        step(1);
        rev = revFrame(rev, false);
        worst = Math.max(worst, Math.abs(player.spindashCharge - rev));
      }
      release('move_down');
      c.true(worst <= EPS, 'decay follows rev -= floor(rev / 0.125) / 256 every frame');
    }),
  );

  // --- Slopes, slipping, rolling -----------------------------------------------------

  it(
    'slip threshold is exactly 2.5 and the lock is 30 frames',
    checked((c) => {
      const slipAngle = Tuning.physics.slip_angle;
      const angle = slipAngle + 5;
      // 2.5 itself is "not slipping"; half a tolerance above it keeps the float
      // subtraction of the slope factor from landing a hair under 2.5.
      for (const [gsp, slips] of [
        [2.5 + EPS / 2, false],
        [2.5 - EPS, true],
      ] as const) {
        climbing(c, angle, 0);
        // Guide order: slope factor, then friction (no input), then the slip
        // check reads the result: add both back so the check sees gsp.
        player.groundSpeed = gsp + 0.125 * sin(player.groundAngle) + 0.046875;
        step(1);
        const locked = player.controlLock > 0;
        c.eq(locked, slips, `gsp ${gsp} at the slip check on ${angle} deg: slips ${slips}`);
        if (locked) {
          c.eq(player.controlLock, 30, 'control lock set to 30 frames');
          let frames = 0;
          while (player.controlLock > 0 && frames < 60) {
            step(1);
            frames += 1;
          }
          c.eq(frames, 30, 'lock lasts exactly 30 frames');
        }
      }
      // Just under the slip angle: no slip however slow.
      climbing(c, slipAngle - 3, 1);
      step(1);
      c.eq(player.controlLock, 0, `no slip at ${player.groundAngle} deg, under the slip angle ${slipAngle} (gsp ${player.groundSpeed})`);
      // Past the fall angle (69) the slip detaches: put him on a 75 deg face.
      world = newWorld();
      addSlope(world, 75);
      const feet = new Vec2(60, -60 * tan(75));
      player = spawnPlayer(world, feet);
      step(2);
      player.respawnAt(feet.sub(new Vec2(0, 19)));
      let stood = false;
      let fell = false;
      for (let i = 0; i < 12; i++) {
        step(1);
        if (player.grounded) stood = true;
        else if (stood && player.controlLock > 0) {
          fell = true;
          break;
        }
      }
      c.true(stood && fell, `standing still on a 75 deg slope slips and falls off (stood ${stood}, fell ${fell})`);
    }),
  );

  it(
    'roll start at 1.03125 and unroll below 0.5',
    checked((c) => {
      // Down held with no direction: friction first, then the roll check.
      for (const [gsp, rolls] of [
        [1.03125, true],
        [1.03125 - EPS, false],
      ] as const) {
        flat();
        player.groundSpeed = gsp + 0.046875;
        press('move_down');
        step(1);
        release('move_down');
        c.eq(player.state === 'roll', rolls, `gsp ${gsp} after friction: rolls ${rolls}`);
      }
      // Unroll below 0.5 (checked after roll friction 0.0234375).
      for (const [gsp, ball] of [
        [0.5, true],
        [0.5 - EPS, false],
      ] as const) {
        flat();
        player.groundSpeed = 3;
        press('move_down');
        step(1);
        release('move_down');
        c.eq(player.state, 'roll', 'rolling');
        player.groundSpeed = gsp + 0.0234375;
        step(1);
        c.eq(player.state === 'roll', ball, `rolling at ${gsp} after friction: still a ball ${ball}`);
      }
    }),
  );

  it(
    'landing bands: flat, 23, 30, 46 and 60',
    checked((c) => {
      // Same drop (feet 100 px up, xsp 1). Guide: flat band (<= 23): gsp = xsp;
      // 24-45: if |xsp| <= ysp, gsp = ysp * 0.5 * -sign(sin a); > 45: gsp = ysp * -sign(sin a).
      for (const angle of [0, 23, 30, 46, 60]) {
        world = newWorld();
        if (angle === 0) addFloor(world);
        else addSlope(world, angle);
        player = spawnPlayer(world, new Vec2(0, -100));
        settle(player, new Vec2(0, -100));
        player.launch(new Vec2(1, 0));
        let ysp = 0;
        for (let i = 0; i < 120; i++) {
          // Guide air step: move, then ysp += gravity, THEN the floor sensors
          // land, so the band uses the ysp after this frame's gravity.
          ysp = player.velocity.y + 0.21875;
          step(1);
          if (player.grounded) break;
        }
        let expected = 1;
        if (angle > 23 && 1 <= ysp) expected = -ysp * (angle <= 45 ? 0.5 : 1);
        c.near(player.groundSpeed, expected, 1 / 128, `landing band at ${angle} deg`);
      }
    }),
  );

  // --- Damage, death, springs, caps --------------------------------------------------

  it(
    'hurt arc and landing distance',
    checked((c) => {
      flat();
      GameState.tickets = 5;
      const x0 = player.globalPosition.x;
      player.hurt(player.globalPosition.add(new Vec2(-10, 0)));
      step(1);
      c.near(player.velocity.x, 2, EPS, 'hurt xsp 2 away from the source');
      c.near(player.velocity.y, -4 + 0.1875, EPS, 'hurt ysp -4, then hurt gravity 0.1875');
      let frames = 1;
      while (!player.grounded && frames < 120) {
        step(1);
        frames += 1;
      }
      // Guide (position then gravity, no drag).
      let guideFrames = 0;
      let y = 0;
      let ysp = -4;
      for (;;) {
        y += ysp;
        ysp += 0.1875;
        guideFrames += 1;
        if (y >= 0) break;
      }
      c.eq(frames, guideFrames, 'hurt arc frames to land');
      c.near(player.globalPosition.x - x0, 2 * guideFrames, 1 / 128, 'hurt arc landing distance');
    }),
  );

  it(
    'death launch -7',
    checked((c) => {
      flat();
      player.kill();
      c.near(player.velocity.y, -7, EPS, 'death ysp -7');
      const y0 = player.globalPosition.y;
      step(1);
      c.near(player.globalPosition.y - y0, -7, EPS, 'death: position += ysp (-7) before gravity');
    }),
  );

  it(
    'springs and the speed cap',
    checked((c) => {
      flat();
      player.launch(new Vec2(0, -16));
      c.near(player.velocity.y, -16, EPS, 'red spring 16');
      flat();
      player.launch(new Vec2(0, -10));
      c.near(player.velocity.y, -10, EPS, 'yellow spring 10');
      flat();
      player.launch(new Vec2(20, -20));
      c.near(player.velocity.x, 16, EPS, 'speed cap 16 on xsp');
      c.near(player.velocity.y, -16, EPS, 'speed cap 16 on ysp');
      flat();
      player.groundSpeed = 20;
      step(1);
      c.near(Math.abs(player.groundSpeed), 16, EPS, 'ground speed cap 16');
      flat();
      player.launch(new Vec2(0, 10));
      for (let i = 0; i < 40; i++) {
        step(1);
        if (player.grounded) break;
      }
      c.true(player.velocity.y <= 16 + EPS, 'fall speed never exceeds 16');
    }),
  );

  // --- Loop ------------------------------------------------------------------------

  it(
    'loop exit speed at 8 with right held',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      const loop = addLoop(world, Vec2.ZERO);
      const radius = loop.radius;
      player = spawnPlayer(world, new Vec2(-500, 0));
      settle(player, new Vec2(-500, 0));
      player.groundSpeed = 8;
      press('move_right');
      let exitSpeed = NaN;
      const trace: [number, number, number][] = []; // angle before the frame, mode before, gsp after
      for (let i = 0; i < 400; i++) {
        const angleBefore = player.groundAngle;
        const modeBefore = player.collisionMode;
        step(1);
        trace.push([angleBefore, modeBefore, player.groundSpeed]);
        if (player.globalPosition.x > 300 && player.grounded) {
          exitSpeed = player.groundSpeed;
          break;
        }
      }
      release('move_right');
      c.true(!Number.isNaN(exitSpeed), 'came out of the loop');
      // Replay the Guide's per-frame rules on the game's own angle sequence:
      // slope factor 0.125 sin(angle) (the ceiling range skipped, as the
      // matrix documents), then +0.046875 up to 6 with right held.
      let gsp = 8;
      let worst = 0;
      for (const [a, mode, after] of trace) {
        if (mode !== 2) gsp -= 0.125 * sin(a);
        if (gsp < 6) gsp = Math.min(gsp + 0.046875, 6);
        worst = Math.max(worst, Math.abs(gsp - after));
      }
      c.true(worst <= EPS, `every loop frame follows the Guide rules on its measured angle (worst error ${worst})`);
      c.true(!Number.isNaN(guideLap(radius, 8, true)), 'an ideal ring gets round too');
    }),
  );

  // --- Hitboxes and sensors ----------------------------------------------------------

  it(
    'hitbox radii and sensor layout',
    checked((c) => {
      flat();
      c.true(player.getRadii().equals(new Vec2(9, 19)), 'standing radii 9 x 19');
      player.sensors.recording = true;
      step(1);
      const casts = [...player.sensors.casts];
      player.sensors.recording = false;
      const centre = player.globalPosition;
      const found = new Map(casts.map((k) => [k.label, k]));
      for (const [label, dx] of [
        ['A', -9],
        ['B', 9],
      ] as const) {
        const k = found.get(label);
        c.true(!!k, `floor sensor ${label} cast`);
        if (k) c.near(k.from.x - centre.x, dx, EPS, `floor sensor ${label} x offset`);
      }
      for (const [label, dx] of [
        ['E', -10],
        ['F', 10],
      ] as const) {
        const k = found.get(label);
        if (!k) continue;
        c.near(k.to.x - centre.x, dx, EPS, `wall sensor ${label} reaches push radius 10`);
        c.near(k.from.y - centre.y, 8, EPS, `wall sensor ${label} sits 8 px lower on flat ground`);
      }
      // Rolling radii.
      player.groundSpeed = 3;
      press('move_down');
      step(1);
      release('move_down');
      c.true(player.getRadii().equals(new Vec2(7, 14)), 'rolling radii 7 x 14');
    }),
  );

  // --- Animation (needs the player visuals) ------------------------------------------

  it(
    'animation frame durations follow the Guide',
    checked((c) => {
      flat();
      type Visual = Node & { animFrame?: number };
      const visualOf = (p: Player) => p.children.find((n) => n.name === 'Visual') as Visual | undefined;
      if (visualOf(player)?.animFrame === undefined) return; // the visuals port is not installed here
      // Guide: a walk/run frame lasts max(0, 8 - |gsp|) ticks (some readings count value + 1).
      for (const gsp of [1, 3, 5, 7]) {
        flat();
        const visual = visualOf(player)!;
        player.groundSpeed = gsp;
        press('move_right');
        player.groundSpeed = gsp;
        step(2);
        let last = visual.animFrame!;
        const gaps: number[] = [];
        let since = 0;
        for (let i = 0; i < 48; i++) {
          player.groundSpeed = gsp;
          step(1);
          since += 1;
          const f = visual.animFrame!;
          if (f !== last) {
            gaps.push(since);
            since = 0;
            last = f;
          }
        }
        release('move_right');
        const guide = Math.floor(Math.max(0, 8 - gsp));
        if (gaps.length > 2) c.true(gaps[1] === guide || gaps[1] === guide + 1, `frame time at gsp ${gsp} within the two Guide readings`);
      }
    }),
  );
});
