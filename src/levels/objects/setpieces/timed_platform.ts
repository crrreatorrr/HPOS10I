// A timed platform (Neon Rush Remix Act 2: timed platforms over pits). A
// jump-through slab with a row of lights. The first landing starts its
// countdown (`countdown_frames`): the lights go out one by one, and for the
// last Difficulty.telegraph(warn_seconds) at its local difficulty (never
// under 0.35 s) it blinks in the warning colour - the telegraph. Then it
// switches off (no collision) for `off_frames`, shown as a dim outline, and
// comes back (never inside a player). Jumping off does not stop a running
// countdown. With a non-zero `travel` it also shuttles, eased, between its
// start and start + travel over `period_frames` (carrying Sproto, as moving
// terrain). The origin is the top-left corner at the start of the trip.

import { Audio } from '../../../core/audio';
import type { Gfx } from '../../../runtime/gfx';
import { Signal } from '../../../runtime/signal';
import { Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import type { Configurable, Props } from '../../common/props';
import { SetPiecePlatform } from './platform_base';
import { glowLine } from './style';

export enum TimedPhase {
  READY,
  COUNTING,
  OFF,
}

export class TimedPlatform extends SetPiecePlatform implements Configurable {
  readonly countdownStarted = new Signal();
  readonly switchedOff = new Signal();
  readonly switchedOn = new Signal();

  countdownFrames = 90;
  offFrames = 150;
  warnSeconds = 0.5;
  travel = Vec2.ZERO;
  periodFrames = 240;
  /** Frames the shuttle is shifted by. */
  offset = 0;

  phase = TimedPhase.READY;
  /** Frames left in the countdown or the off time. */
  timer = 0;
  frame = 0;
  private home = Vec2.ZERO;
  private warn = 30;

  constructor(name = 'TimedPlatform') {
    super(name);
  }

  applyProps(p: Props): void {
    this.applyCommon(p);
    this.countdownFrames = Math.max(p.int('countdown_frames', this.countdownFrames), 1);
    this.offFrames = Math.max(p.int('off_frames', this.offFrames), 1);
    this.warnSeconds = p.num('warn_seconds', this.warnSeconds);
    this.travel = p.vec('travel', this.travel);
    this.periodFrames = Math.max(p.int('period_frames', this.periodFrames), 2);
    this.offset = p.int('offset', this.offset);
  }

  override ready(): void {
    super.ready();
    this.home = this.position;
    this.warn = Math.min(LevelDifficulty.telegraphFrames(this.warnSeconds, LevelDifficulty.at(this)), this.countdownFrames);
  }

  get warnFrames(): number {
    return this.warn;
  }

  /** Offset from the start of the trip at tick `frame`. */
  offsetAt(frame: number): Vec2 {
    if (this.travel.isZero()) return Vec2.ZERO;
    const phase = ((frame + this.offset) % this.periodFrames) / this.periodFrames;
    return this.travel.mul((1 - Math.cos(phase * Math.PI * 2)) / 2);
  }

  override physicsProcess(): void {
    this.frame += 1;
    switch (this.phase) {
      case TimedPhase.READY:
        if (this.playersStanding().length > 0) {
          this.phase = TimedPhase.COUNTING;
          this.timer = this.countdownFrames;
          this.countdownStarted.emit();
        }
        break;
      case TimedPhase.COUNTING:
        this.timer -= 1;
        if (this.timer === this.warn && this.isVisibleInTree()) Audio.playSfx('enemy_telegraph');
        if (this.timer <= 0) {
          this.setSolid(false);
          this.phase = TimedPhase.OFF;
          this.timer = this.offFrames;
          this.switchedOff.emit();
        }
        break;
      case TimedPhase.OFF:
        if (this.timer > 0) this.timer -= 1;
        if (this.timer <= 0 && this.setSolid(true)) {
          this.phase = TimedPhase.READY;
          this.switchedOn.emit();
        }
        break;
    }
    this.moveTo(this.home.add(this.offsetAt(this.frame)));
  }

  /** 0..1 of the countdown left (1 while ready). */
  remaining(): number {
    if (this.phase === TimedPhase.READY) return 1;
    if (this.phase === TimedPhase.OFF) return 0;
    return this.timer / this.countdownFrames;
  }

  override draw(g: Gfx): void {
    const style = this.styleNow();
    const w = this.size.x;
    const h = this.size.y;
    if (this.phase === TimedPhase.OFF) {
      const color = (style.neon ? style.accent : style.edge).withAlpha(0.25);
      for (let x = 0; x < w; x += 8) g.rect(x, 0, Math.min(4, w - x), 1.5, color);
      for (let x = 4; x < w; x += 8) g.rect(x, h - 1.5, Math.min(4, w - x), 1.5, color);
      return;
    }
    const warning = this.phase === TimedPhase.COUNTING && this.timer <= this.warn;
    const blinkOn = warning && Math.floor(this.frame / 4) % 2 === 0;
    const edge = blinkOn ? style.warn : style.edge;
    g.rect(0, 0, w, h, style.body);
    g.rect(0, h * 0.5, w, h * 0.5, style.shade);
    this.drawSurface(g);
    const box = [new Vec2(0, 0), new Vec2(w, 0), new Vec2(w, h), new Vec2(0, h)];
    if (style.neon) {
      g.additive(() => {
        glowLine(g, box, style.accent, true, 1);
        glowLine(g, [new Vec2(0, 0), new Vec2(w, 0)], edge, false, 2);
      });
    } else {
      g.rect(0, 0, w, h, style.outline, false, 1);
      g.rect(1, 1, w - 2, 2, edge);
    }
    // The countdown lights: lit from the left, going out as time runs down.
    const lights = Math.max(2, Math.floor(w / 16));
    const lit = Math.ceil(this.remaining() * lights);
    const step = w / lights;
    for (let i = 0; i < lights; i++) {
      const on = i < lit;
      const c = on ? (warning ? style.warn : style.accent) : style.shade.lightened(0.15);
      g.rect(i * step + step / 2 - 2, h * 0.5 - 1, 4, 3, c);
    }
  }
}
