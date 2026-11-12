// Pill-robot enemies (ports of tests/levels/test_enemies.gd,
// test_enemies_t2.gd and test_z2_enemies.gd): the contract, destroy vs hurt,
// patrols, telegraphs (never under 0.35 s), aimed attacks locking their
// target, the armored shield and difficulty scaling.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Layers } from '../../src/core/layers';
import { Difficulty } from '../../src/core/difficulty';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Tuning } from '../../src/core/tuning';
import { isConfigurable, Props } from '../../src/levels/common/props';
import { LevelTypes } from '../../src/levels/common/level_loader';
import { Chaser } from '../../src/levels/enemies/chaser';
import { Diver } from '../../src/levels/enemies/diver';
import { Dropper } from '../../src/levels/enemies/dropper';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { Hopper } from '../../src/levels/enemies/hopper';
import { Pellet } from '../../src/levels/enemies/pellet';
import { PelletPill } from '../../src/levels/enemies/pellet_pill';
import { Sniper } from '../../src/levels/enemies/sniper';
import { SpikePill } from '../../src/levels/enemies/spike_pill';
import { Walker } from '../../src/levels/enemies/walker';
import { ENEMY_SCENES, registerEnemies } from '../../src/levels/registry_enemies';
import type { Player } from '../../src/player/player';
import { Gfx } from '../../src/runtime/gfx';
import { Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { addFloor, addRect, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

const E = 'res://levels/enemies/';
const WALKER = `${E}walker.tscn`;
const HOPPER = `${E}hopper.tscn`;
const CHASER = `${E}chaser.tscn`;
const PELLET_PILL = `${E}pellet_pill.tscn`;
const SPIKE_PILL = `${E}spike_pill.tscn`;
const KNIGHT = `${E}z2/knight_pill.tscn`;
const DIVER = `${E}z2/spellbook_diver.tscn`;
const LANTERN = `${E}z2/lantern_pill.tscn`;
const SNIPER = `${E}sniper.tscn`;
/** 0.35 s, the shortest telegraph allowed at any difficulty. */
const MIN_TELEGRAPH_FRAMES = 21;

let world: Node2D;
let player: Player;
let hurts = 0;

function setAct(zone: string, stage: number): void {
  SceneRouter.zoneId = zone;
  SceneRouter.stage = stage;
}

/** Instances a registered scene like the level loader: defaults, props, position, then into the tree. */
function place<T extends Node2D>(parent: Node2D, scene: string, at: Vec2, props: Record<string, unknown> = {}): T {
  const node = ENEMY_SCENES[scene]!() as T;
  node.position = at;
  if (isConfigurable(node)) node.applyProps(Props.of(props));
  parent.addChild(node);
  return node;
}

/** A flat floor (top y = 0), the enemies, and Sproto with his feet at `feet`. */
function setup(enemies: [string, Vec2, Record<string, unknown>?][], feet = new Vec2(-200, 0), floor = true): Enemy[] {
  world = newWorld();
  if (floor) addFloor(world);
  const out = enemies.map(([scene, at, props]) => place<Enemy>(world, scene, at, props ?? {}));
  player = spawnPlayer(world, feet);
  hurts = 0;
  player.hurtTaken.connect(() => (hurts += 1));
  player.stateChanged.connect((_old, next) => {
    if (next === 'dead') hurts += 1;
  });
  GameState.addTickets(10); // a hit with no tickets kills; count both
  settle(player, feet);
  return out;
}

/** Sproto in the jump state, falling at `fall` px/f with his ball centre at `at` (jump held). */
function dropAttacking(at: Vec2, fall = 4): void {
  press('jump');
  step(2);
  expect(player.state).toBe('jump');
  player.globalPosition = at;
  player.velocity = new Vec2(0, fall);
}

/** Runs until `cond` holds or `max` ticks pass; the ticks used, or -1. */
function waitFor(cond: () => boolean, max: number): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    step(1);
  }
  return cond() ? max : -1;
}

const gone = (e: Enemy): boolean => !e.alive || e.isFreed();

beforeEach(() => {
  setAct('test_zone', 1);
  GameState.resetGame();
});

afterEach(() => {
  release('jump');
  release('move_left');
  release('move_right');
  release('move_down');
});

describe('chain score', () => {
  it('enemies popped without touching the ground pay 100, 200, 400...; landing or a roll on the ground starts over', () => {
    // Three walkers stacked in the air under a falling, attacking Sproto: each pop bounces him onto nothing but the next.
    const [a, b, c] = setup(
      [
        [WALKER, new Vec2(0, -200), { patrol_distance: 0 }],
        [WALKER, new Vec2(0, -200), { patrol_distance: 0 }],
        [WALKER, new Vec2(0, -200), { patrol_distance: 0 }],
      ],
      new Vec2(-200, 0),
    );
    const score0 = GameState.score;
    dropAttacking(new Vec2(0, -240));
    expect(waitFor(() => gone(a!) && gone(b!) && gone(c!), 60)).toBeGreaterThanOrEqual(0);
    expect(player.grounded).toBe(false);
    expect(GameState.score - score0).toBe(100 + 200 + 400);
    expect(GameState.chain).toBe(3);
    // Landing ends the chain.
    release('jump');
    expect(waitFor(() => player.grounded, 200)).toBeGreaterThanOrEqual(0);
    expect(GameState.chain).toBe(0);
    // Rolling through enemies on the ground pays 100 each.
    const [d, e] = setup([
      [WALKER, new Vec2(60, 0), { patrol_distance: 0 }],
      [WALKER, new Vec2(140, 0), { patrol_distance: 0 }],
    ], new Vec2(-60, 0));
    const score1 = GameState.score;
    player.groundSpeed = 8;
    press('move_down');
    step(2);
    release('move_down');
    expect(player.state).toBe('roll');
    expect(waitFor(() => gone(d!) && gone(e!), 80)).toBeGreaterThanOrEqual(0);
    expect(GameState.score - score1).toBe(200);
    expect(hurts).toBe(0);
  });
});

describe('registry', () => {
  it('registers every enemy scene the levels instance', async () => {
    registerEnemies();
    const fs = await import('node:fs');
    const path = await import('node:path');
    const scenes = new Set<string>();
    const walk = (dir: string): void => {
      for (const f of fs.readdirSync(dir)) {
        const q = path.join(dir, f);
        if (fs.statSync(q).isDirectory()) walk(q);
        else if (f.endsWith('.json') && !q.includes('tilesets')) {
          for (const n of JSON.parse(fs.readFileSync(q, 'utf8')).nodes as { scene?: string }[]) {
            if ((n.scene ?? '').includes('enemies')) scenes.add(n.scene!);
          }
        }
      }
    };
    walk('src/levels/data');
    expect(scenes.size).toBeGreaterThan(10);
    for (const s of scenes) expect(LevelTypes.has(s), s).toBe(true);
  });

  it('every enemy follows the contract and has its scene tier', () => {
    const tiers: Record<string, number> = {
      'walker.tscn': 1, 'hopper.tscn': 1, 'chaser.tscn': 2, 'floater.tscn': 2, 'pellet_pill.tscn': 2,
      'spike_pill.tscn': 3, 'armored.tscn': 3, 'diver.tscn': 3, 'dropper.tscn': 4, 'sniper.tscn': 4,
      'z2/spellbook_pill.tscn': 2, 'z2/spellbook_diver.tscn': 3, 'z2/knight_pill.tscn': 3, 'z2/lantern_pill.tscn': 4,
      'z3/drone_pill.tscn': 2, 'z3/clerk_pill.tscn': 2, 'z3/bouncer_pill.tscn': 3, 'z3/drone_diver.tscn': 3,
      'z3/security_pill.tscn': 3, 'z3/chandelier_pill.tscn': 4, 'z3/camera_pill.tscn': 4,
    };
    for (const [file, tier] of Object.entries(tiers)) {
      const e = ENEMY_SCENES[E + file]!() as Enemy;
      expect(e).toBeInstanceOf(Enemy);
      expect(e.tier, file).toBe(tier);
      expect(e.collisionLayer).toBe(Layers.ENEMIES);
      expect(e.collisionMask & Layers.PLAYER).not.toBe(0);
      expect(e.shapes.length, file).toBe(1);
    }
    for (const file of ['pellet.tscn', 'shot.tscn', 'paper_sheet.tscn']) {
      const p = ENEMY_SCENES[E + file]!() as Pellet;
      expect(p.collisionLayer).toBe(Layers.HAZARDS);
      expect(p.isInGroup('pellets')).toBe(true);
    }
    // Level props override the scene defaults.
    const spike = place<SpikePill>(newWorld(), SPIKE_PILL, Vec2.ZERO, { speed: 0.25, patrol_distance: 40, direction: 1, tier: 3 });
    expect([spike.speed, spike.patrolDistance, spike.direction]).toEqual([0.25, 40, 1]);
  });
});

describe('walker and hopper (T1)', () => {
  it('patrols, turns at a wall and never leaves its ledge', () => {
    world = newWorld();
    addRect(world, new Rect2(0, 0, 96, 200)); // a ledge with drops on both sides
    addRect(world, new Rect2(200, -100, 32, 300)); // a wall
    addRect(world, new Rect2(120, 0, 300, 200)); // floor up to the wall
    const onLedge = place<Walker>(world, WALKER, new Vec2(48, 0), { speed: 1.5 });
    const byWall = place<Walker>(world, WALKER, new Vec2(160, 0), { speed: 1.5, direction: 1 });
    let ledgeMin = Infinity;
    let ledgeMax = -Infinity;
    let wallMax = -Infinity;
    let turned = false;
    let lastX = byWall.globalPosition.x;
    for (let i = 0; i < 600; i++) {
      step(1);
      ledgeMin = Math.min(ledgeMin, onLedge.globalPosition.x);
      ledgeMax = Math.max(ledgeMax, onLedge.globalPosition.x);
      wallMax = Math.max(wallMax, byWall.globalPosition.x);
      if (byWall.globalPosition.x < lastX) turned = true;
      lastX = byWall.globalPosition.x;
    }
    expect(ledgeMin - 14).toBeGreaterThanOrEqual(-2);
    expect(ledgeMax + 14).toBeLessThanOrEqual(98);
    expect(ledgeMax - ledgeMin).toBeGreaterThan(40); // it does patrol
    expect(onLedge.globalPosition.y).toBeCloseTo(0, 2);
    expect(wallMax + 14).toBeLessThanOrEqual(200.01);
    expect(turned).toBe(true);
  });

  it('turns at the ends of its patrol range', () => {
    const [w] = setup([[WALKER, new Vec2(0, 0), { patrol_distance: 16 }]], new Vec2(-600, 0));
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 200; i++) {
      step(1);
      min = Math.min(min, w!.globalPosition.x);
      max = Math.max(max, w!.globalPosition.x);
    }
    expect(min).toBeGreaterThanOrEqual(-16.01);
    expect(max).toBeLessThanOrEqual(16.01);
    expect(max - min).toBeGreaterThan(30);
  });

  it('a jumping player destroys a walker: +100 and he bounces up', () => {
    const [walker] = setup([[WALKER, new Vec2(0, 0), { speed: 0 }]]);
    const score = GameState.score;
    dropAttacking(new Vec2(0, -40), 4);
    let vy: number | null = null;
    for (let i = 0; i < 10; i++) {
      step(1);
      if (gone(walker!)) {
        vy = player.velocity.y;
        break;
      }
    }
    expect(gone(walker!)).toBe(true);
    expect(GameState.score).toBe(score + 100);
    expect(vy).not.toBeNull();
    expect(vy!).toBeLessThan(0);
    expect(player.state).not.toBe('hurt');
    expect(hurts).toBe(0);
  });

  it('a rolling player destroys a walker', () => {
    const [walker] = setup([[WALKER, new Vec2(0, 0), { speed: 0 }]], new Vec2(-80, 0));
    const score = GameState.score;
    player.groundSpeed = 5;
    press('move_down');
    step(2);
    release('move_down');
    expect(player.state).toBe('roll');
    waitFor(() => gone(walker!) || hurts > 0, 60);
    expect(gone(walker!)).toBe(true);
    expect(GameState.score).toBe(score + 100);
    expect(hurts).toBe(0);
  });

  it('two walkers in one tick score as a chain of two but bounce once', () => {
    const enemies = setup([[WALKER, new Vec2(-8, 0), { speed: 0 }], [WALKER, new Vec2(8, 0), { speed: 0 }]]);
    const score = GameState.score;
    dropAttacking(new Vec2(0, -36), 5);
    let before = 0;
    let after = 0;
    for (let i = 0; i < 10; i++) {
      before = player.velocity.y;
      step(1);
      if (gone(enemies[0]!) || gone(enemies[1]!)) {
        after = player.velocity.y;
        break;
      }
    }
    expect(gone(enemies[0]!) && gone(enemies[1]!)).toBe(true);
    // The second pop of the same airborne chain pays 200.
    expect(GameState.score).toBe(score + 100 + 200);
    expect(Math.abs(after - (-before + Tuning.physics.gravity))).toBeLessThan(0.05);
  });

  it('a standing player touching a walker gets hurt, and the walker survives', () => {
    const [walker] = setup([[WALKER, new Vec2(0, 0), { speed: 0 }]], new Vec2(-60, 0));
    const tickets = GameState.tickets;
    player.groundSpeed = 4;
    expect(waitFor(() => hurts > 0, 40)).toBeGreaterThanOrEqual(0);
    expect(hurts).toBe(1);
    expect(player.state).toBe('hurt');
    expect(GameState.tickets).toBeLessThan(tickets);
    expect(walker!.alive).toBe(true);
  });

  it('a walker rolling into a standing player hurts him', () => {
    const [walker] = setup([[WALKER, new Vec2(40, 0), { speed: 1.5, direction: -1 }]], new Vec2(0, 0));
    expect(waitFor(() => hurts > 0, 60)).toBeGreaterThanOrEqual(0);
    expect(walker!.alive).toBe(true);
  });

  it('a hopper hops in place after a crouch of at least 0.35 s', () => {
    const [hopper] = setup([[HOPPER, new Vec2(0, 0), { first_hop_delay: 10 }]]) as Hopper[];
    let top = 0;
    let run = 0;
    let hops = 0;
    let shortest = 1000;
    let wasGrounded = true;
    for (let i = 0; i < 400; i++) {
      step(1);
      top = Math.min(top, hopper!.globalPosition.y);
      expect(Math.abs(hopper!.globalPosition.x)).toBeLessThan(0.001);
      const onFloor = hopper!.grounded;
      if (hopper!.isTelegraphing()) run += 1;
      else if (wasGrounded && !onFloor) {
        hops += 1;
        if (hops > 1) shortest = Math.min(shortest, run);
        run = 0;
      }
      wasGrounded = onFloor;
    }
    expect(hops).toBeGreaterThanOrEqual(3);
    expect(top).toBeLessThan(-40);
    expect(shortest).toBeGreaterThanOrEqual(Math.round(0.35 * 60));
  });
});

describe('difficulty', () => {
  it('scales speed, intervals and telegraphs', () => {
    const [calm] = setup([[WALKER, new Vec2(0, 0)]], new Vec2(-600, 0));
    expect(calm!.moveSpeed(1)).toBeCloseTo(1, 6);
    expect(calm!.intervalFrames(80)).toBe(80);
    setAct('z4_neon_rush_remix', 2);
    const lively = place<Walker>(world, WALKER, new Vec2(200, 0));
    expect(lively.moveSpeed(1)).toBeCloseTo(Difficulty.speedMult(Difficulty.current()), 6);
    expect(lively.moveSpeed(1)).toBeGreaterThan(1.3);
    expect(lively.intervalFrames(80)).toBeLessThan(80);
    expect(lively.telegraphFrames(0.4)).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
  });

  it('a walker patrols faster in a harder act', () => {
    const speedIn = (zone: string, stage: number): number => {
      setAct(zone, stage);
      const [w] = setup([[WALKER, new Vec2(0, 0), { speed: 1 }]], new Vec2(-1500, 0));
      const x0 = w!.globalPosition.x;
      step(10);
      return Math.abs(w!.globalPosition.x - x0) / 10;
    };
    const easy = speedIn('test_zone', 1);
    const hard = speedIn('z4_neon_rush_remix', 2);
    expect(easy).toBeCloseTo(1, 3);
    expect(hard).toBeCloseTo(Difficulty.speedMult(8), 3);
    expect(hard).toBeGreaterThan(easy * 1.3);
  });
});

describe('chaser and spike pill (T2, T3)', () => {
  it('a chaser telegraphs at least 0.35 s at the hardest act, then rushes and hurts', () => {
    setAct('z4_neon_rush_remix', 2);
    const [chaser] = setup([[CHASER, new Vec2(0, 0), { speed: 0.25, direction: -1 }]], new Vec2(-400, 0)) as Chaser[];
    let telegraphs = 0;
    chaser!.telegraphed.connect(() => (telegraphs += 1));
    player.respawnAt(chaser!.globalPosition.add(new Vec2(-150, -19)));
    let telegraph = 0;
    let xAtTelegraph = Infinity;
    let rushStep = 0;
    let lastX = chaser!.globalPosition.x;
    for (let i = 0; i < 120; i++) {
      step(1);
      if (hurts > 0 || gone(chaser!)) break;
      if (chaser!.isTelegraphing()) {
        telegraph += 1;
        if (xAtTelegraph === Infinity) xAtTelegraph = chaser!.globalPosition.x;
        expect(chaser!.globalPosition.x).toBeCloseTo(xAtTelegraph, 3);
      } else if (chaser!.isRushing()) {
        rushStep = Math.max(rushStep, lastX - chaser!.globalPosition.x);
      }
      lastX = chaser!.globalPosition.x;
    }
    expect(telegraphs).toBe(1);
    expect(telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(rushStep).toBeGreaterThan(chaser!.moveSpeed(0.25) * 4);
    expect(hurts).toBe(1);
  });

  it('a chaser ignores Sproto behind it', () => {
    const [chaser] = setup([[CHASER, new Vec2(0, 0), { speed: 0.25, direction: -1 }]], new Vec2(120, 0)) as Chaser[];
    step(60);
    expect(chaser!.isTelegraphing() || chaser!.isRushing()).toBe(false);
  });

  it('spikes out hurt even a jump; retracted, a jump destroys it', () => {
    const pills = setup(
      [
        [SPIKE_PILL, new Vec2(0, 0), { speed: 0, safe_frames: 60 }],
        [SPIKE_PILL, new Vec2(400, 0), { speed: 0, safe_frames: 5000 }],
      ],
      new Vec2(-300, 0),
    ) as SpikePill[];
    waitFor(() => pills[0]!.spikesOut(), 200);
    expect(pills[0]!.spikesOut()).toBe(true);
    dropAttacking(new Vec2(0, -50));
    waitFor(() => hurts > 0, 12);
    release('jump');
    expect(hurts).toBe(1);
    expect(gone(pills[0]!)).toBe(false);
    waitFor(() => player.grounded, 200);
    waitFor(() => !player.isInvincible(), 300);
    expect(pills[1]!.spikesOut() || pills[1]!.isTelegraphing()).toBe(false);
    dropAttacking(new Vec2(400, -50));
    waitFor(() => gone(pills[1]!), 12);
    expect(gone(pills[1]!)).toBe(true);
    expect(hurts).toBe(1);
  });
});

describe('armored (knight pill)', () => {
  /** A standing knight facing `facing` at x 0, Sproto `gap` px in front of it. */
  function knight(facing: number, gap = 70): Enemy {
    const [k] = setup([[KNIGHT, new Vec2(0, 0), { speed: 0, direction: facing }]], new Vec2(facing * gap, 0));
    player.facing = -facing;
    return k!;
  }

  function rollIn(towards: number, speed: number): void {
    player.groundSpeed = towards * speed;
    press('move_down');
    step(2);
    release('move_down');
  }

  for (const facing of [-1, 1]) {
    it(`facing ${facing}: blocks a slow frontal roll (and hurts once), breaks to a fast one`, () => {
      let k = knight(facing);
      rollIn(-facing, 3);
      waitFor(() => gone(k) || hurts > 0, 60);
      expect(hurts).toBe(1);
      expect(gone(k)).toBe(false);
      step(40);
      expect(hurts).toBe(1);
      k = knight(facing);
      const score = GameState.score;
      rollIn(-facing, 6);
      waitFor(() => gone(k) || hurts > 0, 60);
      expect(gone(k)).toBe(true);
      expect(hurts).toBe(0);
      expect(GameState.score).toBe(score + 100);
    });

    it(`facing ${facing}: a slow roll into its back or a jump from above destroys it`, () => {
      const [k] = setup([[KNIGHT, new Vec2(0, 0), { speed: 0, direction: facing }]], new Vec2(-facing * 70, 0));
      rollIn(facing, 2.5);
      waitFor(() => gone(k!) || hurts > 0, 60);
      expect(gone(k!) && hurts === 0).toBe(true);
      const k2 = knight(facing);
      dropAttacking(new Vec2(facing * 6, -50));
      waitFor(() => gone(k2) || hurts > 0, 12);
      expect(gone(k2) && hurts === 0).toBe(true);
    });
  }
});

describe('aimed attacks (fairness)', () => {
  it('a pellet pill telegraphs >= 0.35 s, then fires a slow pellet along the ground that hurts', () => {
    setAct('z4_neon_rush_remix', 2);
    const [pill] = setup([[PELLET_PILL, new Vec2(0, 0), { facing: -1 }]], new Vec2(-200, 0)) as PelletPill[];
    let clock = 0;
    let telegraphAt = -1;
    pill!.telegraphed.connect(() => (telegraphAt = clock));
    let pellet: Pellet | null = null;
    let glowing = 0;
    while (clock < 400 && !pellet) {
      step(1);
      clock += 1;
      if (pill!.isTelegraphing()) glowing += 1;
      pellet = tree.getFirstNodeInGroup<Pellet>('pellets');
    }
    expect(pellet).not.toBeNull();
    expect(telegraphAt).toBeGreaterThanOrEqual(0);
    expect(clock - telegraphAt).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(glowing).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    const x0 = pellet!.globalPosition.x;
    step(10);
    const speed = (x0 - pellet!.globalPosition.x) / 10;
    expect(speed).toBeGreaterThan(0.5);
    expect(speed).toBeLessThanOrEqual(3.5);
    expect(pellet!.globalPosition.y).toBeCloseTo(-6, 0);
    waitFor(() => hurts > 0, 120);
    expect(hurts).toBe(1);
    step(2);
    expect(pellet!.isFreed()).toBe(true);
  });

  it('a diver marks where Sproto was and swoops there in a straight line', () => {
    const [diver] = setup([[DIVER, new Vec2(0, -150)]], new Vec2(-400, 0)) as Diver[];
    let sounds = 0;
    diver!.telegraphed.connect(() => (sounds += 1));
    const spot = new Vec2(40, -19);
    player.respawnAt(spot);
    step(2);
    expect(diver!.isTelegraphing()).toBe(true);
    expect(sounds).toBe(1);
    const target = diver!.target;
    expect(target.distanceTo(player.globalPosition)).toBeLessThan(2);
    // He runs away at the flash: the dive still goes to the old spot.
    player.respawnAt(new Vec2(-300, -19));
    let telegraph = 0;
    while (diver!.isTelegraphing()) {
      telegraph += 1;
      step(1);
    }
    expect(telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES - 2);
    expect(diver!.isSwooping()).toBe(true);
    const start = diver!.globalPosition;
    const line = target.sub(start).normalized();
    let reached = false;
    for (let i = 0; i < 200 && diver!.isSwooping(); i++) {
      step(1);
      const off = diver!.globalPosition.sub(start).cross(line);
      expect(Math.abs(off)).toBeLessThan(0.5);
      reached = reached || diver!.globalPosition.distanceTo(target) < 0.01;
    }
    expect(reached).toBe(true);
    expect(diver!.target.equals(target)).toBe(true);
    expect(hurts).toBe(0);
  });

  it('a sniper locks its target at telegraph start and fires a burst at that spot', () => {
    const [sniper] = setup([[SNIPER, new Vec2(0, 0)]], new Vec2(-1000, 0)) as Sniper[];
    player.respawnAt(new Vec2(-250, -19));
    step(2);
    expect(sniper!.isTelegraphing()).toBe(true);
    const locked = sniper!.target;
    player.respawnAt(new Vec2(-600, -19)); // runs at the flash
    waitFor(() => sniper!.isFiring(), 120);
    expect(sniper!.target.equals(locked)).toBe(true);
    const shots = waitFor(() => tree.getNodesInGroup('pellets').length >= 3, 40);
    expect(shots).toBeGreaterThanOrEqual(0);
    for (const s of tree.getNodesInGroup<Node2D>('pellets')) {
      const dir = locked.sub(sniper!.muzzle()).normalized();
      expect(Math.abs(s.globalPosition.sub(sniper!.muzzle()).cross(dir))).toBeLessThan(0.5);
    }
  });

  it('a lantern drops only when Sproto moves in under it, after a telegraph, and breaks without score', () => {
    const [lantern] = setup([[LANTERN, new Vec2(0, -150), { arm_frames: 10 }]], new Vec2(-300, 0)) as Dropper[];
    let landed = false;
    lantern!.landed.connect(() => (landed = true));
    step(20);
    expect(lantern!.isTelegraphing() || lantern!.isFalling()).toBe(false);
    const score = GameState.score;
    player.respawnAt(new Vec2(0, -19));
    let shook = -1;
    let fell = -1;
    for (let i = 0; i < 200 && !gone(lantern!); i++) {
      step(1);
      if (shook < 0 && lantern!.isTelegraphing()) shook = i;
      if (fell < 0 && lantern!.isFalling()) fell = i;
    }
    expect(shook).toBeGreaterThanOrEqual(0);
    expect(fell - shook).toBeGreaterThanOrEqual(MIN_TELEGRAPH_FRAMES);
    expect(hurts).toBe(1); // a standing Sproto under it is hit
    expect(gone(lantern!)).toBe(true);
    expect(landed).toBe(true); // it hit him on the way down, then broke on the floor
    expect(GameState.score).toBe(score); // no score for a landing
  });
});

describe('drawing', () => {
  /** A Canvas2D stand-in that accepts every call and records how many were made. */
  function stubGfx(): { g: Gfx; calls: () => number } {
    let n = 0;
    const fn = (): void => {
      n += 1;
    };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : fn),
      set: (t, k, v) => {
        t[k as string] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { g: new Gfx(ctx), calls: () => n };
  }

  it('every enemy and projectile draws in every state without throwing', () => {
    const scenes = Object.keys(ENEMY_SCENES);
    const nodes: Node2D[] = [];
    world = newWorld();
    addFloor(world);
    addRect(world, new Rect2(-4000, -400, 8000, 16)); // a ceiling for the droppers
    scenes.forEach((s, i) => {
      const y = s.includes('dropper') || s.includes('lantern') || s.includes('chandelier') ? -300 : s.includes('diver') || s.includes('floater') || s.includes('spellbook_pill') || s.includes('drone_pill') ? -150 : 0;
      nodes.push(place<Node2D>(world, s, new Vec2(i * 30 - 300, y)));
    });
    player = spawnPlayer(world, new Vec2(0, 0));
    const { g, calls } = stubGfx();
    for (let i = 0; i < 400; i++) {
      step(1);
      if (i === 40) player.respawnAt(new Vec2(-250, -19)); // wake the aimed ones
      if (i % 7 === 0) for (const n of nodes) if (!n.isFreed()) n.draw(g);
      for (const p of tree.getNodesInGroup<Node2D>('pellets')) p.draw(g);
    }
    expect(calls()).toBeGreaterThan(1000);
  });
});
