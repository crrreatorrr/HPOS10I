// The Executive, the final boss (docs/LEVELS.md, docs/DESIGN.md): a generic
// tall businessman in a grey suit with a briefcase and sunglasses. Very
// difficult by design: D 10, four attacks per opening, the shortest
// telegraphs (never under 0.35 s; screen-filling attacks get longer ones),
// x1.3 after hits 4 and 6, desperation. His body is the suit; his weak point
// is his head, open only while he checks his phone.
//
// Phase 1 (hits 1-4) on the rooftop floor, standing at his wall:
//   - briefcase (aimed): a ring marks where Sproto stood; the case lands
//     there and bursts into a paper storm (drifting sheets that hurt, 2 s);
//   - crash: a "market crash" of chart arrows down the arena's eight lanes,
//     in three marked waves; the two-lane gap opens around Sproto and moves
//     one lane per wave (one lane of it always stays safe);
//   - dash: a power slide along the floor to the other wall; jump it;
//   - double: two briefcases, both landings marked.
// Phase 2 (hits 5-6): the roof splits (cracks flash first) into two ledges
// by the walls and three floating platforms over a deadly drop. He rides a
// giant red chart arrow above his wall:
//   - arrow_slide: a dashed path, then he dives and slides across the
//     platforms on the arrow, knocking them loose (they respawn on a timer);
//     the ledges are never touched;
//   - storm: a briefcase whose paper storm also pushes Sproto sideways;
//   - crash and double as before.
// Desperation (hits 7-8): market crash and briefcase storms at once, the
// phone check shrinks to 0.9 s, and platforms crumble a second after you
// land on them. For the phone check he lands on the middle platform (all
// platforms come back first).
// Final hit: slow motion, his tie flies off, Sproto poses.
// Ticket refill: after hit 4 only (the arena).

import { BossSprite } from '../boss_sprites';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { clamp } from '../../runtime/math';
import { Node2D } from '../../runtime/node';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { Effects } from '../../player/effects';
import type { Player } from '../../player/player';
import { GameCamera } from '../../camera/game_camera';
import { CurveShape, CurveTerrain } from '../../terrain/curve_terrain';
import { Boss, BossHazard, waitFrames, type AttackPlan, type BossScript } from '../boss_base';
import { BossFx, OUTLINE } from '../boss_fx';
import { RoofPlatform } from './rooftop';

const STAND_INSET = 40;
const OPEN_INSET = 64;
const PERCH_INSET = 28;
const PERCH_Y = -150;
const RIDE_Y = -8;
const LANES = 8;
const CASE_GRAVITY = 0.3;
const STORM_FRAMES = 120;
const LEDGE = 56;
const PLATFORM = new Vec2(64, 16);
const GAP = 22;
const SLOW_MOTION = 0.3;
const SLOW_FRAMES = 45;

const SUIT = Color.rgb8(128, 132, 144);
const SUIT_SHADE = Color.rgb8(92, 96, 108);
const SHIRT = Color.rgb8(240, 240, 236);
const TIE = Color.rgb8(214, 40, 50);
const SKIN = Color.rgb8(226, 184, 150);
const HAIR = Color.rgb8(48, 40, 40);
const SHADES = Color.rgb8(20, 20, 28);
const CASE = Color.rgb8(122, 78, 40);
const CASE_DARK = Color.rgb8(84, 52, 26);
const PAPER = Color.rgb8(246, 246, 240);
const ARROW = Color.rgb8(226, 36, 48);
const ARROW_DARK = Color.rgb8(150, 20, 30);
const PHONE = Color.rgb8(120, 220, 255);

type Pose = 'stand' | 'slide' | 'phone' | 'ride';

/** The tie that flies off on the final hit. */
class FlyingTie extends Node2D {
  vel = new Vec2(1.5, -5);
  private age = 0;

  override physicsProcess(): void {
    this.age += 1;
    this.vel = this.vel.withY(this.vel.y + 0.12);
    this.position = this.position.add(this.vel);
    this.rotation += 0.25;
    if (this.age > 150) this.queueFree();
  }

  override draw(g: Gfx): void {
    g.polygon([new Vec2(-3, -8), new Vec2(3, -8), new Vec2(2, -5), new Vec2(4, 6), new Vec2(0, 10), new Vec2(-4, 6), new Vec2(-2, -5)], OUTLINE);
    g.polygon([new Vec2(-2, -7), new Vec2(2, -7), new Vec2(1, -5), new Vec2(3, 6), new Vec2(0, 9), new Vec2(-3, 6), new Vec2(-1, -5)], TIE);
  }
}

export class TheExecutive extends Boss {
  home = 1;
  pose: Pose = 'stand';
  /** True once the roof has split (phase 2 on). */
  split = false;
  readonly platforms: RoofPlatform[] = [];
  private cycle = 0;
  private caseTargets: Vec2[] = [];
  private caseZones: Rect2[] = [];
  private stormZones: Rect2[] = [];
  private crashMarked: number[] = [];
  private crashFalling: number[] = [];
  private gapLane = 3;
  private crackFlash = false;
  private slidePath: [Vec2, Vec2] | null = null;
  private sinkZone: Rect2 | null = null;
  private slowFrames = 0;
  private hasTie = true;

  constructor() {
    super('TheExecutive', 'z4_neon_rush_remix', 0x45584543);
  }

  protected override resetPose(): void {
    this.position = new Vec2(this.centerX(), this.arena.floorY);
    this.home = 1;
  }

  private standAt(side: number, inset = STAND_INSET): Vec2 {
    return new Vec2(this.sideX(side, inset), this.arena.floorY);
  }

  private perchAt(side: number): Vec2 {
    return new Vec2(this.sideX(side, PERCH_INSET), this.arena.floorY + PERCH_Y);
  }

  laneRect(i: number): Rect2 {
    const w = (this.arena.right - this.arena.left) / LANES;
    const top = this.arena.view.y;
    return new Rect2(this.arena.left + i * w, top, w, this.arena.floorY - top);
  }

  // --- Plans --------------------------------------------------------------------

  protected override *intro(): BossScript {
    yield* this.glide(this.standAt(this.home), Boss.GRACE_FRAMES);
  }

  protected planCycle(): AttackPlan[] {
    const briefcase: AttackPlan = { id: 'briefcase', aimed: true };
    const double: AttackPlan = { id: 'double', aimed: true, telegraph: 1.3 };
    const crash: AttackPlan = { id: 'crash', telegraph: 2.2 };
    const dash: AttackPlan = { id: 'dash', telegraph: 1.6 };
    const slide: AttackPlan = { id: 'arrow_slide', telegraph: 3.5 };
    const storm: AttackPlan = { id: 'storm', aimed: true };
    const sets: AttackPlan[][] =
      this.phase === 1
        ? [
            [briefcase, crash, dash, double],
            [crash, double, briefcase, dash],
            [double, dash, crash, briefcase],
          ]
        : this.phase === 2
          ? [
              [slide, storm, crash, double],
              [storm, slide, double, crash],
            ]
          : [
              [{ ...crash, overlap: true, gap: 4 }, storm, slide, double],
              [slide, { ...crash, overlap: true, gap: 4 }, storm, double],
            ];
    const plans = sets[this.cycle % sets.length]!;
    this.cycle += 1;
    return plans;
  }

  // --- Telegraphs ---------------------------------------------------------------

  protected override beginTelegraph(plan: AttackPlan, target: Vec2): void {
    switch (plan.id) {
      case 'briefcase':
      case 'storm':
        this.aimCases([target.x]);
        break;
      case 'double': {
        const away = target.x > this.centerX() ? -1 : 1;
        this.aimCases([target.x, target.x + away * 88]);
        break;
      }
      case 'crash': {
        // The first gap opens around Sproto's lane (he can't outrun a far one).
        const w = (this.arena.right - this.arena.left) / LANES;
        const lane = clamp(Math.floor((target.x - this.arena.left) / w), 0, LANES - 1);
        this.gapLane = clamp(lane - this.rng.randiRange(0, 1), 0, LANES - 2);
        this.crashMarked = this.waveLanes(this.gapLane);
        break;
      }
      case 'arrow_slide': {
        const y = this.arena.floorY + RIDE_Y - 30;
        this.slidePath = [new Vec2(this.arena.left + LEDGE + 6, y), new Vec2(this.arena.right - LEDGE - 6, y)];
        break;
      }
      default:
        break;
    }
  }

  protected override telegraphStep(plan: AttackPlan, _target: Vec2, frame: number, total: number): void {
    if (plan.id === 'dash' && !this.split) {
      const left = Math.max(1, Math.round(total * 0.6) - frame);
      this.position = this.position.lerp(this.standAt(this.home, PERCH_INSET), Math.min(1, 1 / left));
      this.pose = 'slide';
    }
  }

  private aimCases(xs: number[]): void {
    this.caseTargets = xs.map((x) => new Vec2(this.clampX(x, 16), this.arena.floorY));
    this.caseZones = this.caseTargets.map((t) => new Rect2(t.x - 44, this.arena.floorY - 80, 88, 80));
  }

  private waveLanes(gap: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < LANES; i++) if (i !== gap && i !== gap + 1) out.push(i);
    return out;
  }

  // --- Attacks ------------------------------------------------------------------

  protected attack(plan: AttackPlan): BossScript {
    switch (plan.id) {
      case 'briefcase':
      case 'double':
        return this.throwCases(false);
      case 'storm':
        return this.throwCases(true);
      case 'crash':
        return this.crash();
      case 'dash':
        return this.dash();
      case 'arrow_slide':
        return this.arrowSlide();
      default:
        return waitFrames(1);
    }
  }

  private handPos(): Vec2 {
    return this.position.add(new Vec2(this.facing * 12, -46));
  }

  private *throwCases(push: boolean): BossScript {
    const cases: BossHazard[] = [];
    for (const t of this.caseTargets) {
      cases.push(this.briefcase(this.handPos(), t, push));
      yield* waitFrames(this.gapFrames(10));
    }
    this.caseTargets = [];
    while (cases.some((c) => !c.isDone())) yield;
    this.caseZones = [];
    while (this.liveHazards().some((h) => h.name === 'Paper')) yield;
    this.stormZones = [];
  }

  private briefcase(from: Vec2, to: Vec2, push: boolean): BossHazard {
    const h = new BossHazard(this, 'Briefcase', new Vec2(14, 10));
    const frames = Math.max(28, Math.min(54, Math.round(Math.abs(to.x - from.x) / 5)));
    const dy = to.y - 6 - from.y;
    h.vel = new Vec2((to.x - from.x) / frames, (dy - 0.5 * CASE_GRAVITY * frames * frames) / frames);
    const floor = to.y - 6;
    h.behave = (c) => {
      c.vel = c.vel.withY(c.vel.y + CASE_GRAVITY);
      c.position = c.position.add(c.vel);
      c.rotation += 0.2 * Math.sign(c.vel.x || 1);
      if (c.position.y >= floor && c.vel.y > 0) {
        this.paperStorm(new Vec2(c.position.x, floor), push);
        return true;
      }
      return false;
    };
    h.look = (g) => this.drawCase(g);
    return this.spawnHazard(h, from);
  }

  /** Drifting sheets that hurt for 2 s; with `push` the storm also shoves Sproto away from its middle. */
  private paperStorm(at: Vec2, push: boolean): void {
    Effects.dust(this.parent, new Vec2(at.x, this.arena.floorY), 0, 4);
    this.stormZones.push(new Rect2(at.x - 44, this.arena.floorY - 80, 88, 80));
    for (let i = 0; i < 6; i++) {
      const h = new BossHazard(this, 'Paper', new Vec2(8, 6));
      const phase = (i / 6) * Math.PI * 2;
      const home = at.add(new Vec2(-30 + i * 12, -10 - (i % 3) * 14));
      h.life = STORM_FRAMES;
      h.behave = (p) => {
        const t = p.age;
        p.position = home.add(new Vec2(Math.sin(t * 0.05 + phase) * 10, Math.sin(t * 0.08 + phase) * 6 - t * 0.12));
        p.rotation = Math.sin(t * 0.2 + phase) * 0.6;
        p.harmful = t < STORM_FRAMES - 12;
        if (push && i === 0) this.pushFrom(at);
        return false;
      };
      h.look = (g, p) => {
        const a = p.harmful ? 1 : Math.max(0, (STORM_FRAMES - p.age) / 12);
        g.rect(-5, -4, 10, 8, OUTLINE.withAlpha(a));
        g.rect(-4, -3, 8, 6, PAPER.withAlpha(a));
        g.line(new Vec2(-3, 0), new Vec2(2, -2), ARROW.withAlpha(a), 1);
      };
      this.spawnHazard(h, home);
    }
  }

  private pushFrom(center: Vec2): void {
    const p = this.player();
    if (!p) return;
    const d = p.globalPosition.sub(center);
    if (Math.abs(d.x) > 72 || d.y < -110 || d.y > 20) return;
    const dir = d.x === 0 ? 1 : Math.sign(d.x);
    if (p.grounded) p.groundSpeed = clamp(p.groundSpeed + dir * 0.08, -6, 6);
    else p.velocity = p.velocity.withX(clamp(p.velocity.x + dir * 0.06, -6, 6));
  }

  private *crash(): BossScript {
    const waves = this.phase === 1 ? 3 : 4;
    // Each wave is marked for at least 0.35 s before its arrows drop (and they
    // take a third of a second to fall): time to step one lane over.
    const wait = Math.max(Boss.MIN_TELEGRAPH_FRAMES, this.gapFrames(64));
    const arrows: BossHazard[] = [];
    for (let k = 0; k < waves; k++) {
      // Drop the marked wave, then mark the next one (the gap moves a lane).
      const lanes = this.crashMarked;
      this.crashFalling = [...lanes];
      for (const lane of lanes) arrows.push(this.chartArrow(lane));
      if (k === waves - 1) {
        this.crashMarked = [];
        break;
      }
      const step = this.gapLane <= 0 ? 1 : this.gapLane >= LANES - 2 ? -1 : this.rng.randf() < 0.5 ? -1 : 1;
      this.gapLane += step;
      const next = this.waveLanes(this.gapLane);
      this.crashMarked = next;
      yield* this.subTelegraph('crash_wave', wait);
    }
    while (arrows.some((a) => !a.isDone())) yield;
    this.crashFalling = [];
  }

  private chartArrow(lane: number): BossHazard {
    const r = this.laneRect(lane);
    const h = new BossHazard(this, 'ChartArrow', new Vec2(12, 22));
    const floor = this.arena.floorY;
    h.vel = new Vec2(0, 8);
    h.behave = (a) => {
      a.position = a.position.add(a.vel);
      if (a.position.y >= floor - 11) {
        Effects.dust(this.parent, new Vec2(a.position.x, floor), 0, 2);
        return true;
      }
      return false;
    };
    h.look = (g) => {
      g.polygon([new Vec2(-4, -11), new Vec2(4, -11), new Vec2(4, 3), new Vec2(8, 3), new Vec2(0, 12), new Vec2(-8, 3), new Vec2(-4, 3)], OUTLINE);
      g.polygon([new Vec2(-3, -10), new Vec2(3, -10), new Vec2(3, 4), new Vec2(6, 4), new Vec2(0, 10), new Vec2(-6, 4), new Vec2(-3, 4)], ARROW);
    };
    return this.spawnHazard(h, new Vec2(r.center.x, r.y + 10));
  }

  private *dash(): BossScript {
    this.pose = 'slide';
    const other = -this.home;
    const toX = this.sideX(other, PERCH_INSET);
    const top = this.speedPx(4.0);
    for (let i = 0; Math.abs(toX - this.position.x) > 0.5; i++) {
      const speed = top * Math.min(1, 0.2 + (0.8 * i) / 22);
      const dx = toX - this.position.x;
      this.facing = Math.sign(dx);
      this.position = this.position.withX(Math.abs(dx) <= speed ? toX : this.position.x + Math.sign(dx) * speed);
      if (this.frame % 5 === 0) Effects.dust(this.parent, new Vec2(this.position.x, this.arena.floorY), -this.facing, 2);
      yield;
    }
    this.home = other;
    yield* waitFrames(this.gapFrames(10));
    this.pose = 'stand';
    yield* this.glide(this.standAt(this.home), this.gapFrames(16));
  }

  private *arrowSlide(): BossScript {
    this.pose = 'ride';
    this.slidePath = null;
    const other = -this.home;
    const y = this.arena.floorY + RIDE_Y;
    const startX = this.home < 0 ? this.arena.left + LEDGE + 14 : this.arena.right - LEDGE - 14;
    const endX = other < 0 ? this.arena.left + LEDGE + 14 : this.arena.right - LEDGE - 14;
    yield* this.glide(new Vec2(startX, y), 18);
    const speed = this.speedPx(3.4);
    while (Math.abs(endX - this.position.x) > speed) {
      this.facing = Math.sign(endX - this.position.x);
      this.position = this.position.add(new Vec2(this.facing * speed, 0));
      for (const p of this.platforms) {
        const r = p.rect();
        if (this.position.x > r.x - 12 && this.position.x < r.right + 12) p.knock();
      }
      yield;
    }
    this.home = other;
    yield* this.glide(this.perchAt(this.home), this.gapFrames(26));
  }

  // --- The roof split -----------------------------------------------------------

  private *splitRoof(): BossScript {
    this.crackFlash = true;
    yield* this.subTelegraph('split', 80);
    this.crackFlash = false;
    const host = this.arena.host;
    const { left, right, floorY } = this.arena;
    if (host) {
      host.floor?.queueFree();
      for (const [name, x] of [
        ['LedgeLeft', left],
        ['LedgeRight', right - LEDGE],
      ] as const) {
        const ledge = new CurveTerrain(name);
        ledge.shape = CurveShape.BLOCK;
        ledge.position = new Vec2(x, floorY);
        ledge.size = new Vec2(LEDGE, 64);
        if (host.floor) {
          ledge.fillColor = host.floor.fillColor;
          ledge.edgeColor = host.floor.edgeColor;
        }
        ledge.setArtZone(host.artZone());
        host.terrain.addChild(ledge);
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = new RoofPlatform(`Platform${i + 1}`, PLATFORM);
      p.position = new Vec2(left + LEDGE + GAP + i * (PLATFORM.x + GAP), floorY);
      this.platforms.push(p);
      (host ? host.terrain : this.parent ?? this).addChild(p);
    }
    this.split = true;
    GameCamera.current()?.shake(4, 0.5);
  }

  /** The gaps the split opens (world x ranges), for the crack telegraph. */
  splitGaps(): [number, number][] {
    const out: [number, number][] = [];
    let x = this.arena.left + LEDGE;
    for (let i = 0; i < 4; i++) {
      out.push([x, x + GAP]);
      x += GAP + PLATFORM.x;
    }
    return out;
  }

  // --- Opening, recovery, desperation -------------------------------------------

  protected *openPose(): BossScript {
    if (!this.split) {
      this.pose = 'stand';
      yield* this.glide(this.standAt(this.home, OPEN_INSET), this.gapFrames(16));
      this.pose = 'phone';
      return;
    }
    for (const p of this.platforms) p.restore();
    const mid = this.platforms[1]!.rect();
    const spot = new Vec2(mid.center.x, this.arena.floorY);
    this.sinkZone = new Rect2(spot.x - 22, this.arena.floorY - 130, 44, 130);
    this.pose = 'ride';
    yield* this.glide(spot.add(new Vec2(0, -100)), 22);
    yield* this.glide(spot, 18);
    this.sinkZone = null;
    this.pose = 'phone';
  }

  protected *closePose(): BossScript {
    if (!this.split) {
      this.pose = 'stand';
      yield* this.glide(this.standAt(this.home), this.gapFrames(14));
      return;
    }
    this.pose = 'ride';
    yield* this.glide(this.perchAt(this.home), this.gapFrames(30));
  }

  protected override *recover(): BossScript {
    if (this.phase >= 2 && !this.split) {
      // Hit 4: onto the arrow, then the roof splits.
      this.pose = 'ride';
      yield* this.glide(this.perchAt(this.home), 40);
      yield* this.splitRoof();
      yield* waitFrames(this.gapFrames(20));
      return;
    }
    if (this.split) {
      this.pose = 'ride';
      this.home = this.rng.randf() < 0.5 ? -1 : 1;
      yield* this.glide(this.perchAt(this.home), 50);
    } else {
      this.pose = 'stand';
      yield* this.glide(this.standAt(this.home), 40);
    }
    yield* waitFrames(this.gapFrames(40));
  }

  override physicsProcess(): void {
    super.physicsProcess();
    if (this.slowFrames > 0) {
      this.slowFrames -= 1;
      if (this.slowFrames === 0) tree.timeScale = 1;
    }
    if (this.desperate && this.split && !this.isDefeated) {
      const p = this.player();
      if (p) {
        const standOn = this.isWeakOpen() || this.pose === 'phone' ? this.platforms[1] : null;
        for (const plat of this.platforms) if (plat !== standOn && plat.carries(p)) plat.crumble();
      }
    }
  }

  protected override onFinalHit(player: Player): void {
    tree.timeScale = SLOW_MOTION;
    this.slowFrames = SLOW_FRAMES;
    this.hasTie = false;
    const tie = new FlyingTie();
    tie.vel = new Vec2(-this.facing * 1.6, -5);
    Effects.spawn(this.parent, tie, this.position.add(new Vec2(0, -52)), 46);
    player.playPose('victory');
  }

  protected override defeatStep(frame: number): void {
    const p = this.player();
    if (p && p.grounded && p.pose !== 'victory') p.playPose('victory');
    this.pose = 'stand';
    this.position = this.position.add(new Vec2(Math.sin(frame * 0.9) * 1.2, 0));
  }

  protected updateShapes(): void {
    if (this.isDefeated) {
      this.weakPoint.setRects([]);
      this.body.setRects([]);
      return;
    }
    switch (this.pose) {
      case 'slide':
        this.weakPoint.setRects([]);
        this.body.setRects([new Rect2(-22, -40, 44, 40)]);
        break;
      case 'ride':
        this.weakPoint.setRects([new Rect2(-13, -84, 26, 22)]);
        this.body.setRects([new Rect2(-11, -62, 22, 62), new Rect2(-28, -2, 56, 10)]);
        break;
      default:
        this.weakPoint.setRects([new Rect2(-13, -84, 26, 22)]);
        this.body.setRects([new Rect2(-11, -62, 22, 62)]);
        break;
    }
  }

  override dangerZones(): Rect2[] {
    const out = [...this.caseZones, ...this.stormZones];
    for (const l of new Set([...this.crashMarked, ...this.crashFalling])) out.push(this.laneRect(l));
    if (this.sinkZone) out.push(this.sinkZone);
    const t = this.currentTelegraph();
    if (t && t.plan.id === 'dash') out.push(new Rect2(this.sideX(this.home, PERCH_INSET) - 30, this.arena.floorY - 90, 60, 90));
    if (t && t.plan.id === 'arrow_slide') out.push(new Rect2(this.arena.left + LEDGE + 2, this.arena.floorY - 100, this.arena.right - this.arena.left - 2 * LEDGE - 4, 100));
    return out;
  }

  // --- Art ----------------------------------------------------------------------

  override drawOverlay(g: Gfx): void {
    super.drawOverlay(g);
    const t = this.currentTelegraph();
    const floor = this.arena.floorY;
    for (const c of this.caseTargets) BossFx.targetRing(g, c.add(new Vec2(0, -8)), this.frame, 12);
    for (const l of this.crashMarked) BossFx.laneWarning(g, this.laneRect(l), this.frame);
    if (t && t.plan.id === 'dash') BossFx.dashedLine(g, new Vec2(this.sideX(this.home, PERCH_INSET), floor - 20), new Vec2(this.sideX(-this.home, PERCH_INSET), floor - 20), this.frame, 3);
    if (this.slidePath) BossFx.dashedLine(g, this.slidePath[0], this.slidePath[1], this.frame, 3);
    if (this.crackFlash) {
      for (const [x0, x1] of this.splitGaps()) {
        BossFx.floorWarning(g, x0 - 2, x1 + 2, floor + 6, this.frame, 10);
        const mx = (x0 + x1) / 2;
        g.polyline([new Vec2(mx - 4, floor), new Vec2(mx + 3, floor + 5), new Vec2(mx - 2, floor + 10), new Vec2(mx + 2, floor + 16)], OUTLINE, 2);
      }
    }
    if (this.sinkZone) BossFx.floorWarning(g, this.sinkZone.x, this.sinkZone.right, floor, this.frame, 3);
  }

  private drawCase(g: Gfx): void {
    g.rect(-8, -6, 16, 12, OUTLINE);
    g.rect(-7, -5, 14, 10, CASE);
    g.rect(-7, -1, 14, 2, CASE_DARK);
    g.rect(-3, -8, 6, 3, OUTLINE);
    g.rect(-1, -1, 2, 2, Color.rgb8(230, 200, 90));
  }

  private drawArrow(g: Gfx): void {
    const f = this.facing;
    const pts = [new Vec2(-f * 30, 0), new Vec2(-f * 12, -4), new Vec2(f * 2, 2), new Vec2(f * 18, -4), new Vec2(f * 18, -9), new Vec2(f * 32, 1), new Vec2(f * 18, 11), new Vec2(f * 18, 6), new Vec2(f * 2, 12), new Vec2(-f * 12, 6), new Vec2(-f * 30, 10)];
    g.polygon(pts.map((p) => p.add(new Vec2(0, -1))), OUTLINE);
    g.polygon(pts.map((p) => p.lerp(new Vec2(0, 3), 0.1)), this.tint(ARROW));
    g.line(new Vec2(-f * 26, 7), new Vec2(f * 16, 7), ARROW_DARK, 1);
  }

  override draw(g: Gfx): void {
    const f = this.facing;
    if (this.pose === 'ride') this.drawArrow(g);
    if (this.drawBossSprite(g, BossSprite.executive, this.pose === 'ride' ? -2 : 0, this.pose === 'slide' ? 0.55 : 1)) {
      if (this.isWeakOpen()) BossFx.weakPoint(g, this.weakRect(), this.globalPosition, this.frame);
      return;
    }
    if (this.pose === 'slide') {
      this.drawSlide(g, f);
      return;
    }
    const phone = this.pose === 'phone';
    const lift = this.pose === 'ride' ? -2 : 0;
    // Legs and shoes.
    for (const s of [-1, 1]) {
      g.rect(s * 5 - 4, -30 + lift, 8, 30, OUTLINE);
      g.rect(s * 5 - 3, -29 + lift, 6, 28, this.tint(SUIT_SHADE));
      g.rect(s * 5 - 4 + f * 2, -3 + lift, 9, 3, OUTLINE);
    }
    // Jacket, shirt and tie.
    g.rect(-12, -64 + lift, 24, 36, OUTLINE);
    g.rect(-11, -63 + lift, 22, 34, this.tint(SUIT));
    g.polygon([new Vec2(-4, -63 + lift), new Vec2(4, -63 + lift), new Vec2(0, -50 + lift)], SHIRT);
    if (this.hasTie) {
      g.polygon([new Vec2(-2, -62 + lift), new Vec2(2, -62 + lift), new Vec2(3, -46 + lift), new Vec2(0, -42 + lift), new Vec2(-3, -46 + lift)], TIE);
    }
    g.line(new Vec2(-4, -63 + lift), new Vec2(-1, -40 + lift), SUIT_SHADE, 1);
    g.line(new Vec2(4, -63 + lift), new Vec2(1, -40 + lift), SUIT_SHADE, 1);
    // Arms: one holds the briefcase (or the phone).
    const caseHand = new Vec2(-f * 13, -34 + lift);
    const otherHand = phone ? new Vec2(f * 6, -60 + lift) : this.currentTelegraph() ? new Vec2(f * 14, -70 + lift) : new Vec2(f * 13, -36 + lift);
    for (const hand of [caseHand, otherHand]) {
      const sh = new Vec2(Math.sign(hand.x || f) * 10, -60 + lift);
      g.line(sh, hand, OUTLINE, 6);
      g.line(sh, hand, this.tint(SUIT), 4);
      g.circle(hand, 2.5, SKIN);
    }
    g.setTransform(caseHand.add(new Vec2(0, 6)), 0);
    this.drawCase(g);
    g.resetTransform();
    if (phone) {
      g.rect(otherHand.x - 3, otherHand.y - 9, 6, 9, OUTLINE);
      g.rect(otherHand.x - 2, otherHand.y - 8, 4, 7, PHONE);
    }
    // Head: slick hair and sunglasses.
    const head = new Vec2(f * 1, -73 + lift + (phone ? 2 : 0));
    if (this.isWeakOpen()) g.circle(head, 16 + Math.sin(this.frame * 0.3) * 1.5, PHONE.withAlpha(0.2));
    g.rect(head.x - 8, head.y - 9, 16, 18, OUTLINE);
    g.rect(head.x - 7, head.y - 8, 14, 16, this.tint(SKIN));
    g.rect(head.x - 8, head.y - 10, 16, 5, HAIR);
    g.rect(head.x - 8 + (f > 0 ? 0 : 10), head.y - 8, 6, 3, HAIR);
    g.rect(head.x - 7, head.y - 3, 14, 4, SHADES);
    g.rect(head.x + f * 3 - 1, head.y - 2, 2, 1, Color.WHITE.withAlpha(0.8));
    g.line(new Vec2(head.x - 3, head.y + 5), new Vec2(head.x + 3, head.y + 4), OUTLINE, 1);
  }

  private drawSlide(g: Gfx, f: number): void {
    // Power slide: low, leaning back, one leg forward.
    g.rect(-20, -14, 40, 12, OUTLINE);
    g.rect(-19, -13, 38, 10, this.tint(SUIT_SHADE));
    g.rect(f * 14 - 5, -6, 12, 4, OUTLINE);
    g.polygon([new Vec2(-f * 14, -14), new Vec2(f * 2, -14), new Vec2(-f * 2, -38), new Vec2(-f * 16, -36)], OUTLINE);
    g.polygon([new Vec2(-f * 13, -15), new Vec2(f * 1, -15), new Vec2(-f * 3, -37), new Vec2(-f * 15, -35)], this.tint(SUIT));
    const head = new Vec2(-f * 10, -42);
    g.rect(head.x - 7, head.y - 7, 14, 14, OUTLINE);
    g.rect(head.x - 6, head.y - 6, 12, 12, this.tint(SKIN));
    g.rect(head.x - 7, head.y - 8, 14, 4, HAIR);
    g.rect(head.x - 6, head.y - 2, 12, 3, SHADES);
    if (this.hasTie) g.line(new Vec2(-f * 6, -34), new Vec2(-f * 18, -30), TIE, 2);
    for (let k = 0; k < 3; k++) g.line(new Vec2(-f * (24 + k * 6), -6 - k * 8), new Vec2(-f * (32 + k * 6), -6 - k * 8), Color.WHITE.withAlpha(0.6), 1);
  }
}
