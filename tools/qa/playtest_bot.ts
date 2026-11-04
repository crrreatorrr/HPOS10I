// QA playtest bot (port of tools/qa/playtest_bot.gd, with the pilot of
// tests/levels/inputs/record_act_run.gd). Owned by QA. Plays an act headless
// in the shared tree: it builds the level from its JSON, drives Sproto only
// through Input.actionPress / actionRelease, steps tree.physicsStep() and
// reports the finish frame, deaths, stuck periods and what blocked it.
//
// Deaths go through the real flow: LevelRoot asks for a respawn, the bot
// takes a life (refilled so a long run never ends in game over), restarts
// from the checkpoint like SceneRouter.respawn() and rebuilds the act.
//
// Policies:
//   runner  the Godot bot: hold right; on the floor jump when blocked or every
//           `jumpEvery` frames; spin dash after 2 s without progress
//   pilot   runner plus a look ahead: jumps pits, steps, pellets and enemies
//           (rolls through walkers at speed), rolls into breakable walls and
//           item boxes, backs off for a run-up when it creeps up a slope (and
//           turns round early with an enemy behind), and when stuck in place
//           escalates: spin dash, run-up and running jump, spin dash, longer run-up
//   none    sends nothing (replay a Dev timeline with `timeline`)
//
// Frame 0 is the first tick the act is the current scene (Dev's timeline clock).

import { Dev } from '../../src/core/dev';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Settings } from '../../src/core/settings';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { LevelRoot } from '../../src/levels/common/level_root';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import { BreakableWall } from '../../src/levels/objects/breakable_wall';
import { ItemBox } from '../../src/levels/objects/item_box';
import { FLOOR, type Player } from '../../src/player/player';
import { Input, type Action } from '../../src/runtime/input';
import { Node, ProcessMode, type Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';

const FPS = 60;
const STUCK_LOG_FRAMES = 300; // > 5 s without x progress = a logged stuck period
const SPINDASH_AFTER_FRAMES = 120; // > 2 s without progress = spin dash
const WALL_WINDOW = 10;
const STALL_WINDOW = 120;
const JUMP_HOLD_FRAMES = 20;
const SHORT_HOP = 8;
const FEET = 19;
/** Solid terrain, path A and top-only (the floor Sproto runs on from the start). */
const TERRAIN = 1 | 2 | 8;
const SOURCE = 'bot';
const ACTIONS: Action[] = ['move_left', 'move_right', 'move_up', 'move_down', 'jump'];

export type Policy = 'runner' | 'pilot' | 'none';

export interface BotOptions {
  data: LevelData;
  zone: string;
  stage: number;
  policy?: Policy;
  /** Physics frames to run (default 45000: the 10:00 time limit plus respawn waits). */
  frames?: number;
  /** Runner: also jump every N frames (0 = off). */
  jumpEvery?: number;
  /** Settings.data.itemBoxes for this run (default on). */
  itemBoxes?: boolean;
  /** A Dev input timeline to replay ({events: [[frame, action, pressed]]}). */
  timeline?: unknown;
  /** Stop at the first death (timeline replays). */
  stopOnDeath?: boolean;
  /** Called every tick after the step (tests watching features). */
  onTick?: (frame: number, root: LevelRoot, player: Player) => void;
}

export interface StuckPeriod {
  start: number;
  end: number;
  seconds: number;
  x: number;
  y: number;
  state: string;
  /** The nearest unbroken item box within 320 px of Sproto when the stall was logged. */
  box: { x: number; y: number; distance: number } | null;
}

export interface BotResult {
  zone: string;
  stage: number;
  policy: Policy;
  jumpEvery: number;
  itemBoxes: boolean;
  frames: number;
  completed: boolean;
  /** Frame (since the act first became current) on which the goal was reached; -1 = never. */
  completedFrame: number;
  /** GameState.levelTime at the goal (the act timer: resumes from the checkpoint after a death). */
  levelTime: number;
  timeOver: boolean;
  deaths: { frame: number; x: number; y: number; cause: string }[];
  stuck: StuckPeriod[];
  longestNoProgress: number;
  maxX: number;
  start: { x: number; y: number };
  final: { x: number; y: number; state: string };
  jumps: number;
  spindashes: number;
  backoffs: number;
  rolls: number;
  inputsSent: number;
  boxesPlaced: number;
  boxesBroken: number;
  nanFrames: number;
  stateFrames: Record<string, number>;
  /** The timeline frame Dev reports for the goal (replays). */
  devCompletedFrame: number;
}

/** Ticks the run clock like the game's GameClock autoload. */
class BotClock extends Node {
  constructor() {
    super('BotClock');
    this.processMode = ProcessMode.PAUSABLE;
  }

  override physicsProcess(delta: number): void {
    GameState.tick(delta);
  }
}

let clock: BotClock | null = null;

function ensureAutoloads(): void {
  if (!Dev.isInsideTree()) tree.addAutoload(Dev);
  if (!clock || !clock.isInsideTree()) clock = tree.addAutoload(new BotClock());
}

/** Plays one act and reports. */
export async function playAct(opts: BotOptions): Promise<BotResult> {
  const bot = new Bot(opts);
  return bot.run();
}

class Bot {
  private readonly policy: Policy;
  private readonly maxFrames: number;
  private readonly jumpEvery: number;
  private readonly itemBoxes: boolean;

  private frame = 0;
  private readonly trace = typeof process !== 'undefined' && !!process.env.BOT_TRACE;
  private readonly traceAll = typeof process !== 'undefined' && process.env.BOT_TRACE === 'all';
  private queue: [number, Action, boolean][] = [];
  private held = new Set<Action>();
  private root: LevelRoot | null = null;
  private player: Player | null = null;
  private respawnPending = false;
  private completedFrame = -1;
  private levelTimeAtGoal = 0;
  private timeOver = false;

  private startPos = Vec2.ZERO;
  private maxX = -Infinity;
  private lifeBestX = -Infinity;
  private sinceProgress = 0;
  private longest = 0;
  private stuckOpen: StuckPeriod | null = null;
  private stuck: StuckPeriod[] = [];
  private xHistory: number[] = [];
  private window: number[] = [];
  private busyUntil = 0;
  private nextSpindash = 0;
  private creepFrames = 0;
  private noHopUntil = 0;
  private airborne = false;
  private stallLevel = 0;
  /** A pilot spin dash being set up (settle, then crouch), with its deadline. */
  private backingUntil = 0;
  private dash: { phase: 'settle' | 'crouch'; until: number; since: number } | null = null;

  private deaths: BotResult['deaths'] = [];
  private deathLatched = false;
  private lastHurt = '';
  private jumps = 0;
  private spindashes = 0;
  private backoffs = 0;
  private rolls = 0;
  private inputsSent = 0;
  private boxesPlaced = 0;
  private nanFrames = 0;
  private stateFrames: Record<string, number> = {};
  private brokenBoxes = new Set<string>();

  constructor(private readonly opts: BotOptions) {
    this.policy = opts.policy ?? (opts.timeline ? 'none' : 'pilot');
    this.maxFrames = opts.frames ?? 45000;
    this.jumpEvery = opts.jumpEvery ?? 240;
    this.itemBoxes = opts.itemBoxes ?? true;
  }

  async run(): Promise<BotResult> {
    const savedBoxes = Settings.data.itemBoxes;
    Settings.data.itemBoxes = this.itemBoxes;
    for (const a of ACTIONS) Input.actionRelease(a, SOURCE);
    ensureAutoloads();
    SceneRouter.zoneId = this.opts.zone;
    SceneRouter.stage = this.opts.stage;
    SceneRouter.freeScene = '';
    GameState.resetGame();
    GameState.startLevel(this.opts.zone, this.opts.stage);
    const completed = (): void => {
      if (this.completedFrame < 0) {
        this.completedFrame = this.frame;
        this.levelTimeAtGoal = GameState.levelTime;
      }
    };
    GameState.levelCompleted.connect(completed);
    try {
      await this.load();
      Dev.completedAtFrame = -1;
      Dev.play(this.opts.timeline ?? { events: [] }, '');
      while (this.frame < this.maxFrames) {
        if (this.respawnPending) await this.respawn();
        const f = this.frame;
        this.runQueue(f);
        const player = this.player;
        if (player && !player.isFreed()) {
          this.observe(f, player);
          if (this.policy !== 'none' && this.completedFrame < 0) this.decide(f, player);
        }
        tree.physicsStep();
        this.frame++;
        if (player && this.root && this.opts.onTick) this.opts.onTick(f, this.root, player);
        if (this.trace && (f % 10 === 0 || this.traceAll) && player) {
          process.stderr.write(`trace f${f} x=${player.globalPosition.x.toFixed(0)} y=${player.globalPosition.y.toFixed(0)} ${player.state} gs=${player.groundSpeed.toFixed(2)} g=${player.grounded} m=${player.collisionMode} held=${[...this.held].join('+')} busy=${this.busyUntil}\n`);
        }
        if (this.completedFrame >= 0) break;
        if (this.opts.stopOnDeath && this.deaths.length > 0) break;
      }
    } finally {
      GameState.levelCompleted.disconnect(completed);
      for (const a of ACTIONS) Input.actionRelease(a, SOURCE);
      Dev.play({ events: [] }, '');
      for (const a of ACTIONS) Input.actionRelease(a, 'timeline');
      Settings.data.itemBoxes = savedBoxes;
    }
    this.closeStuck(this.frame);
    const p = this.player;
    return {
      zone: this.opts.zone,
      stage: this.opts.stage,
      policy: this.policy,
      jumpEvery: this.jumpEvery,
      itemBoxes: this.itemBoxes,
      frames: this.frame,
      completed: this.completedFrame >= 0,
      completedFrame: this.completedFrame,
      levelTime: this.completedFrame >= 0 ? this.levelTimeAtGoal : GameState.levelTime,
      timeOver: this.timeOver,
      deaths: this.deaths,
      stuck: this.stuck,
      longestNoProgress: this.longest,
      maxX: this.maxX,
      start: { x: this.startPos.x, y: this.startPos.y },
      final: p ? { x: p.globalPosition.x, y: p.globalPosition.y, state: p.state } : { x: NaN, y: NaN, state: '(none)' },
      jumps: this.jumps,
      spindashes: this.spindashes,
      backoffs: this.backoffs,
      rolls: this.rolls,
      inputsSent: this.inputsSent,
      boxesPlaced: this.boxesPlaced,
      boxesBroken: this.brokenBoxes.size,
      nanFrames: this.nanFrames,
      stateFrames: this.stateFrames,
      devCompletedFrame: Dev.completedAtFrame,
    };
  }

  // --- Level, deaths and respawns ----------------------------------------------------

  private async load(): Promise<void> {
    const root = (await buildLevel(this.opts.data)) as LevelRoot;
    root.useSceneRouter = false;
    root.respawnRequested.connect(() => (this.respawnPending = true));
    tree.changeSceneNow(() => root);
    this.root = root;
    this.boxesPlaced = Math.max(this.boxesPlaced, root.findChildren((n) => n instanceof ItemBox).length);
    const player = root.player;
    this.player = player;
    if (!player) return;
    if (this.maxX === -Infinity) this.startPos = player.globalPosition;
    this.lifeBestX = player.globalPosition.x;
    this.sinceProgress = 0;
    this.xHistory = [];
    this.window = [];
    this.stallLevel = 0;
    this.dash = null;
    this.deathLatched = false;
    this.busyUntil = 0;
    this.closeStuck(this.frame);
    player.hurtTaken.connect(() => (this.lastHurt = this.nearestThreat(player)));
    player.stateChanged.connect((_old, next) => {
      if (next === 'dead') this.recordDeath(player);
    });
  }

  private async respawn(): Promise<void> {
    this.respawnPending = false;
    GameState.loseLife();
    if (GameState.lives < 3) {
      GameState.lives = 3;
    }
    GameState.restartFromCheckpoint();
    // Scripted moves restart; the policy presses right again on the new life.
    this.queue = [];
    for (const a of [...this.held]) this.send(a, false);
    await this.load();
  }

  private recordDeath(player: Player): void {
    if (this.deathLatched) return;
    this.deathLatched = true;
    const pos = player.globalPosition;
    let cause = this.lastHurt || 'unknown';
    if (GameState.levelTime >= 600 - 1e-6) {
      cause = 'time over';
      this.timeOver = true;
    } else if (this.root && pos.y - player.getRadii().y > this.root.getBounds().bottom) {
      cause = 'pit';
    }
    this.deaths.push({ frame: this.frame, x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, cause });
    this.lastHurt = '';
  }

  /** What most likely hurt Sproto: the nearest enemy or hazard. */
  private nearestThreat(player: Player): string {
    const at = player.globalPosition;
    let best = '';
    let bestD = 96;
    for (const n of tree.allNodes()) {
      if (!(n instanceof Enemy) && !n.isInGroup('pellets') && !/Spikes|Candle|Beam|Book|Shelf|Bookshelf|Door/.test(n.constructor.name)) continue;
      const d = (n as Node2D).globalPosition.distanceTo(at);
      if (d < bestD) {
        bestD = d;
        best = `${n.constructor.name} ${n.name}`;
      }
    }
    return best || 'hazard';
  }

  // --- Observation ---------------------------------------------------------------------

  private observe(f: number, p: Player): void {
    const pos = p.globalPosition;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(p.velocity.x) || !Number.isFinite(p.velocity.y)) {
      this.nanFrames++;
      return;
    }
    this.stateFrames[p.state] = (this.stateFrames[p.state] ?? 0) + 1;
    for (const b of this.root?.findChildren<ItemBox>((n) => n instanceof ItemBox) ?? []) {
      if (b.isBroken()) this.brokenBoxes.add(`${b.globalPosition.x},${b.globalPosition.y}`);
    }
    this.maxX = Math.max(this.maxX, pos.x);
    if (pos.x > this.lifeBestX + 1) {
      this.lifeBestX = pos.x;
      this.sinceProgress = 0;
      this.stallLevel = 0;
      this.closeStuck(f);
    } else {
      this.sinceProgress++;
      this.longest = Math.max(this.longest, this.sinceProgress);
      if (this.sinceProgress === STUCK_LOG_FRAMES) {
        this.stuckOpen = { start: f - STUCK_LOG_FRAMES, end: f, seconds: 0, x: round1(pos.x), y: round1(pos.y), state: p.state, box: this.boxAhead(p) };
      }
    }
    this.xHistory.push(pos.x);
    if (this.xHistory.length > WALL_WINDOW) this.xHistory.shift();
    this.window.push(pos.x);
    if (this.window.length > STALL_WINDOW) this.window.shift();
  }

  /** Stuck in place: no new best x for 2 s and less than 64 px of travel in the last 2 s (or 10 s without a new best). */
  private stalled(): boolean {
    if (this.sinceProgress < SPINDASH_AFTER_FRAMES) return false;
    if (this.sinceProgress >= 600) return true;
    if (this.window.length < STALL_WINDOW) return false;
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of this.window) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return hi - lo < 64;
  }

  /** An enemy (or pellet) within `reach` px behind Sproto at about his height. */
  private threatBehind(p: Player, reach: number): boolean {
    const at = p.globalPosition;
    const near = (n: Node2D): boolean => {
      const d = n.globalPosition.sub(at);
      return d.x < 0 && d.x > -reach && Math.abs(d.y) < 120;
    };
    return tree.getNodesInGroup<Enemy>('enemies').some((e) => e.alive && near(e)) || tree.getNodesInGroup<Node2D>('pellets').some(near);
  }

  private closeStuck(f: number): void {
    if (!this.stuckOpen) return;
    this.stuckOpen.end = f;
    this.stuckOpen.seconds = Math.round(((f - this.stuckOpen.start) / FPS) * 100) / 100;
    this.stuck.push(this.stuckOpen);
    this.stuckOpen = null;
  }

  /** The nearest unbroken item box within 320 px of Sproto, or null. */
  private boxAhead(p: Player): { x: number; y: number; distance: number } | null {
    const at = p.globalPosition;
    let best: { x: number; y: number; distance: number } | null = null;
    for (const b of this.root?.findChildren<ItemBox>((n) => n instanceof ItemBox) ?? []) {
      if (b.isBroken()) continue;
      const d = b.globalPosition.distanceTo(at);
      if (d < 320 && (!best || d < best.distance)) best = { x: b.globalPosition.x, y: Math.round(b.globalPosition.y), distance: Math.round(d) };
    }
    return best;
  }

  private onFloor(p: Player): boolean {
    return p.grounded && p.collisionMode === FLOOR;
  }

  // --- Policies ------------------------------------------------------------------------

  private decide(f: number, p: Player): void {
    if (p.state === 'dead') return;
    if (this.policy === 'runner') this.runner(f, p);
    else this.pilot(f, p);
  }

  /** The Godot bot's runner policy, unchanged. */
  private runner(f: number, p: Player): void {
    if (f < this.busyUntil) return;
    if (!this.held.has('move_right')) this.schedule(f, 'move_right', true);
    if (!this.onFloor(p)) return;
    if (this.sinceProgress >= SPINDASH_AFTER_FRAMES && f >= this.nextSpindash) {
      this.spindash(f);
      return;
    }
    if (this.blocked(p) || (this.jumpEvery > 0 && f > 0 && f % this.jumpEvery === 0)) this.jump(f, JUMP_HOLD_FRAMES);
  }

  private blocked(p: Player): boolean {
    const slow = Math.abs(p.groundSpeed) < 0.5;
    return slow && this.xHistory.length === WALL_WINDOW && Math.abs(this.xHistory[WALL_WINDOW - 1]! - this.xHistory[0]!) < 0.5;
  }

  /** Runner plus a look ahead (record_act_run.gd's pilot) and stall recovery. */
  private pilot(f: number, p: Player): void {
    if (!p.grounded) {
      this.airborne = true;
      return;
    }
    if (this.airborne) {
      this.airborne = false;
      this.busyUntil = Math.max(this.busyUntil, f + 3);
    }
    if (this.backingUntil > f && this.threatBehind(p, 80)) {
      // An enemy close behind: turn round now (a shorter run-up).
      this.queue = this.queue.filter(([, a]) => a !== 'move_left' && a !== 'move_right' && a !== 'jump');
      this.send('move_left', false);
      this.send('jump', false);
      this.send('move_right', true);
      this.backingUntil = 0;
      this.busyUntil = f + 1;
    }
    if (f < this.busyUntil || p.state === 'hurt') return;
    if (!this.held.has('move_right')) this.schedule(f, 'move_right', true);
    if (!this.onFloor(p)) return; // never jump off a wall, a loop or a ceiling
    const pos = p.globalPosition;
    const gs = p.groundSpeed;
    const angle = wrap180(p.groundAngle);
    const onSlope = Math.abs(angle) > 5;
    const flat = Math.abs(angle) < 5;

    // A spin dash in progress: settle to a standstill facing right on flat floor, crouch, charge.
    if (this.dash) {
      this.dashStep(f, p, flat);
      return;
    }
    // Stuck in place: escalate (spin dash, a run-up and a running jump, spin dash, a longer run-up).
    if (this.stalled() && f >= this.nextSpindash) {
      this.stallLevel++;
      const step = this.stallLevel % 4;
      if (step === 1 || step === 3) this.requestSpindash(f, p);
      else if (step === 2) this.backOff(f, 60 + 20 * Math.min(this.stallLevel, 8), true);
      else this.backOff(f, 120 + 30 * Math.min(this.stallLevel, 8), false);
      this.nextSpindash = Math.max(this.busyUntil, this.dashDeadline()) + 30;
      return;
    }
    // Blocked by a wall on flat floor: hop (the runner's rule).
    if (flat && this.blocked(p)) {
      this.jump(f, JUMP_HOLD_FRAMES);
      return;
    }
    // Creeping up a slope: back off for a run-up when the way back is clear.
    this.creepFrames = onSlope && gs < 1.5 ? this.creepFrames + 1 : 0;
    if (this.creepFrames > 45 && f >= this.noHopUntil) {
      this.creepFrames = 0;
      this.backOff(f, 80 + 40 * Math.min(this.backoffs, 3), false);
      return;
    }
    // A breakable wall ahead: roll into it.
    for (const wall of this.root?.findChildren<BreakableWall>((n) => n instanceof BreakableWall) ?? []) {
      const d = wall.globalPosition.sub(pos);
      if (!wall.isBroken() && d.x > 0 && d.x < 40 + gs * 10 && Math.abs(d.y) < 64 && gs > 2.5) {
        this.roll(f);
        return;
      }
    }
    // An item box ahead: roll through it at speed (keeps the speed), else spin dash through it.
    for (const box of this.root?.findChildren<ItemBox>((n) => n instanceof ItemBox) ?? []) {
      if (box.isBroken()) continue;
      const d = box.globalPosition.sub(pos);
      if (d.x > 0 && d.x < 24 + Math.max(gs, 1) * 8 && Math.abs(d.y - FEET) < 24) {
        if (gs >= 3) this.rollOn(f);
        else this.requestSpindash(f, p);
        return;
      }
    }
    // A step up ahead: hop it.
    if (f >= this.noHopUntil && this.stepAhead(pos, gs, flat)) {
      this.jump(f, JUMP_HOLD_FRAMES);
      return;
    }
    // A pit ahead (no floor below the spots it reaches in 4 and 8 frames, down to the pit line): jump it.
    if (gs > 1 && this.pitAhead(pos, gs)) {
      this.jump(f, JUMP_HOLD_FRAMES);
      return;
    }
    // Pellets rolling at him.
    for (const pellet of tree.getNodesInGroup<Node2D>('pellets')) {
      const d = pellet.globalPosition.sub(pos);
      if (Math.abs(d.y) < 40 && d.x > -8 && d.x < 24 + (Math.abs(gs) + 2) * 10) {
        this.jump(f, -1);
        return;
      }
    }
    // Enemies ahead: roll through walkers at speed, jump the rest.
    for (const enemy of tree.getNodesInGroup<Enemy>('enemies')) {
      if (!enemy.alive) continue;
      const d = enemy.globalPosition.sub(pos);
      const kind = enemyKind(enemy);
      const flying = kind === 'floater' || kind === 'diver';
      let reach = 20 + Math.max(gs, 1) * (flying ? 6 : 4);
      const rushing = (enemy as { isRushing?: () => boolean }).isRushing?.() ?? false;
      if (rushing) reach += 30;
      const shieldFaces = (enemy as { shieldFaces?: (pl: Player) => boolean }).shieldFaces;
      const shielded = kind === 'armored' && !!shieldFaces && shieldFaces.call(enemy, p) && gs < 4.5;
      if (kind === 'spike' || shielded) reach += 24;
      const level = flying ? d.y > -120 && d.y < 0 : Math.abs(d.y - FEET) < 40;
      if (!(d.x > 0 && d.x < reach && level)) continue;
      if ((kind === 'walker' || kind === 'chaser' || kind === 'armored') && gs >= 5 && flat) this.rollThrough(f);
      else if (kind === 'spike' || shielded || flying) this.jump(f, JUMP_HOLD_FRAMES);
      else this.jump(f, -1);
      return;
    }
    if (this.jumpEvery > 0 && f > 0 && f % this.jumpEvery === 0) this.jump(f, JUMP_HOLD_FRAMES);
  }

  private stepAhead(pos: Vec2, gs: number, flat: boolean): boolean {
    if (gs < 0 || !flat) return false;
    const reach = 20 + gs * 6;
    const low = tree.physics.intersectRay(pos.add(new Vec2(0, 12)), pos.add(new Vec2(reach, 12)), TERRAIN & ~8);
    if (!low || Math.abs(low.normal.x) < 0.9) return false;
    return !tree.physics.intersectRay(pos.add(new Vec2(0, -60)), pos.add(new Vec2(reach + 16, -60)), TERRAIN & ~8);
  }

  private pitAhead(pos: Vec2, gs: number): boolean {
    const bottom = this.root?.getBounds().bottom ?? pos.y + 400;
    const depth = Math.min(bottom - pos.y + 32, 400);
    for (const ahead of [16 + gs * 4, 16 + gs * 8]) {
      const x = pos.x + ahead;
      const hit = tree.physics.intersectRay(new Vec2(x, pos.y - 8), new Vec2(x, pos.y + depth), TERRAIN);
      if (hit) return false;
    }
    return true;
  }

  // --- Moves ---------------------------------------------------------------------------

  private jump(f: number, hold: number): void {
    const p = this.player;
    if (hold < 0) hold = p && Math.abs(p.groundSpeed) > 4 ? SHORT_HOP : JUMP_HOLD_FRAMES;
    this.jumps++;
    this.schedule(f, 'jump', true);
    this.schedule(f + hold, 'jump', false);
    this.busyUntil = f + hold + 1;
  }

  private spindash(f: number): void {
    this.spindashes++;
    this.schedule(f, 'move_right', false);
    this.schedule(f, 'move_down', true);
    for (let tap = 0; tap < 3; tap++) {
      this.schedule(f + 2 + tap * 4, 'jump', true);
      this.schedule(f + 3 + tap * 4, 'jump', false);
    }
    this.schedule(f + 16, 'move_down', false);
    this.schedule(f + 17, 'move_right', true);
    this.busyUntil = f + 18;
    this.nextSpindash = f + SPINDASH_AFTER_FRAMES + 18;
  }

  /** Runs left for `frames`, then right again (a run-up), optionally jumping on the way back. */
  private backOff(f: number, frames: number, jumpBack: boolean): void {
    this.backoffs++;
    this.backingUntil = f + frames;
    this.noHopUntil = f + frames * 3;
    this.schedule(f, 'move_right', false);
    this.schedule(f, 'move_left', true);
    this.schedule(f + frames, 'move_left', false);
    this.schedule(f + frames, 'move_right', true);
    let busy = f + frames + 2;
    if (jumpBack) {
      const at = f + frames + Math.round(frames * 0.8);
      this.schedule(at, 'jump', true);
      this.schedule(at + JUMP_HOLD_FRAMES, 'jump', false);
      busy = at + JUMP_HOLD_FRAMES + 1;
    }
    this.busyUntil = busy;
  }

  /** A roll into an enemy (right let go: a roll needs no direction held), then a hop out of it. */
  private rollThrough(f: number): void {
    this.rolls++;
    this.schedule(f, 'move_right', false);
    this.schedule(f, 'move_down', true);
    this.schedule(f + 4, 'move_down', false);
    this.schedule(f + 18, 'jump', true);
    this.schedule(f + 18 + SHORT_HOP, 'jump', false);
    this.schedule(f + 19, 'move_right', true);
    this.busyUntil = f + 20 + SHORT_HOP;
  }

  private dashDeadline(): number {
    return this.dash ? this.dash.until : 0;
  }

  /** Starts a pilot spin dash (it waits for a standstill facing right on flat floor, at most 3 s). */
  private requestSpindash(f: number, _p: Player): void {
    this.dash = { phase: 'settle', until: f + 180, since: f };
  }

  private dashStep(f: number, p: Player, flat: boolean): void {
    const dash = this.dash!;
    if (f >= dash.until) {
      this.dash = null;
      this.send('move_down', false);
      return;
    }
    if (dash.phase === 'settle') {
      if (f - dash.since > 90) {
        this.dash = null;
        this.backOff(f, 90, false);
        return;
      }
      this.send('move_down', false);
      this.send('move_left', false);
      const still = flat && Math.abs(p.groundSpeed) < 0.5;
      if (still && p.facing !== 1) {
        this.send('move_right', !this.held.has('move_right'));
        return;
      }
      this.send('move_right', false);
      if (still) {
        this.send('move_down', true);
        dash.phase = 'crouch';
        dash.since = f;
      }
      return;
    }
    // Crouch: down held until friction stops him and he crouches, then charge and release.
    if (p.crouching) {
      this.dash = null;
      this.spindashes++;
      for (let tap = 0; tap < 3; tap++) {
        this.schedule(f + tap * 4, 'jump', true);
        this.schedule(f + 1 + tap * 4, 'jump', false);
      }
      this.schedule(f + 14, 'move_down', false);
      this.schedule(f + 15, 'move_right', true);
      this.busyUntil = f + 16;
      return;
    }
    if (f - dash.since > 40 || !flat) dash.phase = 'settle';
    // Never settles on flat floor (the foot of a hill): give up and take a run-up instead.
    if (f - dash.since > 90) {
      this.dash = null;
      this.send('move_down', false);
      this.backOff(f, 90, false);
    }
  }

  /** A roll that keeps going (item boxes, loops). */
  private rollOn(f: number): void {
    this.rolls++;
    this.schedule(f, 'move_right', false);
    this.schedule(f, 'move_down', true);
    this.schedule(f + 4, 'move_down', false);
    this.schedule(f + 24, 'move_right', true);
    this.busyUntil = f + 24;
  }

  private roll(f: number): void {
    this.rolls++;
    this.schedule(f, 'move_right', false);
    this.schedule(f, 'move_down', true);
    this.schedule(f + 6, 'move_down', false);
    this.schedule(f + 30, 'move_right', true);
    this.busyUntil = f + 32;
  }

  // --- Input ---------------------------------------------------------------------------

  private schedule(at: number, action: Action, pressed: boolean): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1]![0] > at) i--;
    this.queue.splice(i, 0, [at, action, pressed]);
    if (at <= this.frame) this.runQueue(this.frame);
  }

  private runQueue(f: number): void {
    while (this.queue.length > 0 && this.queue[0]![0] <= f) {
      const [, action, pressed] = this.queue.shift()!;
      this.send(action, pressed);
    }
  }

  private send(action: Action, pressed: boolean): void {
    if (pressed === this.held.has(action)) return;
    if (pressed) {
      this.held.add(action);
      Input.actionPress(action, SOURCE);
    } else {
      this.held.delete(action);
      Input.actionRelease(action, SOURCE);
    }
    this.inputsSent++;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function wrap180(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

/** The enemy's behaviour, from its class. */
export function enemyKind(enemy: Enemy): string {
  const name = enemy.constructor.name.toLowerCase();
  let proto: object | null = Object.getPrototypeOf(enemy) as object | null;
  const chain: string[] = [name];
  while (proto && proto.constructor !== Enemy) {
    chain.push(proto.constructor.name.toLowerCase());
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  for (const n of chain) {
    if (n.includes('spike') || n === 'securitypill') return 'spike';
    if (n === 'armored' || n.includes('knight') || n.includes('bouncer')) return 'armored';
    if (n === 'diver' || n.includes('diver')) return 'diver';
    if (n === 'floater') return 'floater';
    if (n === 'chaser') return 'chaser';
    if (n === 'hopper') return 'hopper';
    if (n === 'pelletpill') return 'pellet';
    if (n === 'walker') return 'walker';
  }
  return 'other';
}

export function summaryLine(label: string, r: BotResult): string {
  const done = r.completed ? `goal at frame ${r.completedFrame} (${(r.completedFrame / FPS).toFixed(1)} s, timer ${r.levelTime.toFixed(1)} s)` : `not finished, max x ${r.maxX.toFixed(0)}, final ${r.final.state} at (${r.final.x.toFixed(0)}, ${r.final.y.toFixed(0)})`;
  const deaths = r.deaths.map((d) => `${d.cause} @x${d.x.toFixed(0)}`).join('; ');
  const stuck = r.stuck.map((s) => `x${s.x.toFixed(0)} ${s.seconds}s${s.box ? ` [box at ${s.box.x},${s.box.y}]` : ''}`).join('; ');
  return `${label} ${r.policy}${r.policy === 'none' ? '' : ` j${r.jumpEvery}`} boxes ${r.itemBoxes ? 'on' : 'off'}: ${done}, deaths ${r.deaths.length}${deaths ? ` (${deaths})` : ''}, stuck ${r.stuck.length}${stuck ? ` (${stuck})` : ''}, boxes ${r.boxesBroken}/${r.boxesPlaced}`;
}
