// Base for the four boss fights (docs/CONTRACTS.md "Bosses", docs/LEVELS.md
// "Bosses"). A boss takes 8 hits. It has a weak point (an area in group
// `boss_weak_point`) and a harmful body (areas in group `boss_body`), both on
// layer 9 (boss) with mask 5 (player).
//
// The fight is a loop of cycles. Each cycle chains the attacks the subclass
// plans (Difficulty.boss(zone).attacks_per_cycle of its own, plus extras such
// as a chandelier), then opens the weak point for the tuning's window:
//   - every attack is telegraphed first (visual + 'boss_telegraph'), for
//     Difficulty.telegraph(base x scale) and never under 0.35 s; an aimed
//     attack locks its target (the player's position) when the telegraph
//     STARTS, so moving away at once always avoids it;
//   - a touch on the open weak point while player.isAttacking() is a hit:
//     player.bounceOff(y, true), 'boss_hit', a flash and 1.5 s in which the
//     boss can't be hit and its body and weak point don't hurt;
//   - touching the closed weak point or the body hurts Sproto (he keeps his
//     own invincibility frames: player.hurt() ignores him while invincible);
//   - after hits 4 and 6 the boss speeds up by the tuning's escalation and
//     its phase changes (phase 1 = hits 1-4, 2 = hits 5-6, 3 = hits 7-8);
//     with `desperation`, phase 3 is the desperation phase (shorter window);
//   - nothing can hit for 2 s after the fight starts or Sproto respawns;
//   - sinking into and rising out of the opening pose, and retreating after
//     a hit, the boss is drained: touching it then does nothing (it never
//     lands on Sproto unannounced), and if it settled onto him its body
//     spares him until he steps out.
// On the 8th hit: `defeated`, then explosions ('boss_explode') with camera
// shake, then `exploded` (the arena opens its exit and ends the level).
//
// Scripts are generators that yield once per physics tick (BossScript). The
// main script runs the fight; attacks that overlap the next one run beside it.
// Movement and gaps scale with Difficulty.speedMult/intervalMult at the
// boss's D, times the escalation. Hazards (BossHazard) are children of the
// boss in world space and are cleared on defeat.

import { Audio } from '../core/audio';
import { Difficulty, type BossTuning } from '../core/difficulty';
import { FPS } from '../core/physics_constants';
import { Layers } from '../core/layers';
import { GameCamera } from '../camera/game_camera';
import { Player } from '../player/player';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { clamp, Rng } from '../runtime/math';
import { Node2D } from '../runtime/node';
import { rectShape } from '../runtime/physics';
import { Signal } from '../runtime/signal';
import { tree } from '../runtime/tree';
import { Rect2, Vec2 } from '../runtime/vec2';
import { LevelFx } from '../levels/common/level_fx';
import { PlayerArea } from '../levels/common/player_area';
import type { CurveTerrain } from '../terrain/curve_terrain';
import { BossFx } from './boss_fx';

/** A script step per physics tick. */
export type BossScript = Generator<void, void, void>;

/** Waits `frames` ticks. */
export function* waitFrames(frames: number): BossScript {
  for (let i = 0; i < frames; i++) yield;
}

/** What the arena tells its boss (world space). */
export interface ArenaInfo {
  /** The camera lock rectangle. */
  view: Rect2;
  /** Inner faces of the walls. */
  left: number;
  right: number;
  floorY: number;
  host: ArenaHost | null;
}

/** Arena services a boss may use (the Executive splits the floor). */
export interface ArenaHost {
  /** Parent for terrain pieces. */
  readonly terrain: Node2D;
  /** The arena's floor between the walls. */
  readonly floor: CurveTerrain | null;
  artZone(): string;
}

export interface AttackPlan {
  id: string;
  /** Telegraph length relative to the tuning's base telegraph (screen-filling attacks use more). */
  telegraph?: number;
  /** Locks the player's position when the telegraph starts. */
  aimed?: boolean;
  /** The next telegraph may start while this attack still runs. */
  overlap?: boolean;
  /** Frames after the attack before the next telegraph (scaled by the interval). */
  gap?: number;
  /** Variant parameter for the subclass (side, height, half...). */
  variant?: number;
}

/** A trigger area of the boss: its weak point or one part of its body. */
export class BossArea extends PlayerArea {
  private rects: Rect2[] = [];

  constructor(name: string, group: string) {
    super(name);
    this.collisionLayer = Layers.BOSS;
    this.monitorable = true;
    this.monitoring = false;
    this.addToGroup(group);
  }

  /** Sets the shapes (rectangles in the boss's local space); none = off. */
  setRects(rects: readonly Rect2[]): void {
    if (rects.length === this.rects.length && rects.every((r, i) => sameRect(r, this.rects[i]!))) return;
    this.rects = [...rects];
    this.clearShapes();
    for (const r of rects) this.addShape(rectShape(r.size, r.center));
    this.monitoring = rects.length > 0;
  }

  localRects(): readonly Rect2[] {
    return this.rects;
  }

  globalRects(): Rect2[] {
    const o = this.globalPosition;
    return this.rects.map((r) => r.translated(o));
  }
}

function sameRect(a: Rect2, b: Rect2): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * A boss projectile or hazard, in world space. Hurts Sproto on touch even
 * while he attacks (boss hazards can't be popped), unless the boss can't harm
 * right now. Moves by `vel` and `gravity`, or by its own `behave` (return
 * true to pop). `life` in frames (-1 = until popped).
 */
export class BossHazard extends PlayerArea {
  vel = Vec2.ZERO;
  gravity = 0;
  life = -1;
  age = 0;
  harmful = true;
  /** Free number for the owner's behaviour (bounces, wave index...). */
  count = 0;
  behave: ((h: BossHazard) => boolean | void) | null = null;
  look: ((g: Gfx, h: BossHazard) => void) | null = null;
  private done = false;

  constructor(
    readonly boss: Boss,
    name: string,
    readonly size: Vec2,
  ) {
    super(name);
    this.collisionLayer = Layers.HAZARDS;
    this.monitorable = true;
    this.topLevel = true;
    this.addShape(rectShape(size));
    this.addToGroup('boss_hazard');
  }

  override physicsProcess(): void {
    if (this.done) return;
    this.age += 1;
    if (this.behave) {
      if (this.behave(this) === true) {
        this.pop();
        return;
      }
    } else {
      this.vel = this.vel.withY(this.vel.y + this.gravity);
      this.position = this.position.add(this.vel);
    }
    if (this.life >= 0 && this.age >= this.life) {
      this.pop();
      return;
    }
    if (!this.harmful || !this.boss.canHarm()) return;
    for (const player of this.playersInside()) {
      if (player.state !== 'dead') player.hurt(this.globalPosition);
    }
  }

  /** World rectangle (bots, tests). */
  rect(): Rect2 {
    return Rect2.centered(this.globalPosition, this.size);
  }

  isDone(): boolean {
    return this.done;
  }

  pop(): void {
    if (this.done) return;
    this.done = true;
    this.monitoring = false;
    this.monitorable = false;
    this.boss.forgetHazard(this);
    this.queueFree();
  }

  override draw(g: Gfx): void {
    this.look?.(g, this);
  }
}

/** Draws the boss's telegraph markers in world space. */
class BossOverlay extends Node2D {
  constructor(private readonly boss: Boss) {
    super('Overlay');
    this.topLevel = true;
    this.zIndex = 40;
  }

  override draw(g: Gfx): void {
    this.boss.drawOverlay(g);
  }
}

interface Telegraph {
  plan: AttackPlan;
  frames: number;
  left: number;
  target: Vec2;
}

export abstract class Boss extends Node2D {
  static readonly HITS = 8;
  /** 0.35 s: the shortest telegraph at any difficulty. */
  static readonly MIN_TELEGRAPH_FRAMES = Math.ceil(Difficulty.MIN_TELEGRAPH * FPS);
  /** 1.5 s without taking or dealing damage after a hit (docs: 1-2 s). */
  static readonly HIT_INVINCIBLE_FRAMES = 90;
  /** Nothing can hit within 2 s of the fight starting or a respawn. */
  static readonly GRACE_FRAMES = 120;
  /** Hits after which the boss speeds up (and its phase changes). */
  static readonly ESCALATION_HITS: readonly number[] = [4, 6];
  /** Weak-point window before desperation, relative to the tuning's (desperation bosses only). */
  static readonly EARLY_WINDOW = 1.4;

  readonly hitTaken = new Signal<[number]>();
  readonly phaseChanged = new Signal<[number]>();
  readonly defeated = new Signal();
  /** After the defeat explosions: the arena opens its exit. */
  readonly exploded = new Signal();
  /** Every telegraph: attack id and its length in frames. */
  readonly telegraphStarted = new Signal<[string, number]>();
  /** The attack itself begins (the telegraph is over). */
  readonly attackStarted = new Signal<[string]>();
  /** The speed multiplier after an escalation. */
  readonly escalated = new Signal<[number]>();
  readonly weakPointOpened = new Signal();

  readonly tuning: BossTuning;
  arena: ArenaInfo;
  readonly weakPoint = new BossArea('WeakPoint', 'boss_weak_point');
  readonly body = new BossArea('Body', 'boss_body');

  hitsTaken = 0;
  /** 1 = hits 1-4, 2 = hits 5-6, 3 = hits 7-8. */
  phase = 1;
  /** Escalation multiplier (1, then x escalation after hits 4 and 6). */
  speed = 1;
  desperate = false;
  engaged = false;
  isDefeated = false;
  /** 1 right, -1 left (art). */
  facing = -1;
  /** The aimed target of the current telegraph (null when not aimed). */
  lockedTarget: Vec2 | null = null;
  protected rng: Rng;
  protected frame = 0;

  private main: BossScript | null = null;
  private side: BossScript[] = [];
  private hazards = new Set<BossHazard>();
  private telegraphNow: Telegraph | null = null;
  private weakOpen = false;
  private invFrames = 0;
  private graceFrames = 0;
  private flashFrames = 0;
  private playerWasDead = false;
  /** Sinking into or rising out of the opening pose: the boss is drained and harmless to touch. */
  private drained = false;
  /** Players it settled onto while drained: its body spares them until they step out. */
  private spared = new Set<Player>();

  constructor(
    name: string,
    readonly zoneId: string,
    seed: number,
  ) {
    super(name);
    this.addToGroup('boss');
    const tuning = Difficulty.boss(zoneId);
    if (!tuning) throw new Error(`no boss tuning for ${zoneId}`);
    this.tuning = tuning;
    this.rng = new Rng(seed);
    this.arena = { view: new Rect2(-212, -192, 424, 240), left: -196, right: 196, floorY: 0, host: null };
    this.addChild(this.weakPoint);
    this.addChild(this.body);
    this.addChild(new BossOverlay(this));
  }

  get hitsLeft(): number {
    return Boss.HITS - this.hitsTaken;
  }

  // --- Subclass hooks -----------------------------------------------------------

  /** The attacks of the next cycle (attacks_per_cycle of its own, plus extras). */
  protected abstract planCycle(): AttackPlan[];
  /** The attack after its telegraph. `target` is the locked target (or the player at telegraph start). */
  protected abstract attack(plan: AttackPlan, target: Vec2): BossScript;
  /** Moves into the opening pose (the weak point is still closed). */
  protected abstract openPose(): BossScript;
  /** Leaves the opening pose. */
  protected abstract closePose(): BossScript;
  /** Sets this tick's weak-point and body rectangles (local), from the current pose. */
  protected abstract updateShapes(): void;

  /** Before the first cycle (the grace period runs meanwhile). */
  protected *intro(): BossScript {
    yield* waitFrames(Boss.GRACE_FRAMES);
  }

  /** After a hit: back to a safe place. */
  protected *recover(): BossScript {
    yield* waitFrames(Boss.HIT_INVINCIBLE_FRAMES);
  }

  /** Called when a telegraph starts. */
  protected beginTelegraph(_plan: AttackPlan, _target: Vec2): void {}
  /** Every telegraph tick (frame counts up from 0). */
  protected telegraphStep(_plan: AttackPlan, _target: Vec2, _frame: number, _total: number): void {}
  /** Every tick of the open window. */
  protected openStep(_frame: number, _total: number): void {}
  /** Every tick of the defeat sequence. */
  protected defeatStep(_frame: number): void {}
  /** The 8th hit landed. */
  protected onFinalHit(_player: Player): void {}
  /** Where the current telegraph's attack will land (bots, overlay). World rects. */
  dangerZones(): Rect2[] {
    return [];
  }

  /** Telegraph visuals in world space (the overlay calls it every frame). */
  drawOverlay(g: Gfx): void {
    const t = this.telegraphNow;
    if (t && t.plan.aimed) BossFx.targetRing(g, t.target, this.frame);
  }

  // --- State --------------------------------------------------------------------

  isWeakOpen(): boolean {
    return this.weakOpen;
  }

  isInvincible(): boolean {
    return this.invFrames > 0;
  }

  /** True while hazards and the body can hurt (not in the grace period or after defeat). */
  canHarm(): boolean {
    return this.engaged && !this.isDefeated && this.graceFrames <= 0;
  }

  graceLeft(): number {
    return this.graceFrames;
  }

  currentTelegraph(): Readonly<Telegraph> | null {
    return this.telegraphNow;
  }

  isFlashing(): boolean {
    return this.flashFrames > 0;
  }

  /** The weak point's world rectangle, or null when it has none this pose. */
  weakRect(): Rect2 | null {
    return this.weakPoint.globalRects()[0] ?? null;
  }

  bodyRects(): Rect2[] {
    return this.body.globalRects();
  }

  /** Everything that would hurt Sproto now (world rects): bots and tests. */
  threats(): Rect2[] {
    const out: Rect2[] = [];
    if (!this.canHarm()) return out;
    for (const h of this.hazards) if (h.harmful && !h.isDone()) out.push(h.rect());
    if (this.isTouchSafe()) return out;
    out.push(...this.bodyRects());
    const weak = this.weakRect();
    if (weak && !this.weakOpen) out.push(weak);
    return out;
  }

  liveHazards(): BossHazard[] {
    return [...this.hazards].filter((h) => !h.isDone());
  }

  /** Places the boss in its arena (before it enters the tree). */
  setArena(info: ArenaInfo): void {
    this.arena = info;
    this.resetPose();
  }

  /** The waiting pose before the fight, from `arena`. */
  protected resetPose(): void {
    this.position = new Vec2(this.centerX(), this.arena.floorY - 120);
  }

  /** Starts the fight (the arena calls it when Sproto is inside). */
  engage(): void {
    if (this.engaged || this.isDefeated) return;
    this.engaged = true;
    this.graceFrames = Boss.GRACE_FRAMES;
    this.main = this.fight(false);
  }

  // --- Helpers for subclasses ---------------------------------------------------

  player(): Player | null {
    for (const p of tree.getNodesInGroup<Player>('player')) if (p.state !== 'dead' && !p.isFreed()) return p;
    return null;
  }

  /** Movement at the boss's difficulty and escalation, px/frame. */
  speedPx(base: number): number {
    return base * Difficulty.speedMult(this.tuning.d) * this.speed;
  }

  /** A gap or rest at the boss's difficulty and escalation, frames. */
  gapFrames(base: number): number {
    return Math.max(1, Math.round((base * Difficulty.intervalMult(this.tuning.d)) / this.speed));
  }

  /**
   * Telegraph frames for `scale` x the base telegraph: never under 0.35 s.
   * Escalation shortens it, except for screen-filling attacks (scale 2 and
   * up), which keep their long warning in every phase.
   */
  telegraphFrames(scale = 1): number {
    const seconds = Difficulty.telegraph(this.tuning.telegraph * scale, this.tuning.d) / (scale >= 2 ? 1 : this.speed);
    return Math.max(Boss.MIN_TELEGRAPH_FRAMES, Math.round(seconds * FPS));
  }

  /** The open window in frames: the tuning's in desperation (or without it), longer before. */
  weakWindowFrames(): number {
    const early = this.tuning.desperation && !this.desperate ? Boss.EARLY_WINDOW : 1;
    return Math.round(this.tuning.weak_window * early * FPS);
  }

  /** An x inside the arena, `inset` px from the wall on `side` (-1 left, 1 right). */
  sideX(side: number, inset: number): number {
    return side < 0 ? this.arena.left + inset : this.arena.right - inset;
  }

  centerX(): number {
    return (this.arena.left + this.arena.right) / 2;
  }

  /** Moves the boss to `to` at `speed` px/frame (one tick per yield). */
  protected *moveTo(to: Vec2, speed: number): BossScript {
    for (let guard = 0; guard < 2000; guard++) {
      const d = to.sub(this.position);
      if (Math.abs(d.x) > 0.5) this.facing = d.x > 0 ? 1 : -1;
      if (d.length() <= speed) {
        this.position = to;
        return;
      }
      this.position = this.position.add(d.normalized().mul(speed));
      yield;
    }
  }

  /** Eases the boss to `to` over `frames` ticks. */
  protected *glide(to: Vec2, frames: number): BossScript {
    const from = this.position;
    const n = Math.max(1, Math.round(frames));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.position = from.lerp(to, t * t * (3 - 2 * t));
      yield;
    }
  }

  /** Runs `script` beside the main script (it ends on its own). */
  protected runBeside(script: BossScript): void {
    this.side.push(script);
  }

  /** Telegraph markers that are not boss attacks (sub-waves, the chandelier): same signals and sound. */
  protected *subTelegraph(id: string, frames: number, step: ((frame: number) => void) | null = null): BossScript {
    const n = Math.max(Boss.MIN_TELEGRAPH_FRAMES, Math.round(frames));
    this.telegraphStarted.emit(id, n);
    LevelFx.playTelegraph();
    for (let i = 0; i < n; i++) {
      step?.(i);
      yield;
    }
    this.attackStarted.emit(id);
  }

  spawnHazard(h: BossHazard, at: Vec2): BossHazard {
    h.position = at;
    this.hazards.add(h);
    this.addChild(h);
    return h;
  }

  /** @internal hazards remove themselves when they pop. */
  forgetHazard(h: BossHazard): void {
    this.hazards.delete(h);
  }

  clearHazards(): void {
    for (const h of [...this.hazards]) h.pop();
    this.hazards.clear();
  }

  /** Colour for the art: lightened while the hit flash blinks. */
  protected tint(c: Color): Color {
    return this.flashFrames > 0 && Math.floor(this.flashFrames / 3) % 2 === 0 ? c.lerp(Color.WHITE, 0.75) : c;
  }

  protected explode(at: Vec2, size = 1): void {
    BossFx.explosion(this.parent, at, size);
  }

  // --- Main loop ----------------------------------------------------------------

  override physicsProcess(): void {
    this.frame += 1;
    if (this.graceFrames > 0) this.graceFrames -= 1;
    if (this.invFrames > 0) this.invFrames -= 1;
    if (this.flashFrames > 0) this.flashFrames -= 1;
    this.watchRespawn();
    if (this.main && this.main.next().done) this.main = null;
    if (this.side.length > 0) {
      const running = this.side.slice();
      this.side = [];
      for (const s of running) if (!s.next().done) this.side.push(s);
    }
    this.updateShapes();
    this.contact();
  }

  /** A respawn in place (dead -> alive) restarts the grace period. */
  private watchRespawn(): void {
    let dead = false;
    let any = false;
    for (const p of tree.getNodesInGroup<Player>('player')) {
      any = true;
      if (p.state === 'dead') dead = true;
    }
    if (!any) return;
    if (this.playerWasDead && !dead && this.engaged) this.graceFrames = Boss.GRACE_FRAMES;
    this.playerWasDead = dead;
  }

  /** True while touching the boss can't hurt (grace, after a hit, sinking into or out of an opening). */
  isTouchSafe(): boolean {
    return !this.canHarm() || this.invFrames > 0 || this.drained;
  }

  private contact(): void {
    if (!this.engaged || this.isDefeated) return;
    for (const player of this.weakPoint.playersInside()) {
      if (player.state === 'dead') continue;
      if (this.invFrames > 0) return;
      if (this.weakOpen && player.isAttacking()) {
        this.landHit(player);
        return;
      }
      if (!this.weakOpen && !this.isTouchSafe()) player.hurt(this.weakPoint.globalPosition);
    }
    const inside = this.body.playersInside();
    for (const p of [...this.spared]) if (!inside.includes(p)) this.spared.delete(p);
    if (this.isTouchSafe()) return;
    for (const player of inside) {
      if (player.state !== 'dead' && !this.spared.has(player)) player.hurt(this.bodyCenter());
    }
  }

  private bodyCenter(): Vec2 {
    const rects = this.bodyRects();
    return rects.length > 0 ? rects[0]!.center : this.globalPosition;
  }

  private landHit(player: Player): void {
    this.hitsTaken += 1;
    this.weakOpen = false;
    this.invFrames = Boss.HIT_INVINCIBLE_FRAMES;
    this.flashFrames = 36;
    this.telegraphNow = null;
    this.lockedTarget = null;
    const weak = this.weakRect();
    player.bounceOff(weak ? weak.center.y : this.globalPosition.y, true);
    Audio.playSfx('boss_hit');
    GameCamera.current()?.shake(3, 0.25);
    tree.hitStop(4);
    let escalated = false;
    if (Boss.ESCALATION_HITS.includes(this.hitsTaken)) {
      this.speed *= this.tuning.escalation;
      this.phase += 1;
      this.desperate = this.tuning.desperation && this.phase >= 3;
      escalated = true;
    }
    this.hitTaken.emit(this.hitsLeft);
    if (escalated) {
      this.escalated.emit(this.speed);
      this.phaseChanged.emit(this.phase);
    }
    if (this.hitsLeft <= 0) {
      this.isDefeated = true;
      this.side = [];
      this.clearHazards();
      this.onFinalHit(player);
      this.defeated.emit();
      this.main = this.defeatSequence();
      return;
    }
    this.main = this.fight(true);
  }

  private *fight(afterHit: boolean): BossScript {
    // Retreating after a hit it is harmless too (it never turns on him mid-retreat).
    this.drained = afterHit;
    if (afterHit) yield* this.recover();
    else yield* this.intro();
    this.drained = false;
    for (;;) {
      for (const plan of this.planCycle()) yield* this.runAttack(plan);
      while (this.side.length > 0) yield;
      this.drained = true;
      yield* this.openPose();
      this.updateShapes();
      this.spared = new Set(this.body.playersInside());
      this.drained = false;
      yield* this.opening();
      this.drained = true;
      yield* this.closePose();
      this.drained = false;
    }
  }

  private *runAttack(plan: AttackPlan): BossScript {
    const frames = this.telegraphFrames(plan.telegraph ?? 1);
    const player = this.player();
    const target = player ? player.globalPosition : new Vec2(this.centerX(), this.arena.floorY - 19);
    this.lockedTarget = plan.aimed ? target : null;
    this.telegraphNow = { plan, frames, left: frames, target };
    this.telegraphStarted.emit(plan.id, frames);
    Audio.playSfx('boss_telegraph');
    this.beginTelegraph(plan, target);
    for (let i = 0; i < frames; i++) {
      if (this.telegraphNow) this.telegraphNow.left = frames - i;
      this.telegraphStep(plan, target, i, frames);
      yield;
    }
    this.telegraphNow = null;
    this.lockedTarget = null;
    this.attackStarted.emit(plan.id);
    const script = this.attack(plan, target);
    if (plan.overlap) this.runBeside(script);
    else yield* script;
    yield* waitFrames(this.gapFrames(plan.gap ?? 12));
  }

  private *opening(): BossScript {
    const frames = this.weakWindowFrames();
    this.weakOpen = true;
    this.weakPointOpened.emit();
    for (let i = 0; i < frames; i++) {
      this.openStep(i, frames);
      yield;
      if (!this.weakOpen) return;
    }
    this.weakOpen = false;
  }

  private *defeatSequence(): BossScript {
    this.telegraphNow = null;
    for (let i = 0; i < 120; i++) {
      if (i % 8 === 0) {
        const off = new Vec2(this.rng.randfRange(-28, 28), this.rng.randfRange(-56, 0));
        this.explode(this.globalPosition.add(off), 0.8);
        Audio.playSfx('boss_explode');
        GameCamera.current()?.shake(2.5, 0.2);
      }
      this.defeatStep(i);
      yield;
    }
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6;
      this.explode(this.globalPosition.add(new Vec2(Math.cos(a) * 18, -28 + Math.sin(a) * 18)), 1.6);
    }
    Audio.playSfx('boss_explode');
    GameCamera.current()?.shake(6, 0.6);
    this.visible = false;
    yield* waitFrames(40);
    this.exploded.emit();
  }

  /** Shared clamp: an x kept `margin` px inside the walls. */
  protected clampX(x: number, margin: number): number {
    return clamp(x, this.arena.left + margin, this.arena.right - margin);
  }
}
