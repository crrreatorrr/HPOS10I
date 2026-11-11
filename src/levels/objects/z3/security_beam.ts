// A security beam (Capital Mansion hazard): an emitter on the ceiling that
// fires a laser straight down to the floor on a timer. Before the beam comes
// on, the emitter blinks red and a dotted aiming line appears, with the
// telegraph sound, for Difficulty.telegraph(telegraphSeconds, local), never
// under 0.35 s. While the beam is on, touching it hurts, jumping or rolling
// included; the rest of the time it is harmless. The off time scales with
// interval_mult. The origin is the emitter, on the ceiling.

import { Layers } from '../../../core/layers';
import { drawPropSprite, PropSprite } from '../prop_sprite';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Node2D } from '../../../runtime/node';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';

export enum BeamPhase {
  OFF,
  WARNING,
  ON,
}

const EMITTER = new Color(0.3, 0.32, 0.4);
const EMITTER_DARK = new Color(0.14, 0.15, 0.2);
const LENS = new Color(0.9, 0.2, 0.2);
const LENS_OFF = new Color(0.4, 0.1, 0.1);
const BEAM = new Color(1.0, 0.25, 0.3);
const BEAM_HALF = BEAM.withAlpha(0.5);
const BEAM_GLOW = BEAM.withAlpha(0.55);
const BEAM_SPOT = BEAM.withAlpha(0.7);
const BEAM_CORE = new Color(1.0, 0.85, 0.85);
const OUTLINE = new Color(0.08, 0.08, 0.12);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class SecurityBeam extends Node2D implements Configurable {
  readonly telegraphed = new Signal();

  /** How far down the beam reaches (to the floor). */
  length = 160.0;
  /** Frames off at difficulty 1 (scaled by interval_mult), and on. */
  offFrames = 150;
  onFrames = 60;
  telegraphSeconds = 0.5;
  /** Extra frames before the first cycle (to stagger several). */
  firstDelay = 0;

  phase = BeamPhase.OFF;
  private timer = 0;
  private readonly beam: PlayerArea;
  private readonly beamShape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private d = NaN;

  constructor(name = 'SecurityBeam') {
    super(name);
    this.beam = new PlayerArea('Beam');
    this.beam.collisionLayer = Layers.HAZARDS;
    this.beam.monitorable = true;
    this.beam.addShape(this.beamShape);
    this.addChild(this.beam);
    this.layout();
  }

  applyProps(p: Props): void {
    this.length = p.num('length', this.length);
    this.offFrames = p.int('off_frames', this.offFrames);
    this.onFrames = p.int('on_frames', this.onFrames);
    this.telegraphSeconds = p.num('telegraph_seconds', this.telegraphSeconds);
    this.firstDelay = p.int('first_delay', this.firstDelay);
    this.layout();
  }

  private layout(): void {
    this.beamShape.size = new Vec2(6, this.length);
    this.beamShape.offset = new Vec2(0, this.length / 2);
    this.beam.shapesChanged();
  }

  override ready(): void {
    this.timer = -this.firstDelay;
  }

  override physicsProcess(): void {
    this.timer += 1;
    switch (this.phase) {
      case BeamPhase.OFF:
        if (this.timer >= this.quiet() - this.warning()) {
          this.phase = BeamPhase.WARNING;
          this.timer = 0;
          this.telegraphed.emit();
          LevelFx.playTelegraph();
        }
        break;
      case BeamPhase.WARNING:
        if (this.timer >= this.warning()) {
          this.phase = BeamPhase.ON;
          this.timer = 0;
        }
        break;
      case BeamPhase.ON:
        for (const player of this.beam.playersInside()) {
          if (player.state !== 'dead') player.hurt(new Vec2(this.globalPosition.x, player.globalPosition.y));
        }
        if (this.timer >= this.onFrames) {
          this.phase = BeamPhase.OFF;
          this.timer = 0;
        }
        break;
    }
  }

  isTelegraphing(): boolean {
    return this.phase === BeamPhase.WARNING;
  }

  isOn(): boolean {
    return this.phase === BeamPhase.ON;
  }

  localDifficulty(): number {
    if (Number.isNaN(this.d)) this.d = LevelDifficulty.at(this);
    return this.d;
  }

  /** Frames off between beams, the warning included. */
  quiet(): number {
    return Math.max(LevelDifficulty.intervalFrames(this.offFrames, this.localDifficulty()), this.warning() + 1);
  }

  warning(): number {
    return LevelDifficulty.telegraphFrames(this.telegraphSeconds, this.localDifficulty());
  }

  cullRect(): Rect2 {
    return new Rect2(-10, -2, 20, this.length + 14);
  }

  override draw(g: Gfx): void {
    // The emitter housing, hanging from the ceiling.
    const drawn = drawPropSprite(g, PropSprite.beamEmitter, new Vec2(0, 5));
    if (!drawn) {
      g.rect(-9, -1, 18, 12, OUTLINE);
      g.rect(-8, 0, 16, 10, EMITTER);
      g.rect(-8, 7, 16, 3, EMITTER_DARK);
    }
    const t = this.timer;
    const blink = this.phase === BeamPhase.WARNING && Math.trunc(t / 3) % 2 === 0;
    const lens = new Vec2(0, drawn ? 5 : 10);
    g.circle(lens, 3.5, OUTLINE);
    g.circle(lens, 2.5, blink || this.phase === BeamPhase.ON ? LENS : LENS_OFF);
    if (this.phase === BeamPhase.WARNING) {
      for (let y = 14.0; y < this.length; y += 8) g.rect(-1, y + ((t * 2) % 8), 2, 3, blink ? BEAM : BEAM_HALF);
    } else if (this.phase === BeamPhase.ON) {
      const w = 3 + (Math.trunc(t / 2) % 2);
      g.rect(-w, 12, w * 2, this.length - 12, BEAM_GLOW);
      g.rect(-1, 12, 2, this.length - 12, BEAM_CORE);
      g.circle(new Vec2(0, this.length), 4, BEAM_SPOT);
    }
  }
}
