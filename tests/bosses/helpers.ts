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

/**
 * A scripted player that only uses the controls. Each tick:
 *   - weak point open: run at it, jump from a short distance and steer the
 *     ball onto it from above;
 *   - a telegraphed landing zone over him: run out of it;
 *   - something low coming at him: jump it in time;
 *   - otherwise wait away from the boss.
 */
export class BossBot {
  private last = new Map<unknown, Rect2>();
  private lastVel = new Map<unknown, Vec2>();
  private jumpHeld = 0;
  private dirHeld = 0;
  private home: number | null = null;
  private hop = false;

  constructor(private readonly w: ArenaWorld) {}

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
    const me = Rect2.centered(p, player.getRadii().mul(2));
    let dir = 0;
    let jump = false;

    const weak = boss.weakRect();
    const motion = this.trackMotion();
    if (boss.isWeakOpen() && weak && !boss.isInvincible()) {
      const dx = weak.center.x - p.x;
      if (player.grounded) {
        const want = Math.sign(dx) * Math.min(4, Math.max(1.5, Math.abs(dx) / 14));
        const gsp = player.groundSpeed;
        dir = Math.abs(want - gsp) > 0.3 ? Math.sign(want - gsp) : 0;
        if (Math.abs(dx) < 40 + Math.abs(gsp) * 9 && Math.sign(gsp) === Math.sign(dx)) jump = true;
        if (Math.abs(dx) < 20) jump = true;
      } else {
        const want = Math.max(-3, Math.min(3, dx / 10));
        const vx = player.velocity.x;
        dir = Math.abs(want - vx) > 0.2 ? Math.sign(want - vx) : 0;
        jump = true;
      }
    } else {
      // Wait 120 px from the boss on his own side of it (the other side
      // if the wall is in the way). Only re-picked while nothing moves
      // sideways and no telegraph runs.
      const calm = !boss.currentTelegraph() && motion.every((m) => Math.abs(m.vel.x) < 0.5);
      if (calm || this.home === null) {
        const bx = boss.position.x;
        const side = p.x >= bx ? 1 : -1;
        const pick = bx + side * 120;
        this.home = pick > info.left + 30 && pick < info.right - 30 ? pick : bx - side * 120;
      }
      dir = Math.abs(this.home - p.x) > 12 && calm ? Math.sign(this.home - p.x) : 0;
      const zones = boss.dangerZones().filter((z) => z.w < (info.right - info.left) * 0.8);
      const hit = (x: number): boolean => zones.some((z) => x + me.w / 2 + 5 > z.x && x - me.w / 2 - 5 < z.right);
      if (hit(p.x)) {
        // Run to the nearest x out of every marked zone (never past the boss).
        const bx = boss.position.x;
        const low = boss.bodyRects().some((r) => r.bottom > info.floorY - 60);
        const ok = (x: number): boolean =>
          x > info.left + 10 && x < info.right - 10 && !hit(x) && (!low || ((x - bx) * (p.x - bx) > 0 && Math.abs(x - bx) > 36));
        for (let d = 8; d < info.right - info.left; d += 8) {
          if (ok(p.x - d)) {
            dir = -1;
            break;
          }
          if (ok(p.x + d)) {
            dir = 1;
            break;
          }
        }
      }
      if (player.grounded) {
        const coming = motion.filter((m) => (m.rect.center.x < p.x ? m.vel.x : -m.vel.x) > 0.4 && m.rect.bottom > info.floorY - 36 && Math.abs(m.rect.center.x - p.x) < 140);
        for (const m of motion) {
          const toward = m.rect.center.x < p.x ? m.vel.x : -m.vel.x;
          if (toward <= 0.4 || m.rect.bottom < info.floorY - 36) continue;
          const closing = toward + (m.rect.center.x < p.x ? -player.velocity.x : player.velocity.x);
          const gap = Math.max(m.rect.x - me.right, me.x - m.rect.right, 0);
          const rise = info.floorY - m.rect.y + 2;
          const t = BossBot.riseFrames(rise);
          if (t === null || closing <= 0) continue;
          // Time to contact, counting the threat's own acceleration towards him.
          const acc = Math.max(0, m.rect.center.x < p.x ? m.acc.x : -m.acc.x);
          const lead = t + 4;
          if (gap <= closing * lead + 0.5 * acc * lead * lead) {
            jump = true;
            // A short hop for small things (back down in time for the next one).
            if (this.jumpHeld === 0) this.hop = m.rect.w < 10 && rise < 30 && coming.length <= 1;
          }
        }
      } else if (this.jumpHeld > 0) {
        jump = !this.hop || this.jumpHeld < 5;
      }
    }
    if (!boss.isWeakOpen()) {
      // Don't walk into a marked zone.
      const zones = boss.dangerZones().filter((z) => z.w < (info.right - info.left) * 0.8);
      const inside = (x: number): boolean => zones.some((z) => x + me.w / 2 + 3 > z.x && x - me.w / 2 - 3 < z.right);
      if (dir !== 0 && !inside(p.x) && inside(p.x + dir * 6)) dir = 0;
      if (player.grounded && dir === 0 && Math.abs(player.groundSpeed) > 0.6) dir = -Math.sign(player.groundSpeed); // brake
    }
    if (!player.grounded && player.velocity.y > 0 && !this.floorAt(p.x + player.velocity.x * 6)) {
      // Falling towards a gap: steer to the nearest floor.
      for (let d = 4; d < 80; d += 4) {
        if (this.floorAt(p.x - d)) {
          dir = -1;
          break;
        }
        if (this.floorAt(p.x + d)) {
          dir = 1;
          break;
        }
      }
    }
    // Never walk off a ledge: hop a gap he means to cross, otherwise stop.
    if (player.grounded && dir !== 0 && !this.floorAt(p.x + dir * 12) && !jump) {
      if (this.floorAt(p.x + dir * 40)) jump = true;
      else dir = 0;
    }
    this.apply(dir, jump);
  }

  private floorAt(x: number): boolean {
    const y = this.w.arena.info.floorY;
    return tree.physics.intersectRay(new Vec2(x, y - 8), new Vec2(x, y + 12), Layers.TERRAIN_SOLID) !== null;
  }

  /** Threats with their velocity since last tick (hazards by identity, body parts by index). */
  private trackMotion(): { rect: Rect2; vel: Vec2; acc: Vec2 }[] {
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
    const out: { rect: Rect2; vel: Vec2; acc: Vec2 }[] = [];
    const vels = new Map<unknown, Vec2>();
    for (const [key, r] of now) {
      const prev = this.last.get(key);
      const vel = prev ? r.center.sub(prev.center) : Vec2.ZERO;
      const before = this.lastVel.get(key);
      vels.set(key, vel);
      out.push({ rect: r, vel, acc: before ? vel.sub(before) : Vec2.ZERO });
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
export function playWithBot(w: ArenaWorld, maxFrames: number, topUp = false): boolean {
  const bot = new BossBot(w);
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
