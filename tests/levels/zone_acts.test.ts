// The test zone and the zone acts, built from their level files (ports of
// the structure checks in tests/levels/test_test_zone.gd, test_z1_acts.gd,
// test_z2_acts.gd and test_z3_acts.gd): registration, the pieces each act
// is built from, the enemy roster and the in-act ramp, fair spawns (and none
// on moving terrain), the calm corridor before each boss gate and the zone
// set pieces. The recorded runs and the playtest bot are in
// tests/qa/playtest.test.ts; the difficulty rows and the lint in
// tests/qa/level_lint.test.ts.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Difficulty } from '../../src/core/difficulty';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { ZoneRegistry } from '../../src/core/zone_registry';
import type { LevelData } from '../../src/levels/common/level_loader';
import { BoundsRect, Marker, TileLayer } from '../../src/levels/common/level_nodes';
import { LevelRoot } from '../../src/levels/common/level_root';
import { Diver } from '../../src/levels/enemies/diver';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { Checkpoint } from '../../src/levels/objects/checkpoint';
import { LevelSpring } from '../../src/levels/objects/spring';
import { Conveyor } from '../../src/levels/objects/z3/conveyor';
import { FloorSwitch } from '../../src/levels/objects/z3/floor_switch';
import { MovingBookshelf } from '../../src/levels/objects/z2/moving_bookshelf';
import { ShiftingStaircase } from '../../src/levels/objects/z2/shifting_staircase';
import { Door } from '../../src/levels/objects/z3/door';
import { Node, Node2D } from '../../src/runtime/node';
import { CollisionObject2D } from '../../src/runtime/physics';
import { Rect2, type Vec2 } from '../../src/runtime/vec2';
import { CurveShape, CurveTerrain } from '../../src/terrain/curve_terrain';
import { annotate, loadLevelData, originOf } from '../../tools/qa/level_lint';
import { Checks } from '../helpers/check';
import { step } from '../helpers/world';
import { buildAct, loadAct, SCREEN, TEST_ZONE } from './level_world';

const O = 'res://levels/objects/';
const E = 'res://levels/enemies/';
const B = {
  LOOP: 'res://terrain/loop.tscn',
  TICKET: `${O}ticket.tscn`,
  SPRING_UP: `${O}spring_up.tscn`,
  SPRING_DIAGONAL: `${O}spring_diagonal.tscn`,
  BOOSTER: `${O}speed_booster.tscn`,
  BREAKABLE_WALL: `${O}breakable_wall.tscn`,
  CHECKPOINT: `${O}checkpoint.tscn`,
  GOAL_SIGN: `${O}goal_sign.tscn`,
  WATERFALL: `${O}z1/waterfall.tscn`,
  WALKER: `${E}walker.tscn`,
  HOPPER: `${E}hopper.tscn`,
  CHASER: `${E}chaser.tscn`,
  FLOATER: `${E}floater.tscn`,
  PELLET_PILL: `${E}pellet_pill.tscn`,
  SPIKE_PILL: `${E}spike_pill.tscn`,
  SHIFTING_STAIRCASE: `${O}z2/shifting_staircase.tscn`,
  BOOKSHELF: `${O}z2/moving_bookshelf.tscn`,
  CANDLE: `${O}z2/candle.tscn`,
  FALLING_BOOK: `${O}z2/falling_book.tscn`,
  AUTOSCROLL: `${O}z2/autoscroll_section.tscn`,
  SPELLBOOK: `${E}z2/spellbook_pill.tscn`,
  SPELLBOOK_DIVER: `${E}z2/spellbook_diver.tscn`,
  KNIGHT: `${E}z2/knight_pill.tscn`,
  LANTERN: `${E}z2/lantern_pill.tscn`,
  CONVEYOR: `${O}z3/conveyor.tscn`,
  SECURITY_BEAM: `${O}z3/security_beam.tscn`,
  DOOR: `${O}z3/door.tscn`,
  FLOOR_SWITCH: `${O}z3/floor_switch.tscn`,
  DRONE: `${E}z3/drone_pill.tscn`,
  DRONE_DIVER: `${E}z3/drone_diver.tscn`,
  CLERK: `${E}z3/clerk_pill.tscn`,
  BOUNCER: `${E}z3/bouncer_pill.tscn`,
  SECURITY_PILL: `${E}z3/security_pill.tscn`,
  CHANDELIER: `${E}z3/chandelier_pill.tscn`,
  CAMERA: `${E}z3/camera_pill.tscn`,
  BURROWER: 'hpos://hazards/burrower',
};

interface Built {
  root: LevelRoot;
  data: LevelData;
}

async function built(file: string): Promise<Built> {
  const data = loadLevelData(file);
  const root = await buildAct(file);
  annotate(root, data);
  return { root, data };
}

const sceneOf = (n: Node): string => originOf(n).scene;

/** Instanced scenes by path, as Godot's scene_file_path counts. */
function counts(root: Node): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of root.findChildren()) {
    const s = sceneOf(n);
    if (s) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

const xOf = (n: Node): number => (n as Node2D).globalPosition.x;

function startX(root: LevelRoot): number {
  return root.getNode<Node2D>('PlayerStart').globalPosition.x;
}

function goal(root: LevelRoot): Node2D {
  return root.getNode<Node2D>('Objects/GoalSign');
}

function progress(root: LevelRoot, x: number): number {
  const s = startX(root);
  return Math.min(Math.max((x - s) / (goal(root).globalPosition.x - s), 0), 1);
}

function spawns(root: LevelRoot): Vec2[] {
  return [root.getNode<Node2D>('PlayerStart').globalPosition, ...root.findChildren((n) => sceneOf(n) === B.CHECKPOINT).map((n) => (n as Node2D).globalPosition)];
}

const enemies = (root: Node): Enemy[] => root.findChildren<Enemy>((n) => n instanceof Enemy);

function requirePieces(c: Checks, root: LevelRoot, stage: number, required: Record<string, [number, number]>): void {
  const have = counts(root);
  for (const [path, need] of Object.entries(required)) {
    const n = need[stage - 1]!;
    c.true((have[path] ?? 0) >= n, `act ${stage} uses ${path.split('/').pop()} (${have[path] ?? 0} of ${n})`);
  }
}

/** The last checkpoint is within 2.25 screens of the goal, with a calm corridor of a few tickets before it. */
function calmCorridor(c: Checks, root: LevelRoot): void {
  const g = goal(root).globalPosition.x;
  const last = Math.max(...spawns(root).map((p) => p.x));
  c.true(g - last <= 2.25 * SCREEN, `a checkpoint ${(g - last).toFixed(0)} px before the goal (<= 2.25 screens)`);
  let tickets = 0;
  for (const n of root.findChildren((x) => x instanceof Node2D)) {
    const x = xOf(n);
    if (x < last - 2 * SCREEN || x > g) continue;
    c.false(n instanceof Enemy, `no enemy in the last corridor (${n.name})`);
    if (sceneOf(n) === B.TICKET) tickets++;
  }
  c.true(tickets >= 3 && tickets <= 12, `a few tickets in the corridor (${tickets})`);
}

beforeEach(() => {
  GameState.resetGame();
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
});

// --- Test zone -----------------------------------------------------------------------

describe('test zone', () => {
  const REQUIRED: Record<string, number> = {
    [B.LOOP]: 1,
    [B.SPRING_UP]: 1,
    [B.SPRING_DIAGONAL]: 1,
    [B.BOOSTER]: 1,
    [B.BREAKABLE_WALL]: 1,
    [B.CHECKPOINT]: 1,
    [B.GOAL_SIGN]: 1,
    [B.WALKER]: 1,
    [B.HOPPER]: 1,
    [B.TICKET]: 60,
  };

  it('structure and the D0 targets', async () => {
    const c = new Checks();
    c.eq(ZoneRegistry.stagePath('test_zone', 1), 'level:test_zone', 'registered as the test zone act');
    const { root } = await built(TEST_ZONE);
    c.true(root instanceof LevelRoot, 'a LevelRoot');
    c.eq(root.zoneId, 'test_zone', 'zone id');
    c.eq(root.artZoneId, 'z1_retro_rush_hills', 'Zone 1 art');
    c.true(root.getNodeOrNull('PlayerStart') instanceof Marker, 'PlayerStart');
    const bounds = root.getNode<BoundsRect>('Bounds').rect;
    c.true(bounds.w > SCREEN && bounds.h >= 240, 'Bounds bigger than the screen');
    const have = counts(root);
    for (const [path, need] of Object.entries(REQUIRED)) c.true((have[path] ?? 0) >= need, `uses ${path.split('/').pop()} (${have[path] ?? 0})`);
    c.true(root.findChildren((n) => n instanceof TileLayer).length > 0, 'built mostly from tiles');
    c.true(root.findChildren((n) => n instanceof CurveTerrain && n.shape === CurveShape.QUARTER_PIPE).length > 0, 'a quarter pipe');
    const t = Difficulty.targets(0);
    const screens = bounds.w / SCREEN;
    const es = enemies(root);
    c.near(screens, t.screens, 2, 'length in screens');
    c.near(es.length / screens, t.enemies_per_screen, 0.05, 'enemies per screen');
    for (const e of es) c.eq(e.tier, 1, `${e.name} is T1`);
    const cps = have[B.CHECKPOINT] ?? 0;
    c.true(Math.abs(cps - t.checkpoints) <= 1, `checkpoints: ${cps} (row ${t.checkpoints}, plus the finale one)`);
    c.near((have[B.TICKET] ?? 0) / screens, t.tickets_per_screen, t.tickets_per_screen * 0.25, 'tickets per screen');
    c.done();
  });

  it('the sections ramp towards the finale, which opens at a checkpoint', async () => {
    const level = await loadAct(TEST_ZONE);
    const start = startX(level);
    const g = goal(level).globalPosition.x;
    expect(level.progressAt(start)).toBeCloseTo(0, 6);
    expect(level.progressAt(g)).toBeCloseTo(1, 6);
    expect(level.progressAt(start - 500)).toBeCloseTo(0, 6);
    expect(level.progressAt(g + 500)).toBeCloseTo(1, 6);
    const per = { opening: 0, middle: 0, finale: 0 };
    for (const e of level.findChildren<Enemy>((n) => n instanceof Enemy)) {
      const p = level.progressAt(e.globalPosition.x);
      per[p < Difficulty.OPENING_END ? 'opening' : p < Difficulty.FINALE_START ? 'middle' : 'finale']++;
    }
    const widths = { opening: Difficulty.OPENING_END, middle: Difficulty.FINALE_START - Difficulty.OPENING_END, finale: 1 - Difficulty.FINALE_START };
    const density = { opening: per.opening / widths.opening, middle: per.middle / widths.middle, finale: per.finale / widths.finale };
    expect(per.finale).toBeGreaterThanOrEqual(1);
    expect(density.finale).toBeGreaterThan(density.middle);
    expect(density.finale).toBeGreaterThan(density.opening);
    const finaleCheckpoint = level
      .findChildren<Checkpoint>((n) => n instanceof Checkpoint)
      .some((cp) => {
        const at = level.progressAt(cp.globalPosition.x);
        return at >= Difficulty.FINALE_START - 0.02 && at <= Difficulty.FINALE_START + 0.06;
      });
    expect(finaleCheckpoint).toBe(true);
  });

  it('PlayerStart is on solid ground', async () => {
    const level = await loadAct(TEST_ZONE);
    step(120);
    const p = level.player!;
    expect(p.grounded).toBe(true);
    expect(p.state).not.toBe('dead');
    expect(Math.abs(p.globalPosition.x - startX(level))).toBeLessThanOrEqual(0.5);
  });
});

// --- Zone acts -----------------------------------------------------------------------

const Z1 = 'z1_retro_rush_hills';
const Z2 = 'z2_wizard_academy';
const Z3 = 'z3_capital_mansion';
const file = (zone: string, stage: number): string => `src/levels/data/${zone}/act${stage}.json`;

describe('Zone 1, Retro Rush Hills', () => {
  const REQUIRED: Record<string, [number, number]> = {
    [B.LOOP]: [2, 2],
    [B.SPRING_UP]: [2, 1],
    [B.SPRING_DIAGONAL]: [1, 3],
    [B.BOOSTER]: [2, 2],
    [B.WATERFALL]: [2, 2],
    [B.CHECKPOINT]: [3, 4],
    [B.GOAL_SIGN]: [1, 1],
    [B.BREAKABLE_WALL]: [0, 1],
  };
  const ROSTER = [B.WALKER, B.HOPPER, B.CHASER, B.FLOATER, B.PELLET_PILL, B.SPIKE_PILL];
  const acts: Built[] = [];
  beforeAll(async () => {
    for (const stage of [1, 2]) acts.push(await built(file(Z1, stage)));
  });

  it('both acts are registered and use the zone pieces', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const stage = i + 1;
      c.eq(ZoneRegistry.stagePath(Z1, stage), `level:${Z1}/act${stage}`, `act ${stage} registered`);
      c.eq(root.zoneId, Z1, `act ${stage}: zone id`);
      c.eq(root.artZoneId, Z1, `act ${stage}: Zone 1 art`);
      c.true(root.getNodeOrNull('PlayerStart') instanceof Marker, `act ${stage}: PlayerStart`);
      const bounds = root.getNode<BoundsRect>('Bounds').rect;
      c.true(bounds.w > 40 * SCREEN, `act ${stage}: a long act`);
      c.true(root.findChildren((n) => n instanceof TileLayer).length > 0, `act ${stage}: built from tiles`);
      requirePieces(c, root, stage, REQUIRED);
      c.true((counts(root)[B.TICKET] ?? 0) > (4 * bounds.w) / SCREEN, `act ${stage}: plenty of tickets`);
      for (const w of root.findChildren((n) => n.name.startsWith('Waterfall'))) {
        c.true(!(w instanceof CollisionObject2D) && w.findChildren((n) => n instanceof CollisionObject2D).length === 0, `${w.name} is decoration`);
      }
    });
    c.done();
  });

  it('act 2 has the secret and the switchback', () => {
    const { root } = acts[1]!;
    expect(root.findChildren((n) => sceneOf(n) === B.BREAKABLE_WALL).length).toBe(1);
    const marker = root.getNodeOrNull<BoundsRect>('LeftwardZigzag');
    expect(marker).toBeInstanceOf(BoundsRect);
    expect(marker!.rect.w).toBeGreaterThanOrEqual(SCREEN);
    const left = root.getNodeOrNull<LevelSpring>('Objects/ZigzagSpringLeft');
    const right = root.getNodeOrNull<LevelSpring>('Objects/ZigzagSpringRight');
    expect(left?.facing).toBe(-1);
    expect(right?.facing).toBe(1);
    expect(right!.position.y).toBeLessThan(left!.position.y);
  });

  it('enemies follow the roster and the in-act ramp', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const stage = i + 1;
      const ceiling = stage === 1 ? 1 : 2;
      let t2 = 0;
      for (const e of enemies(root)) {
        c.true(ROSTER.includes(sceneOf(e)), `act ${stage}: ${e.name} is on the Zone 1 roster`);
        const finale = progress(root, xOf(e)) >= Difficulty.FINALE_START;
        const allowed = ceiling + (finale ? 1 : 0);
        c.true(e.tier <= allowed, `act ${stage}: ${e.name} (T${e.tier}) within T${allowed}`);
        if (e.tier === 2) t2++;
      }
      c.true(t2 > 0, `act ${stage} meets the new T2s`);
    });
    c.done();
  });

  it('spawns are fair: nothing within a screen of a respawn or 2 screens after it', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const xs = spawns(root).map((p) => p.x);
      for (const e of enemies(root)) {
        const x = xOf(e);
        for (const at of xs) {
          c.true(Math.abs(x - at) > SCREEN, `act ${i + 1}: ${e.name} ${(x - at).toFixed(0)} px from a respawn at x ${at}`);
          c.true(x <= at || x - at > 2 * SCREEN, `act ${i + 1}: ${e.name} ${(x - at).toFixed(0)} px after a respawn at x ${at}`);
        }
      }
    });
    c.done();
  });

  it('act 2 ends in a calm corridor by a checkpoint', () => {
    const c = new Checks();
    calmCorridor(c, acts[1]!.root);
    c.done();
  });
});

/** Rectangles of the moving terrain (staircases, shelves, doors), grown by 48 px. */
function movers(root: LevelRoot): Rect2[] {
  const out: Rect2[] = [];
  for (const n of root.findChildren()) {
    if (n instanceof MovingBookshelf) out.push(new Rect2(n.globalPosition.x, n.globalPosition.y, n.size.x, n.size.y).grow(48));
    else if (n instanceof ShiftingStaircase) {
      const size = { x: 48 * n.steps, y: 32 * n.steps };
      out.push(new Rect2(n.globalPosition.x, n.globalPosition.y - size.y, size.x, size.y).grow(48));
    } else if (n instanceof Door) out.push(new Rect2(n.globalPosition.x, n.globalPosition.y - n.size.y, n.size.x, n.size.y).grow(48));
  }
  return out;
}

describe('Zone 2, Wizard Academy', () => {
  const REQUIRED: Record<string, [number, number]> = {
    [B.SHIFTING_STAIRCASE]: [3, 2],
    [B.BOOKSHELF]: [3, 4],
    [B.CANDLE]: [6, 6],
    [B.FALLING_BOOK]: [4, 4],
    [B.AUTOSCROLL]: [0, 1],
    [B.BREAKABLE_WALL]: [0, 1],
    [B.CHECKPOINT]: [4, 5],
    [B.GOAL_SIGN]: [1, 1],
  };
  const ROSTER = [B.WALKER, B.HOPPER, B.CHASER, B.PELLET_PILL, B.SPELLBOOK, B.SPELLBOOK_DIVER, B.KNIGHT, B.LANTERN, B.BURROWER];
  const acts: Built[] = [];
  beforeAll(async () => {
    for (const stage of [1, 2]) acts.push(await built(file(Z2, stage)));
  });

  it('both acts are registered and use the zone pieces', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const stage = i + 1;
      c.eq(ZoneRegistry.stagePath(Z2, stage), `level:${Z2}/act${stage}`, `act ${stage} registered`);
      c.eq(root.zoneId, Z2, `act ${stage}: zone id`);
      c.eq(root.artZoneId, Z2, `act ${stage}: Zone 2 art`);
      const tiles = root.findChildren<TileLayer>((n) => n instanceof TileLayer);
      c.true(tiles.length > 0 && tiles[0]!.tilesetId === Z2, `act ${stage}: built from the Zone 2 tiles`);
      requirePieces(c, root, stage, REQUIRED);
    });
    c.done();
  });

  it('both acts climb more than two screens', () => {
    for (const { root } of acts) {
      const ys = spawns(root).map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(2 * 240 - 64);
    }
  });

  it('enemies follow the roster and the in-act ramp', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const stage = i + 1;
      const tiers: Record<number, number> = {};
      for (const e of enemies(root)) {
        c.true(ROSTER.includes(sceneOf(e)), `act ${stage}: ${e.name} is on the Zone 2 roster`);
        const at = progress(root, xOf(e));
        if (e.tier === 4) c.true(at >= Difficulty.FINALE_START, `act ${stage}: ${e.name} (T4) only in the finale`);
        if (at < Difficulty.OPENING_END) c.true(e.tier <= 2, `act ${stage}: ${e.name} (T${e.tier}) in the opening`);
        tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
      }
      for (const t of [1, 2, 3, 4]) c.true((tiers[t] ?? 0) > 0, `act ${stage} meets T${t} enemies ${JSON.stringify(tiers)}`);
    });
    c.done();
  });

  it('spawns are fair and never on moving terrain', () => {
    const c = new Checks();
    acts.forEach(({ root }, i) => {
      const spots = spawns(root);
      for (const spot of spots) for (const r of movers(root)) c.false(r.hasPoint(spot), `act ${i + 1}: spawn at ${spot} is clear of moving terrain ${r}`);
      for (const e of enemies(root)) {
        const x = xOf(e);
        for (const s of spots) {
          c.true(Math.abs(x - s.x) > SCREEN, `act ${i + 1}: ${e.name} ${(x - s.x).toFixed(0)} px from a respawn at x ${s.x}`);
          c.true(x <= s.x || x - s.x > 2 * SCREEN, `act ${i + 1}: ${e.name} ${(x - s.x).toFixed(0)} px after a respawn`);
        }
      }
    });
    c.done();
  });

  it('act 2 has the broom chase after a checkpoint and a calm end', () => {
    const c = new Checks();
    const { root } = acts[1]!;
    const chase = root.findChildren((n) => sceneOf(n) === B.AUTOSCROLL);
    c.eq(chase.length, 1, 'one broom chase');
    const start = xOf(chase[0]!);
    const before = spawns(root)
      .filter((p) => p.x < start)
      .sort((a, b) => a.x - b.x);
    c.true(before.length > 0 && start - before[before.length - 1]!.x <= 3 * SCREEN, 'a checkpoint shortly before the chase');
    calmCorridor(c, root);
    c.done();
  });
});

describe('Zone 3, Capital Mansion', () => {
  const REQUIRED: Record<string, [number, number]> = {
    [B.DOOR]: [3, 4],
    [B.FLOOR_SWITCH]: [3, 4],
    [B.SECURITY_BEAM]: [9, 10],
    [B.CONVEYOR]: [4, 4],
    [B.BOOSTER]: [2, 0],
    [B.BOOKSHELF]: [1, 5],
    [B.CHECKPOINT]: [5, 6],
    [B.GOAL_SIGN]: [1, 1],
  };
  const ROSTER = [B.CHASER, B.DRONE, B.DRONE_DIVER, B.CLERK, B.BOUNCER, B.SECURITY_PILL, B.CHANDELIER, B.CAMERA, B.BURROWER];
  const acts: LevelRoot[] = [];
  beforeAll(async () => {
    // In the tree, so the switches resolve their doors.
    for (const stage of [1, 2]) {
      const root = await loadAct(file(Z3, stage));
      annotate(root, loadLevelData(file(Z3, stage)));
      acts.push(root);
    }
  });

  it('both acts are registered and use the zone pieces; every switch opens a door', () => {
    const c = new Checks();
    acts.forEach((root, i) => {
      const stage = i + 1;
      c.eq(ZoneRegistry.stagePath(Z3, stage), `level:${Z3}/act${stage}`, `act ${stage} registered`);
      c.eq(root.zoneId, Z3, `act ${stage}: zone id`);
      c.eq(root.artZoneId, Z3, `act ${stage}: Zone 3 art`);
      const tiles = root.findChildren<TileLayer>((n) => n instanceof TileLayer);
      c.true(tiles.length > 0 && tiles[0]!.tilesetId === Z3, `act ${stage}: Zone 3 tiles`);
      requirePieces(c, root, stage, REQUIRED);
      for (const sw of root.findChildren<FloorSwitch>((n) => n instanceof FloorSwitch)) {
        c.true(sw.doors.length > 0 && sw.getNodeOrNull(sw.doors[0]!) instanceof Door, `${sw.name} opens a door`);
      }
    });
    c.done();
  });

  it('enemies follow the roster (T2 to T4) and the in-act ramp; divers keep the dive floor', () => {
    const c = new Checks();
    acts.forEach((root, i) => {
      const stage = i + 1;
      const tiers: Record<number, number> = {};
      for (const e of enemies(root)) {
        c.true(ROSTER.includes(sceneOf(e)), `act ${stage}: ${e.name} is on the Zone 3 roster`);
        c.true(e.tier >= 2, `act ${stage}: ${e.name} is T2 or above`);
        if (progress(root, xOf(e)) < Difficulty.OPENING_END) c.true(e.tier <= 3, `act ${stage}: ${e.name} (T${e.tier}) in the opening`);
        tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
      }
      for (const t of [2, 3, 4]) c.true((tiers[t] ?? 0) > 0, `act ${stage} meets T${t} enemies`);
      for (const d of root.findChildren<Diver>((n) => n instanceof Diver && sceneOf(n) === B.DRONE_DIVER)) c.true(d.minDiveDrop >= 120, `${d.name} keeps the dive floor`);
    });
    c.done();
  });

  it('every respawn is a screen clear of enemies and off moving terrain', () => {
    const c = new Checks();
    acts.forEach((root, i) => {
      const spots = spawns(root);
      for (const spot of spots) for (const r of movers(root)) c.false(r.hasPoint(spot), `act ${i + 1}: spawn ${spot} clear of moving terrain ${r}`);
      for (const e of enemies(root)) {
        const at = e.globalPosition;
        for (const s of spots) c.true(Math.abs(at.x - s.x) > SCREEN || Math.abs(at.y - s.y) > 200, `act ${i + 1}: ${e.name} ${(at.x - s.x).toFixed(0)} px from a respawn at x ${s.x}`);
      }
    });
    c.done();
  });

  it("act 2's exit is reached travelling left past the gate checkpoint", () => {
    const c = new Checks();
    const root = acts[1]!;
    const g = goal(root).globalPosition;
    const marker = root.getNodeOrNull<BoundsRect>('LeftwardBunkerExit');
    c.true(marker instanceof BoundsRect && marker.rect.w >= SCREEN, 'a leftward stretch at least a screen wide');
    const belt = root.getNodeOrNull<Conveyor>('Terrain/ExitConveyor');
    c.true(belt instanceof Conveyor && belt.speed < 0, 'the exit belt carries left');
    c.true(!!belt && belt.globalPosition.x > g.x && belt.globalPosition.x - g.x < 2 * SCREEN, "the goal is at the belt's left end");
    const gate = spawns(root)
      .filter((p) => Math.abs(p.y - (g.y - 19)) < 1)
      .sort((a, b) => a.x - b.x)[0];
    c.true(!!gate && Math.abs(gate.x - g.x) <= 2.25 * SCREEN, `a checkpoint beside the arena gate (${gate ? Math.abs(gate.x - g.x).toFixed(0) : 'none'} px)`);
    let tickets = 0;
    for (const n of root.findChildren((x) => x instanceof Node2D)) {
      const p = (n as Node2D).globalPosition;
      if (Math.abs(p.y - g.y) < 40 && p.x > g.x && p.x < g.x + 2 * SCREEN) {
        c.false(n instanceof Enemy, `no enemy in the exit corridor (${n.name})`);
        if (sceneOf(n) === B.TICKET) tickets++;
      }
    }
    c.true(tickets >= 3 && tickets <= 12, `a few tickets in the corridor (${tickets})`);
    c.done();
  });
});
