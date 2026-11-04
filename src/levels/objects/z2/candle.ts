// A candle (Wizard Academy hazard, docs/DESIGN.md "candle-lit halls"): a tall
// candle in a holder whose flame flares up on a timer. Before a flare the
// flame sputters and flickers (and the telegraph sound plays) for
// Difficulty.telegraph(telegraphSeconds, local), never under 0.35 s. While it
// flares, touching the flame hurts, rolling or jumping included; the rest of
// the time the candle is harmless decoration (no collision), so it can be
// jumped while low. The quiet time scales with interval_mult. The origin is
// the middle of the holder's base, on the floor.

import { Layers } from '../../../core/layers';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Node2D } from '../../../runtime/node';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';

export enum CandlePhase {
  LOW,
  WARNING,
  FLARE,
}

const CANDLE_HEIGHT = 22.0;
const FLAME_WIDTH = 14.0;
const WAX = new Color(0.98, 0.93, 0.8);
const WAX_SHADE = new Color(0.84, 0.76, 0.6);
const HOLDER = new Color(0.6, 0.38, 0.86);
const HOLDER_DARK = new Color(0.32, 0.16, 0.5);
const GOLD = new Color(0.98, 0.8, 0.3);
const OUTLINE = new Color(0.14, 0.1, 0.2);
const FLAME = new Color(1.0, 0.62, 0.16);
const FLAME_CORE = new Color(1.0, 0.93, 0.55);
const FLAME_HOT = new Color(1.0, 0.4, 0.12);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class Candle extends Node2D implements Configurable {
  static readonly CANDLE_HEIGHT = CANDLE_HEIGHT;
  readonly telegraphed = new Signal();

  /** Frames with the flame low at difficulty 1 (scaled by interval_mult). */
  lowFrames = 150;
  /** Frames the flame stays up. */
  flareFrames = 60;
  telegraphSeconds = 0.5;
  /** How tall the flare is above the wick, px. */
  flareHeight = 40.0;
  /** Extra frames before the first cycle (to stagger several). */
  firstDelay = 0;

  phase = CandlePhase.LOW;
  private timer = 0;
  private readonly flame: PlayerArea;
  private readonly flameShape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private d = NaN;

  constructor(name = 'Candle') {
    super(name);
    this.flame = new PlayerArea('Flame');
    this.flame.collisionLayer = Layers.HAZARDS;
    this.flame.monitorable = true;
    this.flame.addShape(this.flameShape);
    this.addChild(this.flame);
    this.layout();
  }

  applyProps(p: Props): void {
    this.lowFrames = p.int('low_frames', this.lowFrames);
    this.flareFrames = p.int('flare_frames', this.flareFrames);
    this.telegraphSeconds = p.num('telegraph_seconds', this.telegraphSeconds);
    this.flareHeight = p.num('flare_height', this.flareHeight);
    this.firstDelay = p.int('first_delay', this.firstDelay);
    this.layout();
  }

  private layout(): void {
    this.flameShape.size = new Vec2(FLAME_WIDTH, this.flareHeight);
    this.flameShape.offset = new Vec2(0, -CANDLE_HEIGHT - this.flareHeight / 2);
    this.flame.shapesChanged();
  }

  override ready(): void {
    this.timer = -this.firstDelay;
  }

  override physicsProcess(): void {
    this.timer += 1;
    switch (this.phase) {
      case CandlePhase.LOW:
        if (this.timer >= this.quiet() - this.warning()) {
          this.phase = CandlePhase.WARNING;
          this.timer = 0;
          this.telegraphed.emit();
          LevelFx.playTelegraph();
        }
        break;
      case CandlePhase.WARNING:
        if (this.timer >= this.warning()) {
          this.phase = CandlePhase.FLARE;
          this.timer = 0;
        }
        break;
      case CandlePhase.FLARE:
        for (const player of this.flame.playersInside()) {
          if (player.state !== 'dead') player.hurt(this.globalPosition.add(new Vec2(0, -CANDLE_HEIGHT)));
        }
        if (this.timer >= this.flareFrames) {
          this.phase = CandlePhase.LOW;
          this.timer = 0;
        }
        break;
    }
  }

  isTelegraphing(): boolean {
    return this.phase === CandlePhase.WARNING;
  }

  isFlaring(): boolean {
    return this.phase === CandlePhase.FLARE;
  }

  localDifficulty(): number {
    if (Number.isNaN(this.d)) this.d = LevelDifficulty.at(this);
    return this.d;
  }

  /** Frames between flares, the warning included. */
  quiet(): number {
    return Math.max(LevelDifficulty.intervalFrames(this.lowFrames, this.localDifficulty()), this.warning() + 1);
  }

  warning(): number {
    return LevelDifficulty.telegraphFrames(this.telegraphSeconds, this.localDifficulty());
  }

  cullRect(): Rect2 {
    const top = CANDLE_HEIGHT + 3 + Math.max(this.flareHeight, 20) + 2;
    return new Rect2(-12, -top, 24, top + 2);
  }

  override draw(g: Gfx): void {
    // Holder: a purple dish with a gold rim.
    g.rect(-10, -5, 20, 5, OUTLINE);
    g.rect(-9, -4, 18, 3, HOLDER);
    g.rect(-9, -2, 18, 1, HOLDER_DARK);
    g.rect(-9, -5, 18, 1, GOLD);
    // Wax with a drip.
    g.rect(-5, -CANDLE_HEIGHT - 1, 10, CANDLE_HEIGHT - 3, OUTLINE);
    g.rect(-4, -CANDLE_HEIGHT, 8, CANDLE_HEIGHT - 5, WAX);
    g.rect(2, -CANDLE_HEIGHT, 2, CANDLE_HEIGHT - 5, WAX_SHADE);
    g.rect(-4, -CANDLE_HEIGHT + 1, 2, 5, WAX);
    g.line(new Vec2(0, -CANDLE_HEIGHT), new Vec2(0, -CANDLE_HEIGHT - 3), OUTLINE, 1);
    const wick = new Vec2(0, -CANDLE_HEIGHT - 3);
    const t = this.timer;
    switch (this.phase) {
      case CandlePhase.LOW:
        this.drawFlame(g, wick, 4, 7 + (Math.trunc(t / 6) % 2), FLAME, FLAME_CORE);
        break;
      case CandlePhase.WARNING: {
        // Sputtering: the flame jumps between small and tall and flashes.
        const tall = 8 + ((t * 7) % 11);
        this.drawFlame(g, wick.add(new Vec2((t % 3) - 1, 0)), 5, tall, Math.trunc(t / 3) % 2 === 0 ? FLAME_HOT : FLAME, FLAME_CORE);
        break;
      }
      case CandlePhase.FLARE: {
        const sway = Math.sin(t * 0.4) * 1.5;
        this.drawFlame(g, wick.add(new Vec2(sway, 0)), FLAME_WIDTH / 2, this.flareHeight, FLAME_HOT, FLAME);
        this.drawFlame(g, wick.add(new Vec2(sway * 0.5, 0)), FLAME_WIDTH / 4, this.flareHeight * 0.6, FLAME_CORE, FLAME_CORE);
        break;
      }
    }
  }

  /** A teardrop flame standing on `base`, `halfWidth` wide and `height` tall. */
  private drawFlame(g: Gfx, base: Vec2, halfWidth: number, height: number, color: Color, core: Color): void {
    const points: Vec2[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (Math.PI * k) / 8;
      points.push(base.add(new Vec2(Math.cos(a) * halfWidth, Math.sin(a) * halfWidth * 0.6 - halfWidth * 0.6)));
    }
    points.push(base.add(new Vec2(0, -height)));
    g.polygon(points, color);
    g.polyline(points, OUTLINE, 1, true);
    g.circle(base.add(new Vec2(0, -height * 0.25)), halfWidth * 0.45, core);
  }
}
