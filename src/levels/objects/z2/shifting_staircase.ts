// A shifting staircase (Wizard Academy, docs/DESIGN.md): a flight of floating
// stone steps that shifts between two layouts on a timer.
//   Layout A: step i sits at i * rise (a staircase).
//   Layout B: step i sits at i * (rise + fold). With the defaults the flight
//   folds flat into a bridge, then rises again.
// Each step is a MovingBody (docs/CONTRACTS.md "Moving terrain"): Sproto rides
// it up and down. Every shift is eased and never faster than `maxSpeed`
// px/frame (the contract allows at most 6 px/frame down for a ridden
// platform). Before each shift the runes on the steps glow and the telegraph
// sound plays for Difficulty.telegraph(telegraphSeconds, local), never under
// 0.35 s. The hold between shifts scales with interval_mult. Steps never
// overlap or pinch each other: they move in step, in their own columns. Keep
// 39 px of headroom above the highest layout (the crush rule). With
// `pillars`, each step is a stone pillar reaching down to the first step's
// level (sunk into the floor in the lower layout), so nothing can get under a
// step and be pinned when it comes down; draw it behind the terrain
// (z_index -1) so the sunk part is hidden. The origin is the top-left corner
// of the first step.

import { drawPropSprite, PropSprite } from '../prop_sprite';
import { TerrainArt } from '../../../terrain/terrain_art';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { clamp } from '../../../runtime/math';
import { Node2D } from '../../../runtime/node';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import { MovingBody } from '../../common/moving_body';
import type { Configurable, Props } from '../../common/props';

export enum StairPhase {
  HOLD_A,
  WARN_B,
  TO_B,
  HOLD_B,
  WARN_A,
  TO_A,
}

const RUNE = new Color(0.62, 0.42, 0.9);
const RUNE_GLOW = new Color(1.0, 0.86, 0.4);
const RUNE_GLOW_HALF = RUNE_GLOW.withAlpha(0.5);
const STONE = new Color(0.62, 0.6, 0.7);
const STONE_LIGHT = new Color(0.8, 0.79, 0.88);
const STONE_DARK = new Color(0.36, 0.33, 0.46);
const OUTLINE = new Color(0.14, 0.11, 0.22);

/** One floating stone step: a slab with a rune line that glows before a shift. */
export class StairStep extends MovingBody {
  size = new Vec2(48, 16);
  glow = false;

  cullRect(): Rect2 {
    return new Rect2(-2, -2, this.size.x + 4, this.size.y + 4);
  }

  override draw(g: Gfx): void {
    const size = this.size;
    g.rect(-1, -1, size.x + 2, size.y + 2, OUTLINE);
    g.rect(0, 0, size.x, size.y, STONE_DARK);
    const stone = TerrainArt.materials('z2_wizard_academy').fill;
    if (stone) g.tiled(stone, new Rect2(0, 0, size.x, size.y));
    // The step's top slab, then a pillar of stone courses below it.
    const depth = Math.min(16, size.y);
    if (!drawPropSprite(g, PropSprite.stairTread, new Vec2(size.x / 2, depth / 2), new Vec2(size.x / 42, depth / 14))) {
      g.rect(0, 0, size.x, depth, STONE);
    }
    g.rect(0, 0, size.x, 2, STONE_LIGHT);
    let y = 16.0;
    let course = 0;
    while (!stone && y < size.y) {
      g.line(new Vec2(0, y), new Vec2(size.x, y), OUTLINE, 1);
      const joint = size.x / 2 + (course % 2 === 0 ? 12 : -12);
      g.line(new Vec2(joint, y), new Vec2(joint, Math.min(y + 8, size.y)), OUTLINE, 1);
      y += 8;
      course += 1;
    }
    const rune = this.glow ? RUNE_GLOW : RUNE;
    g.line(new Vec2(6, 8), new Vec2(size.x - 6, 8), rune, 1);
    for (const x of [size.x * 0.25, size.x * 0.5, size.x * 0.75]) g.rect(x - 1.5, 6.5, 3, 3, rune);
    if (this.glow) g.rect(-2, -2, size.x + 4, Math.min(size.y, 16) + 4, RUNE_GLOW_HALF, false, 1);
  }
}

export class ShiftingStaircase extends Node2D implements Configurable {
  readonly telegraphed = new Signal();
  readonly shiftStarted = new Signal();

  steps = 5;
  stepSize = new Vec2(48, 16);
  /** Offset from one step to the next in layout A (y < 0 rises). */
  rise = new Vec2(48, -32);
  /** Extra offset per step in layout B. */
  fold = new Vec2(0, 32);
  /** Frames each layout holds at difficulty 1 (scaled by interval_mult). */
  holdFrames = 150;
  /** Frames a shift takes (raised when needed to respect maxSpeed). */
  shiftFrames = 60;
  /** Fastest any step moves, px/frame. */
  maxSpeed = 4.0;
  telegraphSeconds = 0.5;
  /** Extra frames before the first cycle (to stagger several). */
  firstDelay = 0;
  /** Steps are pillars down to the first step's level (see above). */
  pillars = false;

  phase = StairPhase.HOLD_A;
  private timer = 0;
  private _blend = 0;
  private bodies: StairStep[] = [];
  private d = NaN;

  constructor(name = 'ShiftingStaircase') {
    super(name);
  }

  applyProps(p: Props): void {
    this.steps = p.int('steps', this.steps);
    this.stepSize = p.vec('step_size', this.stepSize);
    this.rise = p.vec('rise', this.rise);
    this.fold = p.vec('fold', this.fold);
    this.holdFrames = p.int('hold_frames', this.holdFrames);
    this.shiftFrames = p.int('shift_frames', this.shiftFrames);
    this.maxSpeed = p.num('max_speed', this.maxSpeed);
    this.telegraphSeconds = p.num('telegraph_seconds', this.telegraphSeconds);
    this.firstDelay = p.int('first_delay', this.firstDelay);
    this.pillars = p.bool('pillars', this.pillars);
  }

  override ready(): void {
    for (let i = 0; i < this.steps; i++) {
      const step = new StairStep(`Step${i + 1}`);
      step.size = new Vec2(this.stepSize.x, this.stepSize.y + (this.pillars ? Math.abs(this.rise.y) * i : 0));
      step.position = this.stepPosition(i, 0);
      step.addBox(step.size);
      this.addChild(step);
      this.bodies.push(step);
    }
    this.timer = -this.firstDelay;
  }

  override physicsProcess(): void {
    this.timer += 1;
    switch (this.phase) {
      case StairPhase.HOLD_A:
      case StairPhase.HOLD_B:
        if (this.timer >= this.hold() - this.warning()) {
          this.setPhase(this.phase === StairPhase.HOLD_A ? StairPhase.WARN_B : StairPhase.WARN_A);
          this.telegraphed.emit();
          LevelFx.playTelegraph();
        }
        break;
      case StairPhase.WARN_B:
      case StairPhase.WARN_A:
        if (this.timer >= this.warning()) {
          this.setPhase(this.phase === StairPhase.WARN_B ? StairPhase.TO_B : StairPhase.TO_A);
          this.shiftStarted.emit();
        }
        break;
      case StairPhase.TO_B:
      case StairPhase.TO_A: {
        const t = clamp(this.timer / this.shift(), 0, 1);
        const eased = (1 - Math.cos(Math.PI * t)) / 2;
        this._blend = this.phase === StairPhase.TO_B ? eased : 1 - eased;
        if (this.timer >= this.shift()) this.setPhase(this.phase === StairPhase.TO_B ? StairPhase.HOLD_B : StairPhase.HOLD_A);
        break;
      }
    }
    const glow = this.isTelegraphing();
    for (let i = 0; i < this.bodies.length; i++) {
      const step = this.bodies[i]!;
      step.moveTo(this.stepPosition(i, this._blend));
      step.glow = glow;
    }
  }

  private setPhase(phase: StairPhase): void {
    this.phase = phase;
    this.timer = 0;
  }

  /** Step i's local position, blended between layout A (0) and B (1). */
  private stepPosition(i: number, blend: number): Vec2 {
    return this.rise.mul(i).add(this.fold.mul(i * blend));
  }

  /** 0 in layout A, 1 in layout B. */
  blend(): number {
    return this._blend;
  }

  isTelegraphing(): boolean {
    return this.phase === StairPhase.WARN_A || this.phase === StairPhase.WARN_B;
  }

  isShifting(): boolean {
    return this.phase === StairPhase.TO_A || this.phase === StairPhase.TO_B;
  }

  stepBodies(): MovingBody[] {
    return this.bodies;
  }

  localDifficulty(): number {
    if (Number.isNaN(this.d)) this.d = LevelDifficulty.at(this);
    return this.d;
  }

  /** Frames each layout holds, warning included. */
  hold(): number {
    return Math.max(LevelDifficulty.intervalFrames(this.holdFrames, this.localDifficulty()), this.warning() + 1);
  }

  warning(): number {
    return LevelDifficulty.telegraphFrames(this.telegraphSeconds, this.localDifficulty());
  }

  /** Frames per shift: at least shiftFrames, and slow enough that the eased
   * peak speed (pi / 2 * distance / frames) stays within maxSpeed. */
  shift(): number {
    const longest = this.fold.mul(this.steps - 1).length();
    return Math.max(this.shiftFrames, Math.ceil(((Math.PI / 2) * longest) / this.maxSpeed));
  }
}
