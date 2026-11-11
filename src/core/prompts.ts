// In-level teaching prompts. A PromptZone in a level (src/levels/objects/
// prompt_zone.ts) asks for a prompt by key; the HUD shows the matching line
// for a few seconds (src/ui/hud/prompt_line.ts builds the text from the
// player's bindings). Each key shows at most once per run: the record is
// cleared by a fresh act start (GameState.levelStarted), not by a respawn.

import { Signal } from '../runtime/signal';
import { GameState } from './game_state';

/** Seconds a prompt stays up. */
export const PROMPT_SECONDS = 5;

class PromptStore {
  readonly shown = new Signal<[string]>();
  /** The key on show ('' = none) and the seconds it has left. */
  current = '';
  secondsLeft = 0;
  private seen = new Set<string>();
  private wired = false;

  /** Shows a prompt unless this run already saw it. Returns true when it is now showing. */
  show(key: string): boolean {
    this.wire();
    if (key === '' || this.seen.has(key)) return false;
    this.seen.add(key);
    this.current = key;
    this.secondsLeft = PROMPT_SECONDS;
    this.shown.emit(key);
    return true;
  }

  hasSeen(key: string): boolean {
    return this.seen.has(key);
  }

  /** Counts the prompt down (the HUD calls it once per rendered frame). */
  tick(delta: number): void {
    if (this.current === '') return;
    this.secondsLeft -= delta;
    if (this.secondsLeft <= 0) this.clear();
  }

  /** Hides the prompt on show (keeps the record of what was seen). */
  clear(): void {
    this.current = '';
    this.secondsLeft = 0;
  }

  /** A new run: every prompt may show again. */
  reset(): void {
    this.seen.clear();
    this.clear();
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    GameState.levelStarted.connect(() => this.reset());
  }
}

export const Prompts = new PromptStore();
