// A teaching prompt: an invisible area with a prompt key (props `prompt`,
// `width`, `height`, `on_entry`). The origin is the middle of its base, at
// floor level. While Sproto is inside it:
//   - with `on_entry`, the prompt shows as soon as he enters;
//   - otherwise it shows once he has been slower than 1 px/frame on the
//     ground for 60 frames in a row (he is stuck or unsure, not passing by).
// The HUD draws the line (Prompts, src/core/prompts.ts); each key shows at
// most once per run. No collision, no art. Layer 7 (objects), mask 5 (player).

import { Prompts } from '../../core/prompts';
import { rectShape } from '../../runtime/physics';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

/** Slower than this (px/frame) counts as standing. */
export const PROMPT_SLOW_SPEED = 1;
/** Standing this many frames in a row shows the prompt. */
export const PROMPT_WAIT_FRAMES = 60;

export class PromptZone extends PlayerArea implements Configurable {
  prompt = '';
  width = 128;
  height = 96;
  onEntry = false;
  private slowFrames = 0;
  /** One zone asks once: a scene still running while the next run loads can't use up the new run's prompt. */
  private asked = false;

  constructor(name = 'PromptZone') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
  }

  applyProps(p: Props): void {
    this.prompt = p.str('prompt', this.prompt);
    this.width = Math.max(16, p.num('width', this.width));
    this.height = Math.max(16, p.num('height', this.height));
    this.onEntry = p.bool('on_entry', this.onEntry);
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(rectShape(new Vec2(this.width, this.height), new Vec2(0, -this.height / 2)));
  }

  cullRect(): Rect2 {
    return new Rect2(-this.width / 2, -this.height, this.width, this.height);
  }

  override physicsProcess(): void {
    if (this.asked || this.prompt === '' || Prompts.hasSeen(this.prompt)) return;
    const players = this.playersInside().filter((p) => p.state !== 'dead');
    if (players.length === 0) {
      this.slowFrames = 0;
      return;
    }
    if (this.onEntry) {
      this.asked = true;
      Prompts.show(this.prompt);
      return;
    }
    const standing = players.some((p) => p.grounded && Math.abs(p.groundSpeed) < PROMPT_SLOW_SPEED && p.state !== 'spindash');
    this.slowFrames = standing ? this.slowFrames + 1 : 0;
    if (this.slowFrames >= PROMPT_WAIT_FRAMES) {
      this.asked = true;
      Prompts.show(this.prompt);
    }
  }
}
