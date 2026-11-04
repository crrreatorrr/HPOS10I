// Zone 2 and Zone 3 objects and pills not covered by objects.test.ts and
// enemies.test.ts (ports of tests/levels/test_z2_objects.gd and
// test_z3_blocks.gd): the shifting staircase and the moving bookshelf
// (moving terrain), the candle, the falling book, the security beam
// (telegraphed hazards), the flying-broom autoscroll, the door, the clerk's
// aimed paper arc, the sniper / camera pill's long telegraph, burst, line of
// sight and off-screen rule, and the Zone 3 pills' finale ramp.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Layers } from '../../src/core/layers';
import { SceneRouter } from '../../src/core/scene_router';
import { GameCamera } from '../../src/camera/game_camera';
import type { LevelRoot } from '../../src/levels/common/level_root';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { Sniper, SniperMode } from '../../src/levels/enemies/sniper';
import { GoalSign } from '../../src/levels/objects/goal_sign';
import { AutoscrollSection } from '../../src/levels/objects/z2/autoscroll_section';
import { Candle, CandlePhase } from '../../src/levels/objects/z2/candle';
import { FallingBook } from '../../src/levels/objects/z2/falling_book';
import { MovingBookshelf } from '../../src/levels/objects/z2/moving_bookshelf';
import { ShiftingStaircase } from '../../src/levels/objects/z2/shifting_staircase';
import { Conveyor } from '../../src/levels/objects/z3/conveyor';
import { Door } from '../../src/levels/objects/z3/door';
import { SecurityBeam, BeamPhase } from '../../src/levels/objects/z3/security_beam';
import type { Player } from '../../src/player/player';
import { Node, Node2D } from '../../src/runtime/node';
import { AnimatableBody2D } from '../../src/runtime/physics';
import { tree, type ViewProvider } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { addFloor, addRect, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';
import { enemy, FEET, MIN_TELEGRAPH_FRAMES, miniLevel, place, waitFor } from './level_world';

const E3 = 'res://levels/enemies/z3/';
const DRONE = `${E3}drone_pill.tscn`;
const DRONE_DIVER = `${E3}drone_diver.tscn`;
const CLERK = `${E3}clerk_pill.tscn`;
const BOUNCER = `${E3}bouncer_pill.tscn`;
const SECURITY = `${E3}security_pill.tscn`;
const CHANDELIER = `${E3}chandelier_pill.tscn`;
const CAMERA = `${E3}camera_pill.tscn`;
const SNIPER = 'res://levels/enemies/sniper.tscn';

let world: Node2D;
let player: Player;
let hurts = 0;

function setAct(zone: string, stage: number): void {
  SceneRouter.zoneId = zone;
  SceneRouter.stage = stage;
}

function setup(feet = new Vec2(-300, 0), floor = true): void {
  world = newWorld();
  if (floor) addFloor(world);
  player = spawnPlayer(world, feet);
  hurts = 0;
  player.hurtTaken.connect(() => hurts++);
  player.stateChanged.connect((_o, next) => {
    if (next === 'dead') hurts++;
  });
  GameState.addTickets(10); // a hit with no tickets would kill
  settle(player, feet);
}

function stand(feet: Vec2): void {
  player.respawnAt(feet.sub(new Vec2(0, FEET)));
  step(2);
}

const pellets = (): Node2D[] => tree.getNodesInGroup<Node2D>('pellets');

beforeEach(() => {
  GameState.resetGame();
  setAct('test_zone', 1);
});

afterEach(() => {
  releaseAll();
  tree.paused = false;
  SceneRouter.zoneId = '';
});

// --- Shifting staircase ----------------------------------------------------------------

describe('shifting staircase', () => {
  it('its steps are moving terrain', () => {
    setup();
    const stairs = place(world, new ShiftingStaircase(), new Vec2(0, -40));
    step(1);
    const bodies = stairs.stepBodies();
    expect(bodies.length).toBe(5);
    for (const b of bodies) {
      expect(b).toBeInstanceOf(AnimatableBody2D);
      expect(b.collisionLayer).toBe(Layers.TERRAIN_SOLID);
      expect(typeof b.platformDelta).toBe('function');
    }
  });

  it('shifts on a timer after a telegraph of at least 0.35 s, never faster than 4 px/f', () => {
    setAct('z4_neon_rush_remix', 2);
    setup();
    const stairs = place(world, new ShiftingStaircase(), new Vec2(0, -40), { hold_frames: 60, shift_frames: 10 });
    let telegraphs = 0;
    stairs.telegraphed.connect(() => telegraphs++);
    const bodies = stairs.stepBodies();
    let warning = 0;
    const warnings: number[] = [];
    let shifts = 0;
    let fastest = 0;
    let wasShifting = false;
    const last = bodies.map((b) => b.targetPosition());
    let lo = Infinity;
    let hi = -Infinity;
    const failures: string[] = [];
    for (let i = 0; i < 600; i++) {
      step(1);
      if (stairs.isTelegraphing()) warning++;
      const shifting = stairs.isShifting();
      if (shifting && !wasShifting) {
        shifts++;
        warnings.push(warning);
      }
      if (!shifting && !stairs.isTelegraphing()) warning = 0;
      const wasMoving = wasShifting;
      wasShifting = shifting;
      bodies.forEach((b, k) => {
        const now = b.targetPosition();
        const moved = now.sub(last[k]!);
        if (moved.sub(b.platformDelta()).length() > 1e-6) failures.push(`platformDelta is not the tick's move (frame ${i})`);
        fastest = Math.max(fastest, moved.length());
        if (moved.length() > 0 && !(shifting || wasMoving)) failures.push(`step ${k} moved outside a shift (frame ${i})`);
        last[k] = now;
      });
      lo = Math.min(lo, stairs.blend());
      hi = Math.max(hi, stairs.blend());
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(shifts).toBeGreaterThanOrEqual(3);
    for (const w of warnings) expect(w).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(telegraphs).toBe(shifts);
    expect(fastest).toBeLessThanOrEqual(4.01);
    expect(lo).toBeLessThanOrEqual(0.001);
    expect(hi).toBeGreaterThanOrEqual(0.999);
  });

  it('carries Sproto down and up and never swallows him', () => {
    setup();
    const stairs = place(world, new ShiftingStaircase(), new Vec2(0, -40), { hold_frames: 40 });
    step(2);
    stand(new Vec2(4 * 48 + 24, -40 - 4 * 32));
    expect(player.grounded).toBe(true);
    const bodies = stairs.stepBodies();
    const top = bodies[4]!;
    let worst = 0;
    let lowest = -Infinity;
    let highest = Infinity;
    let prevTop = Infinity;
    const cycle = stairs.hold() * 2 + stairs.shift() * 2 + 10;
    for (let i = 0; i < cycle; i++) {
      step(1);
      const stepTop = stairs.globalPosition.y + top.targetPosition().y;
      const feet = player.globalPosition.y + FEET;
      worst = Math.max(worst, Math.min(Math.abs(feet - stepTop), Math.abs(feet - prevTop)));
      prevTop = stepTop;
      lowest = Math.max(lowest, stepTop);
      highest = Math.min(highest, stepTop);
      expect(player.grounded, `grounded on the moving step (frame ${i})`).toBe(true);
      for (const b of bodies) {
        const rect = new Rect2(stairs.globalPosition.x + b.targetPosition().x, stairs.globalPosition.y + b.targetPosition().y, 48, 16);
        expect(rect.hasPoint(player.globalPosition), `inside a step (frame ${i})`).toBe(false);
      }
    }
    expect(lowest - highest).toBeGreaterThanOrEqual(127);
    expect(worst).toBeLessThanOrEqual(1);
    expect(player.state).not.toBe('dead');
  });
});

// --- Moving bookshelf -----------------------------------------------------------------

describe('moving bookshelf', () => {
  it('telegraphs before every close, the first one included', () => {
    setAct('z4_neon_rush_remix', 2);
    setup();
    const shelf = place(world, new MovingBookshelf(), new Vec2(0, -96), { rest_frames: 60, out_frames: 20 });
    expect(typeof shelf.platformDelta).toBe('function');
    const events: [number, string][] = [];
    let clock = 0;
    shelf.telegraphed.connect(() => events.push([clock, 'telegraph']));
    shelf.closingStarted.connect(() => events.push([clock, 'close']));
    let lastOffset = Vec2.ZERO;
    let wasClosing = false;
    for (let i = 0; i < 700; i++) {
      step(1);
      clock++;
      const offset = shelf.offset();
      const closing = shelf.isClosing();
      expect(offset.length() > lastOffset.length() && !(closing || wasClosing), `closed outside its closing phase (frame ${i})`).toBe(false);
      lastOffset = offset;
      wasClosing = closing;
    }
    const closes = events.filter((e) => e[1] === 'close');
    expect(closes.length).toBeGreaterThanOrEqual(3);
    expect(events[0]![1]).toBe('telegraph');
    events.forEach((e, k) => {
      if (e[1] !== 'close') return;
      expect(k > 0 && events[k - 1]![1] === 'telegraph').toBe(true);
      const lead = e[0] - events[k - 1]![0];
      expect(lead).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
      expect(lead).toBeGreaterThanOrEqual(shelf.warning());
    });
  });

  it('pushes Sproto out of its way in the open', () => {
    setup(new Vec2(100, 0));
    const shelf = place(world, new MovingBookshelf(), new Vec2(0, -96), { rest_frames: 40 });
    stand(new Vec2(100, 0));
    for (let i = 0; i < 200; i++) {
      step(1);
      const rect = new Rect2(shelf.targetPosition().x, shelf.targetPosition().y, 64, 96);
      expect(rect.hasPoint(player.globalPosition), `inside the shelf (frame ${i})`).toBe(false);
      expect(player.state).not.toBe('dead');
    }
    expect(player.globalPosition.x).toBeGreaterThanOrEqual(168);
  });

  it('crushes Sproto against a wall only after its telegraph', () => {
    setup(new Vec2(140, 0));
    addRect(world, new Rect2(170, -200, 32, 200));
    const shelf = place(world, new MovingBookshelf(), new Vec2(0, -96), { rest_frames: 40 });
    stand(new Vec2(140, 0));
    let telegraphed = false;
    shelf.telegraphed.connect(() => (telegraphed = true));
    expect(waitFor(() => player.state === 'dead', 240)).toBeGreaterThanOrEqual(0);
    expect(telegraphed).toBe(true);
  });
});

// --- Candle and security beam (timed hazards) -------------------------------------------

interface PhaseRuns {
  warning: number[];
  hot: number[];
  cycle: number[];
  telegraphs: number;
  hurtWhileCold: number;
}

/** Phase runs of a LOW/OFF -> WARNING -> FLARE/ON hazard (phase 0, 1, 2) over `frames`. */
function phaseRuns(hazard: { phase: number; telegraphed: { connect(fn: () => void): void } }, frames: number): PhaseRuns {
  const out: PhaseRuns = { warning: [], hot: [], cycle: [], telegraphs: 0, hurtWhileCold: 0 };
  hazard.telegraphed.connect(() => out.telegraphs++);
  let last = -1;
  let run = 0;
  let coldStarted = -1;
  let before = hurts;
  for (let i = 0; i < frames; i++) {
    step(1);
    const phase = hazard.phase;
    if (hurts > before && phase !== 2 && last !== 2) out.hurtWhileCold++;
    before = hurts;
    if (phase === last) {
      run++;
      continue;
    }
    if (last === 1) out.warning.push(run);
    else if (last === 2) out.hot.push(run);
    if (phase === 0) {
      if (coldStarted >= 0) out.cycle.push(i - coldStarted);
      coldStarted = i;
    }
    last = phase;
    run = 1;
  }
  return out;
}

describe('candle', () => {
  it('flares after a telegraph; only the flare hurts', () => {
    setAct('z4_neon_rush_remix', 2);
    setup(Vec2.ZERO);
    const candle = place(world, new Candle(), Vec2.ZERO, { low_frames: 60, flare_frames: 30 });
    stand(Vec2.ZERO);
    const runs = phaseRuns(candle, 400);
    expect(runs.hot.length).toBeGreaterThanOrEqual(2);
    for (const w of runs.warning) expect(w).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(runs.telegraphs).toBeGreaterThanOrEqual(runs.hot.length);
    expect(hurts).toBeGreaterThanOrEqual(1);
    expect(runs.hurtWhileCold).toBe(0);
  });

  it('the flare hurts a jumping Sproto too', () => {
    setup(new Vec2(-200, 0));
    const candle = place(world, new Candle(), Vec2.ZERO, { low_frames: 40 });
    waitFor(() => candle.isFlaring(), 200);
    press('jump');
    step(2);
    player.globalPosition = new Vec2(0, -60);
    player.velocity = new Vec2(0, 3);
    waitFor(() => hurts > 0, 10);
    release('jump');
    expect(hurts).toBe(1);
  });

  it('its quiet time scales with the interval multiplier', () => {
    const cycles: Record<string, number> = {};
    for (const [zone, stage] of [
      ['test_zone', 1],
      ['z4_neon_rush_remix', 2],
    ] as const) {
      setAct(zone, stage);
      setup();
      const candle = place(world, new Candle(), Vec2.ZERO);
      const runs = phaseRuns(candle, 700);
      expect(runs.cycle.length).toBeGreaterThanOrEqual(1);
      expect(Math.abs(runs.cycle[runs.cycle.length - 1]! - (candle.quiet() + candle.flareFrames))).toBeLessThanOrEqual(1);
      cycles[zone] = runs.cycle[runs.cycle.length - 1]!;
    }
    expect(cycles.z4_neon_rush_remix!).toBeLessThan(cycles.test_zone!);
    expect(CandlePhase.FLARE).toBe(2);
  });
});

describe('security beam', () => {
  it('telegraphs, then hurts even a roller; harmless while off', () => {
    setAct('z4_neon_rush_remix', 2);
    setup(Vec2.ZERO);
    const beam = place(world, new SecurityBeam(), new Vec2(0, -160), { off_frames: 60, on_frames: 60, length: 160 });
    stand(Vec2.ZERO);
    const runs = phaseRuns(beam, 400);
    expect(runs.hot.length).toBeGreaterThanOrEqual(2);
    for (const w of runs.warning) expect(w).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(runs.telegraphs).toBeGreaterThanOrEqual(runs.hot.length);
    expect(hurts).toBeGreaterThanOrEqual(1);
    expect(runs.hurtWhileCold).toBe(0);
    stand(new Vec2(-120, 0));
    waitFor(() => !player.isInvincible(), 300);
    waitFor(() => beam.isOn(), 200);
    const before = hurts;
    player.groundSpeed = 6;
    press('move_down');
    step(2);
    release('move_down');
    waitFor(() => hurts > before, 60);
    expect(hurts).toBe(before + 1);
    expect(BeamPhase.ON).toBe(2);
  });

  it('its cycle scales with the interval multiplier', () => {
    const cycles: Record<string, number> = {};
    for (const [zone, stage] of [
      ['test_zone', 1],
      ['z4_neon_rush_remix', 2],
    ] as const) {
      setAct(zone, stage);
      setup();
      const beam = place(world, new SecurityBeam(), new Vec2(0, -160));
      const runs = phaseRuns(beam, 700);
      expect(runs.cycle.length).toBeGreaterThanOrEqual(1);
      expect(Math.abs(runs.cycle[runs.cycle.length - 1]! - (beam.quiet() + beam.onFrames))).toBeLessThanOrEqual(1);
      cycles[zone] = runs.cycle[runs.cycle.length - 1]!;
    }
    expect(cycles.z4_neon_rush_remix!).toBeLessThan(cycles.test_zone!);
  });
});

// --- Falling book ---------------------------------------------------------------------

describe('falling book', () => {
  it('drops when Sproto moves under it, after a telegraph of at least 0.35 s, then bursts', () => {
    setAct('z4_neon_rush_remix', 2);
    setup(new Vec2(-200, 0));
    const book = place(world, new FallingBook(), new Vec2(0, -150), { arm_frames: 10 });
    step(20);
    expect(book.isTelegraphing() || book.isFalling()).toBe(false);
    let clock = 0;
    let shookAt = -1;
    book.telegraphed.connect(() => (shookAt = clock));
    let fellAt = -1;
    const y0 = book.globalPosition.y;
    player.respawnAt(new Vec2(0, -FEET));
    for (let i = 0; i < 120; i++) {
      step(1);
      clock++;
      if (book.isFreed()) break;
      if (book.isTelegraphing()) expect(book.globalPosition.y).toBeCloseTo(y0, 3);
      else if (book.isFalling() && fellAt < 0) fellAt = clock;
      if (hurts > 0) break;
    }
    expect(shookAt).toBeGreaterThanOrEqual(0);
    expect(fellAt - shookAt).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(hurts).toBe(1);
    step(2);
    expect(book.isFreed() || !book.isInsideTree()).toBe(true);
  });

  it('never drops on a respawn underneath it', () => {
    setup(Vec2.ZERO);
    const book = place(world, new FallingBook(), new Vec2(0, -150), { arm_frames: 10 });
    step(200);
    expect(book.isTelegraphing() || book.isFalling()).toBe(false);
    stand(new Vec2(200, 0));
    step(5);
    stand(new Vec2(10, 0));
    expect(waitFor(() => book.isTelegraphing(), 5)).toBeGreaterThanOrEqual(0);
  });

  it('bursts on landing, and a jump pops it', () => {
    setup(new Vec2(-200, 0));
    const books = [place(world, new FallingBook(), new Vec2(0, -150), { arm_frames: 0 }), place(world, new FallingBook(), new Vec2(400, -150), { arm_frames: 0 })];
    let landed = false;
    books[0]!.landed.connect(() => (landed = true));
    step(2);
    stand(Vec2.ZERO);
    waitFor(() => books[0]!.isFalling(), 60);
    stand(new Vec2(-200, 0));
    const gone = (b: FallingBook): boolean => b.isFreed() || !b.isInsideTree();
    waitFor(() => gone(books[0]!), 120);
    expect(landed && gone(books[0]!)).toBe(true);
    expect(hurts).toBe(0);
    stand(new Vec2(400, 0));
    waitFor(() => books[1]!.isFalling(), 60);
    press('jump');
    waitFor(() => gone(books[1]!), 60);
    release('jump');
    expect(gone(books[1]!)).toBe(true);
    expect(hurts).toBe(0);
  });
});

// --- Autoscroll (flying-broom chase) ---------------------------------------------------

function scrollLevel(extra?: (root: LevelRoot) => void): { level: LevelRoot; section: AutoscrollSection } {
  let section!: AutoscrollSection;
  const level = miniLevel(new Vec2(64, -19), 0, 4000, (root) => {
    section = place(root, new AutoscrollSection(), new Vec2(300, 0), { length: 1200, speed: 120 });
    extra?.(root);
  });
  return { level, section };
}

describe('autoscroll section', () => {
  it('starts at its line, keeps Sproto on screen and stops at its end', () => {
    const { level, section } = scrollLevel();
    const hero = level.player!;
    expect(section.active).toBe(false);
    hero.respawnAt(new Vec2(320, -19));
    expect(waitFor(() => section.active, 5)).toBeGreaterThanOrEqual(0);
    const camera = GameCamera.current()!;
    step(2);
    expect(hero.clampRect.hasArea()).toBe(true);
    const x0 = camera.globalPosition.x;
    step(60);
    expect(Math.abs(camera.globalPosition.x - x0 - 120)).toBeLessThanOrEqual(3);
    const startX = hero.globalPosition.x;
    step(200);
    let view = camera.viewRect();
    expect(hero.globalPosition.x).toBeGreaterThanOrEqual(view.x);
    expect(hero.globalPosition.x).toBeGreaterThan(startX + 100);
    press('move_right');
    for (let i = 0; i < 120; i++) {
      step(1);
      view = camera.viewRect();
      expect(hero.globalPosition.x, `ahead of the screen (frame ${i})`).toBeLessThanOrEqual(view.right - 8);
    }
    release('move_right');
    let stopView = new Rect2();
    section.finished.connect(() => (stopView = camera.viewRect()));
    expect(waitFor(() => section.done, 900)).toBeGreaterThanOrEqual(0);
    expect(stopView.right).toBeGreaterThanOrEqual(300 + 1200 - 0.5);
    expect(hero.clampRect.hasArea()).toBe(false);
    const x1 = camera.globalPosition.x;
    step(30);
    expect(Math.abs(camera.globalPosition.x - x1)).toBeLessThan(30);
  });

  it('crushes Sproto against a wall, then stops', () => {
    const { level, section } = scrollLevel((root) => addRect(root.getNode<Node2D>('Terrain'), new Rect2(700, -400, 32, 400)));
    const hero = level.player!;
    hero.respawnAt(new Vec2(600, -19));
    expect(waitFor(() => hero.state === 'dead', 600)).toBeGreaterThanOrEqual(0);
    step(2);
    expect(section.done && !section.active).toBe(true);
    expect(hero.clampRect.hasArea()).toBe(false);
  });

  it('a respawned act starts the section over', () => {
    let { level, section } = scrollLevel();
    level.player!.respawnAt(new Vec2(320, -19));
    waitFor(() => section.active, 5);
    step(60);
    level.player!.kill();
    waitFor(() => section.done, 5);
    expect(section.done).toBe(true);
    let respawned = false;
    level.respawnRequested.connect(() => (respawned = true));
    waitFor(() => respawned, 300);
    expect(respawned).toBe(true);
    ({ level, section } = scrollLevel());
    const camera = GameCamera.current()!;
    const x0 = camera.globalPosition.x;
    step(30);
    expect(section.active || level.player!.clampRect.hasArea()).toBe(false);
    expect(Math.abs(camera.globalPosition.x - x0)).toBeLessThanOrEqual(1);
    level.player!.respawnAt(new Vec2(320, -19));
    expect(waitFor(() => section.active, 5)).toBeGreaterThanOrEqual(0);
  });

  it('pausing pauses the scroll', () => {
    const { level } = scrollLevel();
    level.player!.respawnAt(new Vec2(320, -19));
    step(10);
    const camera = GameCamera.current()!;
    const x0 = camera.globalPosition.x;
    tree.paused = true;
    step(30);
    const x1 = camera.globalPosition.x;
    tree.paused = false;
    step(30);
    expect(x1).toBeCloseTo(x0, 2);
    expect(camera.globalPosition.x).toBeGreaterThan(x1 + 30);
  });
});

// --- Zone 3 blocks ----------------------------------------------------------------------

describe('Zone 3 blocks', () => {
  it('a conveyor carries a standing Sproto and a runner beats it', () => {
    setup(new Vec2(-300, 0), false);
    addRect(world, new Rect2(-600, 0, 300, 200));
    const belt = place(world, new Conveyor(), new Vec2(-300, 0), { size: new Vec2(1200, 48), speed: -3 });
    expect(belt.collisionLayer).toBe(Layers.TERRAIN_SOLID);
    expect(belt.getMeta<number>('conveyor_speed')).toBeCloseTo(-3, 3);
    stand(new Vec2(600, 0));
    const x0 = player.globalPosition.x;
    step(60);
    expect(Math.abs(player.globalPosition.x - x0 + 180)).toBeLessThanOrEqual(6);
    expect(player.grounded && Math.abs(player.groundSpeed) < 0.1).toBe(true);
    const x1 = player.globalPosition.x;
    press('move_right');
    step(180);
    release('move_right');
    expect(player.groundSpeed).toBeGreaterThan(5);
    expect(player.globalPosition.x).toBeGreaterThan(x1 + 100);
  });

  it('a closed door blocks a runner and never hurts; opening over Sproto never crushes him', () => {
    setup(new Vec2(-200, 0));
    const door = place(world, new Door('HallDoor'), new Vec2(100, 0));
    step(2);
    press('move_right');
    step(180);
    expect(player.globalPosition.x).toBeLessThan(100);
    expect(door.isOpen).toBe(false);
    release('move_right');
    expect(hurts).toBe(0);
    setup(new Vec2(-200, 0));
    const low = place(world, new Door(), Vec2.ZERO, { size: new Vec2(32, 96) });
    addRect(world, new Rect2(-100, -200, 300, 60));
    step(2);
    stand(new Vec2(60, 0));
    low.open();
    waitFor(() => low.isOpen, 60);
    expect(player.state).not.toBe('dead');
  });

  it('the Zone 3 pills have their tiers', () => {
    setup();
    const placed = [
      [DRONE, new Vec2(0, -80)],
      [DRONE_DIVER, new Vec2(200, -150)],
      [CLERK, new Vec2(400, 0)],
      [BOUNCER, new Vec2(600, 0)],
      [SECURITY, new Vec2(800, 0)],
      [CHANDELIER, new Vec2(1000, -150)],
      [CAMERA, new Vec2(1200, 0)],
      [SNIPER, new Vec2(1400, 0)],
    ].map(([scene, at]) => place(world, enemy<Enemy>(scene as string), at as Vec2));
    step(30);
    expect(placed.map((e) => e.tier)).toEqual([2, 3, 2, 3, 3, 4, 4, 4]);
  });

  it('the clerk throws paper in an arc that comes down where Sproto stood at the flash', () => {
    setAct('z4_neon_rush_remix', 2);
    setup(new Vec2(-200, 0));
    const clerk = place(world, enemy<Enemy>(CLERK), Vec2.ZERO, { facing: -1 });
    let aim = Vec2.ZERO;
    clerk.telegraphed.connect(() => (aim = player.globalPosition));
    waitFor(() => pellets().length > 0, 400);
    expect(pellets().length).toBe(1);
    const sheet = pellets()[0]!;
    let top = Infinity;
    let landing = sheet.globalPosition;
    for (let i = 0; i < 200 && !sheet.isFreed() && sheet.isInsideTree(); i++) {
      step(1);
      top = Math.min(top, sheet.globalPosition.y);
      landing = sheet.globalPosition;
    }
    expect(top).toBeLessThan(-50);
    expect(hurts === 1 || landing.distanceTo(aim) < 24, `hurt ${hurts}, ${landing.distanceTo(aim).toFixed(0)} px off`).toBe(true);
  });

  it("moving away at the clerk's flash avoids the sheet", () => {
    setAct('z4_neon_rush_remix', 2);
    setup(new Vec2(-200, 0));
    const clerk = place(world, enemy<Enemy>(CLERK), Vec2.ZERO, { facing: -1 });
    let flashed = false;
    clerk.telegraphed.connect(() => (flashed = true));
    waitFor(() => flashed, 400);
    press('move_left');
    step(150);
    release('move_left');
    expect(hurts).toBe(0);
  });

  for (const [zone, stage] of [
    ['test_zone', 1],
    ['z4_neon_rush_remix', 3],
  ] as const) {
    it(`${zone}: the sniper telegraphs long, fires a 3-shot burst at the locked spot, and running at the flash avoids it`, () => {
      setAct(zone, stage);
      setup(new Vec2(-400, 0));
      const sniper = place(world, enemy<Sniper>(SNIPER), Vec2.ZERO);
      let clock = 0;
      let flashAt = -1;
      sniper.telegraphed.connect(() => (flashAt = clock));
      stand(new Vec2(-260, 0));
      let firstShot = -1;
      let shots = 0;
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        step(1);
        clock++;
        for (const s of pellets()) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            shots++;
            if (firstShot < 0) firstShot = clock;
          }
        }
        if (flashAt >= 0 && clock === flashAt + 1) press('move_left');
        if (sniper.mode === SniperMode.REST) break;
      }
      release('move_left');
      expect(flashAt).toBeGreaterThanOrEqual(0);
      expect(firstShot - flashAt).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
      expect(firstShot - flashAt).toBeGreaterThanOrEqual(sniper.telegraphFrames(0.8));
      expect(shots).toBe(3);
      expect(hurts).toBe(0);
      expect(sniper.target.distanceTo(new Vec2(-260, -FEET))).toBeLessThan(1);
    });
  }

  it('the sniper hits a standing Sproto, but not one behind a wall or too close', () => {
    setup(new Vec2(-400, 0));
    const sniper = place(world, enemy<Sniper>(SNIPER), Vec2.ZERO);
    stand(new Vec2(-100, 0));
    step(90);
    expect(sniper.mode).toBe(SniperMode.IDLE);
    stand(new Vec2(-300, 0));
    waitFor(() => hurts > 0, 300);
    expect(hurts).toBe(1);
    stand(new Vec2(-700, 0));
    waitFor(() => !player.isInvincible() && sniper.mode === SniperMode.IDLE, 400);
    addRect(world, new Rect2(-200, -120, 16, 120));
    step(2);
    stand(new Vec2(-300, 0));
    step(120);
    expect(hurts).toBe(1);
    expect(sniper.mode).toBe(SniperMode.IDLE);
  });

  it('the sniper never fires from off screen, and a shot into the floor pops', () => {
    setup(new Vec2(-400, 0));
    const sniper = place(world, enemy<Sniper>(SNIPER), Vec2.ZERO);
    class View extends Node implements ViewProvider {
      at = new Vec2(3000 - 212, -120);
      viewTopLeft(): Vec2 {
        return this.at;
      }
    }
    const view = world.addChild(new View('View'));
    tree.camera = view;
    step(2);
    stand(new Vec2(-300, 0));
    step(150);
    expect(sniper.mode === SniperMode.IDLE && pellets().length === 0).toBe(true);
    view.at = new Vec2(-150 - 212, -100 - 120);
    step(2);
    (sniper as unknown as { aim: Vec2 }).aim = Vec2.DOWN;
    const shot = sniper.fire();
    expect(shot).not.toBeNull();
    waitFor(() => shot!.isFreed() || !shot!.isInsideTree(), 60);
    expect(shot!.isFreed() || !shot!.isInsideTree()).toBe(true);
    tree.camera = null;
  });

  it('the Zone 3 pills are livelier in the finale, telegraphs still >= 0.35 s', () => {
    setAct('z3_capital_mansion', 2);
    const scenes = [DRONE, DRONE_DIVER, CLERK, BOUNCER, SECURITY, CHANDELIER, CAMERA];
    const placed: Record<string, [Enemy, Enemy]> = {};
    miniLevel(new Vec2(64, -19), 0, 2000, (root) => {
      const goal = place(root, new GoalSign(), new Vec2(1864, 0));
      goal.addToGroup('goal_sign');
      for (const scene of scenes) {
        const y = [DRONE, DRONE_DIVER, CHANDELIER].includes(scene) ? -150 : 0;
        placed[scene] = [place(root, enemy<Enemy>(scene), new Vec2(64 + 0.5 * 1800, y)), place(root, enemy<Enemy>(scene), new Vec2(64 + 0.95 * 1800, y))];
      }
    });
    for (const scene of scenes) {
      const [middle, finale] = placed[scene]!;
      expect(finale.moveSpeed(1), scene).toBeGreaterThan(middle.moveSpeed(1));
      expect(finale.telegraphFrames(0.5), scene).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    }
  });
});
