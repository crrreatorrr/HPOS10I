// A playtest pilot for built acts: plays a level through input actions only
// (move_left / move_right / jump), the way the QA recorder
// (tests/levels/inputs/record_act_run.gd) does, reading the level just to
// time its inputs. It follows the builder's route for the direction to hold
// (reverse runs and zigzags included: in the air after a spring it holds
// the way the landing floor runs), jumps at every lip whose far side it can
// see within a running jump (a tap for short gaps, a full jump for wide
// ones, never off a plain drop), waits before a row of vanishing platforms
// until a run at its speed finds every one solid, waits for a switched-off
// timed platform, rides a shuttling one until its far lip is close, jumps
// enemies ahead of it, and jumps when it is stuck against something.
// It reports whether the goal sign was reached, the frames it took, hurts
// and deaths. On a death the caller decides (a fresh scene from the
// checkpoint, or a failure).

import { Layers } from '../../core/layers';
import { Input, type Action } from '../../runtime/input';
import { tree } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { Player } from '../../player/player';
import type { LevelRoot } from '../common/level_root';
import { Enemy } from '../enemies/enemy_base';
import { TimedPlatform } from '../objects/setpieces/timed_platform';
import { VanishingPlatform, VanishPhase } from '../objects/setpieces/vanishing_platform';
import type { RouteStep } from './level_builder';

const FLOOR_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;
const SOURCE = 'pilot';
const MAX_SPEED = 6;
const ACCEL = 0.046875;
const JUMP_REACH = 220;

export interface PilotLog {
  frame: number;
  step: number;
  at: Vec2;
  what: string;
}

export class RoutePilot {
  step = 0;
  hurts = 0;
  readonly log: PilotLog[] = [];
  private held = new Set<Action>();
  private jumpHold = 0;
  private jumpCooldown = 0;
  private stuckFrames = 0;
  private stuckCount = 0;
  private bestProgress = -Infinity;
  private progressDir = 0;
  private progressStep = -1;
  private backoff = 0;
  private rollFrames = 0;
  private launchDir = 0;
  private waiting = false;
  private frame = 0;
  private vanishing: VanishingPlatform[] = [];
  private timed: TimedPlatform[] = [];

  constructor(
    private root: LevelRoot,
    private route: RouteStep[],
  ) {
    this.bind(root);
  }

  /** Points the pilot at a (re)built scene and finds the route step nearest the player. */
  bind(root: LevelRoot): void {
    this.root = root;
    this.vanishing = root.findChildren<VanishingPlatform>((n) => n instanceof VanishingPlatform);
    this.timed = root.findChildren<TimedPlatform>((n) => n instanceof TimedPlatform);
    const p = root.player;
    if (p) {
      p.hurtTaken.connect(() => (this.hurts += 1), { owner: root });
      let best = this.step;
      let bestD = Infinity;
      this.route.forEach((s, i) => {
        const d = Math.abs(s.from.x - p.globalPosition.x) + Math.abs(s.from.y - this.feet(p));
        if (d < bestD && s.kind === 'walk') {
          bestD = d;
          best = i;
        }
      });
      this.step = best;
    }
  }

  release(): void {
    for (const a of this.held) Input.actionRelease(a, SOURCE);
    this.held.clear();
  }

  private set(action: Action, on: boolean): void {
    if (on && !this.held.has(action)) {
      Input.actionPress(action, SOURCE);
      this.held.add(action);
    } else if (!on && this.held.has(action)) {
      Input.actionRelease(action, SOURCE);
      this.held.delete(action);
    }
  }

  private feet(p: Player): number {
    return p.globalPosition.y + p.getRadii().y;
  }

  private note(what: string): void {
    const p = this.root.player;
    this.log.push({ frame: this.frame, step: this.step, at: p ? p.globalPosition.round() : Vec2.ZERO, what });
    if (this.log.length > 400) this.log.shift();
  }

  private dirOf(i: number): number {
    const s = this.route[Math.min(i, this.route.length - 1)]!;
    return Math.sign(s.to.x - s.from.x) || 1;
  }

  /** Floor top at x within `up` above / `down` below y (moving platforms included when solid). */
  private floorY(x: number, y: number, up = 10, down = 24): number | null {
    const hit = tree.physics.intersectRay(new Vec2(x, y - up), new Vec2(x, y + down), FLOOR_MASK);
    return hit ? hit.position.y : null;
  }

  private onWalk(i: number, p: Player): boolean {
    const s = this.route[i]!;
    if (s.kind !== 'walk' || !p.grounded) return false;
    const x = p.globalPosition.x;
    const lo = Math.min(s.from.x, s.to.x) - 12;
    const hi = Math.max(s.from.x, s.to.x) + 12;
    if (x < lo || x > hi) return false;
    const len = Math.max(Math.abs(s.to.x - s.from.x), 1);
    const t = Math.min(Math.max(Math.abs(x - s.from.x) / len, 0), 1);
    const y = s.from.y + (s.to.y - s.from.y) * t;
    return Math.abs(this.feet(p) - y) <= 8;
  }

  /** Called once per physics tick before the step: sets this tick's inputs. */
  tick(): void {
    this.frame += 1;
    const p = this.root.player;
    if (!p || p.state === 'dead' || this.root.isFinishing()) {
      this.release();
      return;
    }
    // Where along the route are we? (Skip ahead after launches that land further on.)
    for (let k = Math.min(this.route.length - 1, this.step + 8); k > this.step; k--) {
      if (this.onWalk(k, p)) {
        this.step = k;
        this.launchDir = 0;
        break;
      }
    }
    const s = this.route[this.step]!;
    if (p.grounded && s.kind !== 'walk' && Math.abs(this.feet(p) - s.to.y) <= 8 && this.dirOf(this.step) * (p.globalPosition.x - s.to.x) >= -16) {
      this.step = Math.min(this.step + 1, this.route.length - 1);
    }
    if (p.state === 'spring' && this.launchDir === 0) {
      // Launched: hold the way the floor after the launch runs.
      for (let k = this.step; k < Math.min(this.route.length, this.step + 4); k++) {
        if (this.route[k]!.kind === 'spring' && this.route[k]!.from.distanceTo(p.globalPosition) < 160) {
          this.launchDir = this.dirOf(k + 1);
          this.note(`launched, holding ${this.launchDir}`);
          break;
        }
      }
    }
    let dir = this.launchDir !== 0 && !p.grounded ? this.launchDir : this.dirOf(this.step);
    if (p.grounded && this.launchDir !== 0 && p.state !== 'spring') this.launchDir = 0;

    // Waits: vanishing rows and timed platforms ahead.
    const wait = p.grounded && this.shouldWait(p, dir);
    if (wait !== this.waiting) {
      this.waiting = wait;
      this.note(wait ? 'waiting' : 'go');
    }
    if (wait) {
      const v = p.groundSpeed;
      this.set('move_right', v < -0.5);
      this.set('move_left', v > 0.5);
      this.set('jump', false);
      return;
    }
    // A lip over the void before a platform row whose platforms aren't there: stop at it.
    if (p.grounded && this.nextIsPlatforms(p, dir)) {
      const g = this.gapAhead(p, dir);
      const v = p.groundSpeed * dir;
      if (g && g.gap === null && g.dist <= 24 + (v * v) / (2 * 0.5)) {
        this.set('move_right', dir < 0 && v > 0.5);
        this.set('move_left', dir > 0 && v > 0.5);
        this.set('jump', false);
        return;
      }
    }
    // Riding a shuttle: stand still until its far lip is close.
    const support = p.support;
    if (p.grounded && support instanceof TimedPlatform && !support.travel.isZero()) {
      const gap = this.gapAhead(p, dir);
      if (gap === null || gap.dist > 40) dir = 0;
    }
    if (this.backoff > 0) {
      this.backoff -= 1;
      dir = -dir;
      this.set('move_right', dir > 0);
      this.set('move_left', dir < 0);
      this.set('jump', false);
      return;
    }
    this.set('move_right', dir > 0);
    this.set('move_left', dir < 0);
    this.jumpLogic(p, dir);
  }

  /** Distance to the lip ahead and the width of the gap after it (null: no lip within reach). */
  private gapAhead(p: Player, dir: number): { dist: number; gap: number | null } | null {
    return this.gapAheadFrom(p, dir, 0);
  }

  private gapAheadFrom(p: Player, dir: number, from: number): { dist: number; gap: number | null } | null {
    if (dir === 0 || from > 96) return null;
    const x = p.globalPosition.x;
    const feet = this.feet(p);
    let dist = -1;
    for (let d = from; d <= 96; d += 4) {
      if (this.floorY(x + dir * d, feet) === null) {
        dist = d;
        break;
      }
    }
    if (dist < 0) return null;
    for (let d = dist + 4; d <= dist + JUMP_REACH; d += 4) {
      const f = this.floorY(x + dir * d, feet, 72, 24);
      if (f !== null) {
        // A seam a few px wide between two pieces is no gap.
        if (d - dist <= 8) return this.gapAheadFrom(p, dir, d + 4);
        return { dist, gap: d - dist };
      }
    }
    return { dist, gap: null };
  }

  private jumpLogic(p: Player, dir: number): void {
    if (this.rollFrames > 0) {
      this.rollFrames -= 1;
      if (this.rollFrames === 0) this.set('move_down', false);
    }
    if (this.jumpCooldown > 0) this.jumpCooldown -= 1;
    if (this.jumpHold > 0) {
      this.jumpHold -= 1;
      this.set('jump', this.jumpHold > 0);
      return;
    }
    this.set('jump', false);
    if (!p.grounded || this.jumpCooldown > 0 || dir === 0) return;
    const speed = Math.abs(p.groundSpeed);
    const x = p.globalPosition.x;
    // Stuck (no new progress the way we go for a while): hop, or back off for a run-up.
    const progress = dir * x;
    if (dir !== this.progressDir || this.step !== this.progressStep) {
      this.progressDir = dir;
      this.progressStep = this.step;
      this.bestProgress = progress;
      this.stuckFrames = 0;
    } else if (progress > this.bestProgress + 4) {
      this.bestProgress = progress;
      this.stuckFrames = 0;
    } else {
      this.stuckFrames += 1;
    }
    if (this.stuckFrames > 90) {
      this.stuckFrames = 0;
      this.stuckCount += 1;
      if (this.stuckCount % 2 === 0) {
        // Stalled at the foot of a climb: back off for a run-up.
        this.backoff = 70;
        this.note('backing off for a run-up');
      } else {
        this.jump(16, 'stuck');
      }
      return;
    }
    // Only from flat-ish ground (not on a slope, a pipe or a loop).
    if (Player.angleFromFlat(p.groundAngle) > 12) return;
    // A lip ahead with floor beyond it: jump at the lip, held just long enough to land on floor.
    const g = this.gapAhead(p, dir);
    if (g && g.gap !== null && g.dist <= Math.max(6, speed * 1.5)) {
      const hold = this.holdFor(p, dir, g.dist + g.gap);
      this.jump(hold < 0 ? 16 : hold, `lip, gap ${g.gap}`);
      return;
    }
    // Rolling slowly on flat ground with nothing in the way: hop out of the ball to run again.
    const next = this.route[this.step + 1];
    const climbAhead = !!next && (next.kind === 'pipe' || next.kind === 'loop') && Math.abs(next.from.x - x) < 256;
    const rowAhead = this.nextIsPlatforms(p, dir);
    if (p.isBall && p.state === 'roll' && (speed < 4.5 || rowAhead) && Math.abs(p.groundAngle) < 2 && !climbAhead && (!g || g.dist > 96) && this.headroom(p)) {
      this.jump(2, 'unroll');
      return;
    }
    // An enemy ahead at our height: jump into it from above.
    const feet = this.feet(p);
    for (const e of this.root.findChildren<Enemy>((n) => n instanceof Enemy && n.alive)) {
      const dx = (e.globalPosition.x - x) * dir;
      const dy = e.globalPosition.y - feet;
      if (dx > 0 && dx < speed * 8 + 28 && dy > -70 && dy < 12) {
        // Jump into it only if the arc comes down on floor; else roll through it.
        const hold = this.holdFor(p, dir, dx + 16);
        if (hold >= 0) this.jump(Math.max(hold, 6), `enemy ${e.name}`);
        else if (speed > 1.1 && !p.isBall) {
          this.set('move_down', true);
          this.rollFrames = 3;
          this.note(`roll at ${e.name}`);
        }
        return;
      }
    }
  }

  /** True when a vanishing or timed platform's slab (in any phase) lies at x with its top near y. */
  private platformAt(x: number, y: number): boolean {
    for (const n of [...this.vanishing, ...this.timed]) {
      const at = n.globalPosition;
      if (x >= at.x && x <= at.x + n.size.x && Math.abs(at.y - y) <= 8) return true;
    }
    return false;
  }

  /** Room above for a jump (not in a roll tube or under a low ceiling). */
  private headroom(p: Player): boolean {
    const at = p.globalPosition;
    return tree.physics.intersectRay(at, at.add(new Vec2(0, -64)), Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A) === null;
  }

  /**
   * The shortest jump hold (frames) whose arc, flown holding `dir`, comes
   * down on floor at least `beyond` px ahead with 14 px to spare (-1: none).
   */
  private holdFor(p: Player, dir: number, beyond: number): number {
    const x0 = p.globalPosition.x;
    const feet = this.feet(p);
    const locked = p.isBall;
    let best = -1;
    for (const hold of [1, 3, 6, 9, 12, 16]) {
      const land = this.landingX(p.groundSpeed, hold, dir, locked);
      const at = x0 + land;
      if (land * dir < beyond + 8) continue;
      const ok = (x: number): boolean => this.floorY(x, feet, 72, 24) !== null || this.platformAt(x, feet);
      if (ok(at) && ok(at - dir * 14) && ok(at + dir * 14)) {
        best = hold;
        break;
      }
    }
    return best;
  }

  /** Where a jump from ground speed v comes back down to its take-off height (x offset). */
  private landingX(v: number, hold: number, dir: number, locked: boolean): number {
    let vx = v;
    let vy = -6.5;
    let x = 0;
    let y = 0;
    for (let f = 1; f < 180; f++) {
      if (f > hold && vy < -4) vy = -4;
      if (!locked && vx * dir < MAX_SPEED) vx = dir > 0 ? Math.min(vx + 0.09375, MAX_SPEED) : Math.max(vx - 0.09375, -MAX_SPEED);
      if (vy < 0 && vy > -4 && Math.abs(vx) >= 0.125) vx -= vx / 32;
      x += vx;
      y += vy;
      vy += 0.21875;
      if (vy > 0 && y >= 0) return x;
    }
    return x;
  }

  private jump(hold: number, why: string): void {
    this.set('jump', true);
    this.jumpHold = hold;
    this.jumpCooldown = hold + 6;
    this.note(`jump (${why})`);
  }

  /** True when a platform step starts within a screen ahead. */
  private nextIsPlatforms(p: Player, dir: number): boolean {
    for (let k = this.step; k < Math.min(this.route.length, this.step + 3); k++) {
      const s = this.route[k]!;
      const ahead = (s.from.x - p.globalPosition.x) * dir;
      if (s.kind === 'platforms' && ahead >= -8 && ahead < 424) return true;
    }
    return false;
  }

  /** True while the next platform row isn't safe to start yet. */
  private shouldWait(p: Player, dir: number): boolean {
    for (let k = this.step; k < Math.min(this.route.length, this.step + 3); k++) {
      const s = this.route[k]!;
      if (s.kind !== 'platforms' || !s.hops?.length) continue;
      const ahead = (s.from.x - p.globalPosition.x) * dir;
      if (ahead < 0 || ahead > 260) continue;
      const hops = s.hops;
      // Timed platforms switched off: wait for them.
      for (const h of hops) {
        const t = this.timed.find((n) => n.globalPosition.distanceTo(h.at) < 4 || (h.width > n.size.x && Math.abs(n.globalPosition.y - h.at.y) < 4 && n.globalPosition.x >= h.at.x - 4 && n.globalPosition.x <= h.at.x + h.width));
        if (t && !t.isSolid) return ahead < 140;
      }
      const row = hops.map((h) => this.vanishing.find((n) => n.globalPosition.distanceTo(h.at) < 4)).filter((n): n is VanishingPlatform => !!n);
      if (row.length === 0) return false;
      if (ahead > 220) return false; // close in first, then decide
      const v0 = Math.abs(p.groundSpeed);
      const arrive = (dist: number): number => {
        // Frames to cover dist from speed v0, accelerating to MAX_SPEED (or keeping a higher speed).
        if (v0 >= MAX_SPEED) return dist / v0;
        const tAcc = (MAX_SPEED - v0) / ACCEL;
        const dAcc = v0 * tAcc + 0.5 * ACCEL * tAcc * tAcc;
        if (dist <= dAcc) return (-v0 + Math.sqrt(v0 * v0 + 2 * ACCEL * dist)) / ACCEL;
        return tAcc + (dist - dAcc) / MAX_SPEED;
      };
      for (const plat of row) {
        const near = Math.abs((dir > 0 ? plat.globalPosition.x : plat.globalPosition.x + plat.size.x) - p.globalPosition.x);
        const far = Math.abs((dir > 0 ? plat.globalPosition.x + plat.size.x : plat.globalPosition.x) - p.globalPosition.x);
        const t0 = Math.floor(arrive(near)) - 16;
        const t1 = Math.ceil(arrive(far)) + 16;
        for (let t = Math.max(t0, 0); t <= t1; t++) {
          const ph = plat.phaseAt(plat.frame + t);
          if (ph !== VanishPhase.SOLID && ph !== VanishPhase.BLINK) return true;
        }
      }
      return false;
    }
    return false;
  }
}

export interface PilotRun {
  completed: boolean;
  frames: number;
  deaths: number;
  hurts: number;
  furthest: number;
  log: PilotLog[];
}

/**
 * Flies a pilot on the current scene for up to `maxFrames` physics ticks.
 * After a death, `onDeath` gives the scene to continue in (a fresh build
 * that respawns at the checkpoint, as the game does) or null to stop; at
 * most `maxDeaths` deaths are played through.
 */
export async function flyPilot(
  root: LevelRoot,
  route: RouteStep[],
  maxFrames: number,
  onDeath: (() => Promise<LevelRoot | null>) | null = null,
  maxDeaths = 0,
): Promise<PilotRun> {
  const pilot = new RoutePilot(root, route);
  let deaths = 0;
  let furthest = 0;
  let frames = 0;
  let deadFor = 0;
  for (; frames < maxFrames; frames++) {
    const p = root.player;
    if (root.isFinishing()) break;
    if (p && p.state === 'dead') {
      deadFor += 1;
      if (deadFor === 1) deaths += 1;
      if (deadFor > 30) {
        pilot.release();
        const next = deaths <= maxDeaths && onDeath ? await onDeath() : null;
        if (!next) break;
        root = next;
        pilot.bind(root);
        deadFor = 0;
      }
    } else {
      deadFor = 0;
      if (p) furthest = Math.max(furthest, p.globalPosition.x);
    }
    pilot.tick();
    tree.physicsStep();
  }
  pilot.release();
  return { completed: root.isFinishing(), frames, deaths, hurts: pilot.hurts, furthest, log: pilot.log };
}
