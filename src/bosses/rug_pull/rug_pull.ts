// The Rug Pull, Zone 1's boss (docs/LEVELS.md, docs/DESIGN.md): a floating
// magic carpet with angry stitched eyes. D 2.5, one attack per opening,
// 2.0 s weak-point window, ten-percent-ish speed-ups after hits 4 and 6.
//
// It hovers out of reach near one wall. Each cycle it does one attack:
//   - sweep: drops low at its wall (telegraph), then skims across the floor
//     to the other wall; jump over it;
//   - drop (aimed): glides above where Sproto stood when the telegraph
//     started (a shadow marks it) and slams down there; move away;
//   - dust (from phase 2): beats itself low at its wall and sends two dust
//     waves rolling along the floor, close together; one jump clears both.
// Then it flops flat on the floor at its wall, dizzy, with its glowing
// stitched patch up: the weak point. Jump (or roll) into the patch; walking
// into its edge hurts. After a hit it floats back up out of reach.
// Phase 1: sweep / drop. Phase 2: sweep / dust / drop. Phase 3: faster.

import { BossSprite } from '../boss_sprites';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { Effects } from '../../player/effects';
import { GameCamera } from '../../camera/game_camera';
import { Boss, BossHazard, waitFrames, type AttackPlan, type BossScript } from '../boss_base';
import { BossFx, OUTLINE } from '../boss_fx';

const HALF = 36;
const HOME_Y = -130;
const LOW_Y = -16;
const FLAT_Y = -6;
const HOME_INSET = 64;

const RUG = Color.rgb8(176, 42, 66);
const RUG_SHADE = Color.rgb8(120, 24, 52);
const BORDER = Color.rgb8(240, 190, 70);
const PATTERN = Color.rgb8(70, 40, 130);
const FRINGE = Color.rgb8(250, 226, 150);
const STITCH = Color.rgb8(255, 246, 220);
const PATCH = Color.rgb8(120, 230, 190);
const DUST = Color.rgb8(214, 190, 150);

type Pose = 'fly' | 'flat';

export class RugPull extends Boss {
  /** Wall it hovers near: -1 left, 1 right. */
  home = 1;
  pose: Pose = 'fly';
  private cycle = 0;
  private dropX = 0;
  private shaking = 0;

  constructor() {
    super('RugPull', 'z1_retro_rush_hills', 0x52554750);
  }

  protected override resetPose(): void {
    this.position = new Vec2(this.centerX(), this.arena.floorY + HOME_Y);
    this.home = 1;
  }

  homeAt(side: number, y = HOME_Y): Vec2 {
    return new Vec2(this.sideX(side, HOME_INSET), this.arena.floorY + y);
  }

  // --- Fight --------------------------------------------------------------------

  protected override *intro(): BossScript {
    yield* this.glide(this.homeAt(this.home), Boss.GRACE_FRAMES);
  }

  protected planCycle(): AttackPlan[] {
    const rotation: AttackPlan[][] = [
      [{ id: 'sweep' }, { id: 'drop', aimed: true }],
      [{ id: 'sweep' }, { id: 'dust' }, { id: 'drop', aimed: true }],
      [{ id: 'drop', aimed: true }, { id: 'sweep' }, { id: 'dust' }],
    ];
    const list = rotation[Math.min(this.phase, 3) - 1]!;
    const plan = list[this.cycle % list.length]!;
    this.cycle += 1;
    return [plan];
  }

  protected override beginTelegraph(plan: AttackPlan, target: Vec2): void {
    if (plan.id === 'drop') this.dropX = this.clampX(target.x, HALF + 4);
  }

  protected override telegraphStep(plan: AttackPlan, _target: Vec2, frame: number, total: number): void {
    const t = Math.min(1, (frame + 1) / Math.max(1, Math.round(total * 0.7)));
    if (plan.id === 'drop') {
      const from = this.position;
      const to = new Vec2(this.dropX, this.arena.floorY + HOME_Y);
      this.position = from.lerp(to, Math.min(1, t * 0.35 + 0.05));
    } else {
      // Sweep and dust: sink to skimming height at its wall, shaking.
      const to = this.homeAt(this.home, LOW_Y);
      this.position = this.position.lerp(to, Math.min(1, t * 0.3 + 0.04));
      this.shaking = 1;
    }
  }

  protected attack(plan: AttackPlan): BossScript {
    this.shaking = 0;
    switch (plan.id) {
      case 'drop':
        return this.drop();
      case 'dust':
        return this.dust();
      default:
        return this.sweep();
    }
  }

  private *sweep(): BossScript {
    this.position = this.homeAt(this.home, LOW_Y);
    const other = -this.home;
    yield* this.moveTo(this.homeAt(other, LOW_Y), this.speedPx(3.0));
    this.home = other;
    yield* this.glide(this.homeAt(this.home), this.gapFrames(40));
  }

  private *drop(): BossScript {
    this.position = new Vec2(this.dropX, this.position.y);
    let vy = 0;
    const floor = this.arena.floorY + FLAT_Y;
    while (this.position.y < floor) {
      vy = Math.min(vy + 0.45 * this.speed, 12);
      this.position = this.position.withY(Math.min(floor, this.position.y + vy));
      yield;
    }
    Effects.dust(this.parent, new Vec2(this.position.x - HALF, this.arena.floorY), -1, 3);
    Effects.dust(this.parent, new Vec2(this.position.x + HALF, this.arena.floorY), 1, 3);
    GameCamera.current()?.shake(2, 0.2);
    yield* waitFrames(this.gapFrames(20));
    yield* this.glide(new Vec2(this.position.x, this.arena.floorY + HOME_Y), this.gapFrames(36));
    this.home = this.position.x > this.centerX() ? 1 : -1;
    yield* this.glide(this.homeAt(this.home), this.gapFrames(30));
  }

  private *dust(): BossScript {
    this.position = this.homeAt(this.home, LOW_Y);
    const dir = -this.home;
    const waves: BossHazard[] = [];
    for (let i = 0; i < 2; i++) {
      this.shaking = 1;
      yield* waitFrames(6);
      this.shaking = 0;
      waves.push(this.dustWave(dir));
      // Close together: one jump clears both.
      yield* waitFrames(this.gapFrames(16));
    }
    while (waves.some((w) => !w.isDone())) yield;
    yield* this.glide(this.homeAt(this.home), this.gapFrames(30));
  }

  private dustWave(dir: number): BossHazard {
    const h = new BossHazard(this, 'DustWave', new Vec2(18, 16));
    h.vel = new Vec2(dir * this.speedPx(2.6), 0);
    const left = this.arena.left;
    const right = this.arena.right;
    h.behave = (w) => {
      w.position = w.position.add(w.vel);
      return w.position.x < left + 6 || w.position.x > right - 6;
    };
    h.look = (g, w) => {
      for (let k = 0; k < 4; k++) {
        const x = (k - 1.5) * 5;
        const r = 5 + Math.sin(w.age * 0.4 + k) * 1.5;
        g.circle(new Vec2(x, 2 - (k % 2) * 4), r + 1, OUTLINE.withAlpha(0.5));
        g.circle(new Vec2(x, 2 - (k % 2) * 4), r, DUST);
      }
    };
    return this.spawnHazard(h, new Vec2(this.position.x + dir * (HALF + 10), this.arena.floorY - 8));
  }

  protected *openPose(): BossScript {
    yield* this.glide(this.homeAt(this.home), this.gapFrames(16));
    this.pose = 'flat';
    yield* this.glide(this.homeAt(this.home, FLAT_Y), 40);
    Effects.dust(this.parent, new Vec2(this.position.x, this.arena.floorY), 0, 4);
  }

  protected *closePose(): BossScript {
    this.pose = 'fly';
    yield* this.glide(this.homeAt(this.home), this.gapFrames(36));
  }

  protected override *recover(): BossScript {
    this.pose = 'fly';
    yield* this.glide(this.homeAt(this.home), 50);
    yield* waitFrames(this.gapFrames(40));
  }

  protected updateShapes(): void {
    if (this.isDefeated) {
      this.weakPoint.setRects([]);
      this.body.setRects([]);
    } else if (this.pose === 'flat') {
      this.weakPoint.setRects([new Rect2(-28, -14, 56, 13)]);
      this.body.setRects([new Rect2(-HALF, 1, HALF * 2, 5)]);
    } else {
      this.weakPoint.setRects([new Rect2(-20, -12, 40, 8)]);
      this.body.setRects([new Rect2(-HALF, -6, HALF * 2, 12)]);
    }
  }

  override dangerZones(): Rect2[] {
    const t = this.currentTelegraph();
    if (t && t.plan.id === 'drop') return [new Rect2(this.dropX - HALF, this.arena.floorY - 150, HALF * 2, 150)];
    if (t && t.plan.id === 'sweep') return [new Rect2(this.arena.left, this.arena.floorY - 30, this.arena.right - this.arena.left, 30)];
    return [];
  }

  protected override defeatStep(frame: number): void {
    this.pose = 'fly';
    this.position = this.position.add(new Vec2(Math.sin(frame * 0.7) * 1.5, frame < 60 ? -0.2 : 0.8));
    this.rotation = Math.sin(frame * 0.3) * 0.2;
  }

  // --- Art ----------------------------------------------------------------------

  override drawOverlay(g: Gfx): void {
    super.drawOverlay(g);
    const t = this.currentTelegraph();
    const floor = this.arena.floorY;
    if (t && t.plan.id === 'drop') BossFx.floorWarning(g, this.dropX - HALF, this.dropX + HALF, floor, this.frame);
    if (t && (t.plan.id === 'sweep' || t.plan.id === 'dust')) {
      const y = floor + LOW_Y;
      BossFx.dashedLine(g, new Vec2(this.position.x, y), new Vec2(this.sideX(-this.home, 20), y), this.frame);
    }
  }

  override draw(g: Gfx): void {
    const shake = this.shaking > 0 ? Math.sin(this.frame * 1.7) * 1.5 : 0;
    const flat = this.pose === 'flat';
    // Shadow on the floor (shows where it is above the ground).
    const floorLocal = this.arena.floorY - this.position.y;
    if (floorLocal > 8) g.ellipse(new Vec2(0, floorLocal), HALF * Math.max(0.4, 1 - floorLocal / 260), 3, new Color(0, 0, 0, 0.25));
    if (this.drawBossSprite(g, BossSprite.rug, 8, flat ? 0.84 : 1, flat)) {
      if (this.isWeakOpen()) BossFx.weakPoint(g, this.weakRect(), this.globalPosition, this.frame);
      return;
    }
    const wave = (x: number): number => (flat ? 0 : Math.sin(x * 0.12 + this.frame * 0.18) * 2.2);
    const top: Vec2[] = [];
    const bottom: Vec2[] = [];
    for (let x = -HALF; x <= HALF; x += 6) {
      top.push(new Vec2(x + shake + 4, -6 + wave(x)));
      bottom.push(new Vec2(x + shake - 4, 4 + wave(x)));
    }
    const face = [...top, ...[...bottom].reverse()];
    g.polygon(face.map((p) => p.add(new Vec2(0, 0))), OUTLINE);
    const inner = face.map((p) => p.add(new Vec2(0, 0)).lerp(new Vec2(0, -1), 0.08));
    g.polygon(inner, this.tint(RUG));
    // Front edge thickness.
    const edge = [...bottom, ...[...bottom].reverse().map((p) => p.add(new Vec2(0, 3)))];
    g.polygon(edge, this.tint(RUG_SHADE));
    g.polyline(bottom.map((p) => p.add(new Vec2(0, 3))), OUTLINE, 1);
    // Border and pattern.
    g.polyline(top.map((p) => p.add(new Vec2(0, 2))), this.tint(BORDER), 1);
    g.polyline(bottom.map((p) => p.add(new Vec2(0, -2))), this.tint(BORDER), 1);
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      const c = new Vec2(k * 13 + shake, -1 + wave(k * 13));
      g.polygon([c.add(new Vec2(0, -3)), c.add(new Vec2(4, 0)), c.add(new Vec2(0, 3)), c.add(new Vec2(-4, 0))], this.tint(PATTERN));
    }
    // Fringe tassels at both ends.
    for (const end of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const base = (end < 0 ? top[0]! : top[top.length - 1]!).lerp(end < 0 ? bottom[0]! : bottom[bottom.length - 1]!, i / 3);
        const tip = base.add(new Vec2(end * (5 + Math.sin(this.frame * 0.3 + i) * 1.5), 1));
        g.line(base, tip, FRINGE, 1);
      }
    }
    // The stitched patch (weak point): glows while open.
    const open = this.isWeakOpen();
    const pc = new Vec2(shake, -1 + wave(0));
    const glow = open ? 0.5 + 0.5 * Math.sin(this.frame * 0.3) : 0;
    if (open) g.circle(pc, 9 + glow * 2, PATCH.withAlpha(0.35));
    g.polygon([pc.add(new Vec2(0, -5)), pc.add(new Vec2(7, 0)), pc.add(new Vec2(0, 5)), pc.add(new Vec2(-7, 0))], OUTLINE);
    g.polygon([pc.add(new Vec2(0, -4)), pc.add(new Vec2(6, 0)), pc.add(new Vec2(0, 4)), pc.add(new Vec2(-6, 0))], this.tint(open ? PATCH : PATCH.darkened(0.4)));
    g.line(pc.add(new Vec2(-3, -2)), pc.add(new Vec2(3, 2)), STITCH, 1);
    g.line(pc.add(new Vec2(-3, 2)), pc.add(new Vec2(3, -2)), STITCH, 1);
    this.drawEyes(g, shake, wave, flat);
  }

  private drawEyes(g: Gfx, shake: number, wave: (x: number) => number, dizzy: boolean): void {
    const f = this.facing;
    for (const side of [-1, 1]) {
      const c = new Vec2(f * 20 + side * 7 + shake, -2 + wave(f * 20 + side * 7));
      if (dizzy) {
        g.circle(c, 3, STITCH);
        g.arc(c, 2, this.frame * 0.3, this.frame * 0.3 + 4.5, OUTLINE, 1);
        continue;
      }
      // Angry slanted stitched eye: a white wedge with a dark pupil and cross-stitch brows.
      const inner = side * f < 0 ? 1 : -1;
      g.polygon([c.add(new Vec2(-3.5, -1 + inner)), c.add(new Vec2(3.5, -1 - inner)), c.add(new Vec2(3, 2)), c.add(new Vec2(-3, 2))], STITCH);
      g.rect(c.x - 1 + f, c.y, 2, 2, OUTLINE);
      g.line(c.add(new Vec2(-4, -3 + inner * 1.5)), c.add(new Vec2(4, -3 - inner * 1.5)), OUTLINE, 1);
      for (let s = -3; s <= 3; s += 3) g.line(c.add(new Vec2(s, -5)), c.add(new Vec2(s + 1, -3.5)), STITCH, 1);
    }
  }
}
