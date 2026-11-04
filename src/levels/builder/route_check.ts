// Geometric route check for a built level (the builder's `route` against
// the collision world): proves that the way from PlayerStart to the goal
// exists, step by step, without playing it.
//   walk       floor under every 16 px of the step (at the expected height),
//              and no wall across it
//   jump       a gap no wider than a running jump (MAX_JUMP_GAP) nor
//              higher (MAX_JUMP_RISE), with floor at both lips
//   drop       floor below at the landing
//   spring     a spring within 48 px of the take-off, floor at the landing
//   loop       a loop at the step, with a booster or 384 px of run-up before it
//   pipe       a quarter pipe at the take-off, floor at the landing
//   platforms  each platform where the step says, every hop no wider than a
//              running jump; vanishing platforms: a start time exists at
//              which a runner at 6 px/frame finds every one solid
// and that consecutive steps join up (the route is one connected way) and
// run from PlayerStart to the goal sign. Moving terrain is skipped by the
// floor rays (it is checked as platforms). Findings are errors.

import { Layers } from '../../core/layers';
import type { Node, Node2D } from '../../runtime/node';
import type { CollisionObject2D } from '../../runtime/physics';
import { tree } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { CurveShape, CurveTerrain } from '../../terrain/curve_terrain';
import { TerrainLoop } from '../../terrain/loop';
import { LevelSpring } from '../objects/spring';
import { SpeedBooster } from '../objects/speed_booster';
import { CrumbleLedge } from '../objects/setpieces/crumble_ledge';
import { TimedPlatform } from '../objects/setpieces/timed_platform';
import { VanishingPlatform, VanishPhase } from '../objects/setpieces/vanishing_platform';
import { MAX_JUMP_GAP, MAX_JUMP_RISE, type RouteStep } from './level_builder';

const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;
const WALL_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A;
const RUN_SPEED = 6;
const JOIN_X = 64;
const JOIN_Y = 4;

export interface RouteFinding {
  step: number;
  kind: string;
  at: Vec2;
  detail: string;
}

function isMoving(body: CollisionObject2D): boolean {
  return typeof (body as Partial<{ platformDelta(): Vec2 }>).platformDelta === 'function';
}

/** The static floor top at x within [y - up, y + down], or null. */
export function floorAt(x: number, y: number, up = 24, down = 24): number | null {
  let from = new Vec2(x, y - up);
  const to = new Vec2(x, y + down);
  for (let i = 0; i < 8; i++) {
    const hit = tree.physics.intersectRay(from, to, FLOOR_MASK);
    if (!hit) return null;
    if (!isMoving(hit.collider)) return hit.position.y;
    from = new Vec2(x, hit.position.y + 1);
    if (from.y >= to.y) return null;
  }
  return null;
}

function wallAcross(x: number, y: number, dir: number, reach: number): boolean {
  const hit = tree.physics.intersectRay(new Vec2(x, y - 20), new Vec2(x + dir * reach, y - 20), WALL_MASK);
  return !!hit && !isMoving(hit.collider) && Math.abs(hit.normal.x) > 0.7;
}

function all<T extends Node>(root: Node, test: (n: Node) => n is T): T[] {
  return root.findChildren<T>((n) => test(n));
}

export function checkRoute(root: Node, route: RouteStep[], startFeet: Vec2, goalX: number): RouteFinding[] {
  const out: RouteFinding[] = [];
  const add = (step: number, s: RouteStep, at: Vec2, detail: string): void => {
    out.push({ step, kind: s.kind, at, detail });
  };
  const springs = all(root, (n): n is LevelSpring => n instanceof LevelSpring);
  const boosters = all(root, (n): n is SpeedBooster => n instanceof SpeedBooster);
  const loops = all(root, (n): n is TerrainLoop => n instanceof TerrainLoop);
  const pipes = all(root, (n): n is CurveTerrain => n instanceof CurveTerrain && n.shape === CurveShape.QUARTER_PIPE && !(n.parent instanceof TerrainLoop));
  const platforms = all(root, (n): n is Node2D => n instanceof VanishingPlatform || n instanceof TimedPlatform || n instanceof CrumbleLedge);

  if (route.length === 0) {
    out.push({ step: -1, kind: 'route', at: startFeet, detail: 'empty route' });
    return out;
  }
  if (route[0]!.from.distanceTo(startFeet) > 128) {
    add(0, route[0]!, route[0]!.from, `route starts at ${route[0]!.from}, PlayerStart feet at ${startFeet}`);
  }
  const last = route[route.length - 1]!;
  if (Math.max(last.to.x, last.from.x) < goalX) add(route.length - 1, last, last.to, `route ends at x ${last.to.x}, before the goal at ${goalX}`);

  route.forEach((s, i) => {
    if (i > 0) {
      const prev = route[i - 1]!;
      if (Math.abs(prev.to.x - s.from.x) > JOIN_X || Math.abs(prev.to.y - s.from.y) > JOIN_Y) {
        add(i, s, s.from, `does not join the step before (${prev.kind} ends at ${prev.to})`);
      }
    }
    const dir = Math.sign(s.to.x - s.from.x) || 1;
    switch (s.kind) {
      case 'walk': {
        const len = Math.abs(s.to.x - s.from.x);
        for (let d = 0; d <= len; d += 16) {
          const x = s.from.x + dir * d;
          const y = s.from.y + ((s.to.y - s.from.y) * d) / Math.max(len, 1);
          const f = floorAt(x, y, 8, 8);
          if (f === null) {
            add(i, s, new Vec2(x, y), 'no floor under the walk');
            break;
          }
          // A wall right at the end of a walk is where the next step (a spring, a pipe, the end wall) takes over.
          if (d + 32 <= len && wallAcross(x, f, dir, 16)) {
            add(i, s, new Vec2(x, f), 'a wall across the walk');
            break;
          }
        }
        break;
      }
      case 'jump': {
        const gap = Math.abs(s.to.x - s.from.x);
        const rise = s.from.y - s.to.y;
        if (gap > MAX_JUMP_GAP || rise > MAX_JUMP_RISE) add(i, s, s.from, `jump ${gap} px wide and ${rise} px up (running jump ${MAX_JUMP_GAP} x ${MAX_JUMP_RISE})`);
        if (floorAt(s.from.x - dir * 8, s.from.y, 4, 4) === null) add(i, s, s.from, 'no take-off floor');
        if (floorAt(s.to.x + dir * 8, s.to.y, 4, 4) === null) add(i, s, s.to, 'no landing floor');
        break;
      }
      case 'drop': {
        if (s.to.y <= s.from.y) add(i, s, s.to, 'a drop that goes up');
        if (floorAt(s.to.x, s.to.y, 4, 4) === null) add(i, s, s.to, 'no landing floor');
        break;
      }
      case 'spring': {
        if (!springs.some((n) => n.globalPosition.distanceTo(s.from) <= 48)) add(i, s, s.from, 'no spring at the take-off');
        if (floorAt(s.to.x + dir * 16, s.to.y, 4, 4) === null) add(i, s, s.to, 'no landing floor');
        break;
      }
      case 'booster': {
        if (!boosters.some((n) => n.globalPosition.distanceTo(s.from) <= 48)) add(i, s, s.from, 'no booster');
        break;
      }
      case 'loop': {
        const loop = loops.find((n) => Math.abs(n.globalPosition.x - (s.from.x + s.to.x) / 2) < 32 && Math.abs(n.globalPosition.y - s.from.y) < 4);
        if (!loop) add(i, s, s.from, 'no loop here');
        const boosted = boosters.some((b) => b.facing === dir && dir * (s.from.x - b.globalPosition.x) >= 0 && dir * (s.from.x - b.globalPosition.x) < 200);
        if (!boosted) {
          let runup = 0;
          for (let d = 8; d < 400 && floorAt(s.from.x - dir * d, s.from.y, 2, 2) !== null; d += 8) runup = d;
          if (runup < 384) add(i, s, s.from, `loop without a booster and only ${runup} px of run-up`);
        }
        if (floorAt(s.to.x + dir * 16, s.to.y, 4, 4) === null) add(i, s, s.to, 'no floor after the loop');
        break;
      }
      case 'pipe': {
        if (!pipes.some((n) => n.globalPosition.distanceTo(s.from) <= 4)) add(i, s, s.from, 'no quarter pipe at the take-off');
        if (floorAt(s.to.x + dir * 16, s.to.y, 4, 4) === null) add(i, s, s.to, 'no landing floor');
        break;
      }
      case 'platforms': {
        const hops = s.hops ?? [];
        let edge = s.from.x;
        let edgeY = s.from.y;
        for (const hop of hops) {
          const node = platforms.find((n) => n.globalPosition.distanceTo(hop.at) <= 4);
          if (!node) add(i, s, hop.at, 'no platform where the route hops');
          const near = dir > 0 ? hop.at.x : hop.at.x + hop.width;
          const far = dir > 0 ? hop.at.x + hop.width : hop.at.x;
          if (Math.abs(near - edge) > MAX_JUMP_GAP || edgeY - hop.at.y > MAX_JUMP_RISE) add(i, s, hop.at, `hop of ${Math.abs(near - edge)} px from ${edge}`);
          edge = far;
          edgeY = hop.at.y;
        }
        if (Math.abs(s.to.x - edge) > MAX_JUMP_GAP || edgeY - s.to.y > MAX_JUMP_RISE) add(i, s, s.to, `last hop of ${Math.abs(s.to.x - edge)} px`);
        if (floorAt(s.to.x + dir * 8, s.to.y, 4, 4) === null) add(i, s, s.to, 'no floor after the platforms');
        const vanishing = hops.map((h) => platforms.find((n) => n instanceof VanishingPlatform && n.globalPosition.distanceTo(h.at) <= 4)).filter((n): n is VanishingPlatform => !!n);
        if (vanishing.length > 0 && !crossable(vanishing, s.from.x, dir)) add(i, s, s.from, 'no start time lets a runner at 6 px/frame find every vanishing platform solid');
        break;
      }
    }
  });
  return out;
}

/**
 * True when some start frame lets a runner at RUN_SPEED px/frame, entering
 * the row at x0, find every platform solid (SOLID or BLINK) for the whole
 * time he is over it.
 */
export function crossable(row: VanishingPlatform[], x0: number, dir: number): boolean {
  const period = row.reduce((m, p) => Math.max(m, p.period), 1);
  const spans = row.map((p) => {
    const a = (dir > 0 ? p.globalPosition.x : p.globalPosition.x + p.size.x) - x0;
    const b = (dir > 0 ? p.globalPosition.x + p.size.x : p.globalPosition.x) - x0;
    return [Math.floor(Math.abs(a) / RUN_SPEED), Math.ceil(Math.abs(b) / RUN_SPEED)] as const;
  });
  for (let start = 0; start < period * 2; start++) {
    let ok = true;
    for (let k = 0; k < row.length && ok; k++) {
      const [t0, t1] = spans[k]!;
      for (let t = t0; t <= t1; t++) {
        const phase = row[k]!.phaseAt(start + t);
        if (phase !== VanishPhase.SOLID && phase !== VanishPhase.BLINK) {
          ok = false;
          break;
        }
      }
    }
    if (ok) return true;
  }
  return false;
}
