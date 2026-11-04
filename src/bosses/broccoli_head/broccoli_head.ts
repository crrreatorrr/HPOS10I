// Broccoli Head, Zone 3's boss (docs/LEVELS.md, docs/DESIGN.md): a fictional
// cartoon teen with a huge green broccoli-floret haircut, on a hoverboard.
// Very difficult by design: D 8, three attacks per opening, a 0.5 s base
// telegraph (never under 0.35 s), x1.25 after hits 4 and 6, desperation.
//
// He waits above his wall between attacks. His body is the board and his
// hoodie; his weak point is the hair, which he only leaves alone during the
// hair-fix pause (he lands at his wall and combs it).
// Phase 1 (hits 1-4), three per cycle:
//   - zip_low / zip_high: a dashed line shows the height, then he zips across
//     to the other wall, picking up speed. Low (ducked on the board): jump
//     him. High: stay on the ground;
//   - cans (aimed): two fizz cans lobbed at where Sproto stood (rings mark
//     both landings); each bounces once and splits in two on its second
//     bounce, the halves rolling apart along the floor (jump them);
//   - fakeout: telegraphed like a low zip, but he stops short of the middle,
//     then floats back to his wall overhead.
// Phase 2 (hits 5-6): adds
//   - tornado: he spins into a tornado and dashes along the floor; jump it,
//     or roll/spin dash under it (its tip leaves a gap above the floor);
//   - sparks: the chandelier showers one half of the arena at a time (the
//     half is marked first), as a moving no-go zone during his attacks.
// Desperation (hits 7-8): tornado and can throws overlap, the hair-fix
// pause shrinks to 1.1 s, and after each hit he zips to a random side.
// Ticket refill: after hit 4 only (the arena).

import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { Effects } from '../../player/effects';
import { Boss, BossHazard, waitFrames, type AttackPlan, type BossScript } from '../boss_base';
import { BossFx, OUTLINE } from '../boss_fx';

const LOW_Y = -10;
const HIGH_Y = -78;
const REST_Y = -134;
const PERCH_Y = -156;
const TORNADO_Y = -30;
const ZIP_INSET = 30;
const OPEN_INSET = 56;
const CAN_GRAVITY = 0.3;

const HAIR = Color.rgb8(70, 170, 70);
const HAIR_DARK = Color.rgb8(34, 110, 46);
const HAIR_LIGHT = Color.rgb8(150, 220, 110);
const SKIN = Color.rgb8(236, 196, 160);
const HOODIE = Color.rgb8(240, 130, 50);
const HOODIE_SHADE = Color.rgb8(190, 90, 36);
const JEANS = Color.rgb8(60, 80, 140);
const BOARD = Color.rgb8(40, 200, 210);
const BOARD_GLOW = Color.rgb8(160, 255, 250);
const CAN = Color.rgb8(220, 60, 200);
const CAN_BAND = Color.rgb8(255, 240, 90);
const SPARK = Color.rgb8(255, 236, 140);
const GOLD = Color.rgb8(230, 186, 80);

type Pose = 'board' | 'duck' | 'tornado' | 'comb';

export class BroccoliHead extends Boss {
  /** His wall: -1 left, 1 right. */
  home = 1;
  pose: Pose = 'board';
  private cycle = 0;
  private zipY = LOW_Y;
  private canTargets: Vec2[] = [];
  private canZones: Rect2[] = [];
  private sparkHalf = -1;
  private sparkWarn = false;
  private sinkZone: Rect2 | null = null;
  private spin = 0;

  constructor() {
    super('BroccoliHead', 'z3_capital_mansion', 0x42524f43);
  }

  protected override resetPose(): void {
    this.position = new Vec2(this.centerX(), this.arena.floorY + REST_Y);
    this.home = 1;
  }

  private at(side: number, inset: number, y: number): Vec2 {
    return new Vec2(this.sideX(side, inset), this.arena.floorY + y);
  }

  // --- Plans --------------------------------------------------------------------

  protected override *intro(): BossScript {
    yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), Boss.GRACE_FRAMES);
  }

  protected planCycle(): AttackPlan[] {
    const zipLow: AttackPlan = { id: 'zip_low', telegraph: 1.3 };
    const zipHigh: AttackPlan = { id: 'zip_high', telegraph: 1.3 };
    const cans: AttackPlan = { id: 'cans', aimed: true, telegraph: 1.2 };
    const fake: AttackPlan = { id: 'fakeout', telegraph: 1.3 };
    const tornado: AttackPlan = { id: 'tornado', telegraph: 1.4 };
    const sparks = (half: number): AttackPlan => ({ id: 'sparks', telegraph: 2.2, overlap: true, variant: half, gap: 4 });
    const first = this.rng.randiRange(0, 1);
    const sets: AttackPlan[][] =
      this.phase === 1
        ? [
            [zipLow, cans, zipHigh],
            [cans, fake, zipLow],
            [zipHigh, cans, fake],
          ]
        : this.phase === 2
          ? [
              [sparks(first), tornado, cans, sparks(1 - first), zipHigh],
              [sparks(first), cans, tornado, sparks(1 - first), fake],
            ]
          : [
              [sparks(first), { ...tornado, overlap: true, gap: 6 }, cans, sparks(1 - first), zipLow],
              [sparks(first), { ...tornado, overlap: true, gap: 6 }, cans, sparks(1 - first), tornado],
            ];
    const plans = sets[this.cycle % sets.length]!;
    this.cycle += 1;
    return plans;
  }

  // --- Telegraphs ---------------------------------------------------------------

  protected override beginTelegraph(plan: AttackPlan, target: Vec2): void {
    switch (plan.id) {
      case 'zip_low':
      case 'fakeout':
        this.zipY = LOW_Y;
        break;
      case 'zip_high':
        this.zipY = HIGH_Y;
        break;
      case 'cans':
        this.aimCans(target);
        break;
      case 'sparks':
        this.sparkHalf = plan.variant ?? 0;
        this.sparkWarn = true;
        break;
      default:
        break;
    }
  }

  protected override telegraphStep(plan: AttackPlan, _target: Vec2, frame: number, total: number): void {
    const settle = (to: Vec2): void => {
      const left = Math.max(1, Math.round(total * 0.75) - frame);
      this.position = this.position.lerp(to, Math.min(1, 1 / left));
    };
    if (plan.id === 'zip_low' || plan.id === 'zip_high' || plan.id === 'fakeout') settle(this.at(this.home, ZIP_INSET, this.zipY));
    else if (plan.id === 'tornado') {
      if (this.pose !== 'tornado') settle(this.at(this.home, ZIP_INSET, TORNADO_Y));
      this.spin += 0.3;
    }
  }

  private aimCans(target: Vec2): void {
    const tx = this.clampX(target.x, 20);
    const away = tx > this.centerX() ? -1 : 1;
    const second = this.clampX(tx + away * 64, 20);
    this.canTargets = [new Vec2(tx, this.arena.floorY), new Vec2(second, this.arena.floorY)];
    this.canZones = this.canTargets.map((t) => this.canZone(this.handPos(), t));
  }

  private handPos(): Vec2 {
    return this.position.add(new Vec2(this.facing * 12, -40));
  }

  private canFlight(from: Vec2, to: Vec2): { vel: Vec2; frames: number } {
    const frames = Math.max(30, Math.min(56, Math.round(Math.abs(to.x - from.x) / 4.5)));
    const dy = to.y - 5 - from.y;
    return { vel: new Vec2((to.x - from.x) / frames, (dy - 0.5 * CAN_GRAVITY * frames * frames) / frames), frames };
  }

  /** The floor stretch a can covers from its first landing to its split (and a margin). */
  private canZone(from: Vec2, to: Vec2): Rect2 {
    const f = this.canFlight(from, to);
    const vyLand = f.vel.y + CAN_GRAVITY * f.frames;
    const air = (2 * vyLand * 0.55) / CAN_GRAVITY;
    const x2 = to.x + f.vel.x * air;
    const x0 = Math.min(to.x, x2) - 18;
    const x1 = Math.max(to.x, x2) + 18;
    return new Rect2(x0, this.arena.floorY - 64, x1 - x0, 64);
  }

  // --- Attacks ------------------------------------------------------------------

  protected attack(plan: AttackPlan): BossScript {
    switch (plan.id) {
      case 'zip_low':
      case 'zip_high':
        return this.zip(false);
      case 'fakeout':
        return this.zip(true);
      case 'cans':
        return this.throwCans();
      case 'tornado':
        return this.tornado();
      case 'sparks':
        return this.sparks(plan.variant ?? 0);
      default:
        return waitFrames(1);
    }
  }

  /** Dashes along x to `toX`, revving up from a fifth of `top` over 24 frames (time to react). */
  private *dash(toX: number, top: number): BossScript {
    for (let i = 0; Math.abs(toX - this.position.x) > 0.5; i++) {
      const speed = top * Math.min(1, 0.2 + (0.8 * i) / 24);
      const dx = toX - this.position.x;
      this.facing = Math.sign(dx);
      this.position = this.position.withX(Math.abs(dx) <= speed ? toX : this.position.x + Math.sign(dx) * speed);
      if (this.pose === 'tornado') {
        this.spin += 0.5;
        if (this.frame % 6 === 0) Effects.dust(this.parent, new Vec2(this.position.x, this.arena.floorY), -this.facing, 2);
      }
      yield;
    }
  }

  private *zip(fake: boolean): BossScript {
    this.position = this.at(this.home, ZIP_INSET, this.zipY);
    if (this.zipY === LOW_Y) this.pose = 'duck';
    const other = -this.home;
    const speed = this.speedPx(4.0);
    if (fake) {
      const stop = new Vec2(this.centerX() + this.home * 40, this.position.y);
      yield* this.dash(stop.x, speed);
      this.pose = 'board';
      yield* waitFrames(this.gapFrames(24));
      yield* this.glide(new Vec2(stop.x, this.arena.floorY + PERCH_Y), this.gapFrames(26));
      yield* this.glide(this.at(this.home, ZIP_INSET, PERCH_Y), this.gapFrames(34));
      yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), this.gapFrames(16));
      return;
    }
    yield* this.dash(this.sideX(other, ZIP_INSET), speed);
    this.pose = 'board';
    this.home = other;
    Effects.dust(this.parent, new Vec2(this.position.x, this.arena.floorY), -other, 3);
    yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), this.gapFrames(22));
  }

  private *throwCans(): BossScript {
    const cans: BossHazard[] = [];
    this.canZones = this.canTargets.map((t) => this.canZone(this.handPos(), t));
    for (const t of this.canTargets) {
      cans.push(this.can(this.handPos(), t));
      yield* waitFrames(this.gapFrames(10));
    }
    while (cans.some((c) => !c.isDone()) || this.liveHazards().some((h) => h.name === 'MiniCan')) yield;
    this.canZones = [];
    this.canTargets = [];
  }

  private can(from: Vec2, to: Vec2): BossHazard {
    const h = new BossHazard(this, 'Can', new Vec2(8, 10));
    h.vel = this.canFlight(from, to).vel;
    const floor = this.arena.floorY - 5;
    const { left, right } = this.arena;
    h.behave = (c) => {
      c.vel = c.vel.withY(c.vel.y + CAN_GRAVITY);
      c.position = c.position.add(c.vel);
      c.rotation += c.vel.x * 0.12;
      if (c.position.x < left + 4 || c.position.x > right - 4) c.vel = c.vel.withX(-c.vel.x);
      if (c.position.y >= floor && c.vel.y > 0) {
        c.position = c.position.withY(floor);
        c.count += 1;
        if (c.count >= 2) {
          for (const dir of [-1, 1]) this.miniCan(c.position, dir);
          Effects.dust(this.parent, new Vec2(c.position.x, this.arena.floorY), 0, 3);
          return true;
        }
        c.vel = c.vel.withY(-c.vel.y * 0.55);
      }
      return false;
    };
    h.look = (g) => this.drawCan(g, 1);
    return this.spawnHazard(h, from);
  }

  private miniCan(at: Vec2, dir: number): void {
    const h = new BossHazard(this, 'MiniCan', new Vec2(7, 7));
    h.vel = new Vec2(dir * this.speedPx(1.6), -2.2);
    const floor = this.arena.floorY - 4;
    const { left, right } = this.arena;
    h.life = 150;
    h.behave = (c) => {
      c.vel = c.vel.withY(c.vel.y + CAN_GRAVITY);
      c.position = c.position.add(c.vel);
      c.rotation += c.vel.x * 0.2;
      if (c.position.y >= floor) {
        c.position = c.position.withY(floor);
        c.vel = c.vel.withY(0);
      }
      return c.position.x < left + 4 || c.position.x > right - 4;
    };
    h.look = (g) => this.drawCan(g, 0.7);
    this.spawnHazard(h, at);
  }

  private *tornado(): BossScript {
    this.pose = 'tornado';
    this.position = this.at(this.home, ZIP_INSET, TORNADO_Y);
    const other = -this.home;
    yield* this.dash(this.sideX(other, ZIP_INSET), this.speedPx(4.2));
    this.home = other;
    for (let i = 0; i < 14; i++) {
      this.spin += 0.5 - i * 0.03;
      yield;
    }
    this.pose = 'board';
    yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), this.gapFrames(22));
  }

  private halfRect(half: number): Rect2 {
    const mid = this.centerX();
    const top = this.arena.view.y;
    return half === 0 ? new Rect2(this.arena.left, top, mid - this.arena.left, this.arena.floorY - top) : new Rect2(mid, top, this.arena.right - mid, this.arena.floorY - top);
  }

  private *sparks(half: number): BossScript {
    this.sparkHalf = half;
    this.sparkWarn = false;
    const r = this.halfRect(half);
    const frames = this.gapFrames(150);
    for (let i = 0; i < frames; i++) {
      if (i % 5 === 0) this.spark(new Vec2(this.rng.randfRange(r.x + 6, r.right - 6), r.y + 14));
      yield;
    }
    while (this.liveHazards().some((h) => h.name === 'Spark')) yield;
    if (this.sparkHalf === half) this.sparkHalf = -1;
  }

  private spark(at: Vec2): void {
    const h = new BossHazard(this, 'Spark', new Vec2(6, 6));
    h.vel = new Vec2(this.rng.randfRange(-0.3, 0.3), 2.2);
    const floor = this.arena.floorY;
    h.behave = (s) => {
      s.vel = s.vel.withY(Math.min(s.vel.y + 0.1, 6));
      s.position = s.position.add(s.vel);
      return s.position.y >= floor - 3;
    };
    h.look = (g, s) => {
      g.line(new Vec2(0, -6), Vec2.ZERO, SPARK.withAlpha(0.5), 2);
      const k = s.age % 4 < 2 ? 3 : 2;
      g.line(new Vec2(-k, 0), new Vec2(k, 0), SPARK, 1);
      g.line(new Vec2(0, -k), new Vec2(0, k), SPARK, 1);
      g.circle(Vec2.ZERO, 1.5, Color.WHITE);
    };
    this.spawnHazard(h, at);
  }

  // --- Opening and recovery -----------------------------------------------------

  protected *openPose(): BossScript {
    this.pose = 'board';
    const spot = this.at(this.home, OPEN_INSET, REST_Y);
    yield* this.glide(spot, this.gapFrames(18));
    this.sinkZone = new Rect2(spot.x - 22, this.arena.floorY - 100, 44, 100);
    yield* this.glide(this.at(this.home, OPEN_INSET, LOW_Y), 24);
    this.sinkZone = null;
    this.pose = 'comb';
  }

  protected *closePose(): BossScript {
    this.pose = 'board';
    yield* this.glide(this.at(this.home, OPEN_INSET, REST_Y), this.gapFrames(20));
    yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), this.gapFrames(12));
  }

  protected override *recover(): BossScript {
    this.pose = 'board';
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + PERCH_Y), 30);
    if (this.desperate) {
      // Zips to a random side after each hit (overhead, out of reach).
      this.home = this.rng.randf() < 0.5 ? -1 : 1;
      yield* this.moveTo(this.at(this.home, ZIP_INSET, PERCH_Y), this.speedPx(5));
    } else {
      yield* this.glide(this.at(this.home, ZIP_INSET, PERCH_Y), 30);
    }
    yield* this.glide(this.at(this.home, ZIP_INSET, REST_Y), 24);
    yield* waitFrames(this.gapFrames(20));
  }

  protected updateShapes(): void {
    if (this.isDefeated) {
      this.weakPoint.setRects([]);
      this.body.setRects([]);
    } else if (this.pose === 'tornado') {
      this.weakPoint.setRects([]);
      this.body.setRects([new Rect2(-18, -36, 36, 36)]);
    } else if (this.pose === 'duck') {
      this.weakPoint.setRects([new Rect2(-19, -46, 38, 20)]);
      this.body.setRects([new Rect2(-20, -4, 40, 8), new Rect2(-12, -26, 24, 22)]);
    } else {
      this.weakPoint.setRects([new Rect2(-19, -65, 38, 23)]);
      this.body.setRects([new Rect2(-20, -4, 40, 8), new Rect2(-10, -42, 20, 38)]);
    }
  }

  override dangerZones(): Rect2[] {
    const out = [...this.canZones];
    const t = this.currentTelegraph();
    if (t && ['zip_low', 'zip_high', 'fakeout', 'tornado'].includes(t.plan.id)) {
      // He comes down by his wall first.
      out.push(new Rect2(this.sideX(this.home, ZIP_INSET) - 26, this.arena.floorY - 150, 52, 150));
    }
    if (this.sparkHalf >= 0) out.push(this.halfRect(this.sparkHalf).grow(-2));
    if (this.sinkZone) out.push(this.sinkZone);
    return out;
  }

  protected override defeatStep(frame: number): void {
    this.pose = 'board';
    this.position = this.position.add(new Vec2(Math.sin(frame * 0.8) * 1.4, frame < 50 ? -0.4 : 1.2));
    this.rotation = Math.sin(frame * 0.25) * 0.35;
  }

  // --- Art ----------------------------------------------------------------------

  override drawOverlay(g: Gfx): void {
    super.drawOverlay(g);
    this.drawChandelier(g);
    const t = this.currentTelegraph();
    if (t && (t.plan.id === 'zip_low' || t.plan.id === 'zip_high' || t.plan.id === 'fakeout')) {
      const y = this.arena.floorY + this.zipY - 20;
      BossFx.dashedLine(g, new Vec2(this.sideX(this.home, ZIP_INSET), y), new Vec2(this.sideX(-this.home, ZIP_INSET), y), this.frame, 3);
    }
    if (t && t.plan.id === 'tornado') BossFx.floorWarning(g, this.arena.left, this.arena.right, this.arena.floorY, this.frame, 4);
    if (t && t.plan.id === 'cans') for (const c of this.canTargets) BossFx.targetRing(g, c.add(new Vec2(0, -8)), this.frame, 10);
    if (this.sparkWarn && this.sparkHalf >= 0) BossFx.laneWarning(g, this.halfRect(this.sparkHalf), this.frame);
    if (this.sinkZone) BossFx.floorWarning(g, this.sinkZone.x, this.sinkZone.right, this.arena.floorY, this.frame, 3);
  }

  private drawChandelier(g: Gfx): void {
    const top = new Vec2(this.centerX(), this.arena.view.y);
    const c = top.add(new Vec2(0, 22));
    const lit = this.phase >= 2 && this.frame % 10 < 6;
    g.line(top, c, OUTLINE, 2);
    g.ellipse(c, 34, 5, OUTLINE);
    g.ellipse(c, 32, 3.5, GOLD);
    for (let k = -3; k <= 3; k++) {
      const p = c.add(new Vec2(k * 10, -2));
      g.rect(p.x - 1, p.y - 6, 2, 6, Color.rgb8(250, 245, 230));
      g.circle(p.add(new Vec2(0, -8)), lit ? 2.5 : 1.8, lit ? SPARK : Color.rgb8(255, 200, 120));
    }
  }

  private drawCan(g: Gfx, size: number): void {
    const w = 4 * size;
    const h = 5 * size;
    g.rect(-w - 1, -h - 1, w * 2 + 2, h * 2 + 2, OUTLINE);
    g.rect(-w, -h, w * 2, h * 2, CAN);
    g.rect(-w, -h * 0.25, w * 2, h * 0.5, CAN_BAND);
    g.rect(-w, -h, w * 2, 1.5 * size, Color.rgb8(200, 200, 210));
    g.rect(-w + 1, -h + 2, 1, h, Color.WHITE.withAlpha(0.7));
  }

  override draw(g: Gfx): void {
    if (this.pose === 'tornado') {
      this.drawTornado(g);
      return;
    }
    const f = this.facing;
    const duck = this.pose === 'duck';
    const bob = duck ? 0 : Math.sin(this.frame * 0.15) * 1;
    if (duck) {
      this.drawBoard(g);
      g.setTransform(new Vec2(0, 20), 0, new Vec2(1, 1));
      this.drawUpper(g, f, bob - 2, true);
      g.resetTransform();
      return;
    }
    this.drawBoard(g);
    // Legs.
    for (const s of [-1, 1]) {
      g.rect(s * 6 - 3, -18 + bob, 6, 16, OUTLINE);
      g.rect(s * 6 - 2, -17 + bob, 4, 15, this.tint(JEANS));
      g.rect(s * 6 - 4, -4, 8, 3, Color.WHITE);
    }
    this.drawUpper(g, f, bob, false);
  }

  private drawBoard(g: Gfx): void {
    // Hoverboard with a glow under it.
    g.ellipse(new Vec2(0, 5), 18, 2.5, BOARD_GLOW.withAlpha(0.5 + 0.3 * Math.sin(this.frame * 0.4)));
    g.polygon([new Vec2(-22, -2), new Vec2(22, -2), new Vec2(19, 3), new Vec2(-19, 3)], OUTLINE);
    g.polygon([new Vec2(-21, -1), new Vec2(21, -1), new Vec2(18, 2), new Vec2(-18, 2)], this.tint(BOARD));
    g.line(new Vec2(-16, -1), new Vec2(16, -1), BOARD_GLOW, 1);
  }

  /** Torso, arms, head and hair (shifted down while ducking). */
  private drawUpper(g: Gfx, f: number, bob: number, ducking: boolean): void {
    if (ducking) {
      for (const s of [-1, 1]) {
        g.rect(s * 7 - 4, -22, 8, 6, OUTLINE);
        g.rect(s * 7 - 3, -21, 6, 4, this.tint(JEANS));
      }
    }
    // Hoodie torso.
    g.rect(-11, -40 + bob, 22, 24, OUTLINE);
    g.rect(-10, -39 + bob, 20, 22, this.tint(HOODIE));
    g.rect(-10, -24 + bob, 20, 5, this.tint(HOODIE_SHADE));
    g.line(new Vec2(-2, -38 + bob), new Vec2(-3, -30 + bob), Color.WHITE, 1);
    g.line(new Vec2(2, -38 + bob), new Vec2(3, -30 + bob), Color.WHITE, 1);
    // Arms (the comb during the pause).
    const comb = this.pose === 'comb';
    const handA = comb ? new Vec2(f * 4, -58 + Math.sin(this.frame * 0.5) * 4 + bob) : new Vec2(f * 16, -28 + bob);
    const handB = new Vec2(-f * 15, -26 + bob);
    for (const hand of [handA, handB]) {
      const sh = new Vec2(Math.sign(hand.x - 0.01) * 9, -36 + bob);
      g.line(sh, hand, OUTLINE, 5);
      g.line(sh, hand, this.tint(HOODIE), 3);
      g.circle(hand, 2.5, SKIN);
    }
    if (comb) {
      g.rect(handA.x - 1, handA.y - 6, 9, 3, OUTLINE);
      for (let k = 0; k < 4; k++) g.rect(handA.x + k * 2, handA.y - 3, 1, 3, Color.rgb8(240, 90, 140));
    }
    if (this.currentTelegraph()?.plan.id === 'cans') {
      g.setTransform(handB.add(new Vec2(0, -6)), Math.sin(this.frame * 1.3) * 0.4);
      this.drawCan(g, 0.8);
      g.resetTransform();
    }
    // Head and the broccoli hair.
    const head = new Vec2(f * 1, -47 + bob);
    g.circle(head, 7, OUTLINE);
    g.circle(head, 6, SKIN);
    g.rect(head.x + f * 2 - 1, head.y - 1, 2, 2, OUTLINE);
    g.line(head.add(new Vec2(f * 1, 3)), head.add(new Vec2(f * 4, 2.5)), OUTLINE, 1);
    this.drawHair(g, head.add(new Vec2(0, -9)));
  }

  private drawHair(g: Gfx, c: Vec2): void {
    const puffs: [number, number, number][] = [
      [0, -2, 9],
      [-10, 2, 7],
      [10, 2, 7],
      [-6, -9, 7],
      [6, -9, 7],
      [0, -13, 6],
      [-15, -3, 5],
      [15, -3, 5],
    ];
    const open = this.isWeakOpen();
    if (open) g.circle(c.add(new Vec2(0, -4)), 22 + Math.sin(this.frame * 0.3) * 2, HAIR_LIGHT.withAlpha(0.25));
    for (const [x, y, r] of puffs) g.circle(c.add(new Vec2(x, y)), r + 1, OUTLINE);
    for (const [x, y, r] of puffs) g.circle(c.add(new Vec2(x, y)), r, this.tint(HAIR));
    for (const [x, y, r] of puffs) {
      g.circle(c.add(new Vec2(x - r * 0.3, y - r * 0.3)), r * 0.35, this.tint(HAIR_LIGHT));
      g.circle(c.add(new Vec2(x + r * 0.35, y + r * 0.3)), r * 0.25, HAIR_DARK);
    }
    g.rect(c.x - 2, c.y + 5, 4, 4, HAIR_DARK);
  }

  private drawTornado(g: Gfx): void {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const y = 2 - t * 40;
      const w = 6 + t * 16;
      const x = Math.sin(this.spin + i * 0.8) * (2 + t * 3);
      g.ellipse(new Vec2(x, y), w + 1, 4, OUTLINE.withAlpha(0.7));
      g.ellipse(new Vec2(x, y), w, 3, this.tint(i % 2 === 0 ? HAIR : HAIR_LIGHT));
    }
    for (let k = 0; k < 4; k++) {
      const a = this.spin * 1.5 + k * 1.6;
      g.circle(new Vec2(Math.cos(a) * 20, -20 + Math.sin(a * 0.7) * 14), 2, HAIR_DARK);
    }
  }
}
