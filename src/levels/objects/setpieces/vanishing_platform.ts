// A vanishing platform (Neon Rush Remix signature, docs/LEVELS.md Z4 Act 1):
// a jump-through neon slab that fades out and back in on a fixed timer.
// Its cycle (`on_frames` + `off_frames`, shifted by `offset` frames so a row
// can ripple) is:
//   SOLID      standing is safe
//   BLINK      the last part of the on time: it blinks in the warning colour
//              for Difficulty.telegraph(blink_seconds) at its local
//              difficulty (never under 0.35 s) - the telegraph - still solid
//   GONE       no collision: a standing Sproto falls; a dim dashed outline
//              shows where it will come back
//   APPEARING  the last `fade_frames` of the off time: the outline brightens
//              (it comes back at the end, but never inside a player: then
//              it waits until he has left its space)
// The cycle counts this platform's own physics ticks, so it is the same on
// every run (and pauses with the game). The origin is the top-left corner.

import { Audio } from '../../../core/audio';
import type { Gfx } from '../../../runtime/gfx';
import { posmod } from '../../../runtime/math';
import { Signal } from '../../../runtime/signal';
import { Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import type { Configurable, Props } from '../../common/props';
import { SetPiecePlatform } from './platform_base';
import { glowLine } from './style';

export enum VanishPhase {
  SOLID,
  BLINK,
  GONE,
  APPEARING,
}

export class VanishingPlatform extends SetPiecePlatform implements Configurable {
  readonly vanished = new Signal();
  readonly appeared = new Signal();

  onFrames = 150;
  offFrames = 90;
  blinkSeconds = 0.75;
  fadeFrames = 18;
  /** Frames the cycle is shifted by (a platform with offset k is k frames ahead). */
  offset = 0;

  /** Physics ticks since it entered the level. */
  frame = 0;
  phase = VanishPhase.SOLID;
  private blink = 45;
  private waitingToAppear = false;

  constructor(name = 'VanishingPlatform') {
    super(name);
  }

  applyProps(p: Props): void {
    this.applyCommon(p);
    this.onFrames = Math.max(p.int('on_frames', this.onFrames), 1);
    this.offFrames = Math.max(p.int('off_frames', this.offFrames), 1);
    this.blinkSeconds = p.num('blink_seconds', this.blinkSeconds);
    this.fadeFrames = Math.max(p.int('fade_frames', this.fadeFrames), 0);
    this.offset = p.int('offset', this.offset);
  }

  override ready(): void {
    super.ready();
    this.blink = Math.min(LevelDifficulty.telegraphFrames(this.blinkSeconds, LevelDifficulty.at(this)), this.onFrames);
    this.phase = this.phaseAt(0);
    if (this.phase === VanishPhase.GONE || this.phase === VanishPhase.APPEARING) this.setSolid(false);
  }

  /** Telegraph (blink) length in frames. */
  get blinkFrames(): number {
    return this.blink;
  }

  get period(): number {
    return this.onFrames + this.offFrames;
  }

  /** The phase at tick `frame` of the cycle (before the wait for a clear space). */
  phaseAt(frame: number): VanishPhase {
    const t = posmod(frame + this.offset, this.period);
    if (t < this.onFrames - this.blink) return VanishPhase.SOLID;
    if (t < this.onFrames) return VanishPhase.BLINK;
    if (t < this.period - this.fadeFrames) return VanishPhase.GONE;
    return VanishPhase.APPEARING;
  }

  override physicsProcess(): void {
    this.frame += 1;
    const next = this.phaseAt(this.frame);
    const wasSolid = this.isSolid;
    if (next === VanishPhase.GONE || next === VanishPhase.APPEARING) {
      if (wasSolid) {
        this.setSolid(false);
        this.vanished.emit();
      }
      this.waitingToAppear = false;
    } else if (!wasSolid) {
      if (this.setSolid(true)) {
        this.waitingToAppear = false;
        this.appeared.emit();
      } else {
        this.waitingToAppear = true;
      }
    }
    if (next === VanishPhase.BLINK && this.phase !== VanishPhase.BLINK && this.isVisibleInTree()) Audio.playSfx('enemy_telegraph');
    this.phase = this.waitingToAppear ? VanishPhase.APPEARING : next;
    this.moveTo(this.position);
  }

  override draw(g: Gfx): void {
    const style = this.styleNow();
    const w = this.size.x;
    const h = this.size.y;
    const top = [new Vec2(0, 0), new Vec2(w, 0)];
    const box = [new Vec2(0, 0), new Vec2(w, 0), new Vec2(w, h), new Vec2(0, h)];
    switch (this.phase) {
      case VanishPhase.SOLID:
      case VanishPhase.BLINK: {
        const blinkOn = this.phase === VanishPhase.BLINK && Math.floor(this.frame / 4) % 2 === 0;
        const edge = blinkOn ? style.warn : style.edge;
        g.withAlpha(blinkOn ? 0.55 : 1, () => {
          g.rect(0, 0, w, h, style.body);
          g.rect(0, h * 0.5, w, h * 0.5, style.shade);
          if (style.neon) {
            g.additive(() => {
              glowLine(g, box, style.accent, true, 1);
              glowLine(g, top, edge, false, 2);
            });
            for (let x = 8; x < w - 4; x += 16) g.rect(x, h * 0.5 - 1, 6, 2, style.accent.withAlpha(0.6));
          } else {
            g.rect(0, 0, w, h, style.outline, false, 1);
            g.rect(1, 1, w - 2, 2, edge);
          }
        });
        break;
      }
      default: {
        // Gone: a dashed outline where it will come back (brighter while appearing).
        const tc = posmod(this.frame + this.offset, this.period);
        const t = this.phase === VanishPhase.APPEARING ? (tc - (this.period - this.fadeFrames)) / Math.max(this.fadeFrames, 1) : 0;
        const alpha = 0.22 + 0.5 * Math.max(0, Math.min(1, t));
        const color = (style.neon ? style.accent : style.edge).withAlpha(alpha);
        for (let x = 0; x < w; x += 8) g.rect(x, 0, Math.min(4, w - x), 1.5, color);
        for (let x = 4; x < w; x += 8) g.rect(x, h - 1.5, Math.min(4, w - x), 1.5, color);
        break;
      }
    }
  }
}
