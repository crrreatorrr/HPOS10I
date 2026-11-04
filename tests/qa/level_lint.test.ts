// QA level lint (ports of tests/qa/test_level_rules.gd,
// test_level_difficulty.gd, test_difficulty_lint_selftest.gd and
// test_enemy_placement_rules.gd). The measures are proven on built fixtures
// first, then every act must follow the design rules (geometry lint errors
// fail, warnings are printed) and sit on its row of the difficulty curve
// (docs/LEVELS.md, Difficulty.targets) including the in-act ramp, and no act
// may be easier than the one before it. Tools: tools/qa/level_lint.ts.

import { beforeAll, describe, expect, it } from 'vitest';
import { Difficulty, type ActTargets } from '../../src/core/difficulty';
import { SceneRouter } from '../../src/core/scene_router';
import { Settings } from '../../src/core/settings';
import { BoundsRect, Marker } from '../../src/levels/common/level_nodes';
import type { LevelRoot } from '../../src/levels/common/level_root';
import { placeItemBoxes, registerNewContent } from '../../src/levels/content';
import { isConfigurable, Props } from '../../src/levels/common/props';
import { ItemBox } from '../../src/levels/objects/item_box';
import { ENEMY_SCENES, registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { Node, Node2D, ProcessMode } from '../../src/runtime/node';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import * as L from '../../tools/qa/level_lint';
import { qa } from '../helpers/qa';
import { step } from '../helpers/world';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

const log = (line: string): void => void process.stderr.write(`${line}\n`);

// --- Fixtures (test_difficulty_lint_selftest.gd) ------------------------------------------

/** Rows copied from docs/LEVELS.md D1/D2, so the self-test does not depend on the curve. */
const ROW_1: ActTargets = { screens: 45, par_seconds: 150, enemies_per_screen: 0.4, tiers: { 1: 100 }, direction: 1, checkpoints: 3, tickets_per_screen: 5.0 };
const ROW_2: ActTargets = { screens: 55, par_seconds: 195, enemies_per_screen: 0.6, tiers: { 1: 75, 2: 25 }, direction: 2, checkpoints: 4, tickets_per_screen: 4.5 };
const W = 424;
const SCREENS = 45;
const LENGTH = SCREENS * W;

class TierNode extends Node2D {
  tier = 1;
  localDifficulty: number | null = null;
}

type EnemySpec = [number, number, number?];

/** 3 in the opening, 9 in the middle, 6 in the finale (one T2), clear of the checkpoints' 2 screens. */
function rampedEnemies(): EnemySpec[] {
  const out: EnemySpec[] = [];
  for (const p of [0.03, 0.1, 0.17]) out.push([p, 1]);
  for (const p of [0.26, 0.29, 0.32, 0.41, 0.44, 0.47, 0.5, 0.61, 0.64]) out.push([p, 1]);
  for (let i = 0; i < 6; i++) out.push([0.81 + i * 0.03, i === 3 ? 2 : 1]);
  return out;
}

function flatEnemies(): EnemySpec[] {
  return Array.from({ length: 18 }, (_, i): EnemySpec => [0.02 + i * 0.055, 1]);
}

const xAt = (progress: number): number => 100 + progress * (LENGTH - 200);

function marker(parent: Node, name: string, x: number): Marker {
  const m = new Marker(name);
  m.position = new Vec2(x, -19);
  parent.addChild(m);
  return m;
}

function fixture(enemies: EnemySpec[], checkpoints: number[], tickets: number, extra?: (w: Node2D) => void): Node2D {
  const w = qa.world();
  qa.floorAt(w, 0, LENGTH, 0);
  qa.rect(w, new Rect2(-64, -900, 64, 1200));
  qa.rect(w, new Rect2(LENGTH, -900, 64, 1200));
  const bounds = new BoundsRect('Bounds');
  bounds.rect = new Rect2(0, -900, LENGTH, 1000);
  w.addChild(bounds);
  marker(w, 'PlayerStart', 100);
  marker(w, 'Goal', LENGTH - 100);
  enemies.forEach(([p, tier, local], i) => {
    const e = new TierNode(`Enemy${i}`);
    e.tier = tier;
    if (local !== undefined) e.localDifficulty = local;
    e.position = new Vec2(xAt(p), -16);
    w.addChild(e);
  });
  checkpoints.forEach((p, i) => marker(w, `Checkpoint${i + 1}`, xAt(p)));
  for (let i = 0; i < tickets; i++) {
    const t = new Node2D(`Ticket${i}`);
    t.position = new Vec2(200 + (i * (LENGTH - 400)) / Math.max(tickets, 1), -40);
    w.addChild(t);
  }
  extra?.(w);
  step(2);
  return w;
}

const measureFixture = (w: Node2D): L.Measures => L.measure(w, (n) => n.name.startsWith('Enemy'));
const rules = (findings: L.Finding[], severity: L.Severity): string[] => findings.filter((f) => f.severity === severity).map((f) => f.rule);

describe('difficulty lint self-test (fixtures)', () => {
  it('a ramped D1 act on its row passes', () => {
    const m = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75], 225));
    expect(Math.abs(m.screens - 45)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(m.density - 0.4)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(m.ticketDensity - 5)).toBeLessThanOrEqual(0.1);
    expect(m.checkpoints).toBe(3);
    expect(m.direction).toBe(1);
    expect(m.deadEnds).toBe(0);
    expect(m.sections.finale.tierMax).toBe(2);
    expect(m.sections.finale.density).toBeGreaterThanOrEqual(1.3 * m.sections.middle.density);
    expect(rules(L.check(m, 1, ROW_1), 'error')).toEqual([]);
  });

  it('a flat act fails the ramp', () => {
    const m = measureFixture(fixture(flatEnemies(), [0.25, 0.5, 0.6], 225));
    const errors = rules(L.check(m, 1, ROW_1), 'error');
    expect(errors).toContain('difficulty.finale_density');
    expect(errors).toContain('difficulty.finale_tier');
    expect(errors).toContain('difficulty.finale_checkpoint');
  });

  it('the same act is off a D2 row', () => {
    const m = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75], 225));
    const findings = L.check(m, 2, ROW_2);
    expect(rules(findings, 'error')).toContain('difficulty.enemy_density');
    expect(rules(findings, 'error')).toContain('difficulty.finale_tier');
    expect(rules(findings, 'warn')).toContain('difficulty.direction');
    expect(rules(findings, 'warn')).toContain('difficulty.checkpoints');
  });

  it('tier ceiling and missing tier', () => {
    const enemies = rampedEnemies();
    enemies[5] = [0.4, 3];
    const m = measureFixture(fixture(enemies, [0.35, 0.55, 0.75], 225));
    expect(rules(L.check(m, 1, ROW_1), 'error')).toContain('difficulty.tier_ceiling');
    m.tierMissing = 1;
    expect(rules(L.check(m, 1, ROW_1), 'error')).toContain('difficulty.tier_missing');
  });

  it('an act before a boss needs a checkpoint at the gate', () => {
    const gate = (w: Node2D): void => void marker(w, 'BossGate', LENGTH - 60);
    const m = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75], 225, gate));
    expect(rules(L.check(m, 1, ROW_1, true), 'error')).toContain('difficulty.gate_checkpoint');
    expect(rules(L.check(m, 1, ROW_1, false), 'error')).not.toContain('difficulty.gate_checkpoint');
    const withGate = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75, 0.985], 225, gate));
    expect(rules(L.check(withGate, 1, ROW_1, true), 'error')).not.toContain('difficulty.gate_checkpoint');
  });

  it('finale enemies must report a higher local difficulty', () => {
    const bad = rampedEnemies().map(([p, t]): EnemySpec => [p, t, p < 0.75 ? 1 : 0.9]);
    const m = measureFixture(fixture(bad, [0.35, 0.55, 0.75], 225));
    expect(rules(L.check(m, 1, ROW_1), 'error')).toContain('difficulty.finale_local');
    const good = rampedEnemies().map(([p, t]): EnemySpec => [p, t, p < 0.75 ? 1 : 1.5]);
    const g = measureFixture(fixture(good, [0.35, 0.55, 0.75], 225));
    expect(rules(L.check(g, 1, ROW_1), 'error')).not.toContain('difficulty.finale_local');
  });

  it('group nodes are containers, not items', () => {
    const grouped = (w: Node2D): void => {
      const tickets = w.addChild(new Node2D('Tickets'));
      for (let i = 0; i < 30; i++) {
        const t = tickets.addChild(new Node2D(`Pickup${i}`));
        t.position = new Vec2(300 + i * 20, -40);
        t.addChild(new Node2D(`Ticket${i}`));
      }
      const cps = w.addChild(new Node2D('Checkpoints'));
      for (const x of [xAt(0.2), xAt(0.9)]) marker(cps, `Checkpoint${Math.trunc(x)}`, x);
    };
    const m = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75], 225, grouped));
    expect(m.tickets).toBe(225 + 30);
    expect(m.checkpoints).toBe(3 + 2);
  });

  it('enemies too close after a checkpoint fail below D5', () => {
    const enemies = rampedEnemies();
    enemies.push([0.56, 1]);
    const m = measureFixture(fixture(enemies, [0.35, 0.55, 0.75], 225));
    expect(rules(L.check(m, 1, ROW_1), 'error')).toContain('difficulty.safe_spot');
    expect(rules(L.check(m, 5, ROW_1), 'error')).not.toContain('difficulty.safe_spot');
  });

  it('a vertical climb and a dead end raise the direction', () => {
    const climb = (w: Node2D): void => {
      qa.rect(w, new Rect2(LENGTH * 0.4, -600, 1200, 600));
      qa.rect(w, new Rect2(LENGTH * 0.75, -300, 32, 300));
    };
    const m = measureFixture(fixture(rampedEnemies(), [0.35, 0.55, 0.75], 225, climb));
    expect(m.verticalScreens).toBeGreaterThanOrEqual(2);
    expect(m.deadEnds).toBeGreaterThanOrEqual(1);
    expect(m.direction).toBeGreaterThanOrEqual(3);
  });

  it('a later act that is easier fails the order', () => {
    const easy = { d: 2, label: 'act2', m: { density: 0.3, tierMax: 1, direction: 1, ticketDensity: 6 } };
    const first = { d: 1, label: 'act1', m: { density: 0.4, tierMax: 1, direction: 1, ticketDensity: 5 } };
    const findings = L.checkOrder([easy, first]);
    expect(rules(findings, 'error')).toContain('difficulty.order');
    expect(rules(findings, 'warn')).toContain('difficulty.order');
    const fine = { d: 2, label: 'act2', m: { density: 0.6, tierMax: 2, direction: 2, ticketDensity: 4.5 } };
    expect(L.checkOrder([first, fine])).toEqual([]);
  });
});

describe('enemy placement rules (test_enemy_placement_rules.gd)', () => {
  for (const [height, flagged] of [
    [100, true],
    [140, false],
  ] as const) {
    it(`a diver ${height} px above the floor is ${flagged ? '' : 'not '}flagged`, () => {
      SceneRouter.zoneId = 'test_zone';
      SceneRouter.stage = 1;
      const w = qa.world();
      qa.rect(w, new Rect2(-600, 0, 1200, 300));
      const d = ENEMY_SCENES['res://levels/enemies/diver.tscn']!() as Node2D;
      if (isConfigurable(d)) d.applyProps(Props.of({}));
      d.position = new Vec2(0, -height);
      d.processMode = ProcessMode.DISABLED;
      w.addChild(d);
      step(2);
      expect(rules(L.lint(w), 'error').includes('enemy.diver_post')).toBe(flagged);
    });
  }
});

// --- Every act ---------------------------------------------------------------------

interface ActResult {
  act: L.ActInfo;
  lint: L.Finding[];
  m: L.Measures;
  check: L.Finding[];
  boxes: { enemies: number; tickets: number; checkpoints: number; placed: number };
}

const results: ActResult[] = [];

describe('every act', () => {
  beforeAll(async () => {
    Settings.reset();
    for (const act of L.zoneActs()) {
      SceneRouter.zoneId = act.zone;
      SceneRouter.stage = act.stage;
      const root: LevelRoot = await L.prepare(L.loadLevelData(act.file));
      const findings = L.lint(root);
      const m = L.measure(root);
      // Item boxes are new: placed on the act, they are neither enemies, tickets nor checkpoints.
      const placed = placeItemBoxes(root);
      const withBoxes = L.measure(root);
      results.push({
        act,
        lint: findings,
        m,
        check: L.check(m, act.d, Difficulty.targets(act.d), act.preBoss),
        boxes: { enemies: withBoxes.enemies, tickets: withBoxes.tickets, checkpoints: withBoxes.checkpoints, placed },
      });
      root.findChildren((n) => n instanceof ItemBox).forEach((b) => b.free());
    }
    SceneRouter.zoneId = '';
    SceneRouter.stage = 1;
    // The measures, one line per act, for the reviewer.
    log('level lint: act measures');
    for (const r of results) log(`  ${r.act.label} (D${r.act.d}${r.act.preBoss ? ', before the boss' : ''}): ${L.summary(r.m)}`);
  }, 300_000);

  it('finds the test zone and every zone act with a level file', () => {
    const labels = results.map((r) => r.act.label);
    expect(labels).toContain('Test zone');
    for (const l of ['Z1 Act 1', 'Z1 Act 2', 'Z2 Act 1', 'Z2 Act 2']) expect(labels).toContain(l);
  });

  it('follow the level-design rules (geometry lint errors fail)', () => {
    const errors: string[] = [];
    for (const r of results) {
      for (const f of r.lint) {
        if (f.severity === 'error') errors.push(L.formatFinding(r.act.label, f));
        else if (f.severity === 'warn') log(`  ${L.formatFinding(r.act.label, f)}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('sit on their row of the difficulty curve, with the in-act ramp', () => {
    const errors: string[] = [];
    for (const r of results) {
      for (const f of r.check) {
        if (f.severity === 'error') errors.push(L.formatFinding(r.act.label, f));
        else if (f.severity === 'warn') log(`  ${L.formatFinding(r.act.label, f)}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('the finale is at least 1.3x as dense as the middle and opens at a checkpoint; a checkpoint outside every boss gate', () => {
    for (const r of results.filter((x) => x.act.d >= 1)) {
      const { middle, finale } = r.m.sections;
      expect(finale.density, `${r.act.label}: finale ${finale.density} vs middle ${middle.density}`).toBeGreaterThanOrEqual(L.FINALE_DENSITY_MIN * middle.density);
      expect(r.m.checkpointXs.some((x) => Math.abs(x - r.m.finaleX) <= L.FINALE_CHECKPOINT_REACH * L.SCREEN_W), `${r.act.label}: finale checkpoint`).toBe(true);
      if (r.act.preBoss) {
        expect(r.m.checkpointXs.some((x) => Math.abs(x - r.m.gateX) <= L.GATE_CHECKPOINT_REACH * L.SCREEN_W), `${r.act.label}: gate checkpoint`).toBe(true);
      }
    }
  });

  it('no act is easier than the one before it, and enemies read their local difficulty', () => {
    const order = L.checkOrder(results.map((r) => ({ label: r.act.label, d: r.act.d, m: r.m })));
    for (const f of order.filter((x) => x.severity === 'warn')) log(`  ${L.formatFinding('order', f)}`);
    expect(order.filter((f) => f.severity === 'error').map((f) => f.detail)).toEqual([]);
    expect(L.checkLocalSource()).toEqual([]);
  });

  it('item boxes are not counted as enemies, tickets or checkpoints', () => {
    for (const r of results) {
      expect(r.boxes.enemies, r.act.label).toBe(r.m.enemies);
      expect(r.boxes.tickets, r.act.label).toBe(r.m.tickets);
      expect(r.boxes.checkpoints, r.act.label).toBe(r.m.checkpoints);
    }
    expect(results.some((r) => r.boxes.placed > 0)).toBe(true);
  });
});
