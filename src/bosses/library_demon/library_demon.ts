// Library Demon, Zone 2's boss (docs/LEVELS.md, docs/DESIGN.md): an original
// horned creature of smoke and ink rising from a cursed book. No symbols on
// it: the book's cover is plain, the ink is just ink. D 4.5, two attacks per
// opening, 1.7 s weak-point window, speed-ups after hits 4 and 6.
//
// The book floats high at one of three spots; the demon's body is the book
// and its smoky torso, its weak point is its horned head. Attacks:
//   - ink_rain: ink gathers over most of the arena's seven lanes (marked),
//     then pours down them; every lane is at most two lanes from a dry one;
//   - pages (aimed): its eyes lock on where Sproto stood, dashed lines show
//     each page's path, then the book flings the fan along them; move away;
//   - ink_wave: the book shakes over its spot (marked), slams down there and
//     sends ink waves along the floor towards the middle; jump them.
// Then it drifts to the spot farthest from Sproto and sinks onto the floor
// (marked), drained, its head low over the book: jump on
// the head (rolling into the book or the smoke hurts). From phase 2 the
// page fans are wider and the rain heavier.

import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { Effects } from '../../player/effects';
import { GameCamera } from '../../camera/game_camera';
import { Boss, BossHazard, waitFrames, type AttackPlan, type BossScript } from '../boss_base';
import { BossFx, OUTLINE } from '../boss_fx';

const BOOK_Y = -112;
const SLUMP_Y = -8;
const SPOT_INSET = 72;
const LANES = 7;

const COVER = Color.rgb8(58, 30, 74);
const COVER_EDGE = Color.rgb8(150, 110, 60);
const PAGE = Color.rgb8(240, 230, 200);
const SMOKE = Color.rgb8(54, 40, 78);
const SMOKE_LIGHT = Color.rgb8(96, 74, 130);
const HORN = Color.rgb8(226, 214, 190);
const HORN_SHADE = Color.rgb8(160, 140, 120);
const EYE = Color.rgb8(180, 255, 120);
const INK = Color.rgb8(26, 20, 48);
const INK_SHINE = Color.rgb8(120, 100, 200);

type Pose = 'float' | 'slump';

export class LibraryDemon extends Boss {
  pose: Pose = 'float';
  /** Spot index: 0 left, 1 middle, 2 right. */
  spot = 1;
  private cycle = 0;
  private rainLanes: Rect2[] = [];
  private slamZone: Rect2 | null = null;
  private pageZones: Rect2[] = [];
  private sinkZone: Rect2 | null = null;
  private shaking = false;

  constructor() {
    super('LibraryDemon', 'z2_wizard_academy', 0x4c494244);
  }

  protected override resetPose(): void {
    this.position = new Vec2(this.centerX(), this.arena.floorY + SLUMP_Y);
    this.spot = 1;
    this.pose = 'slump';
  }

  spotAt(spot: number, y = BOOK_Y): Vec2 {
    const x = spot === 0 ? this.sideX(-1, SPOT_INSET) : spot === 2 ? this.sideX(1, SPOT_INSET) : this.centerX();
    return new Vec2(x, this.arena.floorY + y);
  }

  laneRect(i: number): Rect2 {
    const w = (this.arena.right - this.arena.left) / LANES;
    const top = this.arena.view.y;
    return new Rect2(this.arena.left + i * w, top, w, this.arena.floorY - top);
  }

  // --- Fight --------------------------------------------------------------------

  protected override *intro(): BossScript {
    this.pose = 'float';
    yield* waitFrames(30);
    yield* this.glide(this.spotAt(1), Boss.GRACE_FRAMES - 30);
  }

  protected planCycle(): AttackPlan[] {
    const early: AttackPlan[][] = [
      [{ id: 'ink_rain', telegraph: 1.4 }, { id: 'pages', aimed: true }],
      [{ id: 'ink_wave' }, { id: 'pages', aimed: true }],
    ];
    const late: AttackPlan[][] = [
      [{ id: 'pages', aimed: true }, { id: 'ink_rain', telegraph: 1.4 }],
      [{ id: 'ink_wave' }, { id: 'ink_rain', telegraph: 1.4 }],
      [{ id: 'pages', aimed: true }, { id: 'ink_wave' }],
    ];
    const list = this.phase === 1 ? early : late;
    const plans = list[this.cycle % list.length]!;
    this.cycle += 1;
    return plans.slice(0, this.tuning.attacks_per_cycle);
  }

  protected override beginTelegraph(plan: AttackPlan, target: Vec2): void {
    this.shaking = plan.id === 'ink_wave';
    if (plan.id === 'ink_rain') {
      const offset = this.rng.randiRange(0, 2);
      this.rainLanes = [];
      for (let i = 0; i < LANES; i++) if ((i + offset) % 3 !== 0) this.rainLanes.push(this.laneRect(i));
    } else if (plan.id === 'ink_wave') {
      this.slamZone = new Rect2(this.position.x - 34, this.arena.floorY - 130, 68, 130);
    } else if (plan.id === 'pages') {
      this.pageZones = this.pageAims(target).map((v) => this.pageZone(this.pageOrigin(), v));
    }
  }

  protected attack(plan: AttackPlan, target: Vec2): BossScript {
    this.shaking = false;
    switch (plan.id) {
      case 'ink_rain':
        return this.inkRain();
      case 'ink_wave':
        return this.inkWave();
      default:
        return this.pages(target);
    }
  }

  private *inkRain(): BossScript {
    const drops: BossHazard[] = [];
    const perLane = this.phase === 1 ? 2 : 3;
    for (let k = 0; k < perLane; k++) {
      for (const lane of this.rainLanes) {
        const x = lane.center.x + (k % 2 === 0 ? -1 : 1) * lane.w * 0.22;
        drops.push(this.inkDrop(new Vec2(x, lane.y + 6)));
      }
      yield* waitFrames(this.gapFrames(12));
    }
    while (drops.some((d) => !d.isDone())) yield;
    this.rainLanes = [];
    yield* this.drift();
  }

  private inkDrop(at: Vec2): BossHazard {
    const h = new BossHazard(this, 'InkDrop', new Vec2(10, 12));
    const floor = this.arena.floorY;
    const g = 0.3 * this.speed;
    h.behave = (d) => {
      d.vel = new Vec2(0, Math.min(d.vel.y + g, 7));
      d.position = d.position.add(d.vel);
      if (d.position.y >= floor - 6) {
        Effects.dust(this.parent, new Vec2(d.position.x, floor), 0, 2);
        return true;
      }
      return false;
    };
    h.look = (gfx) => {
      gfx.polygon([new Vec2(0, -7), new Vec2(5, 1), new Vec2(0, 6), new Vec2(-5, 1)], OUTLINE);
      gfx.circle(new Vec2(0, 1), 4.5, INK);
      gfx.polygon([new Vec2(0, -6), new Vec2(3, 0), new Vec2(-3, 0)], INK);
      gfx.rect(-2, -1, 1, 2, INK_SHINE);
    };
    return this.spawnHazard(h, at);
  }

  private pageOrigin(): Vec2 {
    return this.position.add(new Vec2(0, -4));
  }

  /** Page velocities: a fan centred on the locked target. */
  private pageAims(target: Vec2): Vec2[] {
    const count = this.phase === 1 ? 3 : 5;
    const aim = target.sub(this.pageOrigin()).normalized();
    const out: Vec2[] = [];
    for (let i = 0; i < count; i++) out.push(aim.rotated((i - (count - 1) / 2) * 0.2).mul(this.speedPx(2.6)));
    return out;
  }

  /** Where a page's path is low enough to hit Sproto: from 56 px above the floor down to it. */
  private pageZone(from: Vec2, vel: Vec2): Rect2 {
    const floor = this.arena.floorY;
    const top = floor - 56;
    const at = (y: number): number => (vel.y > 0.01 ? from.x + (vel.x * (y - from.y)) / vel.y : from.x + Math.sign(vel.x) * 999);
    const x0 = at(Math.max(top, from.y));
    const x1 = at(floor);
    return new Rect2(Math.min(x0, x1) - 14, top, Math.abs(x1 - x0) + 28, floor - top);
  }

  private *pages(target: Vec2): BossScript {
    const from = this.pageOrigin();
    const pages = this.pageAims(target).map((v) => this.page(from, v));
    while (pages.some((p) => !p.isDone())) yield;
    this.pageZones = [];
    yield* this.drift();
  }

  private page(at: Vec2, vel: Vec2): BossHazard {
    const h = new BossHazard(this, 'Page', new Vec2(10, 8));
    h.vel = vel;
    const { left, right, floorY } = this.arena;
    h.behave = (p) => {
      p.position = p.position.add(p.vel);
      p.rotation = Math.sin(p.age * 0.4) * 0.5;
      const q = p.position;
      return q.y >= floorY - 4 || q.x < left || q.x > right || q.y < this.arena.view.y - 20;
    };
    h.look = (g) => {
      g.rect(-6, -5, 12, 10, OUTLINE);
      g.rect(-5, -4, 10, 8, PAGE);
      for (let y = -2; y <= 2; y += 2) g.line(new Vec2(-3, y), new Vec2(3, y), INK, 1);
    };
    return this.spawnHazard(h, at);
  }

  private *inkWave(): BossScript {
    const floor = this.arena.floorY + SLUMP_Y;
    let vy = 0;
    while (this.position.y < floor) {
      vy = Math.min(vy + 0.5, 10);
      this.position = this.position.withY(Math.min(floor, this.position.y + vy));
      yield;
    }
    this.slamZone = null;
    GameCamera.current()?.shake(2.5, 0.25);
    // From the middle spot a wave runs each way; from a side spot only towards
    // the middle (the gap by the wall stays a safe pocket).
    const waves: BossHazard[] = [];
    const dirs = this.spot === 1 ? [-1, 1] : [this.spot === 0 ? 1 : -1];
    for (const dir of dirs) waves.push(this.wave(dir));
    yield* waitFrames(this.gapFrames(24));
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + BOOK_Y), this.gapFrames(34));
    while (waves.some((w) => !w.isDone())) yield;
  }

  private wave(dir: number): BossHazard {
    const h = new BossHazard(this, 'InkWave', new Vec2(16, 14));
    h.vel = new Vec2(dir * this.speedPx(2.4), 0);
    const { left, right } = this.arena;
    h.behave = (w) => {
      w.position = w.position.add(w.vel);
      return w.position.x < left + 6 || w.position.x > right - 6;
    };
    h.look = (g, w) => {
      const d = Math.sign(w.vel.x);
      const bob = Math.sin(w.age * 0.5) * 1.5;
      g.polygon([new Vec2(-9 * d, 7), new Vec2(-6 * d, -2 + bob), new Vec2(2 * d, -8 + bob), new Vec2(9 * d, -2), new Vec2(9 * d, 7)], OUTLINE);
      g.polygon([new Vec2(-7 * d, 6), new Vec2(-5 * d, -1 + bob), new Vec2(2 * d, -6 + bob), new Vec2(7 * d, -1), new Vec2(7 * d, 6)], INK);
      g.line(new Vec2(-2 * d, -2 + bob), new Vec2(3 * d, -4 + bob), INK_SHINE, 1);
    };
    return this.spawnHazard(h, new Vec2(this.position.x + dir * 30, this.arena.floorY - 7));
  }

  /** Floats to another spot (or `to`), arcing up out of jump reach on the way. */
  private *drift(to = -1): BossScript {
    const options = [0, 1, 2].filter((s) => s !== this.spot);
    this.spot = to >= 0 ? to : options[this.rng.randiRange(0, options.length - 1)]!;
    const from = this.position;
    const dest = this.spotAt(this.spot);
    const frames = Math.max(1, Math.round(from.distanceTo(dest) / this.speedPx(2.2)));
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      this.position = from.lerp(dest, t).add(new Vec2(0, -Math.sin(t * Math.PI) * 40));
      this.facing = dest.x > from.x ? 1 : -1;
      yield;
    }
  }

  /** The spot farthest from Sproto. */
  private farSpot(): number {
    const p = this.player();
    if (!p) return this.spot;
    let best = this.spot;
    let bestD = -1;
    for (const s of [0, 1, 2]) {
      const d = Math.abs(this.spotAt(s).x - p.globalPosition.x);
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  protected *openPose(): BossScript {
    const spot = this.farSpot();
    if (spot !== this.spot) yield* this.drift(spot);
    this.sinkZone = new Rect2(this.position.x - 30, this.arena.floorY - 120, 60, 120);
    this.pose = 'slump';
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + SLUMP_Y), 36);
    this.sinkZone = null;
    Effects.dust(this.parent, new Vec2(this.position.x, this.arena.floorY), 0, 4);
  }

  protected *closePose(): BossScript {
    this.pose = 'float';
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + BOOK_Y), this.gapFrames(32));
    yield* this.drift();
  }

  protected override *recover(): BossScript {
    this.pose = 'float';
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + BOOK_Y), 44);
    yield* this.drift();
    yield* waitFrames(this.gapFrames(30));
  }

  protected updateShapes(): void {
    if (this.isDefeated) {
      this.weakPoint.setRects([]);
      this.body.setRects([]);
    } else if (this.pose === 'slump') {
      this.weakPoint.setRects([new Rect2(-17, -46, 34, 24)]);
      this.body.setRects([new Rect2(-26, -7, 52, 14), new Rect2(-9, -22, 18, 15)]);
    } else {
      this.weakPoint.setRects([new Rect2(-15, -70, 30, 22)]);
      this.body.setRects([new Rect2(-24, -8, 48, 16), new Rect2(-13, -48, 26, 40)]);
    }
  }

  override dangerZones(): Rect2[] {
    const out = [...this.rainLanes];
    if (this.slamZone) out.push(this.slamZone);
    if (this.sinkZone) out.push(this.sinkZone);
    out.push(...this.pageZones);
    return out;
  }

  protected override defeatStep(frame: number): void {
    this.pose = 'float';
    this.position = this.position.add(new Vec2(Math.sin(frame * 0.9) * 1.2, -0.25));
  }

  // --- Art ----------------------------------------------------------------------

  override drawOverlay(g: Gfx): void {
    super.drawOverlay(g);
    const t = this.currentTelegraph();
    if (t && t.plan.id === 'ink_rain') for (const lane of this.rainLanes) BossFx.laneWarning(g, lane, this.frame);
    if (t && t.plan.id === 'ink_wave' && this.slamZone) BossFx.floorWarning(g, this.slamZone.x, this.slamZone.right, this.arena.floorY, this.frame);
    if (t && t.plan.id === 'pages') {
      for (const v of this.pageAims(t.target)) {
        const from = this.pageOrigin();
        const z = this.pageZone(from, v);
        const land = v.y > 0.01 ? from.add(v.mul((this.arena.floorY - from.y) / v.y)) : from.add(v.mul(60));
        BossFx.dashedLine(g, from, land, this.frame, 1);
        BossFx.floorWarning(g, z.x + 14, z.right - 14, this.arena.floorY, this.frame, 4);
      }
    }
    if (this.sinkZone) BossFx.floorWarning(g, this.sinkZone.x, this.sinkZone.right, this.arena.floorY, this.frame, 3);
  }

  override draw(g: Gfx): void {
    const slump = this.pose === 'slump';
    const shake = this.shaking ? Math.sin(this.frame * 1.9) * 1.5 : 0;
    const f = this.frame;
    // Smoke torso: stacked puffs that sway.
    const height = slump ? 26 : 54;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const y = -6 - t * height;
      const x = Math.sin(f * 0.08 + i * 0.9) * (2 + t * 3) + shake;
      const r = (slump ? 7 : 11) - t * 3;
      g.circle(new Vec2(x, y), r + 1, OUTLINE.withAlpha(0.6));
      g.circle(new Vec2(x, y), r, this.tint(i % 2 === 0 ? SMOKE : SMOKE_LIGHT));
    }
    // Arms of smoke (raised while telegraphing).
    const tele = this.currentTelegraph();
    const lift = tele ? -10 : 0;
    for (const s of [-1, 1]) {
      const sh = new Vec2(s * 9 + shake, slump ? -16 : -36);
      const hand = sh.add(new Vec2(s * 14, (slump ? 8 : 4) + lift + Math.sin(f * 0.1 + s) * 2));
      g.line(sh, hand, OUTLINE, 6);
      g.line(sh, hand, this.tint(SMOKE_LIGHT), 4);
      g.circle(hand, 3.5, this.tint(SMOKE));
    }
    this.drawHead(g, new Vec2(shake, slump ? -36 : -58), slump);
    this.drawBook(g, shake);
    // Ink drips under the book.
    if (!slump) {
      for (let k = 0; k < 3; k++) {
        const y = 10 + ((f * 0.6 + k * 9) % 18);
        g.circle(new Vec2(-12 + k * 12 + shake, y), 1.5, INK);
      }
    }
  }

  private drawBook(g: Gfx, shake: number): void {
    const open = 0.5 + 0.5 * Math.sin(this.frame * 0.12);
    const lift = this.pose === 'slump' ? 0 : open * 2;
    // Cover (closed back) and two fanned pages.
    g.polygon([new Vec2(-26 + shake, 2), new Vec2(26 + shake, 2), new Vec2(24 + shake, 8), new Vec2(-24 + shake, 8)], OUTLINE);
    g.polygon([new Vec2(-25 + shake, 3), new Vec2(25 + shake, 3), new Vec2(23 + shake, 7), new Vec2(-23 + shake, 7)], this.tint(COVER));
    g.line(new Vec2(-23 + shake, 7), new Vec2(23 + shake, 7), COVER_EDGE, 1);
    for (const s of [-1, 1]) {
      const pts = [new Vec2(shake, 3), new Vec2(s * 23 + shake, 2 - lift), new Vec2(s * 22 + shake, -4 - lift), new Vec2(shake, -2)];
      g.polygon(pts, OUTLINE);
      g.polygon(pts.map((p) => p.lerp(new Vec2(shake + s * 11, 0), 0.12)), this.tint(PAGE));
      for (let k = 0; k < 3; k++) g.line(new Vec2(s * (5 + k * 5) + shake, -1 - k * 0.3), new Vec2(s * (8 + k * 5) + shake, -1.5 - k * 0.3), INK, 1);
    }
  }

  private drawHead(g: Gfx, at: Vec2, dizzy: boolean): void {
    // Horns: two curved prongs.
    for (const s of [-1, 1]) {
      const base = at.add(new Vec2(s * 7, -6));
      const pts = [base, base.add(new Vec2(s * 8, -6)), base.add(new Vec2(s * 6, -14)), base.add(new Vec2(s * 3, -7)), base.add(new Vec2(-s * 1, -2))];
      g.polygon(pts.map((p) => p.add(new Vec2(0, 0))), OUTLINE);
      g.polygon(pts.map((p) => p.lerp(base.add(new Vec2(s * 4, -6)), 0.25)), this.tint(HORN));
      g.line(base.add(new Vec2(s * 2, -3)), base.add(new Vec2(s * 5, -8)), HORN_SHADE, 1);
    }
    g.circle(at, 12, OUTLINE);
    g.circle(at, 11, this.tint(SMOKE));
    g.circle(at.add(new Vec2(-3, -3)), 5, this.tint(SMOKE_LIGHT).withAlpha(0.6));
    const open = this.isWeakOpen();
    if (open) g.circle(at, 15 + Math.sin(this.frame * 0.3) * 1.5, EYE.withAlpha(0.18));
    for (const s of [-1, 1]) {
      const e = at.add(new Vec2(s * 4.5, 1));
      if (dizzy) {
        g.circle(e, 2.5, EYE.withAlpha(0.5));
        g.arc(e, 2, this.frame * 0.35 * s, this.frame * 0.35 * s + 4.5, OUTLINE, 1);
      } else {
        const glow = this.currentTelegraph()?.plan.aimed ? PAGE : EYE;
        g.polygon([e.add(new Vec2(-3, -1 - s * 0.5)), e.add(new Vec2(3, -1 + s * 0.5)), e.add(new Vec2(2, 2)), e.add(new Vec2(-2, 2))], glow);
      }
    }
    // A jagged grin.
    const m = at.add(new Vec2(0, 6));
    g.polyline([m.add(new Vec2(-5, 0)), m.add(new Vec2(-2.5, 1.5)), m.add(new Vec2(0, 0)), m.add(new Vec2(2.5, 1.5)), m.add(new Vec2(5, 0))], EYE, 1);
  }
}
