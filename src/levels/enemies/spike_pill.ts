// Spike pill robot (tier 3, docs/LEVELS.md): a slow walker whose spikes pop
// out on a timer. Before they come out the tips peek and shake for a
// telegraph. While the spikes are out, touching it hurts even a rolling or
// jumping Sproto; hit it while they are in. The cycle and the telegraph
// scale with the local difficulty. Port of levels/enemies/spike_pill.gd
// (+ spike_pill.tscn: tier 3, speed 0.5, a 34x20 hurtbox 13 px up).

import type { Player } from '../../player/player';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import type { Props } from '../common/props';
import { idiv, PillArt } from './pill_art';
import { Walker } from './walker';

export enum SpikePhase {
  SAFE,
  WARNING,
  SPIKED,
}

export class SpikePill extends Walker {
  static readonly TELEGRAPH = 0.5;
  static readonly SPIKE_LENGTH = 6.0;
  static readonly SPIKE_COUNT = 8;

  /** Frames with the spikes in, and out, at difficulty 1. */
  safeFrames = 120;
  spikedFrames = 90;
  /** Frames before the first cycle starts (to stagger several). */
  firstDelay = 0;

  phase = SpikePhase.SAFE;
  protected timer = 0;

  constructor(name = 'SpikePill') {
    super(name, new Vec2(34, 20), new Vec2(0, -13));
    this.tier = 3;
    this.speed = 0.5;
  }

  override applyProps(p: Props): void {
    super.applyProps(p);
    this.safeFrames = p.int('safe_frames', this.safeFrames);
    this.spikedFrames = p.int('spiked_frames', this.spikedFrames);
    this.firstDelay = p.int('first_delay', this.firstDelay);
  }

  override ready(): void {
    super.ready();
    this.timer = -this.firstDelay;
  }

  override enemyPhysics(delta: number): void {
    super.enemyPhysics(delta);
    this.timer += 1;
    switch (this.phase) {
      case SpikePhase.SAFE:
        if (this.timer >= this.intervalFrames(this.safeFrames) - this.telegraphFrames(SpikePill.TELEGRAPH)) {
          this.phase = SpikePhase.WARNING;
          if (this.onScreen(32)) this.playTelegraph();
        }
        break;
      case SpikePhase.WARNING:
        if (this.timer >= this.intervalFrames(this.safeFrames)) {
          this.phase = SpikePhase.SPIKED;
          this.timer = 0;
        }
        break;
      case SpikePhase.SPIKED:
        if (this.timer >= this.spikedFrames) {
          this.phase = SpikePhase.SAFE;
          this.timer = 0;
        }
        break;
    }
  }

  spikesOut(): boolean {
    return this.phase === SpikePhase.SPIKED;
  }

  isTelegraphing(): boolean {
    return this.phase === SpikePhase.WARNING;
  }

  override isHarmful(_player: Player): boolean {
    return this.spikesOut();
  }

  protected override visorFlash(): boolean {
    return this.phase === SpikePhase.WARNING && idiv(this.timer, 4) % 2 === 0;
  }

  protected override drawBehindBody(g: Gfx): void {
    if (this.phase === SpikePhase.SAFE) return;
    const length = this.phase === SpikePhase.SPIKED ? SpikePill.SPIKE_LENGTH : 2.0;
    const shake = this.phase === SpikePhase.WARNING ? (this.timer % 2) - 0.5 : 0.0;
    const n = SpikePill.SPIKE_COUNT;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * (i + 0.5)) / n;
      const dir = new Vec2(Math.cos(a) * 1.6, Math.sin(a));
      const base = new Vec2(Math.cos(a) * (Walker.HALF_LENGTH + Walker.RADIUS - 1) + shake, Math.sin(a) * (Walker.RADIUS - 1));
      const side = dir.orthogonal().normalized().mul(2.5);
      const tip = base.add(dir.normalized().mul(length));
      const spike = [base.sub(side), tip, base.add(side)];
      g.polygon(spike, this.phase === SpikePhase.WARNING ? PillArt.FLASH : PillArt.SPIKE);
      g.polyline(spike, PillArt.SPIKE_DARK, 1);
    }
  }
}
