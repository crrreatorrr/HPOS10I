// QA regression guards for the player controller and terrain helpers
// (port of tests/qa/test_physics_regression.gd, qa/checklists/01-physics.md).

import { afterEach, beforeEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Tuning } from '../../src/core/tuning';
import { Props } from '../../src/levels/common/props';
import { CEILING, FLOOR, LEFT_WALL, RIGHT_WALL, type Player, type PlayerState } from '../../src/player/player';
import { wrapf } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { CurveShape } from '../../src/terrain/curve_terrain';
import { TerrainLoop } from '../../src/terrain/loop';
import { checked, type Checks } from '../helpers/check';
import { qa, TOP_ONLY } from '../helpers/qa';
import { centreInTerrain, feetY, press, release, releaseAll, step } from '../helpers/world';

const rad = (d: number) => (d * Math.PI) / 180;

let w: Node2D;
let p: Player;

beforeEach(() => {
  GameState.tickets = 0;
});

afterEach(() => {
  GameState.tickets = 0;
  tree.paused = false;
  releaseAll();
});

function flat(feet = Vec2.ZERO): void {
  w = qa.world();
  qa.floorAt(w);
  p = qa.spawn(w, feet);
}

/** Crouch, then one press of jump: the spin dash starts. */
function startSpindash(): void {
  press('move_down');
  step(3);
  press('jump');
  step(1);
  release('jump');
  step(2);
}

function releaseMoves(): void {
  for (const a of ['move_right', 'move_left', 'move_down', 'jump'] as const) release(a);
}

function loopRun(startX: number, speed: number, radius = 112): { done: boolean; airborne: boolean; path: number; full: boolean } {
  w = qa.world();
  qa.floorAt(w, -5000, 5000);
  const lp = qa.loop(w, Vec2.ZERO, radius);
  p = qa.spawn(w, new Vec2(startX, 0));
  const dir = Math.sign(speed);
  p.groundSpeed = speed;
  const action = dir > 0 ? 'move_right' : 'move_left';
  press(action);
  const exitX = (lp.radius + lp.thickness + lp.floorMargin + 40) * dir;
  const modes = new Set<number>();
  let airborne = false;
  let done = false;
  for (let i = 0; i < 900; i++) {
    step(1);
    modes.add(p.collisionMode);
    airborne = airborne || !p.grounded;
    if (p.globalPosition.x * dir > exitX * dir) {
      done = true;
      break;
    }
  }
  release(action);
  return { done, airborne, path: p.collisionPath, full: modes.has(RIGHT_WALL) && modes.has(CEILING) && modes.has(LEFT_WALL) };
}

/** Puts Sproto in state `s` on a flat floor (the setups shared by the hurt and pause checks). */
function enterState(s: PlayerState): void {
  switch (s) {
    case 'run':
      p.groundSpeed = 4;
      press('move_right');
      step(2);
      break;
    case 'skid':
      p.groundSpeed = 6;
      press('move_left');
      step(1);
      break;
    case 'jump':
      press('jump');
      step(4);
      break;
    case 'roll':
      p.groundSpeed = 5;
      press('move_down');
      step(1);
      release('move_down');
      break;
    case 'spindash':
      startSpindash();
      break;
    case 'spring':
      p.launch(new Vec2(0, -8));
      step(2);
      break;
    case 'hurt':
      p.hurt(p.globalPosition.add(new Vec2(20, 0)));
      step(2);
      break;
    case 'dead':
      p.kill();
      step(2);
      break;
    default:
      break;
  }
}

function holdUntil(c: Checks, frames: number, bad: () => string | null): void {
  for (let i = 0; i < frames; i++) {
    step(1);
    const msg = bad();
    if (msg !== null) {
      c.fail(`frame ${i}: ${msg}`);
      return;
    }
  }
}

describe('QA physics regression', () => {
  // --- Ground (PHY-B) --------------------------------------------------------------

  it(
    'skid threshold is 4',
    checked((c) => {
      flat();
      p.groundSpeed = 3.99;
      press('move_left');
      step(1);
      c.true(p.state !== 'skid', `no skid at 3.99 (${p.state})`);
      release('move_left');
      flat();
      p.groundSpeed = 4;
      press('move_left');
      step(1);
      c.eq(p.state, 'skid', 'skid at 4');
    }),
  );

  it(
    'speed above top is kept while holding forward',
    checked((c) => {
      flat();
      p.groundSpeed = 10;
      press('move_right');
      step(60);
      c.near(p.groundSpeed, 10, 1e-6, 'ground');
      p.respawnAt(new Vec2(0, -600));
      p.velocity = new Vec2(8, 1);
      step(5);
      c.near(p.velocity.x, 8, 1e-6, 'air, falling');
      p.velocity = new Vec2(5.9, 1);
      step(5);
      c.near(p.velocity.x, 6, 1e-6, 'air input caps at 6');
    }),
  );

  it(
    'left and right together is no input',
    checked((c) => {
      flat();
      press('move_left');
      press('move_right');
      const states = new Set<string>();
      for (let i = 0; i < 30; i++) {
        step(1);
        states.add(p.state);
      }
      c.eq(p.groundSpeed, 0, 'stays still');
      c.eq([...states].join(), 'idle', 'no state flicker');
      p.groundSpeed = 4;
      step(1);
      c.near(p.groundSpeed, 4 - 0.046875, 1e-6, 'friction only');
    }),
  );

  it(
    'velocity is ground speed projected',
    checked((c) => {
      w = qa.world();
      qa.slope(w, 30);
      p = qa.spawn(w, new Vec2(0, -2));
      p.groundSpeed = 4;
      press('move_right');
      let worst = 0;
      for (let i = 0; i < 20; i++) {
        step(1);
        const a = rad(p.groundAngle);
        worst = Math.max(worst, p.velocity.sub(new Vec2(Math.cos(a), -Math.sin(a)).mul(p.groundSpeed)).length());
      }
      c.true(worst < 0.001, `projection error ${worst}`);
    }),
  );

  it(
    'running off a ledge keeps the speed',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -2000, 100);
      p = qa.spawn(w, Vec2.ZERO);
      p.groundSpeed = 4;
      let gsp = p.groundSpeed;
      for (let i = 0; i < 60; i++) {
        step(1);
        if (!p.grounded) {
          c.near(p.velocity.x, gsp - 0.046875, 1e-6, 'x speed = last ground speed (one friction step)');
          c.true(p.velocity.y >= 0 && p.velocity.y < 0.25, `y speed starts near 0 (${p.velocity.y})`);
          return;
        }
        gsp = p.groundSpeed;
      }
      c.fail('never left the ledge');
    }),
  );

  it(
    'steps up to 10 px are climbed',
    checked((c) => {
      for (const h of [6, 10]) {
        w = qa.world();
        qa.floorAt(w);
        qa.rect(w, new Rect2(200, -h, 400, h));
        p = qa.spawn(w, Vec2.ZERO);
        p.groundSpeed = 6;
        press('move_right');
        step(60);
        release('move_right');
        c.true(p.globalPosition.x > 300, `${h} px step climbed at 6 px/f`);
      }
    }),
  );

  it(
    'balances on a ledge with one sensor',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -2000, 100);
      p = qa.spawn(w, new Vec2(104, 0));
      step(60);
      c.true(p.grounded, 'still on the ledge');
    }),
  );

  // --- Air (PHY-C) -----------------------------------------------------------------

  it(
    'full jump air time',
    checked((c) => {
      flat();
      press('jump');
      let frames = 0;
      for (let i = 0; i < 120; i++) {
        step(1);
        if (!p.grounded) frames += 1;
        else if (frames > 0) break;
      }
      c.true(frames >= 59 && frames <= 61, `air time ${frames} frames`);
    }),
  );

  it(
    'release after the apex changes nothing',
    checked((c) => {
      flat();
      press('jump');
      for (let i = 0; i < 40; i++) {
        step(1);
        if (!p.grounded && p.velocity.y > 0.5) break;
      }
      const vy = p.velocity.y;
      release('jump');
      step(1);
      c.near(p.velocity.y, vy + 0.21875, 1e-6, 'only gravity');
    }),
  );

  it(
    'air acceleration and terminal speed',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -200, 200, 4000);
      p = qa.spawn(w, new Vec2(0, 4000));
      p.respawnAt(new Vec2(0, -2000));
      press('move_right');
      step(2);
      const vx = p.velocity.x;
      step(1);
      c.near(p.velocity.x - vx, 0.09375, 1e-6, 'air acceleration');
      release('move_right');
      let top = 0;
      for (let i = 0; i < 300; i++) {
        step(1);
        top = Math.max(top, p.velocity.y);
        if (p.grounded) break;
      }
      c.near(top, 16, 1e-6, 'terminal fall speed');
    }),
  );

  it(
    'jump leaves perpendicular to the slope',
    checked((c) => {
      for (const angle of [22, -22]) {
        w = qa.world();
        qa.slope(w, angle);
        p = qa.spawn(w, new Vec2(0, -2));
        step(5);
        const gsp = p.groundSpeed;
        const a = rad(p.groundAngle);
        press('jump');
        for (let i = 0; i < 3; i++) {
          step(1);
          if (!p.grounded) break;
        }
        release('jump');
        const expect = new Vec2(gsp * Math.cos(a), -gsp * Math.sin(a)).sub(new Vec2(Math.sin(a), Math.cos(a)).mul(6.5));
        c.true(p.velocity.sub(expect).length() < 0.01, `${angle} deg: ${p.velocity} vs ${expect}`);
      }
    }),
  );

  it(
    'no double jump',
    checked((c) => {
      flat();
      press('jump');
      step(10);
      release('jump');
      step(2);
      const vy = p.velocity.y;
      press('jump');
      step(2);
      c.true(p.velocity.y > vy, 'second press ignored');
    }),
  );

  it(
    'jump against a wall does not stick or jitter',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(100, -300, 40, 300));
      p = qa.spawn(w, new Vec2(80, 0));
      press('move_right');
      step(30);
      const x = p.globalPosition.x;
      press('jump');
      let drift = 0;
      for (let i = 0; i < 80; i++) {
        step(1);
        drift = Math.max(drift, Math.abs(p.globalPosition.x - x));
      }
      c.true(drift < 0.01, `x drift ${drift}`);
      c.true(p.grounded, 'landed');
    }),
  );

  // --- Slopes (PHY-D) ----------------------------------------------------------------

  it(
    'mirrored slope angle',
    checked((c) => {
      w = qa.world();
      qa.slope(w, -22);
      p = qa.spawn(w, new Vec2(0, -2));
      c.near(p.groundAngle, 338, 0.01, '360 - 22');
    }),
  );

  it(
    'ramps at speed stay grounded',
    checked((c) => {
      for (const fillet of [16, 48]) {
        for (const angle of [22, 45, -45]) {
          w = qa.world();
          qa.floorAt(w, -3000, 0);
          qa.curveTerrain(w, Vec2.ZERO, { shape: CurveShape.RAMP, slope_angle: angle, run_length: 200, lead_in: 64, lead_out: 3000, fillet_radius: fillet });
          p = qa.spawn(w, new Vec2(-200, 0));
          p.groundSpeed = 12;
          press('move_right');
          let air = 0;
          for (let i = 0; i < 60; i++) {
            step(1);
            if (!p.grounded) air += 1;
          }
          release('move_right');
          c.eq(air, 0, `ramp ${angle} deg, fillet ${fillet}, 12 px/f: airborne frames`);
        }
      }
    }),
  );

  // --- Collision (PHY-E) -------------------------------------------------------------

  it(
    'no tunnelling through thin walls at 16',
    checked((c) => {
      for (const t of [1, 8]) {
        for (let phase = 0; phase < 16; phase += 3) {
          w = qa.world();
          qa.floorAt(w);
          qa.rect(w, new Rect2(400 + phase, -100, t, 100));
          p = qa.spawn(w, Vec2.ZERO);
          p.groundSpeed = 16;
          step(40);
          c.true(p.globalPosition.x < 400 + phase, `ground: ${t} px wall, phase ${phase}`);
          w = qa.world();
          qa.floorAt(w, -2000, 2000, 400);
          qa.rect(w, new Rect2(300 + phase, -400, t, 800));
          p = qa.spawn(w, new Vec2(0, 400));
          p.respawnAt(new Vec2(0, -100));
          p.velocity = new Vec2(16, -2);
          step(40);
          c.true(p.globalPosition.x < 300 + phase, `air: ${t} px wall, phase ${phase}`);
        }
      }
    }),
  );

  it(
    'no tunnelling through ceilings at 16',
    checked((c) => {
      for (const t of [1, 8, 16]) {
        for (let phase = 0; phase < 8; phase += 3) {
          w = qa.world();
          qa.floorAt(w);
          qa.rect(w, new Rect2(-200, -200 - phase - t, 400, t));
          p = qa.spawn(w, Vec2.ZERO);
          p.launch(new Vec2(0, -16));
          step(40);
          c.true(p.globalPosition.y > -200 - phase, `${t} px ceiling, phase ${phase}`);
        }
      }
    }),
  );

  it(
    'top-only platforms',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(200, -60, 200, 10), TOP_ONLY);
      p = qa.spawn(w, Vec2.ZERO);
      p.groundSpeed = 6;
      press('move_right');
      let worst = 0;
      for (let i = 0; i < 90; i++) {
        step(1);
        worst = Math.max(worst, Math.abs(feetY(p)));
      }
      release('move_right');
      c.true(worst < 0.05, `no snap up when running under it (${worst})`);
      for (const vy of [8, 16]) {
        for (let phase = 0; phase < 8; phase += 3) {
          w = qa.world();
          qa.floorAt(w, -2000, 2000, 400);
          qa.rect(w, new Rect2(-100, 0, 200, 8), TOP_ONLY);
          p = qa.spawn(w, new Vec2(0, 400));
          p.respawnAt(new Vec2(0, -120 - phase));
          p.velocity = new Vec2(0, vy);
          for (let i = 0; i < 60; i++) {
            step(1);
            if (p.grounded) break;
          }
          c.near(feetY(p), 0, 0.05, `lands on it at ${vy} px/f (phase ${phase})`);
        }
      }
    }),
  );

  // --- Loops and terrain helpers (PHY-F) -----------------------------------------------

  it(
    'loop both ways at 8 and 16',
    checked((c) => {
      for (const speed of [8, -8, 16, -16]) {
        const r = loopRun(-500 * Math.sign(speed), speed);
        c.true(r.done && r.full && !r.airborne, `speed ${speed}: full loop on the ground`);
        c.eq(r.path, 0, `speed ${speed}: path A after the loop;`);
      }
    }),
  );

  it(
    'loop radii',
    checked((c) => {
      for (const radius of [48, 80, 160, 220]) {
        for (const speed of [10, -10]) {
          const r = loopRun(-700 * Math.sign(speed), speed, radius);
          c.true(r.done && r.full && !r.airborne && r.path === 0, `radius ${radius} speed ${speed}`);
        }
      }
    }),
  );

  it(
    'path switchers at 16 at every phase',
    checked((c) => {
      for (let phase = 0; phase < 16; phase += 2) {
        for (const dir of [1, -1]) {
          const r = loopRun(-(600 + phase) * dir, 16 * dir);
          c.true(r.done && !r.airborne && r.path === 0, `dir ${dir} phase ${phase}`);
        }
      }
    }),
  );

  it(
    'two loops in a row at 16',
    checked((c) => {
      for (let phase = 0; phase < 16; phase += 3) {
        w = qa.world();
        qa.floorAt(w, -4000, 6000);
        qa.loop(w, Vec2.ZERO);
        const second = qa.loop(w, new Vec2(700, 0));
        p = qa.spawn(w, new Vec2(-600 - phase, 0));
        p.groundSpeed = 16;
        press('move_right');
        let airborne = false;
        const goal = 700 + second.radius + second.thickness + second.floorMargin + 40;
        for (let i = 0; i < 400; i++) {
          step(1);
          airborne = airborne || !p.grounded;
          if (p.globalPosition.x > goal) break;
        }
        release('move_right');
        c.true(p.globalPosition.x > goal && !airborne, `phase ${phase}: second loop completed`);
      }
    }),
  );

  it(
    'loop radius set before entering the tree',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -4000, 4000);
      const lp = new TerrainLoop();
      lp.applyProps(new Props({ radius: 80 }));
      w.addChild(lp);
      p = qa.spawn(w, new Vec2(-600, 0));
      p.groundSpeed = 10;
      press('move_right');
      let ceiling = false;
      for (let i = 0; i < 400; i++) {
        step(1);
        ceiling = ceiling || p.collisionMode === CEILING;
        if (p.globalPosition.x > 250) break;
      }
      release('move_right');
      c.true(ceiling, 'went round');
    }),
  );

  it(
    'jump inside the loop leaves along the normal',
    checked((c) => {
      for (const target of [90, 180, 270]) {
        w = qa.world();
        qa.floorAt(w, -4000, 4000);
        qa.loop(w, Vec2.ZERO);
        p = qa.spawn(w, new Vec2(-500, 0));
        p.groundSpeed = 9;
        press('move_right');
        let jumped = false;
        for (let i = 0; i < 400; i++) {
          step(1);
          if (p.grounded && Math.abs(wrapf(p.groundAngle - target, -180, 180)) < 14) {
            press('jump');
            for (let k = 0; k < 3; k++) {
              step(1);
              if (!p.grounded) break;
            }
            const a = rad(p.groundAngle);
            c.near(p.velocity.dot(new Vec2(-Math.sin(a), -Math.cos(a))), 6.5, 0.01, `jump at ${target} deg`);
            jumped = true;
            break;
          }
        }
        releaseMoves();
        c.true(jumped, `reached ${target} deg`);
        holdUntil(c, 120, () => (centreInTerrain(p) ? `inside terrain after the jump at ${target}` : null));
      }
    }),
  );

  it(
    'reversing mid-loop falls back cleanly',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -4000, 4000);
      qa.loop(w, Vec2.ZERO);
      p = qa.spawn(w, new Vec2(-400, 0));
      p.groundSpeed = 9;
      press('move_right');
      for (let i = 0; i < 300; i++) {
        step(1);
        if (p.collisionMode === RIGHT_WALL && p.groundAngle > 60) break;
      }
      release('move_right');
      press('move_left');
      let ok = false;
      for (let i = 0; i < 400; i++) {
        step(1);
        c.true(!centreInTerrain(p), 'not inside terrain');
        if (p.grounded && p.collisionMode === FLOOR && Math.abs(p.groundAngle) < 1) {
          ok = true;
          break;
        }
      }
      release('move_left');
      c.true(ok, 'back on the floor');
    }),
  );

  it(
    'quarter pipe',
    checked((c) => {
      for (const speed of [10, 4]) {
        w = qa.world();
        qa.floorAt(w, -2000, 0);
        qa.curveTerrain(w, Vec2.ZERO, { shape: CurveShape.QUARTER_PIPE, radius: 96, thickness: 48, wall_height: 224 });
        p = qa.spawn(w, new Vec2(-300, 0));
        p.groundSpeed = speed;
        let risingVx = 0;
        let wentUp = false;
        for (let i = 0; i < 400; i++) {
          step(1);
          if (!p.grounded && p.velocity.y < -1) {
            wentUp = true;
            risingVx = Math.max(risingVx, Math.abs(p.velocity.x));
          }
        }
        if (speed > 5) c.true(wentUp && risingVx < 0.5, `10 px/f: straight-up launch (|vx| ${risingVx})`);
        c.true(p.grounded && p.globalPosition.x < 0 && !centreInTerrain(p), `${speed} px/f: back on the floor left of the pipe`);
      }
    }),
  );

  // --- Rolling and spin dash (PHY-G, PHY-H) ---------------------------------------------

  it(
    'roll deceleration, friction and no forward acceleration',
    checked((c) => {
      flat();
      p.groundSpeed = 6;
      press('move_down');
      step(1);
      release('move_down');
      press('move_left');
      let before = p.groundSpeed;
      step(1);
      c.near(p.groundSpeed - before, -0.125 - 0.0234375, 1e-6, 'decel + friction');
      release('move_left');
      press('move_right');
      before = p.groundSpeed;
      step(1);
      c.near(p.groundSpeed - before, -0.0234375, 1e-6, 'no forward acceleration');
    }),
  );

  it(
    'feet stay put on roll and unroll',
    checked((c) => {
      flat();
      const feet = feetY(p);
      p.groundSpeed = 2;
      press('move_down');
      step(1);
      release('move_down');
      c.near(feetY(p), feet, 0.01, 'roll');
      for (let i = 0; i < 200; i++) {
        step(1);
        if (p.state !== 'roll') break;
      }
      c.near(feetY(p), feet, 0.01, 'unroll');
    }),
  );

  it(
    'isAttacking only in ball states',
    checked((c) => {
      flat();
      c.true(!p.isAttacking(), 'idle');
      p.launch(new Vec2(0, -6));
      c.true(!p.isAttacking(), 'spring');
      step(60);
      GameState.addTickets(1);
      p.hurt(p.globalPosition.add(new Vec2(10, 0)));
      c.true(!p.isAttacking(), 'hurt');
      p.kill();
      c.true(!p.isAttacking(), 'dead');
    }),
  );

  it(
    'spin dash jump spam clamps the charge',
    checked((c) => {
      flat();
      startSpindash();
      let top = 0;
      for (let i = 0; i < 120; i++) {
        if (i % 2 === 0) press('jump');
        else release('jump');
        step(1);
        top = Math.max(top, p.spindashCharge);
        if (p.state !== 'spindash') break;
      }
      c.eq(p.state, 'spindash', 'still charging, never jumped');
      c.true(top <= 8 + 1e-9, `charge <= 8 (${top})`);
      release('jump');
      release('move_down');
      step(2);
      // Charge decays between the last press and the release: 8 + floor(7..8) / 2.
      c.true(p.groundSpeed >= 11.45 && p.groundSpeed <= 12, `near-max release (${p.groundSpeed})`);
    }),
  );

  it(
    'spin dash release and jump on the same frame',
    checked((c) => {
      flat();
      startSpindash();
      c.eq(p.state, 'spindash', 'charging');
      release('move_down');
      press('jump');
      step(3);
      c.true(p.grounded && p.state === 'roll', `released into a roll, no jump (${p.state})`);
    }),
  );

  it(
    'spin dash uphill on 22 degrees',
    checked((c) => {
      for (const angle of [22, -22]) {
        w = qa.world();
        qa.slope(w, angle);
        p = qa.spawn(w, new Vec2(0, -2));
        const uphill = angle > 0 ? 'move_right' : 'move_left';
        press(uphill);
        step(1);
        release(uphill);
        step(30);
        startSpindash();
        c.eq(p.state, 'spindash', `${angle} deg: spin dash starts facing uphill`);
        release('move_down');
        step(2);
        c.near(Math.abs(p.groundSpeed), 8, 0.2, `${angle} deg: release speed`);
      }
    }),
  );

  it(
    'spin dash against a wall',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(100, -100, 40, 100));
      p = qa.spawn(w, new Vec2(90, 0));
      press('move_right');
      step(10);
      release('move_right');
      const x = p.globalPosition.x;
      startSpindash();
      release('move_down');
      let drift = 0;
      for (let i = 0; i < 30; i++) {
        step(1);
        drift = Math.max(drift, Math.abs(p.globalPosition.x - x));
      }
      c.true(drift < 0.01 && p.globalPosition.x < 100, `no tunnel or jitter (${drift})`);
    }),
  );

  // --- Damage, API and pause (PHY-I, PHY-J) ---------------------------------------------

  it(
    'hurt and kill edge cases',
    checked((c) => {
      flat();
      GameState.addTickets(3);
      p.hurt(p.globalPosition.add(new Vec2(20, 0)));
      c.true(p.isInvincible(), 'invincible after a hit');
      p.kill();
      c.eq(p.state, 'dead', 'kill ignores invincibility');
      for (const order of ['hurt_kill', 'kill_hurt']) {
        flat();
        GameState.addTickets(3);
        let died = 0;
        p.died.connect(() => (died += 1));
        if (order === 'hurt_kill') {
          p.hurt(p.globalPosition);
          p.kill();
        } else {
          p.kill();
          p.hurt(p.globalPosition);
        }
        step(90);
        c.eq(died, 1, `${order} on one frame: one death`);
      }
      flat();
      p.kill();
      const vy = p.velocity.y;
      p.launch(new Vec2(0, -16));
      c.eq(p.state, 'dead', 'a spring does not revive');
      c.near(p.velocity.y, vy, 1e-6, 'no launch while dead');
    }),
  );

  it(
    'hurt from every state lands cleanly',
    checked((c) => {
      for (const s of ['idle', 'run', 'skid', 'jump', 'roll', 'spindash', 'spring'] as const) {
        flat();
        GameState.addTickets(5);
        enterState(s);
        c.eq(p.state, s, `setup ${s}`);
        p.hurt(p.globalPosition.add(new Vec2(20, 0)));
        c.eq(p.state, 'hurt', `hurt from ${s}`);
        releaseMoves();
        let landed = false;
        for (let i = 0; i < 200; i++) {
          step(1);
          if (p.grounded) {
            landed = true;
            break;
          }
        }
        c.true(landed && p.state === 'idle', `${s}: lands and goes idle (${p.state})`);
      }
    }),
  );

  it(
    'hurt on the loop ceiling',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, -4000, 4000);
      qa.loop(w, Vec2.ZERO);
      p = qa.spawn(w, new Vec2(-500, 0));
      GameState.addTickets(5);
      p.groundSpeed = 9;
      press('move_right');
      for (let i = 0; i < 300; i++) {
        step(1);
        if (p.collisionMode === CEILING) break;
      }
      p.hurt(p.globalPosition.add(new Vec2(-20, 0)));
      release('move_right');
      c.eq(p.collisionMode, FLOOR, 'mode reset');
      let landed = false;
      for (let i = 0; i < 300; i++) {
        step(1);
        if (centreInTerrain(p)) {
          c.fail('inside terrain');
          break;
        }
        if (p.grounded) {
          landed = true;
          break;
        }
      }
      c.true(landed, 'landed inside the loop');
    }),
  );

  it(
    'control locks',
    checked((c) => {
      flat();
      p.setControlLock(10);
      press('move_left');
      step(10);
      c.eq(p.groundSpeed, 0, 'left ignored for 10 frames');
      step(3);
      c.true(p.groundSpeed < 0, 'control back');
      release('move_left');
      flat();
      p.pushGround(8, 30);
      press('jump');
      let jumped = false;
      for (let i = 0; i < 4; i++) {
        step(1);
        jumped = jumped || !p.grounded;
      }
      c.true(jumped, 'jump works during a pushGround lock');
    }),
  );

  it(
    'clampRect right and top edges',
    checked((c) => {
      flat();
      p.clampRect = new Rect2(-100, -200, 200, 400);
      p.groundSpeed = 6;
      press('move_right');
      step(60);
      release('move_right');
      c.near(p.globalPosition.x, 100 - p.getRadii().x, 0.01, 'held at the right edge');
      c.true(p.state !== 'dead', 'not crushed at the right edge');
      p.launch(new Vec2(0, -12));
      let top = 0;
      for (let i = 0; i < 60; i++) {
        step(1);
        top = Math.min(top, p.globalPosition.y - p.getRadii().y);
      }
      c.true(top >= -200.01, `kept below the top edge (${top})`);
    }),
  );

  it(
    'pause freezes every state and drops presses',
    checked((c) => {
      for (const s of ['idle', 'run', 'skid', 'jump', 'roll', 'spindash', 'spring', 'hurt', 'dead'] as const) {
        flat();
        GameState.addTickets(5);
        enterState(s);
        const snap = () => `${p.globalPosition} ${p.velocity} ${p.state} ${p.groundSpeed} ${p.grounded}`;
        const snapshot = snap();
        tree.paused = true;
        press('jump');
        step(30);
        c.eq(snap(), snapshot, `${s}: frozen while paused`);
        tree.paused = false;
        step(2);
        if (s === 'idle' || s === 'run' || s === 'roll') c.true(p.grounded, `${s}: a jump pressed during pause does not fire`);
        releaseMoves();
      }
    }),
  );

  it(
    'tuning is read every frame',
    checked((c) => {
      flat();
      Tuning.physics.top_speed = 8;
      press('move_right');
      step(200);
      const reached = p.groundSpeed;
      Tuning.reset();
      c.near(reached, 8, 1e-6, 'a runtime top_speed change applies at once');
    }),
  );

  it(
    'steady motion far from the origin',
    checked((c) => {
      w = qa.world();
      qa.floorAt(w, 49000, 60000);
      p = qa.spawn(w, new Vec2(50000, 0));
      p.groundSpeed = 0.5;
      let worst = 0;
      let last = p.globalPosition.x;
      for (let i = 0; i < 30; i++) {
        step(1);
        worst = Math.max(worst, Math.abs(p.globalPosition.x - last - p.groundSpeed));
        last = p.globalPosition.x;
      }
      c.true(worst < 0.02, `per-frame error at x = 50000: ${worst}`);
    }),
  );
});
