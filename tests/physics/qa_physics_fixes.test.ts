// QA regression guards for the bugs fixed after review 01 (port of
// tests/qa/test_physics_fixes.gd): the loop geometry, narrow terrain, low
// tunnels, respawn from a ball, live constants, sharp crests and V valleys.

import { afterEach, beforeEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Tuning } from '../../src/core/tuning';
import { CEILING, FLOOR, LEFT_WALL, PATH_A, RIGHT_WALL, type Player } from '../../src/player/player';
import { wrapf } from '../../src/runtime/math';
import type { Node, Node2D } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { CurveShape } from '../../src/terrain/curve_terrain';
import type { TerrainLoop } from '../../src/terrain/loop';
import { checked, type Checks } from '../helpers/check';
import { PATH_A as LAYER_PATH_A, PATH_B as LAYER_PATH_B, qa, SOLID, TOP_ONLY } from '../helpers/qa';
import { centreInTerrain, feetY, press, release, releaseAll, step } from '../helpers/world';

interface TicketLike extends Node2D {
  velocity: Vec2;
}
const ticketModules = Object.values(
  import.meta.glob<{ ScatteredTicket?: { scatter(parent: Node, origin: Vec2, count: number): TicketLike[] } }>('../../src/player/scattered_ticket.ts', { eager: true }),
);
const ScatteredTicket = ticketModules[0]?.ScatteredTicket ?? null;
const tan = (d: number) => Math.tan((d * Math.PI) / 180);
const sin = (d: number) => Math.sin((d * Math.PI) / 180);
const cos = (d: number) => Math.cos((d * Math.PI) / 180);

beforeEach(() => {
  GameState.tickets = 0;
});

afterEach(() => {
  GameState.tickets = 0;
  releaseAll();
});

function loopWorld(start: Vec2, radius = 112): { lp: TerrainLoop; p: Player } {
  const w = qa.world();
  qa.floorAt(w, -5000, 5000);
  const lp = qa.loop(w, Vec2.ZERO, radius);
  return { lp, p: qa.spawn(w, start) };
}

/** Flat floor with a 32 px low tunnel from x 100 (ceiling bottom at y -32). */
function lowTunnel(length = 400, closed = false): Node2D {
  const w = qa.world();
  qa.floorAt(w);
  qa.rect(w, new Rect2(100, -332, length, 300));
  if (closed) qa.rect(w, new Rect2(100 + length, -400, 100, 400));
  return w;
}

function rollIn(w: Node2D, speed = 3): Player {
  const p = qa.spawn(w, Vec2.ZERO);
  p.groundSpeed = speed;
  press('move_down');
  step(1);
  release('move_down');
  return p;
}

/** A V with its bottom at (0, 0): left side `a` deg, right side `b` deg, depth `h`, optional fillet `f`, on `layer`. */
function vWorld(a: number, b: number, h: number, f = 0, layer = SOLID): Node2D {
  const w = qa.world();
  const left = -h / tan(a);
  const right = h / tan(b);
  const pts = [new Vec2(left - 400, -h), new Vec2(left, -h)];
  if (f > 0) {
    const cc = f / cos(a);
    const dt = f * sin(a);
    for (let k = 0; k < 25; k++) {
      const d = -dt + (2 * dt * k) / 24;
      pts.push(new Vec2(d, -cc + Math.sqrt(f * f - d * d)));
    }
  } else pts.push(Vec2.ZERO);
  pts.push(new Vec2(right, -h), new Vec2(right + 400, -h), new Vec2(right + 400, 400), new Vec2(left - 400, 400));
  qa.poly(w, pts, layer);
  return w;
}

function notInValley(p: Player): boolean {
  return (p as unknown as { _inValley?: boolean })._inValley !== true;
}

function holdUntil(c: Checks, p: Player, frames: number, bad: () => string | null): void {
  for (let i = 0; i < frames; i++) {
    step(1);
    const msg = bad();
    if (msg !== null) {
      c.fail(`frame ${i}: ${msg}`);
      return;
    }
  }
  void p;
}

describe('QA physics fixes', () => {
  // --- BUG-01-01: running off the loop top --------------------------------------

  it(
    'BUG-01-01: off the loop top lands on the floor',
    checked((c) => {
      for (const dir of [1, -1]) {
        for (const path of [0, 1]) {
          const { lp, p } = loopWorld(new Vec2(-600, 0));
          p.respawnAt(new Vec2(0, -2 * lp.radius - lp.thickness - 40));
          p.setCollisionPath(path);
          for (let i = 0; i < 60; i++) {
            step(1);
            if (p.grounded) break;
          }
          p.groundSpeed = 3 * dir;
          const action = dir > 0 ? 'move_right' : 'move_left';
          press(action);
          let buried = -1;
          let air = 0;
          for (let i = 0; i < 300; i++) {
            step(1);
            if (buried < 0 && centreInTerrain(p)) buried = i;
            if (!p.grounded) air += 1;
            if (p.grounded && p.collisionMode === FLOOR && Math.abs(feetY(p)) < 0.05) break;
          }
          release(action);
          const label = `dir ${dir} path ${path}`;
          c.true(buried < 0, `${label}: inside terrain from frame ${buried}`);
          c.true(p.grounded && Math.abs(feetY(p)) < 0.05, `${label}: lands on the floor (${p.globalPosition})`);
          if ((dir > 0 && path === 0) || (dir < 0 && path === 1)) c.eq(air, 0, `${label}: rides the hill foot down without leaving it;`);
        }
      }
    }),
  );

  it(
    'loop feet are hills from outside',
    checked((c) => {
      for (const speed of [3, 8]) {
        const { p } = loopWorld(new Vec2(200, 0));
        p.groundSpeed = -speed;
        press('move_left');
        holdUntil(c, p, 200, () => (centreInTerrain(p) ? `speed ${speed}: inside terrain (${p.globalPosition})` : null));
        release('move_left');
      }
    }),
  );

  it(
    'loop top switcher paths',
    checked((c) => {
      for (const dir of [1, -1]) {
        const { p } = loopWorld(new Vec2(-400 * dir, 0));
        p.groundSpeed = 10 * dir;
        const action = dir > 0 ? 'move_right' : 'move_left';
        press(action);
        let descending = -1;
        for (let i = 0; i < 300; i++) {
          step(1);
          if (p.collisionMode === (dir > 0 ? LEFT_WALL : RIGHT_WALL)) descending = p.collisionPath;
          if (p.globalPosition.x * dir > 300) break;
        }
        release(action);
        c.eq(descending, dir > 0 ? 1 : 0, `dir ${dir}: path while coming down after the top;`);
        c.eq(p.collisionPath, PATH_A, `dir ${dir}: path A after the loop;`);
      }
    }),
  );

  it(
    'loop too slow fails cleanly',
    checked((c) => {
      for (const dir of [1, -1]) {
        for (const speed of [5, 7, 8.5]) {
          const { p } = loopWorld(new Vec2(-260 * dir, 0));
          p.groundSpeed = speed * dir;
          holdUntil(c, p, 600, () => (centreInTerrain(p) ? `dir ${dir} speed ${speed}: inside terrain` : null));
          c.true(p.grounded && p.collisionMode === FLOOR && Math.abs(feetY(p)) < 2, `dir ${dir} speed ${speed}: back on the floor`);
        }
      }
    }),
  );

  it(
    'loop radii 52 to 200 at every speed',
    checked((c) => {
      for (const radius of [52, 112, 200]) {
        for (const speed of [8, 12, 16]) {
          for (const dir of [1, -1]) {
            const { lp, p } = loopWorld(new Vec2(-(radius + 300) * dir, 0), radius);
            p.groundSpeed = speed * dir;
            const action = dir > 0 ? 'move_right' : 'move_left';
            press(action);
            const exitX = lp.radius + lp.thickness + lp.floorMargin + 40;
            const modes = new Set<number>();
            let air = false;
            let done = false;
            for (let i = 0; i < 600; i++) {
              step(1);
              modes.add(p.collisionMode);
              air = air || !p.grounded;
              if (p.globalPosition.x * dir > exitX) {
                done = true;
                break;
              }
            }
            release(action);
            const full = modes.has(RIGHT_WALL) && modes.has(CEILING) && modes.has(LEFT_WALL);
            c.true(done && full && !air && p.collisionPath === 0, `radius ${radius} speed ${speed} dir ${dir}: done ${done} full ${full} air ${air} path ${p.collisionPath}`);
          }
        }
      }
    }),
  );

  // --- BUG-01-02: narrow terrain ------------------------------------------------

  it(
    'BUG-01-02: lands on narrow pillars',
    checked((c) => {
      for (const width of [8, 16]) {
        const w = qa.world();
        qa.floorAt(w, -2000, 2000, 300);
        qa.rect(w, new Rect2(-width / 2, 0, width, 300));
        const p = qa.spawn(w, new Vec2(0, 300));
        p.respawnAt(new Vec2(0, -80));
        for (let i = 0; i < 90; i++) {
          step(1);
          if (centreInTerrain(p)) {
            c.fail(`${width} px pillar: centre inside it at frame ${i}`);
            break;
          }
          if (p.grounded) break;
        }
        c.near(feetY(p), 0, 0.05, `${width} px pillar: standing on top`);
      }
    }),
  );

  // --- BUG-01-03: unrolling under a low ceiling -----------------------------------

  it(
    'BUG-01-03: keeps rolling under a low ceiling',
    checked((c) => {
      const w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(100, -332, 400, 300)); // 32 px tunnel
      const p = qa.spawn(w, Vec2.ZERO);
      p.groundSpeed = 3;
      press('move_down');
      step(1);
      release('move_down');
      holdUntil(c, p, 900, () => {
        const head = p.globalPosition.y - p.getRadii().y;
        return p.globalPosition.x > 100 && p.globalPosition.x < 500 && head < -32.01 ? `${p.state} with the head at ${head} inside the ceiling (-32)` : null;
      });
      c.true(p.globalPosition.x > 500, `crept out of the far end (x ${p.globalPosition.x})`);
    }),
  );

  // --- BUG-01-04: respawnAt from the ball hitbox ----------------------------------

  it(
    'BUG-01-04: respawnAt is exact from any state',
    checked((c) => {
      for (const setup of ['roll', 'jump'] as const) {
        const w = qa.world();
        qa.floorAt(w);
        const p = qa.spawn(w, Vec2.ZERO);
        if (setup === 'roll') {
          p.groundSpeed = 4;
          press('move_down');
          step(1);
          release('move_down');
        } else {
          press('jump');
          step(5);
          release('jump');
        }
        c.eq(p.state, setup, 'setup');
        p.respawnAt(new Vec2(300, -19));
        c.true(p.globalPosition.equals(new Vec2(300, -19)), `respawnAt from ${setup} (${p.globalPosition})`);
      }
    }),
  );

  // --- Constants in PhysicsConstants are read live ----------------------------------

  it(
    'moved constants are read live',
    checked((c) => {
      const w = qa.world();
      qa.floorAt(w);
      const p = qa.spawn(w, Vec2.ZERO);
      const tp = Tuning.physics; // after qa.world(), which resets the tuning
      tp.skid_min_speed = 3;
      p.groundSpeed = 3.5;
      press('move_left');
      step(1);
      const skid = p.state;
      release('move_left');
      tp.turnaround_speed = 1;
      p.groundSpeed = 0.25;
      press('move_left');
      step(1);
      const turned = p.groundSpeed;
      release('move_left');
      let ticketSpeed = 5;
      if (ScatteredTicket) {
        tp.ticket_scatter_speed_first = 5;
        ticketSpeed = ScatteredTicket.scatter(w, new Vec2(0, -100), 1)[0]!.velocity.length();
      }
      Tuning.reset();
      c.eq(skid, 'skid', 'skid_min_speed');
      c.near(turned, -1, 1e-6, 'turnaround_speed');
      c.near(ticketSpeed, 5, 1e-6, 'ticket_scatter_speed_first');
    }),
  );

  // --- Re-check #2: BUG-01-06..09 and the head-height wall ray ----------------------

  it(
    'BUG-01-06: a low dead end can be left',
    checked((c) => {
      // Holding the other way.
      let p = rollIn(lowTunnel(300, true), 4);
      step(240);
      const x0 = p.globalPosition.x;
      press('move_left');
      step(120);
      release('move_left');
      c.true(p.globalPosition.x < x0 - 20, `holding left backs out (x ${x0} -> ${p.globalPosition.x})`);
      // No input: turns back off the wall and leaves.
      p = rollIn(lowTunnel(300, true), 4);
      step(900);
      c.true(p.globalPosition.x < 100, `no input: creeps back out of the entrance (x ${p.globalPosition.x})`);
      // Down + jump spin dashes out of a force-roll.
      p = rollIn(lowTunnel(300, true), 4);
      step(240);
      press('move_left');
      step(2);
      release('move_left');
      press('move_down');
      step(2);
      press('jump');
      step(1);
      release('jump');
      step(2);
      c.eq(p.state, 'spindash', 'down + jump starts a spin dash from a force-roll');
      release('move_down');
      step(60);
      c.true(p.globalPosition.x < 100, `spin dashed out (x ${p.globalPosition.x})`);
    }),
  );

  it(
    'force roll through an open tunnel with every input',
    checked((c) => {
      for (const mode of ['none', 'forward', 'back'] as const) {
        const p = rollIn(lowTunnel());
        for (let i = 0; i < 200; i++) {
          step(1);
          if (Math.abs(p.groundSpeed) <= 0.51) break;
        }
        if (mode === 'forward') press('move_right');
        else if (mode === 'back') press('move_left');
        for (let i = 0; i < 900; i++) {
          step(1);
          const head = p.globalPosition.y - p.getRadii().y;
          c.true(!(p.globalPosition.x > 100 && p.globalPosition.x < 500 && head < -32.01), `${mode}: head inside the ceiling at x ${p.globalPosition.x}`);
          if (p.globalPosition.x > 560 || p.globalPosition.x < 40) break;
        }
        release('move_right');
        release('move_left');
        if (mode === 'back') c.true(p.globalPosition.x < 100, `back: out of the entrance (x ${p.globalPosition.x})`);
        else c.true(p.globalPosition.x > 500, `${mode}: out of the far end (x ${p.globalPosition.x})`);
      }
    }),
  );

  it(
    'BUG-01-07: radius 48 always exits',
    checked((c) => {
      for (const speed of [8, 10, 12]) {
        for (const phase of [0, 3, 7]) {
          const { lp, p } = loopWorld(new Vec2(-400 - phase, 0), 48);
          p.groundSpeed = speed;
          press('move_right');
          const exitX = lp.radius + lp.thickness + lp.floorMargin + 40;
          let done = false;
          for (let i = 0; i < 300; i++) {
            step(1);
            if (p.globalPosition.x > exitX) {
              done = true;
              break;
            }
          }
          release('move_right');
          c.true(done, `speed ${speed} phase ${phase}: exits the radius-48 loop`);
        }
      }
    }),
  );

  it(
    'BUG-01-08: small loop entry has no angle spike',
    checked((c) => {
      for (const radius of [64, 80]) {
        for (const phase of [0, 1.3, 3.7]) {
          const { lp, p } = loopWorld(new Vec2(-400 - phase, 0), radius);
          p.groundSpeed = 10;
          press('move_right');
          const exitX = lp.radius + lp.thickness + lp.floorMargin + 40;
          let last = p.groundAngle;
          let wasGrounded = true;
          let worst = 0;
          for (let i = 0; i < 300; i++) {
            step(1);
            if (p.grounded && wasGrounded) worst = Math.max(worst, Math.abs(wrapf(p.groundAngle - last, -180, 180)));
            last = p.groundAngle;
            wasGrounded = p.grounded;
            if (p.globalPosition.x > exitX) break;
          }
          release('move_right');
          c.true(worst < 40, `radius ${radius} phase ${phase}: largest grounded angle step ${worst}`);
          c.true(p.globalPosition.x > exitX, `radius ${radius} phase ${phase}: completed`);
        }
      }
    }),
  );

  it(
    'BUG-01-09: spring under a narrow column',
    checked((c) => {
      const w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(-8, -400, 16, 300)); // column down to y -100
      const p = qa.spawn(w, Vec2.ZERO);
      p.launch(new Vec2(0, -10));
      holdUntil(c, p, 60, () => {
        const head = p.globalPosition.y - p.getRadii().y;
        return head >= -100.5 && !centreInTerrain(p) ? null : `head ${head} above the column's bottom`;
      });
    }),
  );

  it(
    'walkers stop at low tunnel mouths only',
    checked((c) => {
      for (const h of [32, 37, 38, 48]) {
        const w = qa.world();
        qa.floorAt(w);
        qa.rect(w, new Rect2(100, -h - 300, 400, 300));
        const p = qa.spawn(w, Vec2.ZERO);
        p.groundSpeed = 3;
        press('move_right');
        step(120);
        release('move_right');
        if (h < 37.5) c.near(p.globalPosition.x, 90, 0.01, `${h} px mouth blocks a walker`);
        else c.true(p.globalPosition.x > 400, `${h} px mouth lets a walker in`);
      }
      // Fast runners stop at the mouth too, and can still jump there.
      const w2 = qa.world();
      qa.floorAt(w2);
      qa.rect(w2, new Rect2(100, -332, 400, 300));
      const q = qa.spawn(w2, Vec2.ZERO);
      q.groundSpeed = 16;
      step(30);
      c.true(q.globalPosition.x < 100 && !centreInTerrain(q), '16 px/f stops at the mouth');
      press('jump');
      step(3);
      release('jump');
      c.true(!q.grounded, 'can jump at the mouth');
    }),
  );

  it(
    'head-height ray ignores top-only and the other path',
    checked((c) => {
      for (const layer of [TOP_ONLY, LAYER_PATH_B, LAYER_PATH_A]) {
        const w = qa.world();
        qa.floorAt(w);
        qa.rect(w, new Rect2(100, -40, 400, 10), layer); // bottom 30 px above the floor
        const p = qa.spawn(w, Vec2.ZERO);
        p.groundSpeed = 3;
        press('move_right');
        step(120);
        release('move_right');
        if (layer === LAYER_PATH_A) c.true(p.globalPosition.x < 100, 'own path at head height blocks');
        else c.true(p.globalPosition.x > 300, `layer ${layer} at head height does not block`);
      }
    }),
  );

  // --- Re-check #3: BUG-01-10, BUG-01-11 and the V-valley rule ------------------------

  it(
    'BUG-01-10: sharp 45 degree crests and valleys',
    checked((c) => {
      for (const valley of [false, true]) {
        for (const dir of [1, -1]) {
          for (const speed of [4, 6, 10, 14]) {
            let w: Node2D;
            if (valley) w = vWorld(45, 45, 150);
            else {
              w = qa.world();
              qa.floorAt(w, -3000, 3000);
              qa.poly(w, [new Vec2(-150, 0), new Vec2(0, -150), new Vec2(150, 0)]);
            }
            const p = qa.spawn(w, new Vec2(-350 * dir, valley ? -150 : 0));
            p.groundSpeed = speed * dir;
            const action = dir > 0 ? 'move_right' : 'move_left';
            press(action);
            let drop = 0;
            let walls = false;
            let last = Math.abs(p.groundSpeed);
            for (let i = 0; i < 150; i++) {
              step(1);
              if (p.grounded) {
                drop = Math.max(drop, last - Math.abs(p.groundSpeed));
                walls = walls || p.collisionMode !== FLOOR;
              }
              last = Math.abs(p.groundSpeed);
            }
            release(action);
            const label = `${valley ? '45 valley' : '45 crest'} dir ${dir} at ${speed}`;
            c.true(!walls, `${label}: stays in floor mode`);
            c.true(drop < 0.2, `${label}: lost ${drop} px/frame in one frame`);
          }
        }
      }
    }),
  );

  it(
    'BUG-01-11: sharp V valleys can be left',
    checked((c) => {
      // Run in, settle, then jump out holding right (shallow V) or spin dash out (deep).
      for (const [a, b, h, how] of [
        [50, 50, 150, 'spindash'],
        [60, 60, 150, 'spindash'],
        [70, 50, 64, 'jump'],
        [60, 60, 64, 'jump'],
      ] as const) {
        const w = vWorld(a, b, h);
        const p = qa.spawn(w, new Vec2(-h / tan(a) - 100, -h));
        p.groundSpeed = 6;
        press('move_right');
        step(200);
        release('move_right');
        step(120);
        if (how === 'jump') {
          press('move_right');
          press('jump');
          step(25);
          release('jump');
          step(120);
          release('move_right');
        } else {
          press('move_down');
          step(3);
          for (let k = 0; k < 6; k++) {
            press('jump');
            step(1);
            release('jump');
            step(1);
          }
          release('move_down');
          step(200);
        }
        const out = p.globalPosition.y < -h - 10 || Math.abs(p.globalPosition.x) > h * 2;
        c.true(out, `V ${a}/${b} depth ${h}: out by ${how} (at ${p.globalPosition}, ${p.state})`);
      }
    }),
  );

  it(
    'the V rule stays off on loops and quarter pipes',
    checked((c) => {
      for (const radius of [48, 112]) {
        for (const speed of [0, 1, 4]) {
          const { p } = loopWorld(new Vec2(-20, 0), radius);
          p.groundSpeed = speed;
          holdUntil(c, p, 300, () => (notInValley(p) && !centreInTerrain(p) ? null : `loop r${radius} from ${speed} px/f`));
        }
      }
      for (const speed of [0.5, 2, 5]) {
        const w = qa.world();
        qa.floorAt(w, -2000, 0);
        qa.curveTerrain(w, Vec2.ZERO, { shape: CurveShape.QUARTER_PIPE, radius: 96, thickness: 48, wall_height: 224 });
        const q = qa.spawn(w, new Vec2(-40, 0));
        q.groundSpeed = speed;
        holdUntil(c, q, 300, () => (notInValley(q) ? null : `quarter pipe bottom from ${speed} px/f`));
      }
    }),
  );

  it(
    'V valley layers and landings',
    checked((c) => {
      // Path B V is not solid for a path A player; a top-only V is stood on.
      for (const layer of [TOP_ONLY, LAYER_PATH_B]) {
        const w = vWorld(60, 60, 150, 0, layer);
        const p = qa.spawn(w, new Vec2(-200, -150));
        p.respawnAt(new Vec2(0, -150));
        step(120);
        if (layer === LAYER_PATH_B) c.true(p.globalPosition.y > 300, 'path B V: fell through on path A');
        else c.true(p.grounded && !centreInTerrain(p), 'top-only V: standing in it');
      }
      // Landing in a sharp V after a hit or a spring.
      for (const how of ['hurt', 'spring'] as const) {
        const w2 = vWorld(60, 60, 150);
        const q = qa.spawn(w2, new Vec2(-200, -150));
        GameState.addTickets(5);
        q.respawnAt(new Vec2(-30, -120));
        step(1);
        if (how === 'hurt') q.hurt(q.globalPosition.add(new Vec2(-20, 0)));
        else q.launch(new Vec2(1, -3));
        holdUntil(c, q, 240, () => (centreInTerrain(q) ? `${how} landing: inside terrain` : null));
        c.true(q.grounded && q.state !== 'hurt' && q.state !== 'spring', `${how}: landed (${q.state})`);
      }
    }),
  );
});
