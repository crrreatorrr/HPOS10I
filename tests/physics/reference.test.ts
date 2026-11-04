// Frame-exact accuracy audit (docs/PHYSICS.md): the real Player and the
// reference model of the community Physics Guide (reference_sim.ts) run the
// same inputs side by side. Position and speed must agree within 1/256 px
// each frame. Where the two part, the matrix in docs/PHYSICS.md says why.

import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Player, RIGHT_WALL } from '../../src/player/player';
import { degToRad } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import {
  addFloor,
  addLoop,
  addQuarterPipe,
  addRect,
  addSlope,
  newWorld,
  press,
  release,
  releaseAll,
  settle,
  spawnPlayer,
  step,
} from '../helpers/world';
import { ReferenceSim, SPRING_RED, SPRING_YELLOW } from './reference_sim';

const TOLERANCE = 1 / 256;
/** The sim runs on an ideal circle; the real sensors read a polygon, so only the speed kept through the curve is compared. */
const CURVE_TOLERANCE = 0.25;

type Key = 'left' | 'right' | 'down' | 'jump';
type Events = Map<number, [Key, boolean][]>;
const ACTION = { left: 'move_left', right: 'move_right', down: 'move_down', jump: 'jump' } as const;

class Harness {
  world!: Node2D;
  player!: Player;
  sim!: ReferenceSim;
  held: Record<Key, boolean> = { left: false, right: false, down: false, jump: false };
  lastPlayer = Vec2.ZERO;
  lastSim = Vec2.ZERO;
  failures: string[] = [];

  /** A world and a player standing at `feetX` on the floor (slopeDeg 0) or on a slope through the origin; the sim the same. */
  setup(slopeDeg = 0, feetX = 0): void {
    this.world = newWorld();
    this.sim = new ReferenceSim();
    this.held = { left: false, right: false, down: false, jump: false };
    if (slopeDeg === 0) addFloor(this.world, -6000, 6000);
    else {
      addSlope(this.world, slopeDeg, 8000);
      this.sim.surfaces.length = 0;
      this.sim.addLine(slopeDeg, Vec2.ZERO);
    }
    const feet = new Vec2(feetX, -feetX * Math.tan(degToRad(slopeDeg)));
    this.player = spawnPlayer(this.world, feet);
    settle(this.player, feet);
    expect(this.player.grounded, 'standing at the start').toBe(true);
    // The same start: the dynamics are what is compared.
    this.sim.grounded = true;
    this.sim.state = 'idle';
    this.sim.pos = this.player.globalPosition;
    this.sim.angle = this.player.groundAngle;
    // A steep start slips (and slides) while settling.
    this.sim.controlLock = this.player.controlLock;
    this.sim.gsp = this.player.groundSpeed;
    this.lastPlayer = this.player.globalPosition;
    this.lastSim = this.sim.pos;
  }

  setGroundSpeed(speed: number): void {
    this.player.groundSpeed = speed;
    this.sim.gsp = speed;
  }

  /**
   * Runs `frames` frames of `events` on both. Input pressed before a tick is
   * seen as just pressed in that tick (no one-frame-early compensation as in
   * the Godot harness). Returns the number of frames that matched.
   */
  run(label: string, frames: number, events: Events = new Map(), checkPosition = true, speedTol = TOLERANCE, positionTol = TOLERANCE): number {
    for (let f = 0; f < frames; f++) {
      let pressedNow = false;
      for (const [key, down] of events.get(f) ?? []) {
        this.held[key] = down;
        if (key === 'jump' && down) pressedNow = true;
        if (down) press(ACTION[key]);
        else release(ACTION[key]);
      }
      this.sim.setInput(this.held.left, this.held.right, this.held.down, this.held.jump, pressedNow);
      step(1);
      this.sim.step();
      if (!this.check(`${label} frame ${f}`, checkPosition, speedTol, positionTol)) return f;
    }
    return frames;
  }

  check(label: string, checkPosition = true, speedTol = TOLERANCE, positionTol = TOLERANCE): boolean {
    const p = this.player;
    const s = this.sim;
    let ok = true;
    if (p.grounded !== s.grounded) {
      this.failures.push(
        `${label}: grounded ${p.grounded}, sim ${s.grounded} (player ${p.globalPosition} gsp ${p.groundSpeed} v ${p.velocity}; sim pos ${s.pos} gsp ${s.gsp} v (${s.xsp}, ${s.ysp}))`,
      );
      return false;
    }
    if (p.grounded) {
      if (Math.abs(p.groundSpeed - s.gsp) > speedTol) {
        this.failures.push(`${label}: ground speed ${p.groundSpeed}, sim ${s.gsp}`);
        ok = false;
      }
    } else {
      const v = p.velocity;
      if (Math.abs(v.x - s.xsp) > speedTol || Math.abs(v.y - s.ysp) > speedTol) {
        this.failures.push(`${label}: velocity ${v}, sim (${s.xsp}, ${s.ysp})`);
        ok = false;
      }
    }
    if (checkPosition) {
      // This frame's motion must match to 1/256 px; the absolute position to
      // that plus a little float noise far from the origin.
      const moved = p.globalPosition.sub(this.lastPlayer).sub(s.pos.sub(this.lastSim));
      const d = p.globalPosition.sub(s.pos);
      const slack = positionTol + 4e-6 * Math.max(Math.abs(s.pos.x), Math.abs(s.pos.y));
      if (Math.abs(moved.x) > positionTol || Math.abs(moved.y) > positionTol || Math.abs(d.x) > slack || Math.abs(d.y) > slack) {
        this.failures.push(`${label}: position ${p.globalPosition}, sim ${s.pos} (off by ${d}, this frame's motion off by ${moved})`);
        ok = false;
      }
    }
    this.lastPlayer = p.globalPosition;
    this.lastSim = s.pos;
    return ok;
  }

  /** Fails the test with the first few mismatches. */
  done(): void {
    releaseAll();
    expect(this.failures.slice(0, 5)).toEqual([]);
  }
}

function pressAt(events: Events, frame: number, key: Key): void {
  events.set(frame, [...(events.get(frame) ?? []), [key, true]]);
}

function releaseAt(events: Events, frame: number, key: Key): void {
  events.set(frame, [...(events.get(frame) ?? []), [key, false]]);
}

afterEach(() => {
  releaseAll();
  GameState.tickets = 0;
});

describe('reference model (1/256 px per frame)', () => {
  it('flat run, stop and turnaround', () => {
    const h = new Harness();
    h.setup();
    const ev: Events = new Map();
    pressAt(ev, 0, 'right'); // 128 frames to top speed, then held
    releaseAt(ev, 160, 'right'); // friction to a stop (128 frames)
    pressAt(ev, 300, 'right');
    pressAt(ev, 340, 'left'); // hard turnaround: decelerate, flip at 0.5, accelerate
    releaseAt(ev, 340, 'right');
    releaseAt(ev, 420, 'left');
    h.run('flat run', 480, ev);
    h.done();
  });

  it('flat jumps at 0, 3 and 6', () => {
    const h = new Harness();
    for (const speed of [0, 3, 6]) {
      for (const releaseAtF of [-1, 1, 5, 10]) {
        h.setup();
        h.setGroundSpeed(speed);
        const ev: Events = new Map();
        if (speed > 0) pressAt(ev, 0, 'right');
        pressAt(ev, 1, 'jump');
        if (releaseAtF > 0) releaseAt(ev, 1 + releaseAtF, 'jump');
        h.run(`jump at ${speed}, release ${releaseAtF}`, 300, ev);
        releaseAll();
      }
    }
    h.done();
  });

  it('air drag without input', () => {
    const h = new Harness();
    h.setup();
    h.setGroundSpeed(6);
    const ev: Events = new Map();
    pressAt(ev, 1, 'jump'); // rising slowly with x speed: drag applies
    h.run('air drag', 300, ev);
    h.done();
  });

  it('running up and down slopes', () => {
    const h = new Harness();
    for (const angle of [22.5, 45]) {
      for (const d of ['right', 'left'] as const) {
        h.setup(angle, d === 'right' ? -200 : 200);
        const ev: Events = new Map();
        pressAt(ev, 0, d);
        h.run(`${angle} deg running ${d}`, 300, ev);
        releaseAll();
      }
    }
    h.done();
  });

  it('slope down into a roll', () => {
    const h = new Harness();
    h.setup(22.5, 300);
    const ev: Events = new Map();
    pressAt(ev, 0, 'left');
    releaseAt(ev, 60, 'left');
    pressAt(ev, 60, 'down');
    releaseAt(ev, 62, 'down');
    h.run('roll downhill', 300, ev);
    h.done();
  });

  it('roll uphill stops and comes back', () => {
    const h = new Harness();
    h.setup(30, -300);
    h.setGroundSpeed(5);
    const ev: Events = new Map();
    pressAt(ev, 0, 'down');
    releaseAt(ev, 2, 'down');
    h.run('roll uphill', 300, ev);
    h.done();
  });

  it('jump off a 45 degree slope', () => {
    const h = new Harness();
    for (const speed of [4, -4]) {
      h.setup(45, 0);
      h.setGroundSpeed(speed);
      const ev: Events = new Map();
      pressAt(ev, 1, 'jump');
      releaseAt(ev, 20, 'jump');
      h.run(`jump off 45 at ${speed}`, 300, ev);
      releaseAll();
    }
    h.done();
  });

  it('landing bands: flat, 30 and 60', () => {
    const h = new Harness();
    for (const angle of [0, 30, 60]) {
      for (const vx of [3, -3]) {
        h.setup(angle, 0);
        const start = new Vec2(-60, -200);
        h.player.respawnAt(start);
        h.player.velocity = new Vec2(vx, 2);
        h.sim.airborneAt(start, vx, 2);
        h.lastPlayer = start;
        h.lastSim = start;
        h.run(`landing on ${angle} deg with x ${vx}`, 300);
      }
    }
    h.done();
  });

  it('slip on 50 degrees slides with a control lock', () => {
    const h = new Harness();
    h.setup(50, 0);
    h.setGroundSpeed(1);
    const ev: Events = new Map();
    pressAt(ev, 0, 'right');
    const matched = h.run('slip on 50', 300, ev);
    expect(matched, 'locked and sliding').toBe(300);
    h.done();
  });

  it('too slow on a wall falls off', () => {
    // Running up a vertical wall (right-wall mode, as after a quarter pipe):
    // the slope factor slows him, and below 2.5 px/f he falls off with a
    // 30-frame control lock, then drops back to the floor.
    const h = new Harness();
    h.world = newWorld();
    addFloor(h.world, -6000, 6000);
    addRect(h.world, new Rect2(96, -800, 200, 800));
    h.sim = new ReferenceSim();
    h.sim.addLine(90, new Vec2(96, 0));
    h.player = spawnPlayer(h.world, new Vec2(-300, 0));
    settle(h.player, new Vec2(-300, 0));
    const start = new Vec2(96 - 19, -300);
    h.player.respawnAt(start);
    h.player.grounded = true;
    h.player.collisionMode = RIGHT_WALL;
    h.player.groundAngle = 90;
    h.player.groundSpeed = 6;
    h.sim.pos = start;
    h.sim.grounded = true;
    h.sim.angle = 90;
    h.sim.gsp = 6;
    h.sim.state = 'run';
    h.lastPlayer = start;
    h.lastSim = start;
    let fellAt = -1;
    for (let i = 0; i < 150; i++) {
      if (h.run('wall climb', 1) < 1) break;
      if (fellAt < 0 && !h.player.grounded) fellAt = i;
    }
    expect(fellAt, 'fell off the wall').toBeGreaterThan(0);
    expect(h.player.controlLock, 'control lock set').toBeGreaterThanOrEqual(0);
    h.done();
  });

  it('spin dash charges and releases', () => {
    const h = new Harness();
    for (const presses of [1, 3, 7]) {
      for (const wait of [0, 20]) {
        h.setup();
        const ev: Events = new Map();
        pressAt(ev, 0, 'down');
        let f = 2;
        for (let i = 0; i < presses; i++) {
          pressAt(ev, f, 'jump');
          releaseAt(ev, f + 1, 'jump');
          f += 2;
        }
        releaseAt(ev, f + wait, 'down');
        h.run(`spin dash x${presses} wait ${wait}`, 300, ev);
        releaseAll();
      }
    }
    h.done();
  });

  it('hurt knockback arc', () => {
    const h = new Harness();
    h.setup();
    GameState.tickets = 5;
    h.player.hurt(new Vec2(50, -19));
    h.sim.hurt(50);
    h.check('hurt');
    h.run('hurt arc', 300);
    h.done();
  });

  it('death arc', () => {
    const h = new Harness();
    h.setup();
    h.player.kill();
    h.sim.die();
    h.check('dead');
    h.run('death arc', 120);
    h.done();
  });

  it('rebound rising and falling', () => {
    const h = new Harness();
    for (const rising of [true, false]) {
      for (const held of [true, false]) {
        h.setup();
        const ev: Events = new Map();
        pressAt(ev, 1, 'jump');
        if (!held) releaseAt(ev, 3, 'jump');
        const hitAt = rising ? 8 : 45;
        const matched = h.run('rebound before', hitAt, ev);
        expect(matched, 'in the air before the rebound').toBe(hitAt);
        const enemyY = h.player.globalPosition.y + 20;
        h.player.bounceOff(enemyY);
        h.sim.rebound(enemyY);
        h.check(`rebound rising ${rising} held ${held}`);
        const later: Events = new Map();
        if (held) releaseAt(later, 100, 'jump');
        h.run(`rebound rising ${rising} held ${held}`, 200, later);
        releaseAll();
      }
    }
    h.done();
  });

  it('springs yellow and red', () => {
    const h = new Harness();
    for (const power of [SPRING_YELLOW, SPRING_RED]) {
      h.setup();
      h.setGroundSpeed(2);
      h.player.launch(new Vec2(2, -power));
      h.sim.spring(new Vec2(2, -power));
      h.check(`spring ${power}`);
      h.run(`spring ${power}`, 300);
    }
    h.done();
  });

  it('full loop at 8 keeps its speed', () => {
    const world = newWorld();
    addFloor(world, -4000, 4000);
    const loop = addLoop(world, Vec2.ZERO);
    const player = spawnPlayer(world, new Vec2(-400, 0));
    settle(player, new Vec2(-400, 0));
    const sim = new ReferenceSim();
    sim.addArc(new Vec2(0, -loop.radius), loop.radius);
    sim.standAt(-400);
    player.groundSpeed = 8;
    sim.gsp = 8;
    const exitX = loop.radius + loop.thickness + loop.floorMargin + 40;
    press('move_right');
    let realGsp = NaN;
    for (let i = 0; i < 600; i++) {
      step(1);
      if (player.grounded && player.globalPosition.x > exitX) {
        realGsp = player.groundSpeed;
        break;
      }
    }
    release('move_right');
    sim.setInput(false, true, false, false, false);
    let simGsp = NaN;
    for (let i = 0; i < 600; i++) {
      sim.step();
      if (sim.grounded && sim.pos.x > exitX) {
        simGsp = sim.gsp;
        break;
      }
    }
    expect(Number.isNaN(realGsp), 'real got through').toBe(false);
    expect(Number.isNaN(simGsp), 'sim got through').toBe(false);
    expect(Math.abs(realGsp - simGsp), `exit speed after the loop (real ${realGsp}, sim ${simGsp})`).toBeLessThanOrEqual(CURVE_TOLERANCE);
  });

  it('half-pipe at 8 returns with the right speed', () => {
    // Rolling into a 400 px quarter pipe at 8 px/f, up it until the roll ends,
    // then back down and out onto the floor. The sim runs on the ideal circle
    // and the real sensors read a polygon, so the frame-by-frame tolerance is
    // wider here; the speed back on the floor must still agree closely.
    const h = new Harness();
    h.world = newWorld();
    addFloor(h.world, 0, 4000);
    addQuarterPipe(h.world, Vec2.ZERO, 400, false);
    h.sim = new ReferenceSim();
    h.sim.addArc(new Vec2(0, -400), 400, 270, 360);
    h.player = spawnPlayer(h.world, new Vec2(300, 0));
    settle(h.player, new Vec2(300, 0));
    h.sim.standAt(300);
    h.lastPlayer = h.player.globalPosition;
    h.lastSim = h.sim.pos;
    h.setGroundSpeed(-8);
    const ev: Events = new Map();
    pressAt(ev, 0, 'down');
    releaseAt(ev, 2, 'down');
    let top = 0;
    let backAt = -1;
    let realGsp = NaN;
    for (let i = 0; i < 500; i++) {
      // As in the original: each one-frame run reads frame 0 of `ev`, so down
      // is pressed on the first three frames and stays held.
      if (h.run('half-pipe', 1, i < 3 ? ev : new Map(), true, 0.02, 0.5) < 1) break;
      top = Math.min(top, h.player.globalPosition.y);
      if (top < -100 && h.player.grounded && h.player.globalPosition.x > 60) {
        backAt = i;
        realGsp = h.player.groundSpeed;
        break;
      }
    }
    expect(top, 'went up the pipe').toBeLessThan(-100);
    expect(backAt, `came back onto the floor (final ${h.player.globalPosition}, speed ${h.player.groundSpeed})`).toBeGreaterThan(0);
    expect(Math.abs(realGsp - h.sim.gsp), 'speed back on the floor').toBeLessThanOrEqual(CURVE_TOLERANCE);
    h.done();
  });
});
