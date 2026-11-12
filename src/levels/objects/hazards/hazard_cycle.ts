// The warning runs in full before either the moving solid or the floor
// hazard starts moving. Each instance starts at rest, including after reload.
import type { Node2D } from '../../../runtime/node';
import { tree } from '../../../runtime/tree';
import { clamp } from '../../../runtime/math';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import type { Props } from '../../common/props';

type Phase = 'rest' | 'warning' | 'extend' | 'hold' | 'retract';

export class HazardCycle {
  rest = 132;
  warning = 0.8;
  extend = 18;
  hold = 38;
  retract = 32;
  delay = 0;
  phase: Phase = 'rest';
  elapsed = 0;
  amount = 0;
  private difficulty = NaN;

  applyProps(p: Props): void {
    this.rest = Math.max(1, p.int('rest_frames', this.rest));
    this.warning = p.num('telegraph_seconds', this.warning);
    this.extend = Math.max(1, p.int('extend_frames', this.extend));
    this.hold = Math.max(1, p.int('hold_frames', this.hold));
    this.retract = Math.max(1, p.int('retract_frames', this.retract));
    this.delay = Math.max(0, p.int('first_delay', this.delay));
  }

  reset(): void {
    this.phase = 'rest';
    this.elapsed = -this.delay;
    this.amount = 0;
    this.difficulty = NaN;
  }

  step(node: Node2D, travel: number): void {
    if (Number.isNaN(this.difficulty)) this.difficulty = LevelDifficulty.at(node);
    this.elapsed++;
    switch (this.phase) {
      case 'rest':
        if (this.elapsed >= LevelDifficulty.intervalFrames(this.rest, this.difficulty)) {
          this.advance('warning');
          const at = node.globalPosition;
          if (tree.getNodesInGroup<Node2D>('player').some((p) => p.globalPosition.distanceTo(at) < 260)) {
            LevelFx.playTelegraph();
          }
        }
        break;
      case 'warning':
        if (this.elapsed >= LevelDifficulty.telegraphFrames(this.warning, this.difficulty)) this.advance('extend');
        break;
      case 'extend': {
        // Keep moving solids below the carry limit even for larger travels.
        const length = Math.max(this.extend, Math.ceil(travel / 6));
        this.amount = clamp(this.elapsed / length, 0, 1);
        if (this.elapsed >= length) this.advance('hold');
        break;
      }
      case 'hold':
        if (this.elapsed >= this.hold) this.advance('retract');
        break;
      case 'retract': {
        const length = Math.max(this.retract, Math.ceil(travel / 6));
        this.amount = clamp(1 - this.elapsed / length, 0, 1);
        if (this.elapsed >= length) this.advance('rest');
        break;
      }
    }
  }

  /** Jumps to a phase (hazards that time a phase by something other than the clock). */
  force(phase: Phase): void {
    this.advance(phase);
  }

  private advance(phase: Phase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}
