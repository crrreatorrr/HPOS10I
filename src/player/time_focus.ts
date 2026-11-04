// Duelist cape Time Focus: half-speed time for 3 seconds of real time, once
// per level (refilled on a fresh level start, not on respawn). Paused time
// does not count. Restored when the window ends, on death and on scene change.

import { GameState } from '../core/game_state';
import { SceneRouter } from '../core/scene_router';
import { RelicLoadout } from '../hub/relic_loadout';
import { Node, ProcessMode } from '../runtime/node';
import { tree } from '../runtime/tree';

const SCALE = 0.5;
const DURATION_MS = 3000;
const USES_PER_LEVEL = 1;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

class TimeFocusNode extends Node {
  private usesLeft = USES_PER_LEVEL;
  private active = false;
  private deadline = 0;
  private pausedAt = 0;

  constructor() {
    super('TimeFocus');
    this.processMode = ProcessMode.ALWAYS;
    GameState.levelStarted.connect(() => this.onLevelStarted());
  }

  isActive(): boolean {
    return this.active;
  }

  tryStart(): boolean {
    if (this.active || this.usesLeft <= 0) return false;
    if (tree.paused || !SceneRouter.inGameplay()) return false;
    if (!RelicLoadout.resolve().time_focus) return false;
    this.usesLeft -= 1;
    this.active = true;
    this.pausedAt = 0;
    this.deadline = nowMs() + DURATION_MS;
    tree.timeScale = SCALE;
    return true;
  }

  /** Ends slow motion. Does not refill the use. */
  restore(): void {
    const was = this.active;
    this.active = false;
    this.pausedAt = 0;
    if (was) tree.timeScale = 1;
  }

  private onLevelStarted(): void {
    this.usesLeft = USES_PER_LEVEL;
    if (RelicLoadout.resolve().ranked) {
      this.active = false;
      this.pausedAt = 0;
      this.deadline = 0;
      tree.timeScale = 1;
    } else {
      this.restore();
    }
  }

  override process(): void {
    if (!this.active) return;
    if (!SceneRouter.inGameplay()) {
      this.restore();
      return;
    }
    if (tree.paused) {
      if (this.pausedAt === 0) this.pausedAt = nowMs();
      tree.timeScale = 1;
      return;
    }
    if (this.pausedAt !== 0) {
      this.deadline += nowMs() - this.pausedAt;
      this.pausedAt = 0;
    }
    if (nowMs() >= this.deadline) {
      this.restore();
      return;
    }
    tree.timeScale = SCALE;
  }
}

export const TimeFocus = new TimeFocusNode();
