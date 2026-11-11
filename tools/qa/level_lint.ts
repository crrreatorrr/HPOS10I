// QA level lint (port of tools/qa/level_lint.gd, tests/qa/qa_level_lint.gd
// and tests/qa/qa_difficulty.gd). Owned by QA. Node only (reads the level
// files and the enemy sources from disk).
//
// prepare() builds a level from its JSON and puts it in the shared tree the
// way the Godot lint did with the root script stripped: LevelRoot still
// spawns Sproto and the camera (neither is terrain), but the afterReady hooks
// (item boxes, the time limit) are left out and moving terrain (bodies with
// platformDelta()) is taken out of the static scan and stopped.
//
// lint(root)            geometry rules from the physics review (loops, spawns,
//                       tunnels, steps, narrow tops, fillets, momentum, diver posts)
// measure(root)         the difficulty measures of an act (length in screens,
//                       enemies and tiers, checkpoints, tickets, direction, the
//                       opening/middle/finale ramp, safe spots)
// check(m, d, row)      findings against a row of Difficulty.targets(d)
// checkOrder(acts)      each act not easier than the one before it
// checkLocalSource()    enemy scripts read their local difficulty
//
// Flow and routes (docs/gameplay-improvement-plan.md, D1): measure() also
// reports the share of columns with two stacked routes (whole act and middle
// third), the share of sloped floor, blocking steps per screen and every
// node in group `level_hazard`; check() turns them into flow.routes,
// flow.slope, flow.steps, hazard.timed_solid and hazard.safe_spot, and
// difficulty.checkpoint_gap gets a hard limit of 16 screens. The flow rules
// and the hard gap are errors on the acts in FLOW_ENFORCED (acts that had
// their flow pass) and warnings elsewhere.
//
// Acts built in code (Zone 4) are listed by zoneActs() too: their `file` is
// "code:<scene id>" and loadLevelData() builds them.
//
// Findings: { severity: 'error' | 'warn' | 'info', rule, at, detail }. The
// rules, numbers and tolerances are the Godot lint's (see the .gd files).
// Item boxes (new in the TypeScript build) are neither enemies nor tickets.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Difficulty, type ActTargets } from '../../src/core/difficulty';
import { Layers } from '../../src/core/layers';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { BoundsRect, DecorRect, Marker } from '../../src/levels/common/level_nodes';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { Diver } from '../../src/levels/enemies/diver';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { Node, Node2D, ProcessMode } from '../../src/runtime/node';
import { CollisionObject2D, StaticBody2D } from '../../src/runtime/physics';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { TerrainLoop } from '../../src/terrain/loop';
import { act1Data as z4Act1Data } from '../../src/levels/z4/act1';
import { act2Data as z4Act2Data } from '../../src/levels/z4/act2';
import { Z4_ACT1, Z4_ACT2 } from '../../src/levels/z4/zone';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// --- Constants (qa_level_lint.gd) ------------------------------------------------------

const SOLID = Layers.TERRAIN_SOLID;
const PATH_A = Layers.TERRAIN_PATH_A;
const PATH_B = Layers.TERRAIN_PATH_B;
const TOP_ONLY = Layers.TERRAIN_TOP_ONLY;
export const FLOOR_MASK = SOLID | PATH_A | PATH_B | TOP_ONLY;
export const CEIL_MASK = SOLID | PATH_A | PATH_B;

const STANDING_HEIGHT = 38;
const BALL_HEIGHT = 28;
const COMFORT_HEIGHT = 40;
const MAX_STEP = 10;
const MIN_SOLID_WIDTH = 18;
const MIN_FILLET = 48;
const STEEP = 60;
const RUNUP = 384; // 6^2 / (2 * 0.046875): distance to reach top speed from rest
export const SCAN_STEP = 2;
const CLIMB_ANGLE = 22;
const MIN_RUNUP = 64;
const CHECKPOINT_REACH = 160;
const DIVER_MIN_POST = 120;

// --- Constants (qa_difficulty.gd) ------------------------------------------------------

export const SCREEN_W = 424;
export const SCREEN_H = 240;
export const TOLERANCE = 0.25;
export const TIER_POINTS = 25;
export const ORDER_TOLERANCE = 0.1;
const ROUTE_GAP = 64;
const JUMP_UP = 96;
const END_MARGIN = 128;
const SPRING_REACH = 160;
export const FINALE_DENSITY_MIN = 1.3;
export const FINALE_CHECKPOINT_REACH = 1.5; // screens
export const GATE_CHECKPOINT_REACH = 2.25; // screens
/** Two stacked routes on at least this share of an act's columns, and of its middle third. */
export const ROUTES_MIN_PCT = 20;
export const ROUTES_MID_MIN_PCT = 25;
/** Sloped floor (8 to 80 degrees) on at least this share of an act's columns. */
export const SLOPE_MIN_PCT = 8;
export const SLOPE_MIN_ANGLE = 8;
export const SLOPE_MAX_ANGLE = 80;
/** At most this many blocking steps (the lowest floor rises 16 to 96 px between columns) per screen. */
export const STEPS_MAX_PER_SCREEN = 0.25;
const STEP_MIN_RISE = 16;
const STEP_MAX_RISE = 96;
/** No stretch between start, checkpoints and goal longer than this many screens. */
export const MAX_CHECKPOINT_GAP = 16;
/** Acts built in code: scene id -> level data. */
const CODE_ACTS: Record<string, () => LevelData> = { [Z4_ACT1]: z4Act1Data, [Z4_ACT2]: z4Act2Data };
const CODE_PREFIX = 'code:';
/**
 * Acts ("zone:stage") whose flow rules (flow.routes, flow.slope, flow.steps)
 * and hard checkpoint gap are errors. An act joins the list when its flow
 * pass lands; elsewhere the same findings are warnings.
 */
export const FLOW_ENFORCED: ReadonlySet<string> = new Set<string>(['z1_retro_rush_hills:1']);
export const SECTIONS = ['opening', 'middle', 'finale'] as const;
export type SectionName = (typeof SECTIONS)[number];

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  severity: Severity;
  rule: string;
  at: Vec2;
  detail: string;
}

function add(out: Finding[], severity: Severity, rule: string, at: Vec2, detail: string): void {
  out.push({ severity, rule, at, detail });
}

const f0 = (n: number): string => n.toFixed(0);
const f1 = (n: number): string => n.toFixed(1);
const f2 = (n: number): string => n.toFixed(2);

// --- Acts ------------------------------------------------------------------------------

export interface ActInfo {
  zone: string;
  stage: number;
  d: number;
  preBoss: boolean;
  /** Scene id ("level:z1_retro_rush_hills/act1"). */
  scene: string;
  /** Level file, relative to the repository root, or "code:<scene id>" for an act built in code. */
  file: string;
  /** True for an act built in code (no level file). */
  code: boolean;
  /** Short label for reports ("Z1 Act 1"). */
  label: string;
}

/** Every zone act that has a level file or is built in code (the test zone first), with its D. */
export function zoneActs(): ActInfo[] {
  const out: ActInfo[] = [];
  for (const zone of ZoneRegistry.allZones(true)) {
    zone.acts.forEach((scene, i) => {
      const rel = scene.replace(/^level:/, '');
      let file = rel === 'test_zone' ? 'src/levels/data/test_zone/test_zone.json' : `src/levels/data/${rel}.json`;
      let code = false;
      if (!fs.existsSync(path.join(ROOT_DIR, file))) {
        if (!CODE_ACTS[scene]) return;
        file = `${CODE_PREFIX}${scene}`;
        code = true;
      }
      const stage = i + 1;
      const label = zone.id === 'test_zone' ? 'Test zone' : `${zone.id.slice(0, 2).toUpperCase()} Act ${stage}`;
      out.push({
        zone: zone.id,
        stage,
        d: Difficulty.forStage(zone.id, stage),
        preBoss: zone.boss !== '' && stage === zone.acts.length,
        scene,
        file,
        code,
        label,
      });
    });
  }
  return out;
}

const dataCache = new Map<string, LevelData>();

export function loadLevelData(file: string): LevelData {
  let data = dataCache.get(file);
  if (!data) {
    if (file.startsWith(CODE_PREFIX)) {
      const make = CODE_ACTS[file.slice(CODE_PREFIX.length)];
      if (!make) throw new Error(`no act built in code for ${file}`);
      data = make();
    } else data = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, file), 'utf8')) as LevelData;
    dataCache.set(file, data);
  }
  return data;
}

// --- Node identity (Godot's name / scene_file_path / script) -----------------------------

interface Origin {
  scene: string;
  script: string;
}

const origins = new WeakMap<Node, Origin>();

/** Records each built node's original scene and script path from the level data. */
export function annotate(root: Node, data: LevelData): void {
  for (const n of data.nodes) {
    const parentPath = n.parent === null ? null : n.parent === '.' ? '' : n.parent;
    const p = parentPath === null ? '' : parentPath === '' ? n.name : `${parentPath}/${n.name}`;
    const node = p === '' ? root : root.getNodeOrNull(p);
    if (node) origins.set(node, { scene: n.scene ?? '', script: n.script ?? '' });
  }
}

export function originOf(node: Node): Origin {
  return origins.get(node) ?? { scene: '', script: '' };
}

/** Case-insensitive match of any word in the node's name, scene, script or class. */
export function named(node: Node, words: readonly string[]): boolean {
  const o = originOf(node);
  const text = `${node.name} ${o.scene} ${o.script} ${node.constructor.name}`.toLowerCase();
  return words.some((w) => text.includes(w));
}

const PLAIN_TYPES: ReadonlySet<unknown> = new Set([Node, Node2D, Marker, BoundsRect, DecorRect]);

/** A plain node: no scene instance, no script of its own (a grouping node or a marker). */
function isPlain(node: Node): boolean {
  const o = originOf(node);
  return o.scene === '' && o.script === '' && PLAIN_TYPES.has(node.constructor);
}

/**
 * Nodes under root matching `test`, skipping anything inside a match (one
 * instance counts once). A plain node that matches only by its name and holds
 * other matches is a container ("Tickets", "Checkpoints"): its contents count.
 */
export function collectAll(root: Node, test: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  const isContainer = (node: Node): boolean => {
    if (!isPlain(node)) return false;
    return node.children.some((c) => test(c) || isContainer(c));
  };
  const walk = (node: Node): void => {
    if (test(node) && !isContainer(node)) {
      out.push(node);
      return;
    }
    for (const c of node.children) walk(c);
  };
  for (const c of root.children) walk(c);
  return out;
}

// --- Prepare ---------------------------------------------------------------------------

/**
 * Builds the level and makes it the current scene with the static scan's view
 * of it: no afterReady hooks, moving terrain off its layers and stopped.
 */
export async function prepare(data: LevelData): Promise<LevelRoot> {
  const root = (await buildLevel(data)) as LevelRoot;
  annotate(root, data);
  if (root instanceof LevelRoot) root.useSceneRouter = false;
  const hooks = LevelHooks.afterReady.splice(0);
  try {
    tree.changeSceneNow(() => root);
  } finally {
    LevelHooks.afterReady.push(...hooks);
  }
  for (let i = 0; i < 3; i++) tree.physicsStep();
  stopMovingTerrain(root);
  return root;
}

export function isMoving(node: Node): boolean {
  return node instanceof CollisionObject2D && typeof (node as { platformDelta?: unknown }).platformDelta === 'function';
}

export function stopMovingTerrain(root: Node): void {
  for (const n of root.findChildren((x) => isMoving(x))) {
    (n as CollisionObject2D).collisionLayer = 0;
    n.processMode = ProcessMode.DISABLED;
  }
}

// --- Physics helpers -------------------------------------------------------------------

export function ray(from: Vec2, to: Vec2, mask: number): { position: Vec2; normal: Vec2 } | null {
  return tree.physics.intersectRay(from, to, mask);
}

function pointIn(p: Vec2, mask: number, exclude?: ReadonlySet<CollisionObject2D>): boolean {
  const hits = tree.physics.intersectPoint(p, mask, exclude ? 64 : 1);
  if (!exclude) return hits.length > 0;
  return hits.some((b) => !exclude.has(b));
}

function boundsOf(root: Node): Rect2 | null {
  const node = root.getNodeOrNull('Bounds');
  if (node instanceof BoundsRect && node.rect.hasArea()) return node.globalRect();
  return null;
}

export function terrainExtent(root: Node): Rect2 {
  let rect: Rect2 | null = null;
  for (const body of root.findChildren<StaticBody2D>((n) => n instanceof StaticBody2D)) {
    for (const poly of tree.physics.bodyPolygons(body)) {
      for (const p of poly) rect = rect ? rect.expand(p) : new Rect2(p.x, p.y, 0, 0);
    }
  }
  return (rect ?? new Rect2()).grow(64);
}

// --- Loops -----------------------------------------------------------------------------

export interface LoopInfo {
  node: TerrainLoop;
  at: Vec2;
  radius: number;
  outer: number;
  half: number;
  bodies: Set<CollisionObject2D>;
}

export function findLoops(root: Node): LoopInfo[] {
  return root.findChildren<TerrainLoop>((n) => n instanceof TerrainLoop).map((node) => {
    const foot = Math.min(node.footRadius, node.radius);
    const margin = Math.max(node.floorMargin, foot + 64);
    const outer = node.radius + node.thickness;
    return {
      node,
      at: node.globalPosition,
      radius: node.radius,
      outer,
      half: outer + margin,
      bodies: new Set(node.findChildren<CollisionObject2D>((n) => n instanceof CollisionObject2D)),
    };
  });
}

function checkLoops(out: Finding[], loops: LoopInfo[]): void {
  for (let i = 0; i < loops.length; i++) {
    const a = loops[i]!;
    for (let j = i + 1; j < loops.length; j++) {
      const b = loops[j]!;
      if (Math.abs(a.at.x - b.at.x) < a.half + b.half && Math.abs(a.at.y - b.at.y) < 2 * Math.max(a.outer, b.outer)) {
        add(out, 'error', 'loop.overlap', a.at, `footprints of the loops at x ${f0(a.at.x)} and x ${f0(b.at.x)} overlap (need ${f0(a.half + b.half)} px between centres)`);
      }
    }
    // Other terrain inside the footprint, from the floor up to above the ring.
    const top = a.at.y - 2 * a.radius - (a.outer - a.radius) - 40;
    let found = false;
    for (let x = a.at.x - a.half; x <= a.at.x + a.half && !found; x += 8) {
      for (let y = a.at.y - 4; y >= top; y -= 8) {
        const p = new Vec2(x, y);
        if (pointIn(p, FLOOR_MASK, a.bodies)) {
          add(out, 'error', 'loop.intrusion', p, `terrain inside the footprint of the loop at x ${f0(a.at.x)}`);
          found = true;
          break;
        }
      }
    }
    // Floor continues beyond the footprint on both sides.
    for (const side of [-1, 1]) {
      const probe = new Vec2(a.at.x + side * (a.half + 8), a.at.y - 64);
      if (!ray(probe, probe.add(new Vec2(0, 104)), FLOOR_MASK)) {
        add(out, 'warn', 'loop.exit_gap', probe, `no floor right after the ${side > 0 ? 'right' : 'left'} end of the loop at x ${f0(a.at.x)}`);
      }
    }
    let best = 0;
    for (const side of [-1, 1]) best = Math.max(best, loopRunup(a, side));
    if (best < RUNUP) {
      add(out, 'warn', 'loop.runup', a.at, `longest run-up into the loop at x ${f0(a.at.x)} is ${f0(best)} px (< ${RUNUP} px to reach 6 px/f)`);
    }
  }
}

function loopRunup(lp: LoopInfo, side: number): number {
  let x = lp.at.x + side * lp.half;
  let lastY = lp.at.y;
  let dist = 0;
  while (dist < RUNUP * 2) {
    x += side * 8;
    const hit = ray(new Vec2(x, lastY - 24), new Vec2(x, lastY + 24), FLOOR_MASK);
    if (!hit || hit.position.y > lastY + 6 || hit.position.y < lastY - 12) break;
    lastY = hit.position.y;
    dist += 8;
  }
  return dist;
}

// --- Spawns and checkpoints --------------------------------------------------------------

const isCheckpoint = (n: Node): boolean => n instanceof Node2D && named(n, ['checkpoint']);

export function findCheckpoints(root: Node): Node2D[] {
  return collectAll(root, isCheckpoint) as Node2D[];
}

function checkSpot(out: Finding[], label: string, at: Vec2, bounds: Rect2 | null, loops: LoopInfo[]): void {
  if (bounds && !bounds.hasPoint(at)) add(out, 'error', 'spawn.bounds', at, `${label} is outside Bounds ${bounds}`);
  if (pointIn(at, CEIL_MASK)) {
    add(out, 'error', 'spawn.ground', at, `${label} is inside terrain`);
    return;
  }
  const floor = ray(at.sub(new Vec2(0, 2)), at.add(new Vec2(0, 64)), FLOOR_MASK);
  if (!floor) {
    add(out, 'error', 'spawn.ground', at, `${label} has no floor within 64 px below`);
  } else {
    const fy = floor.position.y;
    const ceil = ray(new Vec2(at.x, fy - 0.5), new Vec2(at.x, fy - 64), CEIL_MASK);
    if (ceil && fy - ceil.position.y < STANDING_HEIGHT) {
      add(out, 'error', 'spawn.headroom', at, `${label} stands under a ${f0(fy - ceil.position.y)} px ceiling (< 38)`);
    }
  }
  for (const lp of loops) {
    const dx = Math.abs(at.x - lp.at.x);
    if (dx > lp.outer && dx < lp.half && at.y > lp.at.y - 2 * lp.outer - 64 && at.y < lp.at.y + 8) {
      add(out, 'error', 'spawn.loop_zone', at, `${label} is between the ring and the side switcher of the loop at x ${f0(lp.at.x)}`);
    }
  }
}

// --- Column scan -----------------------------------------------------------------------

export interface FloorPoint {
  x: number;
  y: number;
  /** Degrees from flat, signed: + rises to the right. */
  angle: number;
  clearance: number;
}

export interface Column {
  x: number;
  floors: FloorPoint[];
  skipped: boolean;
}

const RAD = 180 / Math.PI;

const scans = new WeakMap<Node, { at: number; columns: Column[] }>();

/** scan() of a root's bounds, reused within the same physics frame (lint and measure). */
function scanOf(root: Node, bounds: Rect2, loops: LoopInfo[]): Column[] {
  const known = scans.get(root);
  if (known && known.at === tree.physicsFrames) return known.columns;
  const columns = scan(bounds, loops);
  scans.set(root, { at: tree.physicsFrames, columns });
  return columns;
}

/** Floor points per x column (every 2 px), skipping loop footprints. */
export function scan(bounds: Rect2, loops: LoopInfo[]): Column[] {
  const columns: Column[] = [];
  for (let x = bounds.x + 1; x < bounds.right; x += SCAN_STEP) {
    const skip = loops.some((lp) => Math.abs(x - lp.at.x) < lp.half);
    const floors: FloorPoint[] = [];
    if (!skip) {
      let y = bounds.y;
      let guard = 0;
      while (y < bounds.bottom && guard < 64) {
        guard++;
        while (y < bounds.bottom && pointIn(new Vec2(x, y), FLOOR_MASK)) y += 2;
        if (y >= bounds.bottom) break;
        const hit = ray(new Vec2(x, y), new Vec2(x, bounds.bottom), FLOOR_MASK);
        if (!hit) break;
        const n = hit.normal;
        const hy = hit.position.y;
        if (n.y < -0.25) {
          const ceil = ray(new Vec2(x, hy - 0.5), new Vec2(x, hy - 64), CEIL_MASK);
          floors.push({ x, y: hy, angle: Math.atan2(-n.x, -n.y) * RAD, clearance: ceil ? hy - ceil.position.y : Infinity });
        }
        y = hy + 1;
      }
    }
    columns.push({ x, floors, skipped: skip });
  }
  return columns;
}

/** The floor point in `column` nearest to height `y` (within `reach`), or null. */
export function near(column: Column, y: number, reach: number): FloorPoint | null {
  let best: FloorPoint | null = null;
  let bestD = reach;
  for (const f of column.floors) {
    const d = Math.abs(f.y - y);
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** True when `column` has no floor point with y in [y0, y1]. */
function clear(column: Column, y0: number, y1: number): boolean {
  return !column.floors.some((f) => f.y >= y0 && f.y <= y1);
}

function checkTunnels(out: Finding[], columns: Column[]): void {
  const reported = new Set<string>();
  for (let i = 1; i < columns.length; i++) {
    for (const f of columns[i]!.floors) {
      const c = f.clearance;
      if (c < BALL_HEIGHT || c >= COMFORT_HEIGHT) continue;
      const key = `${Math.trunc(f.x / 256)}:${Math.trunc(f.y / 64)}`;
      if (c >= STANDING_HEIGHT) {
        if (!reported.has(`t${key}`)) {
          reported.add(`t${key}`);
          add(out, 'warn', 'tunnel.tight', new Vec2(f.x, f.y), `${f1(c)} px under a ceiling: stands with < 2 px headroom (make it < 38 or >= 40)`);
        }
        continue;
      }
      // Roll-only gap: check its mouths (neighbouring columns with more room).
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= columns.length || columns[j]!.skipped) continue;
        const g = near(columns[j]!, f.y, 6);
        if (!g || g.clearance < STANDING_HEIGHT) continue;
        if (Math.abs(g.angle) >= 1 || Math.abs(f.angle) >= 1) {
          if (!reported.has(`m${key}`)) {
            reported.add(`m${key}`);
            add(out, 'error', 'tunnel.mouth', new Vec2(f.x, f.y), `roll-only gap (${f1(c)} px) with its mouth on a ${f1(Math.max(Math.abs(g.angle), Math.abs(f.angle)))} deg slope: put mouths on flat ground`);
          }
        }
      }
    }
  }
}

function checkFloors(out: Finding[], columns: Column[]): void {
  const reported = new Set<string>();
  for (let i = 1; i < columns.length - 1; i++) {
    if (columns[i - 1]!.skipped || columns[i + 1]!.skipped) continue;
    for (const f of columns[i]!.floors) {
      const key = `${Math.trunc(f.x / 32)}:${Math.trunc(f.y / 32)}`;
      const prev = near(columns[i - 1]!, f.y, 30);
      // Steps: a riser between two flat floors.
      if (prev && Math.abs(f.angle) < 5 && Math.abs(prev.angle) < 5) {
        const rise = Math.abs(prev.y - f.y);
        if (rise > MAX_STEP + 0.5 && rise <= 24 && !reported.has(`s${key}`)) {
          reported.add(`s${key}`);
          add(out, 'warn', 'step.height', new Vec2(f.x, Math.min(f.y, prev.y)), `${f0(rise)} px step between flat floors (steps must be <= 10 px)`);
        }
      }
      // Narrow tops: a flat run under 18 px wide with drops of more than 19 px on both sides.
      if (Math.abs(f.angle) < 30 && !reported.has(`n${key}`) && !near(columns[i - 1]!, f.y, 3) && clear(columns[i - 1]!, f.y - 3, f.y + 19)) {
        let width = SCAN_STEP;
        let k = i + 1;
        while (k < columns.length && !columns[k]!.skipped && near(columns[k]!, f.y, 3)) {
          width += SCAN_STEP;
          k++;
        }
        if (k < columns.length && !columns[k]!.skipped && clear(columns[k]!, f.y - 3, f.y + 19) && width < MIN_SOLID_WIDTH) {
          reported.add(`n${key}`);
          add(out, 'warn', 'solid.narrow', new Vec2(f.x, f.y), `floor top only ${f0(width)} px wide (solids must be >= 18 px)`);
        }
      }
      // Fillets: a steep floor reached from flat floor or the opposite steep side.
      const cornerKey = `f${Math.trunc(f.x / 128)}:${Math.trunc(f.y / 128)}`;
      if (Math.abs(f.angle) >= STEEP && !reported.has(cornerKey)) {
        const limit = MIN_FILLET * (Math.sin(Math.abs(f.angle) / RAD) - Math.sin(5 / RAD)) - 4;
        const dir = f.angle < 0 ? 1 : -1;
        let k = i;
        let yRef = f.y;
        let span = 0;
        while (span <= limit) {
          k += dir;
          if (k < 0 || k >= columns.length || columns[k]!.skipped) break;
          const g = near(columns[k]!, yRef, 12);
          if (!g) break;
          yRef = g.y;
          span += SCAN_STEP;
          const flat = Math.abs(g.angle) < 5;
          const opposite = Math.abs(g.angle) >= STEEP && Math.sign(g.angle) !== Math.sign(f.angle);
          if (flat || opposite) {
            reported.add(cornerKey);
            add(out, 'warn', 'corner.fillet', new Vec2(f.x, f.y), `${opposite ? 'a sharp V side' : 'flat floor'} meets a ${f0(Math.abs(f.angle))} deg slope within ${f0(span)} px (fillet < 48 px)`);
            break;
          }
        }
      }
    }
  }
}

/** Up-slope feet (rising to the right) and the flat or downhill run-up before each. */
function checkMomentum(out: Finding[], columns: Column[], spots: [string, Vec2][]): void {
  const reported = new Set<string>();
  for (let i = 1; i < columns.length; i++) {
    const c = columns[i]!;
    const prev = columns[i - 1]!;
    for (const f of c.floors) {
      if (f.angle < CLIMB_ANGLE || f.angle > 80) continue;
      const before = near(prev, f.y, 4);
      if (!before || before.angle >= 8) continue;
      let runup = 0;
      let y = before.y;
      for (let j = i - 1; j >= 0 && runup < MIN_RUNUP; j--) {
        const g = near(columns[j]!, y, 4);
        if (!g || g.angle > 8) break;
        runup += SCAN_STEP;
        y = g.y;
      }
      const key = `${Math.trunc(c.x / 64)}:${Math.trunc(f.y / 64)}`;
      if (reported.has(key)) continue;
      reported.add(key);
      if (runup < MIN_RUNUP) {
        add(out, 'warn', 'momentum.runup', new Vec2(c.x, f.y), `${f0(f.angle)} deg up-slope with only ${f0(runup)} px of run-up (needs ${MIN_RUNUP})`);
      }
      for (const [label, at] of spots) {
        if (c.x - at.x > 0 && c.x - at.x <= CHECKPOINT_REACH && Math.abs(at.y - f.y) < 64) {
          add(out, 'warn', 'momentum.checkpoint', at, `${label} is ${f0(c.x - at.x)} px before a ${f0(f.angle)} deg up-slope (a respawn can't climb it)`);
        }
      }
    }
  }
}

/** Diver posts must hang at least 120 px above the floor beneath them (BUG-Z2-01). */
function checkDiverPosts(out: Finding[], root: Node): void {
  for (const node of root.findChildren<Diver>((n) => n instanceof Diver)) {
    const post = node.globalPosition;
    const hit = ray(post, post.add(new Vec2(0, 2000)), FLOOR_MASK);
    if (!hit) {
      add(out, 'info', 'enemy.diver_post', post, `${node.name} has no floor beneath it`);
      continue;
    }
    const drop = hit.position.y - post.y;
    if (drop < DIVER_MIN_POST) add(out, 'error', 'enemy.diver_post', post, `${node.name} hangs ${f0(drop)} px above the floor (needs ${DIVER_MIN_POST})`);
  }
}

/** Geometry findings for a prepared scene (any Node2D root). */
export function lint(root: Node2D): Finding[] {
  const out: Finding[] = [];
  let bounds = boundsOf(root);
  if (!bounds) {
    bounds = terrainExtent(root);
    add(out, 'info', 'scene', Vec2.ZERO, `no Bounds; scanning the terrain extent ${bounds}`);
  }
  const loops = findLoops(root);
  for (const lp of loops) add(out, 'info', 'loop', lp.at, `loop radius ${f0(lp.radius)}, footprint x ${f0(lp.at.x - lp.half)}..${f0(lp.at.x + lp.half)}`);
  checkLoops(out, loops);
  const spots: [string, Vec2][] = [];
  const start = root.getNodeOrNull<Node2D>('PlayerStart');
  if (start) spots.push(['PlayerStart', start.globalPosition]);
  for (const cp of findCheckpoints(root)) spots.push([cp.name, cp.globalPosition]);
  for (const [label, at] of spots) checkSpot(out, label, at, bounds, loops);
  const columns = scanOf(root, bounds, loops);
  checkTunnels(out, columns);
  checkFloors(out, columns);
  checkMomentum(out, columns, spots);
  checkDiverPosts(out, root);
  return out;
}

// --- Difficulty measures ---------------------------------------------------------------

export interface Section {
  screens: number;
  enemies: number;
  tierMax: number;
  local: number[];
  density: number;
}

export interface Measures {
  screens: number;
  walkPx: number;
  route: [number, number];
  startX: number;
  goalX: number;
  finaleX: number;
  gateX: number;
  enemies: number;
  density: number;
  tiers: Record<number, number>;
  tierPct: Record<number, number>;
  tierMax: number;
  tierMissing: number;
  checkpoints: number;
  checkpointXs: number[];
  checkpointProgress: number[];
  maxGapScreens: number;
  tickets: number;
  ticketDensity: number;
  verticalScreens: number;
  routes: number[];
  deadEnds: number;
  deadEndSpots: Vec2[];
  leftwardScreens: number;
  forced: number;
  doorsSwitches: number;
  direction: number;
  sections: Record<SectionName, Section>;
  tooClose: { kind: string; name: string; x: number; enemy: string; ahead: number }[];
  /** Percent of the route's columns (start to goal) with two or more stacked routes. */
  twoRoutePct: number;
  /** The same over the middle third of the route. */
  twoRouteMidPct: number;
  /** Percent of the route's columns with a floor sloped 8 to 80 degrees. */
  slopedPct: number;
  /** Columns where the lowest floor is 16 to 96 px higher than in the column before. */
  blockingSteps: number;
  stepsPerScreen: number;
  /** Every node in group `level_hazard` (vents, rams, wells, burrowers). */
  hazards: HazardInfo[];
  /** Hazards within 2 screens after a checkpoint, spring or loop exit. */
  hazardTooClose: { kind: string; name: string; x: number; hazard: string; ahead: number }[];
}

export interface HazardInfo {
  name: string;
  /** The node's class name (LavaVent, CeilingRam...). */
  type: string;
  x: number;
  y: number;
  /** A moving solid on a timer (a crusher). */
  movingSolid: boolean;
  /** It only starts when the player comes near (`wakeRadius` > 0). */
  wakes: boolean;
  /** Its lane is on the lowest floor of its column. */
  onLowestRoute: boolean;
}

export function isEnemyNode(n: Node): boolean {
  return n instanceof Enemy;
}

function tierOf(n: Node): number | null {
  const t = (n as { tier?: unknown }).tier;
  return typeof t === 'number' ? t : null;
}

/** An enemy's local difficulty: a number field (fixtures) or Enemy.localDifficulty(). */
function localOf(n: Node): number | null {
  const v = (n as { localDifficulty?: unknown }).localDifficulty;
  if (typeof v === 'number') return v;
  if (typeof v === 'function' && n instanceof Enemy && n.isInsideTree()) return n.localDifficulty();
  return null;
}

function widthOf(node: Node): number {
  if (node instanceof BoundsRect) return node.rect.w;
  if (node instanceof DecorRect) return node.rect.w;
  for (const body of [node, ...node.findChildren()]) {
    if (body instanceof CollisionObject2D) {
      for (const s of body.shapes) if (s.kind === 'rect') return s.size.x;
    }
  }
  return SCREEN_W;
}

function sectionOf(progress: number): SectionName {
  if (progress < Difficulty.OPENING_END) return 'opening';
  if (progress < Difficulty.FINALE_START) return 'middle';
  return 'finale';
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.trunc(s.length / 2)]! : 0;
}

/** Measures a prepared level. `isEnemy` overrides enemy detection (fixtures). */
export function measure(root: Node2D, isEnemy: (n: Node) => boolean = isEnemyNode): Measures {
  const bounds = boundsOf(root) ?? terrainExtent(root);
  const loops = findLoops(root);
  const columns = scanOf(root, bounds, loops);

  const start = root.getNodeOrNull<Node2D>('PlayerStart');
  const goal = collectAll(root, (n) => named(n, ['goal']))[0];
  const startX = start ? start.globalPosition.x : bounds.x;
  const goalX = goal instanceof Node2D ? goal.globalPosition.x : bounds.right;
  let lo = Math.min(startX, goalX);
  let hi = Math.max(startX, goalX);
  if (hi - lo < SCREEN_W) {
    lo = bounds.x;
    hi = bounds.right;
  }

  // Length, heights, routes per third.
  let walk = 0;
  const heights: number[] = [];
  const thirds: number[][] = [[], [], []];
  for (const c of columns) {
    if (c.skipped || c.floors.length > 0) walk++;
    let routes = 0;
    let lastY = -Infinity;
    for (const f of c.floors) {
      heights.push(f.y);
      if (f.clearance >= BALL_HEIGHT && f.y - lastY >= ROUTE_GAP) {
        routes++;
        lastY = f.y;
      }
    }
    if (c.x >= lo && c.x <= hi && (routes > 0 || c.skipped)) {
      const third = Math.min(Math.max(Math.trunc((3 * (c.x - lo)) / Math.max(hi - lo, 1)), 0), 2);
      thirds[third]!.push(Math.max(routes, 1));
    }
  }
  const walkPx = walk * SCAN_STEP;
  const screens = walkPx / SCREEN_W;
  heights.sort((a, b) => a - b);
  const vertical = heights.length > 10 ? (heights[Math.trunc(heights.length * 0.95)]! - heights[Math.trunc(heights.length * 0.05)]!) / SCREEN_H : 0;
  const routes = thirds.map((t) => {
    const s = [...t].sort((a, b) => a - b);
    return s.length ? s[Math.trunc(s.length * 0.75)]! : 0;
  });

  // Flow: stacked routes, slopes and blocking steps between start and goal.
  let flowCols = 0;
  let twoCols = 0;
  let midCols = 0;
  let midTwoCols = 0;
  let slopedCols = 0;
  let blockingSteps = 0;
  let prevLowest: number | null = null;
  for (const c of columns) {
    if (c.x < lo || c.x > hi) continue;
    flowCols++;
    const inMid = c.x >= lo + (hi - lo) / 3 && c.x <= lo + (2 * (hi - lo)) / 3;
    if (inMid) midCols++;
    if (c.skipped || c.floors.length === 0) {
      prevLowest = null;
      continue;
    }
    let stacked = 0;
    let last = -Infinity;
    for (const f of c.floors) {
      if (f.clearance >= BALL_HEIGHT && f.y - last >= ROUTE_GAP) {
        stacked++;
        last = f.y;
      }
    }
    if (stacked >= 2) {
      twoCols++;
      if (inMid) midTwoCols++;
    }
    if (c.floors.some((f) => Math.abs(f.angle) >= SLOPE_MIN_ANGLE && Math.abs(f.angle) <= SLOPE_MAX_ANGLE)) slopedCols++;
    const lowest = Math.max(...c.floors.map((f) => f.y));
    if (prevLowest !== null && prevLowest - lowest >= STEP_MIN_RISE && prevLowest - lowest <= STEP_MAX_RISE) blockingSteps++;
    prevLowest = lowest;
  }
  const routeScreens = Math.max((hi - lo) / SCREEN_W, 0.01);

  // Enemies and tiers.
  const enemies = collectAll(root, isEnemy) as Node2D[];
  const tiers: Record<number, number> = {};
  let missing = 0;
  let tierMax = 0;
  for (const e of enemies) {
    const t = tierOf(e);
    if (t === null) {
      missing++;
      continue;
    }
    tiers[t] = (tiers[t] ?? 0) + 1;
    tierMax = Math.max(tierMax, t);
  }
  const tiered = enemies.length - missing;
  const tierPct: Record<number, number> = {};
  for (const [t, n] of Object.entries(tiers)) tierPct[Number(t)] = (100 * n) / Math.max(tiered, 1);

  // Checkpoints and their spacing.
  const checkpointXs = findCheckpoints(root)
    .map((n) => n.globalPosition.x)
    .sort((a, b) => a - b);
  const marks = [lo, ...checkpointXs, hi];
  let maxGap = 0;
  for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i]! - marks[i - 1]!);

  const tickets = collectAll(root, (n) => named(n, ['ticket']) && !named(n, ['scattered']));
  const springs = (collectAll(root, (n) => n instanceof Node2D && named(n, ['spring'])) as Node2D[]).map((s) => s.globalPosition);

  let leftwardPx = Math.max(0, startX - goalX);
  for (const n of collectAll(root, (x) => named(x, ['leftward', 'reverse']))) leftwardPx += widthOf(n);
  const forced = collectAll(root, (n) => named(n, ['autoscroll', 'reverse'])).length;
  const doors = collectAll(root, (n) => named(n, ['door', 'switch']) && !named(n, ['pathswitch', 'path_switch'])).length;
  // Lifts: moving terrain carries Sproto up its own wall (Z2-02).
  const lifts = root.findChildren((n) => isMoving(n)).map((n) => (n as Node2D).globalPosition);
  const deadEndSpots = findDeadEnds(columns, lo + END_MARGIN, hi - END_MARGIN, [...springs, ...lifts]);

  // In-act ramp, by progress along the route.
  const span = goalX - startX;
  const useRoute = Math.abs(span) >= SCREEN_W;
  const prog = (x: number): number =>
    useRoute ? Math.min(Math.max((x - startX) / span, 0), 1) : Math.min(Math.max((x - bounds.x) / Math.max(bounds.w, 1), 0), 1);
  const sections = {} as Record<SectionName, Section>;
  for (const name of SECTIONS) sections[name] = { screens: 0, enemies: 0, tierMax: 0, local: [], density: 0 };
  for (const c of columns) if (c.skipped || c.floors.length > 0) sections[sectionOf(prog(c.x))].screens += SCAN_STEP / SCREEN_W;
  for (const e of enemies) {
    const sec = sections[sectionOf(prog(e.globalPosition.x))];
    sec.enemies++;
    const t = tierOf(e);
    if (t !== null) sec.tierMax = Math.max(sec.tierMax, t);
    const local = localOf(e);
    if (local !== null) sec.local.push(local);
  }
  for (const name of SECTIONS) sections[name].density = sections[name].enemies / Math.max(sections[name].screens, 0.01);
  const gate = collectAll(root, (n) => n instanceof Node2D && named(n, ['bossgate', 'boss_gate', 'arena_gate', 'arenagate']))[0] as Node2D | undefined;
  const gateX = gate ? gate.globalPosition.x : goalX;
  const finaleX = useRoute ? startX + span * Difficulty.FINALE_START : bounds.x + bounds.w * Difficulty.FINALE_START;

  // Safe spots: no enemy within 2 screens after a checkpoint, spring or loop exit (below D5).
  const travel = goalX >= startX ? 1 : -1;
  const safe: { kind: string; name: string; x: number }[] = [];
  for (const n of collectAll(root, isCheckpoint) as Node2D[]) safe.push({ kind: 'checkpoint', name: n.name, x: n.globalPosition.x });
  for (const n of collectAll(root, (x) => x instanceof Node2D && named(x, ['spring'])) as Node2D[]) safe.push({ kind: 'spring', name: n.name, x: n.globalPosition.x });
  for (const lp of loops) safe.push({ kind: 'loop exit', name: 'loop', x: lp.at.x + travel * lp.half });
  const tooClose: Measures['tooClose'] = [];
  for (const spot of safe) {
    for (const e of enemies) {
      const ahead = travel * (e.globalPosition.x - spot.x);
      if (ahead >= 0 && ahead < 2 * SCREEN_W) tooClose.push({ ...spot, enemy: e.name, ahead });
    }
  }

  // Hazards (group level_hazard): where they are, and whether a timed crusher blocks the lowest route.
  const columnAt = (x: number): Column | null => {
    const i = Math.round((x - (bounds.x + 1)) / SCAN_STEP);
    return columns[Math.min(Math.max(i, 0), columns.length - 1)] ?? null;
  };
  const hazards: HazardInfo[] = root
    .findChildren<Node2D>((n) => n instanceof Node2D && n.isInGroup('level_hazard'))
    .map((n) => {
      const at = n.globalPosition;
      const col = columnAt(at.x);
      const below = col ? col.floors.filter((f) => f.y >= at.y - 4) : [];
      const lane = below.length ? Math.min(...below.map((f) => f.y)) : null;
      const lowest = col && col.floors.length ? Math.max(...col.floors.map((f) => f.y)) : null;
      return {
        name: n.name,
        type: n.constructor.name,
        x: at.x,
        y: at.y,
        movingSolid: isMoving(n),
        wakes: Number((n as { wakeRadius?: unknown }).wakeRadius ?? 0) > 0,
        onLowestRoute: lane !== null && lowest !== null && Math.abs(lane - lowest) < 1,
      };
    })
    .sort((a, b) => a.x - b.x);
  const hazardTooClose: Measures['hazardTooClose'] = [];
  for (const spot of safe) {
    for (const h of hazards) {
      const ahead = travel * (h.x - spot.x);
      if (ahead >= 0 && ahead < 2 * SCREEN_W) hazardTooClose.push({ ...spot, hazard: h.name, ahead });
    }
  }

  const m: Measures = {
    screens,
    walkPx,
    route: [lo, hi],
    startX,
    goalX,
    finaleX,
    gateX,
    enemies: enemies.length,
    density: enemies.length / Math.max(screens, 0.01),
    tiers,
    tierPct,
    tierMax,
    tierMissing: missing,
    checkpoints: checkpointXs.length,
    checkpointXs,
    checkpointProgress: checkpointXs.map(prog),
    maxGapScreens: maxGap / SCREEN_W,
    tickets: tickets.length,
    ticketDensity: tickets.length / Math.max(screens, 0.01),
    verticalScreens: vertical,
    routes,
    deadEnds: deadEndSpots.length,
    deadEndSpots,
    leftwardScreens: leftwardPx / SCREEN_W,
    forced,
    doorsSwitches: doors,
    direction: 1,
    sections,
    tooClose,
    twoRoutePct: (100 * twoCols) / Math.max(flowCols, 1),
    twoRouteMidPct: (100 * midTwoCols) / Math.max(midCols, 1),
    slopedPct: (100 * slopedCols) / Math.max(flowCols, 1),
    blockingSteps,
    stepsPerScreen: blockingSteps / routeScreens,
    hazards,
    hazardTooClose,
  };
  m.direction = direction(m);
  return m;
}

/** R1..R5 from the measures (docs/LEVELS.md, "Direction difficulty"). */
export function direction(m: Pick<Measures, 'leftwardScreens' | 'verticalScreens' | 'deadEnds' | 'doorsSwitches' | 'routes' | 'forced'>): number {
  let r = 1;
  if (m.leftwardScreens >= 1 || m.verticalScreens >= 1) r = 2;
  if (m.verticalScreens >= 2) r = 3;
  if ((m.deadEnds >= 1 || m.doorsSwitches >= 1) && (m.leftwardScreens >= 1 || m.verticalScreens >= 2)) r = 4;
  if (m.forced >= 1 && Math.max(0, ...m.routes) >= 3) r = 5;
  return r;
}

/** Floor runs ending at a wall too tall to jump (> 96 px), with no spring or lift within 160 px. */
function findDeadEnds(columns: Column[], x0: number, x1: number, springs: Vec2[]): Vec2[] {
  const seen = new Set<string>();
  const spots: Vec2[] = [];
  for (let i = 1; i < columns.length - 1; i++) {
    const c = columns[i]!;
    if (c.skipped || c.x < x0 || c.x > x1) continue;
    for (const f of c.floors) {
      for (const dir of [-1, 1]) {
        const next = columns[i + dir]!;
        if (next.skipped || near(next, f.y, 24)) continue;
        const head = new Vec2(c.x, f.y - 20);
        if (!ray(head, head.add(new Vec2(12 * dir, 0)), CEIL_MASK)) continue; // a drop or a gap, not a wall
        let climbable = false;
        for (let k = 1; k < 9; k++) {
          const j = i + dir * k;
          if (j < 0 || j >= columns.length) break;
          for (const g of columns[j]!.floors) if (g.y >= f.y - JUMP_UP && g.y < f.y - 4) climbable = true;
        }
        if (climbable) continue;
        const spot = new Vec2(c.x, f.y);
        if (springs.some((s) => s.distanceTo(spot) < SPRING_REACH)) continue;
        const key = `${Math.trunc(c.x / 32)}:${Math.trunc(f.y / 32)}`;
        if (!seen.has(key)) {
          seen.add(key);
          spots.push(spot);
        }
      }
    }
  }
  return spots;
}

// --- Findings against a row ------------------------------------------------------------

function ratio(out: Finding[], rule: string, at: Vec2, got: number, want: number, what: string): void {
  if (want <= 0) return;
  const off = got / want - 1;
  if (Math.abs(off) > TOLERANCE) {
    add(out, 'error', rule, at, `${f2(got)} ${what}, row ${f2(want)} (${off >= 0 ? '+' : ''}${f0(off * 100)} %, allowed ±25 %)`);
  }
}

/**
 * Findings for one act measured as `m` against row `t` (Difficulty.targets(d)).
 * `enforceFlow`: the flow rules and the 16-screen checkpoint gap are errors
 * (an act in FLOW_ENFORCED); otherwise they are warnings.
 */
export function check(m: Measures, d: number, t: ActTargets, preBoss = false, enforceFlow = false): Finding[] {
  const out: Finding[] = [];
  const at = new Vec2(m.route[0], 0);
  checkFlow(out, m, d, enforceFlow);
  ratio(out, 'difficulty.screens', at, m.screens, t.screens, 'screens');
  ratio(out, 'difficulty.enemy_density', at, m.density, t.enemies_per_screen, 'enemies per screen');
  ratio(out, 'difficulty.ticket_density', at, m.ticketDensity, t.tickets_per_screen, 'tickets per screen');
  const ceiling = Math.max(0, ...Object.keys(t.tiers).map(Number));
  if (m.tierMissing > 0) add(out, 'error', 'difficulty.tier_missing', at, `${m.tierMissing} enemies have no \`tier\``);
  const s = m.sections;
  const baseMax = Math.max(s.opening.tierMax, s.middle.tierMax);
  if (baseMax > ceiling) add(out, 'error', 'difficulty.tier_ceiling', at, `T${baseMax} enemies before the finale of a D${d} act (highest allowed T${ceiling})`);
  const finaleCeiling = Math.min(ceiling + 1, 4);
  if (s.finale.tierMax > finaleCeiling) add(out, 'error', 'difficulty.tier_ceiling', at, `T${s.finale.tierMax} enemies in the finale (highest allowed T${finaleCeiling})`);
  if (m.enemies > 0) {
    const all = new Set([...Object.keys(t.tiers), ...Object.keys(m.tierPct)].map(Number));
    for (const k of all) {
      const want = t.tiers[k] ?? 0;
      const got = m.tierPct[k] ?? 0;
      if (Math.abs(got - want) > TIER_POINTS) add(out, 'warn', 'difficulty.tier_mix', at, `T${k} is ${f0(got)} % of enemies (row: ${f0(want)} %)`);
    }
  }
  const cpOff = Math.abs(m.checkpoints - t.checkpoints);
  if (cpOff >= 1) add(out, cpOff >= 2 ? 'error' : 'warn', 'difficulty.checkpoints', at, `${m.checkpoints} checkpoints (row: ${t.checkpoints})`);
  const even = (m.route[1] - m.route[0]) / SCREEN_W / (m.checkpoints + 1);
  if (m.maxGapScreens > 1.75 * even && m.maxGapScreens > 3) {
    add(out, 'warn', 'difficulty.checkpoint_gap', at, `largest gap between start, checkpoints and goal is ${f1(m.maxGapScreens)} screens (even spacing ${f1(even)})`);
  }
  const below = t.direction - m.direction;
  if (below >= 1) {
    add(
      out,
      below >= 2 ? 'error' : 'warn',
      'difficulty.direction',
      at,
      `direction R${m.direction}, row R${t.direction} (vertical ${f1(m.verticalScreens)} screens, leftward ${f1(m.leftwardScreens)}, routes [${m.routes}], dead ends ${m.deadEnds}, doors/switches ${m.doorsSwitches}, forced ${m.forced})`,
    );
  }
  if (d < 5) {
    for (const c of m.tooClose) {
      add(out, c.kind === 'spring' ? 'warn' : 'error', 'difficulty.safe_spot', new Vec2(c.x, 0), `${c.kind} ${c.name} at x ${f0(c.x)}: enemy ${c.enemy} only ${f0(c.ahead)} px (${f1(c.ahead / SCREEN_W)} screens) ahead (below D5 keep 2 screens clear)`);
    }
  }
  const ramp: Finding[] = [];
  checkRamp(ramp, m, ceiling, preBoss);
  // The test zone (D 0) teaches everything gently: its ramp is reported, not enforced.
  for (const f of ramp) {
    if (d < 1 && f.severity === 'error') {
      f.severity = 'warn';
      f.detail += ' (test zone: reported only)';
    }
    out.push(f);
  }
  return out;
}

/** Flow, routes, the hard checkpoint gap and hazards (fixture measures without these fields are skipped). */
function checkFlow(out: Finding[], m: Measures, d: number, enforce: boolean): void {
  if (m.twoRoutePct === undefined) return;
  const at = new Vec2(m.route[0], 0);
  const hard: Severity = enforce ? 'error' : 'warn';
  if (d >= 1) {
    if (m.twoRoutePct < ROUTES_MIN_PCT || m.twoRouteMidPct < ROUTES_MID_MIN_PCT) {
      add(out, hard, 'flow.routes', at, `two stacked routes on ${f0(m.twoRoutePct)} % of the act and ${f0(m.twoRouteMidPct)} % of its middle third (needs ${ROUTES_MIN_PCT} % and ${ROUTES_MID_MIN_PCT} %)`);
    }
    if (m.slopedPct < SLOPE_MIN_PCT) add(out, 'warn', 'flow.slope', at, `${f1(m.slopedPct)} % sloped floor (momentum terrain wants at least ${SLOPE_MIN_PCT} %)`);
    if (m.stepsPerScreen > STEPS_MAX_PER_SCREEN) {
      add(out, 'warn', 'flow.steps', at, `${m.blockingSteps} blocking steps, ${f2(m.stepsPerScreen)} per screen (at most ${STEPS_MAX_PER_SCREEN})`);
    }
    if (m.maxGapScreens > MAX_CHECKPOINT_GAP) {
      add(out, hard, 'difficulty.checkpoint_gap', at, `largest gap between start, checkpoints and goal is ${f1(m.maxGapScreens)} screens (at most ${MAX_CHECKPOINT_GAP})`);
    }
  }
  for (const h of m.hazards) {
    if (h.movingSolid && !h.wakes && h.onLowestRoute) {
      add(out, 'warn', 'hazard.timed_solid', new Vec2(h.x, h.y), `${h.name} (${h.type}) is a moving solid on a fixed timer over the lowest route: give it a wake_radius, or a bypass below it`);
    }
  }
  if (d < 5) {
    for (const c of m.hazardTooClose) {
      add(out, c.kind === 'spring' || !enforce ? 'warn' : 'error', 'hazard.safe_spot', new Vec2(c.x, 0), `${c.kind} ${c.name} at x ${f0(c.x)}: hazard ${c.hazard} only ${f0(c.ahead)} px (${f1(c.ahead / SCREEN_W)} screens) ahead (below D5 keep 2 screens clear)`);
    }
  }
}

function checkRamp(out: Finding[], m: Measures, ceiling: number, preBoss: boolean): void {
  const at = new Vec2(m.finaleX, 0);
  const { opening, middle, finale } = m.sections;
  if (middle.enemies > 0 && finale.density < FINALE_DENSITY_MIN * middle.density) {
    add(out, 'error', 'difficulty.finale_density', at, `finale ${f2(finale.density)} enemies/screen vs middle ${f2(middle.density)} (needs at least ${FINALE_DENSITY_MIN}x)`);
  } else if (middle.enemies === 0 && finale.enemies === 0 && m.enemies > 0) {
    add(out, 'error', 'difficulty.finale_density', at, 'no enemies in the middle or the finale');
  }
  const need = Math.min(ceiling + 1, 4);
  if (m.enemies > 0 && finale.tierMax < need) {
    add(out, 'error', 'difficulty.finale_tier', at, `finale's highest tier is T${finale.tierMax}; it needs T${need} (one above the act's T${ceiling}, max T4)`);
  }
  if (ceiling > 1 && opening.tierMax >= ceiling) {
    add(out, 'warn', 'difficulty.opening_tier', new Vec2(m.startX, 0), `the opening already uses T${opening.tierMax}, the act's top tier (teach safely first)`);
  }
  const nearFinale = m.checkpointXs.some((x) => Math.abs(x - m.finaleX) <= FINALE_CHECKPOINT_REACH * SCREEN_W);
  const nearGate = m.checkpointXs.some((x) => Math.abs(x - m.gateX) <= GATE_CHECKPOINT_REACH * SCREEN_W);
  if (!nearFinale) add(out, 'error', 'difficulty.finale_checkpoint', at, `no checkpoint within ${FINALE_CHECKPOINT_REACH} screens of the finale start (x ${f0(m.finaleX)})`);
  if (preBoss && !nearGate) add(out, 'error', 'difficulty.gate_checkpoint', new Vec2(m.gateX, 0), `act before a boss: no checkpoint within about 2 screens of the arena gate (x ${f0(m.gateX)})`);
  if (middle.local.length > 0 && finale.local.length > 0 && median(finale.local) <= median(middle.local)) {
    add(out, 'error', 'difficulty.finale_local', at, `finale enemies' local difficulty (median ${f2(median(finale.local))}) is not above the middle's (${f2(median(middle.local))})`);
  }
}

export interface MeasuredAct {
  label: string;
  d: number;
  m: Pick<Measures, 'density' | 'tierMax' | 'direction' | 'ticketDensity'>;
}

/** Each act with D >= 1 against the act with the next lower D. */
export function checkOrder(acts: MeasuredAct[]): Finding[] {
  const out: Finding[] = [];
  const sorted = acts.filter((a) => a.d >= 1).sort((a, b) => a.d - b.d);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (Math.abs(cur.d - prev.d) < 1e-6) continue;
    const name = `${cur.label} (D${cur.d}) vs ${prev.label} (D${prev.d})`;
    const a = cur.m;
    const b = prev.m;
    if (a.density < b.density * (1 - ORDER_TOLERANCE)) add(out, 'error', 'difficulty.order', Vec2.ZERO, `${name}: fewer enemies per screen (${f2(a.density)} < ${f2(b.density)})`);
    if (a.tierMax < b.tierMax) add(out, 'error', 'difficulty.order', Vec2.ZERO, `${name}: lower tier ceiling (T${a.tierMax} < T${b.tierMax})`);
    if (a.direction < b.direction) add(out, 'error', 'difficulty.order', Vec2.ZERO, `${name}: lower direction score (R${a.direction} < R${b.direction})`);
    if (a.ticketDensity > b.ticketDensity * (1 + ORDER_TOLERANCE)) add(out, 'warn', 'difficulty.order', Vec2.ZERO, `${name}: more tickets per screen (${f1(a.ticketDensity)} > ${f1(b.ticketDensity)})`);
  }
  return out;
}

/**
 * Enemy scripts take their local difficulty from where they stand: the base
 * class or every enemy script reads it (LevelDifficulty.at, Difficulty.local
 * or progressAt).
 */
export function checkLocalSource(): Finding[] {
  const out: Finding[] = [];
  const dir = path.join(ROOT_DIR, 'src/levels/enemies');
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.ts')) files.push(path.join(d, e.name));
    }
  };
  walk(dir);
  const reads = (text: string): boolean => /LevelDifficulty\.at\(|Difficulty\.local\(|progressAt\(/.test(text);
  const base = path.join(dir, 'enemy_base.ts');
  const baseOk = fs.existsSync(base) && reads(fs.readFileSync(base, 'utf8'));
  const missing = files.filter((f) => f !== base && !reads(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  if (!baseOk && missing.length > 0) {
    add(out, 'error', 'difficulty.local_source', Vec2.ZERO, `enemy_base.ts and ${missing.join(', ')} never read their local difficulty`);
  }
  return out;
}

/** One line for reports. */
export function summary(m: Measures): string {
  const tiers = Object.entries(m.tierPct)
    .map(([t, p]) => `T${t} ${f0(p)}`)
    .join(' / ');
  const ramp = SECTIONS.map((n) => `${n} ${f2(m.sections[n].density)}/screen T${m.sections[n].tierMax}`).join(', ');
  return (
    `${f1(m.screens)} screens, ${m.enemies} enemies (${f2(m.density)}/screen, ${tiers}, max T${m.tierMax}), ` +
    `${m.checkpoints} checkpoints (gap ${f1(m.maxGapScreens)} screens), ${m.tickets} tickets (${f1(m.ticketDensity)}/screen), ` +
    `vertical ${f1(m.verticalScreens)} screens, routes [${m.routes}], dead ends ${m.deadEnds}, leftward ${f1(m.leftwardScreens)} screens, ` +
    `doors/switches ${m.doorsSwitches}, forced ${m.forced} -> R${m.direction}; ramp: ${ramp}; ` +
    `flow: two routes ${f0(m.twoRoutePct)} % (middle third ${f0(m.twoRouteMidPct)} %), sloped ${f0(m.slopedPct)} %, ` +
    `blocking steps ${m.blockingSteps} (${f2(m.stepsPerScreen)}/screen); hazards ${m.hazards.length}` +
    (m.hazards.length ? ` (${m.hazards.map((h) => `${h.type} at ${f0(h.x)}`).join(', ')})` : '')
  );
}

export function formatFinding(label: string, f: Finding): string {
  return `${label}: ${f.severity.toUpperCase()} ${f.rule} at (${f0(f.at.x)}, ${f0(f.at.y)}): ${f.detail}`;
}
