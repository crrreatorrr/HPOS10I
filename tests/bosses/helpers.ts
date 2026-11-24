// Helpers for the boss tests: build an arena scene, put Sproto in it, land
// hits on the open weak point, record telegraphs, and a scripted bot that
// plays a fight with the controls only.

import { GameState } from '../../src/core/game_state';
import { Layers } from '../../src/core/layers';
import { SceneRouter } from '../../src/core/scene_router';
import { Tuning } from '../../src/core/tuning';
import { Moves } from '../../src/player/moves';
import type { Player } from '../../src/player/player';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import type { LevelRoot } from '../../src/levels/common/level_root';
import { LevelTicket } from '../../src/levels/objects/ticket';
import { ScatteredTicket } from '../../src/player/scattered_ticket';
import { ArenaController } from '../../src/bosses/arena';
import type { Boss } from '../../src/bosses/boss_base';
import { press, release, releaseAll, step } from '../helpers/world';

export interface ArenaWorld {
  root: LevelRoot;
  arena: ArenaController;
  boss: Boss;
  player: Player;
  hurts: number;
}

/** Builds the arena from its scene factory, as the scene router would (no scene changes). */
export async function openArena(factory: () => Promise<LevelRoot>): Promise<ArenaWorld> {
  releaseAll();
  Tuning.reset();
  Moves.extraMovesOverride = false;
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
  GameState.resetGame();
  const root = await factory();
  root.useSceneRouter = false;
  tree.changeSceneNow(() => root);
  step(2);
  const arena = ArenaController.find(root)!;
  const world: ArenaWorld = { root, arena, boss: arena.boss, player: root.player!, hurts: 0 };
  world.player.hurtTaken.connect(() => (world.hurts += 1));
  world.player.stateChanged.connect((_o, next) => {
    if (next === 'dead') world.hurts += 1;
  });
  return world;
}

/** Feet position on the arena floor at x. */
export function floorPoint(w: ArenaWorld, x: number): Vec2 {
  return new Vec2(x, w.arena.info.floorY - Tuning.physics.height_radius);
}

/** Puts Sproto inside the arena and runs until the boss is engaged. */
export function enterArena(w: ArenaWorld, x = w.arena.info.left + 60): void {
  w.player.respawnAt(floorPoint(w, x));
  for (let i = 0; i < 10 && !w.boss.engaged; i++) step(1);
}

/** Runs until `cond` holds or `max` ticks pass; the ticks used, or -1. */
export function waitFor(cond: () => boolean, max: number, each: (() => void) | null = null): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    each?.();
    step(1);
  }
  return cond() ? max : -1;
}

/** An x on the floor away from the boss (inside the outer ledge). */
export function safeX(w: ArenaWorld): number {
  const { left, right } = w.arena.info;
  return w.boss.position.x > (left + right) / 2 ? left + 20 : right - 20;
}

/**
 * Waits for the weak point to open, then drops Sproto (jumping) onto it.
 * Tickets are topped up so stray hazards never kill him. True when a hit landed.
 */
export function landHit(w: ArenaWorld, maxWait = 3000): boolean {
  const before = w.boss.hitsTaken;
  for (let attempt = 0; attempt < 8; attempt++) {
    const topUp = (): void => {
      if (GameState.tickets < 20) GameState.addTickets(20);
      // Fell through a gap in the roof: put him back on a ledge.
      if (w.player.state !== 'dead' && w.player.globalPosition.y > w.arena.info.floorY + 4) w.player.respawnAt(floorPoint(w, safeX(w)));
    };
    if (waitFor(() => w.boss.isWeakOpen(), maxWait, topUp) < 0) return false;
    if (w.player.state === 'dead') return false;
    w.player.respawnAt(floorPoint(w, safeX(w)));
    topUp();
    step(2);
    press('jump');
    step(2);
    const weak = w.boss.weakRect();
    if (weak && w.boss.isWeakOpen()) {
      w.player.globalPosition = new Vec2(weak.center.x, weak.y - 14);
      w.player.velocity = new Vec2(0, 3);
      waitFor(() => w.boss.hitsTaken > before, 12);
    }
    release('jump');
    if (w.boss.hitsTaken > before) return true;
  }
  return false;
}

/** Telegraph and attack-start frames by attack id (FIFO per id). */
export interface TelegraphLog {
  pairs: { id: string; telegraph: number; attack: number; frames: number }[];
  unmatched: string[];
}

export function recordTelegraphs(boss: Boss): TelegraphLog {
  const log: TelegraphLog = { pairs: [], unmatched: [] };
  const pending = new Map<string, { frame: number; frames: number }[]>();
  boss.telegraphStarted.connect((id, frames) => {
    let list = pending.get(id);
    if (!list) pending.set(id, (list = []));
    list.push({ frame: tree.physicsFrames, frames });
  });
  boss.attackStarted.connect((id) => {
    const t = pending.get(id)?.shift();
    if (!t) log.unmatched.push(id);
    else log.pairs.push({ id, telegraph: t.frame, attack: tree.physicsFrames, frames: t.frames });
  });
  return log;
}

// --- The bot ----------------------------------------------------------------------

interface Threat {
  rect: Rect2;
  vel: Vec2;
  acc: Vec2;
}

type JumpMode = 'none' | 'hop' | 'full';

interface Option {
  /** The x he steers to and stops at. */
  to: number;
  /** A fixed direction instead (the run at the weak point). */
  dir?: number;
  jump: JumpMode;
  /** Frames on the ground before the jump. */
  delay: number;
}

const HORIZON = 72;
/** On the ground: no jump, or a hop or a full jump now or a little later. */
const JUMPS: readonly { jump: JumpMode; delay: number }[] = [
  { jump: 'none', delay: 0 },
  { jump: 'hop', delay: 0 },
  { jump: 'full', delay: 0 },
  { jump: 'full', delay: 8 },
  { jump: 'hop', delay: 14 },
  { jump: 'full', delay: 20 },
];

/** The direction to hold to reach `to` and stop there (braking in time). */
function steer(x: number, vx: number, grounded: boolean, to: number): number {
  const dx = to - x;
  const slow = grounded ? 0.6 : 0.2;
  if (Math.abs(dx) <= 3) return Math.abs(vx) > slow ? -Math.sign(vx) : 0;
  const stop = grounded ? vx * vx + Math.abs(vx) : (vx * vx) / (2 * 0.09375);
  if (Math.sign(vx) === Math.sign(dx) && Math.abs(dx) <= stop) return Math.abs(vx) > slow ? -Math.sign(vx) : 0;
  return Math.sign(dx);
}

/**
 * A scripted player that only uses the controls and only what a player can
 * see: the boss, its hazards, its telegraph markers and the floor. Each tick:
 *   - weak point open: run at it, jump from a short distance and steer the
 *     ball onto it from above (unless that path runs into a hazard);
 *   - otherwise it tries every simple move (stand, walk, hop or jump, left
 *     or right) against where the hazards and the boss are heading over the
 *     next 0.8 s, and takes the one that stays clear of them, out of the
 *     marked zones and on the floor, closest to where it wants to wait:
 *     a short run from the boss, or on a loose ticket when it carries few.
 * `seed` shifts where it waits, so repeated attempts differ like a player's.
 */
export class BossBot {
  private last = new Map<unknown, Rect2>();
  private lastVel = new Map<unknown, Vec2>();
  private jumpHeld = 0;
  private dirHeld = 0;
  private home: number | null = null;
  private floorMap: boolean[] = [];
  private floorAge = 99;
  private readonly standoff: number;
  private readonly shift: number;

  constructor(
    private readonly w: ArenaWorld,
    seed = 0,
  ) {
    this.standoff = 96 + ((seed * 17) % 37);
    this.shift = ((seed * 5) % 7) - 3;
  }

  /** Frames a jump needs to lift the ball's bottom `rise` px off the floor (null: out of reach). */
  static riseFrames(rise: number): number | null {
    const v = 6.5;
    const g = 0.21875;
    const need = rise;
    const disc = v * v - 2 * g * need;
    if (disc < 0) return null;
    return (v - Math.sqrt(disc)) / g;
  }

  step(): void {
    const { boss, player } = this.w;
    const info = this.w.arena.info;
    if (player.state === 'dead') return this.apply(0, false);
    const p = player.globalPosition;
    const threats = this.trackMotion();
    this.scanFloor();
    const weak = boss.weakRect();
    const zones = boss.dangerZones().filter((z) => z.w < (info.right - info.left) * 0.8);
    // A long marked stretch is the path of the charge that follows: it ends where the marking ends.
    if (boss.currentTelegraph()) {
      this.path = zones.find((z) => z.w > 200) ?? null;
      this.pathRidden = false;
    } else if (boss.isWeakOpen() || !boss.engaged) this.path = null;
    else if (this.path) {
      // He remembers the marked path until the charge along it is over
      // (the boss came down onto it and went back up).
      const low = boss.position.y > info.floorY - 40;
      if (low) this.pathRidden = true;
      else if (this.pathRidden) this.path = null;
      if (this.path) zones.push(this.path);
    }

    if (boss.isWeakOpen() && weak && !boss.isInvincible()) {
      const dx = weak.center.x - p.x;
      let dir = 0;
      let jump = false;
      if (player.grounded) {
        const want = Math.sign(dx) * Math.min(4, Math.max(1.5, Math.abs(dx) / 14));
        const gsp = player.groundSpeed;
        dir = Math.abs(want - gsp) > 0.3 ? Math.sign(want - gsp) : 0;
        if (Math.abs(dx) < 40 + Math.abs(gsp) * 9 && Math.sign(gsp) === Math.sign(dx)) jump = true;
        if (Math.abs(dx) < 20) jump = true;
        this.gapHop = false;
        // Never walk off a ledge: hop a gap he means to cross, otherwise stop.
        if (dir !== 0 && !this.floorAt(p.x + dir * 12) && !jump) {
          if (this.floorAt(p.x + dir * 40)) {
            jump = true;
            // A gap first and the boss further on: a short hop onto the next floor, then the attack.
            this.gapHop = Math.abs(dx) > 90;
          } else dir = 0;
        }
      } else if (this.gapHop) {
        // Across the gap and down onto the floor beyond it: slow, and let go of jump early.
        const vx = player.velocity.x;
        const want = Math.sign(dx) * 1.8;
        dir = Math.abs(want - vx) > 0.2 ? Math.sign(want - vx) : 0;
        jump = this.jumpHeld > 0 && this.jumpHeld < 6;
      } else {
        const want = Math.max(-3, Math.min(3, dx / 10));
        const vx = player.velocity.x;
        dir = Math.abs(want - vx) > 0.2 ? Math.sign(want - vx) : 0;
        jump = true;
      }
      // Go for it unless a hazard is in the way (the boss itself is the target).
      const hazards = threats.filter((t) => !t.body);
      const risk = this.simulate({ to: weak.center.x, dir, jump: jump ? 'full' : 'none', delay: 0 }, hazards, [], 24, weak);
      if (risk.hitAt > 24 && !risk.fell) {
        this.debug = `attack ${dir}/${jump}`;
        return this.apply(dir, jump);
      }
    }

    // Where to wait: a short run from the boss on his own side of it (the
    // other side if the wall is in the way), or on a ticket he can pick up.
    // Only re-picked while nothing moves sideways and no telegraph runs.
    const calm = !boss.currentTelegraph() && threats.every((m) => Math.abs(m.vel.x) < 0.5);
    let home = this.home ?? p.x;
    if (!boss.engaged) home = info.left + 60;
    else if (calm || this.home === null) {
      const bx = boss.position.x;
      const side = p.x >= bx ? 1 : -1;
      const pick = bx + side * this.standoff;
      home = pick > info.left + 30 && pick < info.right - 30 ? pick : bx - side * this.standoff;
    }
    // He is settling into an opening (harmless to touch, a mark where he
    // lands): move in beside it now, there is no time once it is open.
    // (The mark where he lands to open up: narrow, and about his height.)
    const mark = zones.find((z) => z.w <= 60 && z.h >= 100 && z.h <= 140) ?? null;
    const settling = boss.engaged && boss.canHarm() && !boss.isInvincible() && !boss.currentTelegraph() && !!mark;
    if (settling && mark) {
      const side = p.x >= mark.center.x ? 1 : -1;
      home = mark.center.x + side * (mark.w / 2 + 34);
    }
    // He winds up at a wall: whatever comes along the floor, the far half
    // gives the most time (and a charge that stops short never gets there).
    const mid = (info.left + info.right) / 2;
    const windup = boss.engaged && !!boss.currentTelegraph() && Math.min(boss.position.x - info.left, info.right - boss.position.x) < 100;
    if (windup) home = mid + (mid - boss.position.x) * 0.55;
    // Never a marked spot: the nearest clear place beside it.
    for (let d = 0; d < 200 && zones.some((z) => home > z.x - 16 && home < z.right + 16); d += 8) {
      const base: number = home;
      const free = [base - d, base + d].find((x) => x > info.left + 12 && x < info.right - 12 && !zones.some((z) => x > z.x - 16 && x < z.right + 16));
      if (free !== undefined) home = free;
    }
    const tickets = this.tickets();
    if (boss.engaged && GameState.tickets < 3 && !windup) {
      // Go to the nearest one he can reach, outside the marked zones.
      let near: number | null = null;
      for (const at of tickets) {
        if (at.x < info.left + 8 || at.x > info.right - 8 || !this.floorAt(at.x) || zones.some((z) => at.x > z.x - 12 && at.x < z.right + 12)) continue;
        if (near === null || Math.abs(at.x - p.x) < Math.abs(near - p.x)) near = at.x;
      }
      if (near !== null) home = near;
    }
    this.home = home;

    // Places to go: here, the waiting spot, a few steps either way, the
    // edges of the marked zones and any ticket.
    const spots: number[] = [];
    const add = (x: number): void => {
      const at = boss.engaged ? Math.max(info.left + 10, Math.min(info.right - 10, x)) : x;
      if (spots.every((s) => Math.abs(s - at) > 6)) spots.push(at);
    };
    add(p.x);
    add(home);
    for (const d of [-130, -60, -25, 25, 60, 130]) add(p.x + d + this.shift);
    for (const z of zones) {
      add(z.x - 18);
      add(z.right + 18);
    }
    if (GameState.tickets < 5) for (const at of tickets.slice(0, 6)) add(at.x);
    let jumps: readonly { jump: JumpMode; delay: number }[];
    if (player.state === 'hurt') jumps = [{ jump: 'none', delay: 0 }];
    else if (player.grounded) jumps = JUMPS;
    else if (this.jumpHeld > 0 && !this.hopping) jumps = [{ jump: 'full', delay: 0 }, { jump: 'none', delay: 0 }];
    else jumps = [{ jump: 'none', delay: 0 }];
    const throwing = boss.position.y < info.floorY - 100 && (!!boss.currentTelegraph()?.plan.aimed || threats.some((t) => !t.body && t.vel.y > 0.5 && t.rect.center.y < info.floorY - 60));
    let best: Option = { to: p.x, jump: 'none', delay: 0 };
    let bestCost = Infinity;
    for (const to of spots) {
      for (const j of jumps) {
        const o: Option = { to, jump: j.jump, delay: j.delay };
        const r = this.simulate(o, threats, zones, HORIZON, null, tickets);
        let cost = -r.got * (GameState.tickets === 0 ? 400 : GameState.tickets < 5 ? 40 : 3);
        if (r.fell) cost += 5000;
        if (r.hitAt <= HORIZON) cost += 2000 + 40 * (HORIZON - r.hitAt);
        // A jump must be worth it: it costs more than a little, less the later it is (its target's path is surer then).
        if (player.grounded && o.jump !== 'none') cost += (o.jump === 'full' ? 44 : 40) - o.delay * 0.1;
        // He throws from up high: what comes down crosses the air, so stay low unless a gap needs a jump.
        if (player.grounded && o.jump !== 'none' && throwing) cost += 250;
        cost += r.zoneFrames * 12 + (r.inZoneAtEnd ? 600 : 0) + r.lane;
        cost += Math.abs(r.x - home) * 0.25 + Math.abs(r.soon - home) * 0.05;
        if (r.near < 80 && !settling) cost += (80 - r.near) * 2; // never linger beside the boss (unless he is settling in to open up)
        if (r.pocket) cost += 500;
        if (cost < bestCost) {
          bestCost = cost;
          best = o;
        }
      }
    }
    const dir = player.state === 'hurt' ? 0 : steer(p.x, player.grounded ? player.groundSpeed : player.velocity.x, player.grounded, best.to);
    this.debug = `to${best.to.toFixed(0)}/${best.jump}+${best.delay} c=${bestCost.toFixed(0)} home=${home.toFixed(0)}`;
    if (player.grounded && best.jump !== 'none' && best.delay === 0) this.why = this.debug + ' alt=' + JSON.stringify(this.simulate({ to: best.to, jump: 'none', delay: 0 }, threats, zones, HORIZON, null, tickets)) + ' th=' + threats.map((t) => `${t.rect.center.x.toFixed(0)},${t.rect.center.y.toFixed(0)} v${t.vel.x.toFixed(1)},${t.vel.y.toFixed(1)} a${t.acc.x.toFixed(2)}`).join('|');
    this.debug += ' WHY ' + this.why;
    let jump = best.jump !== 'none' && best.delay === 0;
    if (player.grounded) {
      // A fresh press only (after landing with the button down, let go first).
      if (this.jumpHeld > 0) jump = false;
      this.hopping = best.jump === 'hop';
    } else if (this.hopping) jump = this.jumpHeld > 0 && this.jumpHeld < 4; // a hop: let go after a few frames
    this.apply(dir, jump);
  }

  private hopping = false;
  private gapHop = false;
  private path: Rect2 | null = null;
  private pathRidden = false;
  /** The last decision (for traces). */
  debug = '';
  private why = '';

  /**
   * Plays one move forward with Sproto's own numbers (walk, jump, gravity)
   * against the threats' straight-line paths. `goal`: stop early (a success)
   * when he touches it.
   */
  private simulate(o: Option, threats: readonly (Threat & { body?: boolean })[], zones: readonly Rect2[], horizon: number, goal: Rect2 | null, pickups: readonly Vec2[] = []): { hitAt: number; fell: boolean; zoneFrames: number; inZoneAtEnd: boolean; x: number; soon: number; near: number; got: number; lane: number; pocket: boolean } {
    let soon = 0;
    const taken = new Set<Vec2>();
    const touching = new Set<Threat>();
    const landed = new Map<Threat, Vec2>();
    const { player } = this.w;
    const info = this.w.arena.info;
    const floorY = info.floorY;
    const bossX = this.w.boss.position.x;
    // The stretch between the boss and the nearest marked spot on each side of him.
    const leftEdges = zones.filter((z) => z.right <= bossX).map((z) => z.right);
    const rightEdges = zones.filter((z) => z.x >= bossX).map((z) => z.x);
    // (Only while he stands on the floor: from a perch he throws over everything.)
    const low = this.w.boss.position.y > floorY - 60;
    const laneLeft = low && leftEdges.length > 0 ? Math.max(...leftEdges) : Infinity;
    const laneRight = low && rightEdges.length > 0 ? Math.min(...rightEdges) : -Infinity;
    let laneFrames = 0;
    // The pocket between the boss and the wall behind him: no way out of it.
    const pocket = !low ? 0 : bossX - info.left < 110 ? -1 : info.right - bossX < 110 ? 1 : 0;
    let x = player.globalPosition.x;
    let y = player.globalPosition.y;
    let grounded = player.grounded;
    let vx = grounded ? player.groundSpeed : player.velocity.x;
    let vy = grounded ? 0 : player.velocity.y;
    let hw = player.getRadii().x;
    let hh = player.getRadii().y;
    const locked = player.state === 'hurt';
    let safe = player.invincibleFramesLeft();
    let held = o.jump === 'full' ? horizon : o.jump === 'hop' ? o.delay + 4 : 0;
    if (!grounded && o.jump === 'hop') held = 0;
    let mayJump = grounded && o.jump !== 'none';
    let jumped = !grounded && this.jumpHeld > 0;
    let hitAt = Infinity;
    let fell = false;
    let zoneFrames = 0;
    let inZone = false;
    let near = Infinity;
    for (let t = 1; t <= horizon; t++) {
      const dir = locked ? 0 : (o.dir ?? steer(x, vx, grounded, o.to));
      if (grounded) {
        if (mayJump && t > o.delay) {
          mayJump = false;
          grounded = false;
          jumped = true;
          vy = -6.5;
          y += hh - 14;
          hw = 7;
          hh = 14;
        } else {
          if (dir !== 0) vx = Math.sign(vx) === -dir ? vx + dir * 0.5 : Math.max(-6, Math.min(6, vx + dir * 0.046875));
          else vx -= Math.min(Math.abs(vx), 0.046875) * Math.sign(vx);
          x += vx;
          if (!this.floorAt(x)) grounded = false;
        }
      }
      if (!grounded) {
        if (jumped && t > held && vy < -4) vy = -4;
        if (dir !== 0) vx = Math.max(-6, Math.min(6, vx + dir * 0.09375));
        if (vy < 0 && vy > -4) vx -= Math.trunc(vx / 0.125) / 256;
        x += vx;
        y += vy;
        vy = Math.min(16, vy + (locked ? 0.1875 : 0.21875));
        if (vy > 0 && y + hh >= floorY) {
          if (this.floorAt(x) && y + hh < floorY + 12) {
            grounded = true;
            y = floorY - 19;
            hw = 9;
            hh = 19;
            vy = 0;
          } else if (y + hh > floorY + 12) {
            fell = true;
            break;
          }
        }
      }
      if (x - hw < info.left && this.w.boss.engaged) {
        x = info.left + hw;
        vx = 0;
      } else if (x + hw > info.right) {
        x = info.right - hw;
        vx = 0;
      }
      if (t <= 20) soon = x;
      const me = new Rect2(x - hw - 2, y - hh - 2, 2 * hw + 4, 2 * hh + 4);
      if (goal && me.intersects(goal)) break;
      if (!locked) for (const at of pickups) if (me.hasPoint(at)) taken.add(at);
      if (safe > 0) safe -= 1;
      else {
        for (const th of threats) {
          const tt = th.body ? Math.min(t, 30) : t;
          // Its path so far, carried on. The boss may speed up or slow down,
          // so everything from half to 1.3 times that far counts as taken.
          const d = th.vel.mul(t).add(th.acc.mul(0.5 * tt * tt));
          const at = (k: number): Rect2 => {
            let c = th.rect.center.add(d.mul(k));
            // What reaches the floor stays where it came down.
            const down = landed.get(th);
            if (down && k === 1) c = down;
            else if (c.y + th.rect.h / 2 > floorY) {
              c = c.withY(floorY - th.rect.h / 2);
              if (k === 1 && !th.body) landed.set(th, c);
            }
            return Rect2.centered(c, th.rect.size);
          };
          let swept = at(1).grow(2 + Math.min(4, t * 0.08));
          if (th.body) {
            const far = at(1.3);
            if (t === horizon) {
              const cx = Math.max(info.left, Math.min(info.right, far.center.x));
              near = Math.min(near, Math.max(0, Math.abs(cx - x) - th.rect.w / 2 - hw));
            }
            swept = at(0.5).merge(far).grow(2);
            const path = this.path;
            if (path && th.rect.center.x >= path.x - 8 && th.rect.center.x <= path.right + 8) {
              const x0 = Math.max(swept.x, path.x - 8);
              const x1 = Math.min(swept.right, path.right + 8);
              swept = new Rect2(x0, swept.y, Math.max(0, x1 - x0), swept.h);
            }
          }
          const hit = swept.intersects(me);
          // Already against him and not hurting: it counts once he is clear of it.
          if (t === 1 && hit) touching.add(th);
          else if (!hit) touching.delete(th);
          if (hit && !touching.has(th)) {
            hitAt = t;
            break;
          }
        }
        if (hitAt <= horizon) break;
      }
      inZone = zones.some((z) => z.intersects(me));
      if (inZone) zoneFrames += 1;
      // Between the boss and the nearest marked spot: what he throws flies through here, lowest near the spot.
      if ((x > laneLeft && x < bossX) || (x > bossX && x < laneRight)) laneFrames += y + hh < floorY - 30 ? 10 : 3;
    }
    if (this.w.boss.engaged) near = Math.min(near, Math.max(0, Math.abs(bossX - x) - 12 - hw));
    return { hitAt, fell, zoneFrames, inZoneAtEnd: inZone, x, soon, near, got: taken.size, lane: laneFrames, pocket: this.w.boss.engaged && pocket !== 0 && (x - bossX) * pocket > 0 };
  }

  /** Tickets he could pick up now: lying or bouncing within a jump of the floor. */
  private tickets(): Vec2[] {
    const floorY = this.w.arena.info.floorY;
    const out: Vec2[] = [];
    const consider = (at: Vec2): void => {
      if (at.y > floorY - 90 && at.y <= floorY) out.push(at);
    };
    for (const t of tree.getNodesInGroup<ScatteredTicket>('scattered_ticket')) if (!t.isFreed() && t.ageFrames >= 50 && t.ageFrames < 240) consider(t.globalPosition);
    for (const t of this.w.arena.objects.children) if (t instanceof LevelTicket && !t.isCollected()) consider(t.globalPosition);
    return out;
  }

  /** Samples the arena floor every 4 px (it can have gaps), refreshed a few times a second. */
  private scanFloor(): void {
    if (++this.floorAge < 4) return;
    this.floorAge = 0;
    const info = this.w.arena.info;
    const y = info.floorY;
    this.floorMap = [];
    // Floor that shakes is as good as gone.
    const loose = this.w.boss.unstableFloor();
    for (let x = info.left; x <= info.right; x += 4) {
      const solid = tree.physics.intersectRay(new Vec2(x, y - 8), new Vec2(x, y + 12), Layers.TERRAIN_SOLID) !== null;
      this.floorMap.push(solid && !loose.some((r) => x >= r.x && x <= r.right));
    }
  }

  private floorAt(x: number): boolean {
    const info = this.w.arena.info;
    if (x <= info.left || x >= info.right) return true;
    return this.floorMap[Math.round((x - info.left) / 4)] ?? true;
  }

  /** Threats with their velocity since last tick (hazards by identity, the boss as one box). */
  private trackMotion(): (Threat & { body?: boolean })[] {
    const { boss } = this.w;
    const now = new Map<unknown, Rect2>();
    if (boss.canHarm()) {
      for (const h of boss.liveHazards()) if (h.harmful) now.set(h, h.rect());
      if (!boss.isTouchSafe()) {
        // The whole boss as one box (jumps must clear all of it).
        let all: Rect2 | null = null;
        const parts = [...boss.bodyRects()];
        const weak = boss.weakRect();
        if (weak && !boss.isWeakOpen()) parts.push(weak);
        for (const r of parts) all = all ? all.merge(r) : r;
        if (all) now.set('boss', all);
      }
    }
    const out: (Threat & { body?: boolean })[] = [];
    const vels = new Map<unknown, Vec2>();
    for (const [key, r] of now) {
      const prev = this.last.get(key);
      const vel = prev ? r.center.sub(prev.center) : Vec2.ZERO;
      const before = this.lastVel.get(key);
      vels.set(key, vel);
      // A standing start or a stop is not an acceleration to carry on.
      let acc = before && before.length() > 0.05 && vel.length() > 0.05 ? vel.sub(before) : Vec2.ZERO;
      if (acc.x * vel.x < 0) acc = acc.withX(0); // slowing down: it may not stop
      if (acc.length() > 0.6) acc = acc.normalized().mul(0.6);
      out.push({ rect: r, vel, acc, body: key === 'boss' });
    }
    this.last = now;
    this.lastVel = vels;
    return out;
  }

  private apply(dir: number, jump: boolean): void {
    if (dir !== this.dirHeld) {
      if (this.dirHeld < 0) release('move_left');
      if (this.dirHeld > 0) release('move_right');
      if (dir < 0) press('move_left');
      if (dir > 0) press('move_right');
      this.dirHeld = dir;
    }
    if (jump && this.jumpHeld === 0) press('jump');
    if (!jump && this.jumpHeld > 0) release('jump');
    this.jumpHeld = jump ? this.jumpHeld + 1 : 0;
  }

  stop(): void {
    this.apply(0, false);
  }
}

/**
 * Runs the bot until the boss is defeated, Sproto dies or `maxFrames` pass.
 * With `topUp`, tickets are refilled and a fall through the roof is undone
 * (Sproto is put back on a ledge; it counts as damage).
 */
export function playWithBot(w: ArenaWorld, maxFrames: number, topUp = false, seed = 0): boolean {
  const bot = new BossBot(w, seed);
  for (let i = 0; i < maxFrames; i++) {
    if (topUp && GameState.tickets < 20) GameState.addTickets(20);
    if (topUp && w.player.state !== 'dead' && w.player.globalPosition.y > w.arena.info.floorY + 4) {
      w.hurts += 1;
      w.player.respawnAt(floorPoint(w, safeX(w)));
    }
    bot.step();
    step(1);
    if (w.boss.isDefeated) break;
    if (w.player.state === 'dead') break;
  }
  bot.stop();
  return w.boss.isDefeated;
}
