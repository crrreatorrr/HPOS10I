// Zone 4 (Neon Rush Remix) acts: both build in the engine; length,
// checkpoints, ticket density, enemy density and tier mix measured from the
// built scene (lint-style: walkable columns of the collision world, stacked
// floors once) are within 15 % of docs/LEVELS.md (Difficulty.targets(7|8));
// the in-act ramp, R5 markers and routes; diver posts; the builder's
// fairness warnings; the geometric route check
// (src/levels/builder/route_check.ts) from PlayerStart to the goal sign; and
// two playthroughs by the input-only pilot (src/levels/builder/route_pilot.ts):
// one with the enemies taken out (the route itself, no death allowed) and
// one with every enemy at the act's difficulty, respawning at checkpoints.

import { beforeAll, describe, expect, it } from 'vitest';
import { Difficulty } from '../../src/core/difficulty';
import { SceneRouter } from '../../src/core/scene_router';
import { GameState } from '../../src/core/game_state';
import { Layers } from '../../src/core/layers';
import { buildLevel } from '../../src/levels/common/level_loader';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { registerNewContent } from '../../src/levels/content';
import { ItemBox } from '../../src/levels/objects/item_box';
import { Settings } from '../../src/core/settings';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { Checkpoint } from '../../src/levels/objects/checkpoint';
import { GoalSign } from '../../src/levels/objects/goal_sign';
import { LevelTicket } from '../../src/levels/objects/ticket';
import { checkRoute, floorAt } from '../../src/levels/builder/route_check';
import { flyPilot } from '../../src/levels/builder/route_pilot';
import { Diver } from '../../src/levels/enemies/diver';
import type { LevelBuilder } from '../../src/levels/builder/level_builder';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { buildAct1 } from '../../src/levels/z4/act1';
import { buildAct2 } from '../../src/levels/z4/act2';
import { registerZone4, registerZone4Types } from '../../src/levels/z4/register';
import { Z4_ACT1, Z4_ACT2 } from '../../src/levels/z4/zone';
import { Scenes } from '../../src/core/scenes';
import { BoundsRect } from '../../src/levels/common/level_nodes';
import type { Node } from '../../src/runtime/node';
import type { CollisionObject2D } from '../../src/runtime/physics';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';
import { TerrainLoop } from '../../src/terrain/loop';
import { Gfx } from '../../src/runtime/gfx';
import { NeonLoop, NeonTerrain } from '../../src/levels/z4/neon_terrain';
import { step } from '../helpers/world';

const SCREEN = 424;
const COLUMN = 4;
const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B | Layers.TERRAIN_TOP_ONLY;
const CEIL_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_PATH_B;
const TOLERANCE = 0.15;

beforeAll(() => {
  registerCoreTypes();
  registerObjects();
  registerEnemies();
  registerZone4Types();
});

function isMoving(body: CollisionObject2D): boolean {
  return typeof (body as Partial<{ platformDelta(): Vec2 }>).platformDelta === 'function';
}

interface Measure {
  screens: number;
  enemies: number;
  density: number;
  tierPct: Record<number, number>;
  tickets: number;
  ticketDensity: number;
  checkpoints: number[];
  sections: Record<'opening' | 'middle' | 'finale', { screens: number; enemies: number; tierMax: number; density: number }>;
  routesPerThird: number[];
  reverseRuns: number;
  goalX: number;
  startX: number;
}

/** Floors in one column (static terrain only), top to bottom, with the clearance above each. */
function columnFloors(x: number, top: number, bottom: number): { y: number; clearance: number }[] {
  const out: { y: number; clearance: number }[] = [];
  let from = top;
  for (let guard = 0; guard < 32 && from < bottom; guard++) {
    const hit = tree.physics.intersectRay(new Vec2(x, from), new Vec2(x, bottom), FLOOR_MASK);
    if (!hit) break;
    const y = hit.position.y;
    if (!isMoving(hit.collider)) {
      const up = tree.physics.intersectRay(new Vec2(x, y - 1), new Vec2(x, top), CEIL_MASK);
      out.push({ y, clearance: up ? y - up.position.y : Infinity });
    }
    from = y + 1;
  }
  return out;
}

function measure(root: LevelRoot): Measure {
  const bounds = root.getNodeOrNull<BoundsRect>('Bounds')!.globalRect();
  const loops = root.findChildren<TerrainLoop>((n) => n instanceof TerrainLoop).map((l) => l.globalPosition.x);
  const start = root.getNodeOrNull<Node & { globalPosition: Vec2 }>('PlayerStart')!.globalPosition.x;
  const goal = root.findChildren<GoalSign>((n) => n instanceof GoalSign)[0]!.globalPosition.x;
  const sections = {
    opening: { screens: 0, enemies: 0, tierMax: 0, density: 0 },
    middle: { screens: 0, enemies: 0, tierMax: 0, density: 0 },
    finale: { screens: 0, enemies: 0, tierMax: 0, density: 0 },
  };
  const section = (x: number): keyof typeof sections => {
    const p = root.progressAt(x);
    return p < Difficulty.OPENING_END ? 'opening' : p <= Difficulty.FINALE_START ? 'middle' : 'finale';
  };
  let walk = 0;
  const thirds: number[][] = [[], [], []];
  for (let x = bounds.x + COLUMN / 2; x < bounds.right; x += COLUMN) {
    const inLoop = loops.some((lx) => Math.abs(x - lx) < 240);
    const floors = columnFloors(x, bounds.y, bounds.bottom + 32);
    if (!inLoop && floors.length === 0) continue;
    walk += COLUMN;
    sections[section(x)].screens += COLUMN / SCREEN;
    let routes = 0;
    let lastY = -Infinity;
    for (const f of floors) {
      if (f.clearance >= 28 && f.y - lastY >= 64) {
        routes += 1;
        lastY = f.y;
      }
    }
    if (x >= start && x <= goal) thirds[Math.min(2, Math.floor((3 * (x - start)) / (goal - start)))]!.push(Math.max(routes, 1));
  }
  const screens = walk / SCREEN;
  const enemies = root.findChildren<Enemy>((n) => n instanceof Enemy);
  const tiers: Record<number, number> = {};
  for (const e of enemies) {
    tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
    const s = sections[section(e.globalPosition.x)];
    s.enemies += 1;
    s.tierMax = Math.max(s.tierMax, e.tier);
  }
  for (const s of Object.values(sections)) s.density = s.enemies / Math.max(s.screens, 0.01);
  const tierPct: Record<number, number> = {};
  for (const [t, n] of Object.entries(tiers)) tierPct[Number(t)] = (100 * n) / enemies.length;
  const tickets = root.findChildren((n) => n instanceof LevelTicket).length;
  const checkpoints = root
    .findChildren<Checkpoint>((n) => n instanceof Checkpoint)
    .map((c) => c.globalPosition.x)
    .sort((a, b) => a - b);
  const routesPerThird = thirds.map((t) => {
    const sorted = [...t].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length * 0.75)]! : 0;
  });
  const reverseRuns = root.findChildren((n) => /reverse/i.test(n.name)).length;
  return {
    screens,
    enemies: enemies.length,
    density: enemies.length / screens,
    tierPct,
    tickets,
    ticketDensity: tickets / screens,
    checkpoints,
    sections,
    routesPerThird,
    reverseRuns,
    goalX: goal,
    startX: start,
  };
}

function within(got: number, want: number, tol = TOLERANCE): boolean {
  return Math.abs(got - want) <= want * tol;
}

async function load(builder: LevelBuilder, reset = true): Promise<LevelRoot> {
  if (reset) GameState.resetGame();
  const root = (await buildLevel(builder.build())) as LevelRoot;
  root.useSceneRouter = false;
  tree.changeSceneNow(() => root);
  step(2);
  return root;
}

describe('Zone 4 registration', () => {
  it('registerZone4() registers both act scenes, which build a level root', async () => {
    registerZone4();
    for (const id of [Z4_ACT1, Z4_ACT2]) {
      expect(Scenes.exists(id)).toBe(true);
      const node = await Scenes.factory(id)!();
      expect(node).toBeInstanceOf(LevelRoot);
      expect((node as LevelRoot).zoneId).toBe('z4_neon_rush_remix');
    }
  });
});

const ACTS = [
  { name: 'Act 1', d: 7, stage: 1, make: buildAct1, preBoss: false },
  { name: 'Act 2', d: 8, stage: 2, make: buildAct2, preBoss: true },
] as const;
const PILOT_FRAMES = 60 * 60 * 6;

for (const act of ACTS) {
  describe(`Zone 4 ${act.name} (D${act.d})`, () => {
    const t = Difficulty.targets(act.d);
    let builder: LevelBuilder;
    let root: LevelRoot;
    let m: Measure;

    beforeAll(async () => {
      builder = act.make();
      root = await load(builder);
      m = measure(root);
      console.log(
        `[z4 ${act.name}] screens ${m.screens.toFixed(1)} (target ${t.screens}), enemies ${m.enemies} = ${m.density.toFixed(2)}/screen (target ${t.enemies_per_screen}),`,
        `tiers ${JSON.stringify(Object.fromEntries(Object.entries(m.tierPct).map(([k, v]) => [k, Math.round(v)])))} (target ${JSON.stringify(t.tiers)}),`,
        `tickets ${m.tickets} = ${m.ticketDensity.toFixed(2)}/screen (target ${t.tickets_per_screen}), checkpoints ${m.checkpoints.length} (target ${t.checkpoints}),`,
        `sections ${JSON.stringify(Object.fromEntries(Object.entries(m.sections).map(([k, v]) => [k, `${v.enemies}/${v.screens.toFixed(1)}=${v.density.toFixed(2)} T${v.tierMax}`])))},`,
        `routes per third ${JSON.stringify(m.routesPerThird)}, reverse runs ${m.reverseRuns}, route ${builder.stats().routeScreens.toFixed(1)} screens`,
      );
    }, 120000);

    it('builds a level root with the zone ids, a player and a goal', () => {
      expect(root).toBeInstanceOf(LevelRoot);
      expect(root.zoneId).toBe('z4_neon_rush_remix');
      expect(root.artZoneId).toBe('z4_neon_rush_remix');
      expect(root.player).not.toBeNull();
      expect(m.goalX).toBeGreaterThan(m.startX);
    });

    it('length within 15 % of the curve', () => {
      expect(within(m.screens, t.screens), `${m.screens.toFixed(1)} screens`).toBe(true);
    });

    it('checkpoint count, the finale checkpoint and spacing', () => {
      expect(m.checkpoints.length).toBe(t.checkpoints);
      const finaleX = m.startX + (m.goalX - m.startX) * Difficulty.FINALE_START;
      expect(m.checkpoints.some((x) => Math.abs(x - finaleX) <= 1.5 * SCREEN), 'a checkpoint at the finale start').toBe(true);
      const marks = [m.startX, ...m.checkpoints, m.goalX];
      const even = (m.goalX - m.startX) / (m.checkpoints.length + 1);
      for (let i = 1; i < marks.length; i++) expect(marks[i]! - marks[i - 1]!).toBeLessThan(1.75 * even);
      if (act.preBoss) {
        const last = m.checkpoints[m.checkpoints.length - 1]!;
        expect(m.goalX - last, 'a checkpoint right outside the arena gate').toBeLessThanOrEqual(2.25 * SCREEN);
      }
    });

    it('ticket density within 15 %', () => {
      expect(within(m.ticketDensity, t.tickets_per_screen), `${m.ticketDensity.toFixed(2)}/screen`).toBe(true);
    });

    it('enemy density and tier mix within 15 %', () => {
      expect(within(m.density, t.enemies_per_screen), `${m.density.toFixed(2)}/screen`).toBe(true);
      for (const tier of [1, 2, 3, 4]) {
        const want = t.tiers[tier] ?? 0;
        const got = m.tierPct[tier] ?? 0;
        expect(Math.abs(got - want), `T${tier} ${got.toFixed(0)} % (row ${want} %)`).toBeLessThanOrEqual(15);
      }
    });

    it('rising difficulty: denser finale, no top tier in the opening', () => {
      const ceiling = Math.max(...Object.keys(t.tiers).map(Number));
      expect(m.sections.finale.density).toBeGreaterThanOrEqual(1.3 * m.sections.middle.density);
      expect(m.sections.opening.density).toBeLessThan(m.sections.middle.density);
      expect(m.sections.opening.tierMax).toBeLessThan(ceiling);
      expect(m.sections.finale.tierMax).toBe(Math.min(ceiling + 1, 4));
    });

    it('R5: a forced reverse run and three routes in some third', () => {
      expect(m.reverseRuns).toBeGreaterThanOrEqual(1);
      expect(Math.max(...m.routesPerThird)).toBeGreaterThanOrEqual(3);
    });

    it('the neon terrain, loops, set pieces and neon pills draw without throwing', () => {
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, k) => (k in t ? t[k as string] : () => undefined),
        set: (t, k, v) => {
          t[k as string] = v;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
      const g = new Gfx(ctx);
      const nodes = root.findChildren(
        (n) => n instanceof NeonTerrain || n instanceof NeonLoop || n instanceof Enemy || n.parent?.name === 'SetPieces',
      );
      expect(nodes.some((n) => n instanceof NeonTerrain)).toBe(true);
      expect(nodes.some((n) => n instanceof NeonLoop)).toBe(true);
      for (const n of nodes) (n as Node & { draw(g: Gfx): void }).draw(g);
    });

    it('diver posts hang at least 120 px over the floor beneath them (or over the void)', () => {
      for (const d of root.findChildren<Diver>((n) => n instanceof Diver)) {
        const at = d.globalPosition;
        const hit = tree.physics.intersectRay(at, at.add(new Vec2(0, 2000)), FLOOR_MASK);
        if (hit) expect(hit.position.y - at.y, `${d.name} at ${at}`).toBeGreaterThanOrEqual(120);
      }
      expect(floorAt(m.goalX, root.findChildren<GoalSign>((n) => n instanceof GoalSign)[0]!.globalPosition.y)).not.toBeNull();
    });

    it('no fairness warnings from the builder', () => {
      expect(builder.warnings).toEqual([]);
    });

    it('the route from PlayerStart to the goal passes the geometric check', () => {
      const start = root.getNodeOrNull<Node & { globalPosition: Vec2 }>('PlayerStart')!.globalPosition;
      const findings = checkRoute(root, builder.route, start.add(new Vec2(0, 19)), m.goalX);
      expect(findings.map((f) => `#${f.step} ${f.kind} at ${f.at}: ${f.detail}`)).toEqual([]);
    });

    it('the pilot plays the route to the goal with the enemies taken out, without dying', async () => {
      const r0 = await load(builder);
      for (const e of r0.findChildren((n) => n instanceof Enemy)) e.queueFree();
      step(1);
      const run = await flyPilot(r0, builder.route, PILOT_FRAMES);
      console.log(`[z4 ${act.name}] route run: completed ${run.completed} in ${run.frames} frames (${(run.frames / 60).toFixed(0)} s), deaths ${run.deaths}`);
      expect(run.deaths, JSON.stringify(run.log.slice(-8))).toBe(0);
      expect(run.completed, JSON.stringify(run.log.slice(-8))).toBe(true);
    }, 120000);

    it(`the pilot finishes the act at D${act.d} with every enemy, respawning at checkpoints`, async () => {
      const saved = { zone: SceneRouter.zoneId, stage: SceneRouter.stage };
      SceneRouter.zoneId = 'z4_neon_rush_remix';
      SceneRouter.stage = act.stage;
      try {
        const r0 = await load(builder);
        const run = await flyPilot(
          r0,
          builder.route,
          PILOT_FRAMES,
          async () => {
            GameState.restartFromCheckpoint();
            return load(builder, false);
          },
          5,
        );
        console.log(
          `[z4 ${act.name}] full run at D${act.d}: completed ${run.completed} in ${run.frames} frames (${(run.frames / 60).toFixed(0)} s, par ${t.par_seconds} s), deaths ${run.deaths}, hurts ${run.hurts}`,
        );
        expect(run.completed, JSON.stringify(run.log.slice(-8))).toBe(true);
        expect(run.deaths).toBeLessThanOrEqual(3);
        expect(run.frames / 60).toBeLessThan(t.par_seconds);
        // Par is 1.5 x this run when it is deathless (Difficulty.BEST_BOT_FRAMES records it): re-measure after a level change.
        if (run.deaths === 0) expect(t.par_seconds, `par against this run (${run.frames} frames)`).toBe(Difficulty.parFromBot(run.frames / 60));
      } finally {
        SceneRouter.zoneId = saved.zone;
        SceneRouter.stage = saved.stage;
      }
    }, 180000);

    it(`the pilot finishes the act with the shipped hooks on (item boxes, time limit, hit-stop)`, async () => {
      const saved = { zone: SceneRouter.zoneId, stage: SceneRouter.stage, hooks: LevelHooks.afterReady.slice(), boxes: Settings.data.itemBoxes };
      SceneRouter.zoneId = 'z4_neon_rush_remix';
      SceneRouter.stage = act.stage;
      Settings.data.itemBoxes = true;
      registerNewContent();
      try {
        const r0 = await load(builder);
        const boxes = r0.findChildren<ItemBox>((n) => n instanceof ItemBox);
        expect(boxes.length).toBeGreaterThanOrEqual(4);
        // Zone 4's boxes hold no speed shoes, and none stands within a bounce of a pit.
        expect(boxes.some((b) => b.content === 'speed_shoes')).toBe(false);
        const run = await flyPilot(
          r0,
          builder.route,
          PILOT_FRAMES,
          async () => {
            GameState.restartFromCheckpoint();
            return load(builder, false);
          },
          5,
        );
        console.log(
          `[z4 ${act.name}] full run with item boxes (${boxes.length}): completed ${run.completed} in ${run.frames} frames (${(run.frames / 60).toFixed(0)} s), deaths ${run.deaths}, hurts ${run.hurts}`,
        );
        expect(run.completed, JSON.stringify(run.log.slice(-8))).toBe(true);
        expect(run.deaths).toBeLessThanOrEqual(3);
      } finally {
        LevelHooks.afterReady.length = 0;
        LevelHooks.afterReady.push(...saved.hooks);
        Settings.data.itemBoxes = saved.boxes;
        SceneRouter.zoneId = saved.zone;
        SceneRouter.stage = saved.stage;
      }
    }, 180000);
  });
}
