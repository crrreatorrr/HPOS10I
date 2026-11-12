// Speed lines: a few 1 px horizontal streaks along the top and bottom edges
// of the screen that fade in above top running speed (6 px/frame) and are
// fully lit at 12. They slide against the direction of travel. Drawn by the
// HUD under its counters. Purely visual; off with the speed effects option.

import { Settings } from '../../core/settings';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { clamp } from '../../runtime/math';
import { VIEW_H, VIEW_W } from '../../runtime/tree';

/** Streaks start to show above this speed (px/frame)... */
export const LINES_START_SPEED = 6;
/** ...and are fully lit this much faster. */
export const LINES_RANGE = 6;
export const LINE_COUNT = 8;
const MAX_ALPHA = 0.55;
const COLOR = new Color(1, 1, 1);
/** Rows from the top (positive) or the bottom (negative) edge, and each streak's length. */
const ROWS: readonly [number, number][] = [
  [22, 46],
  [38, 30],
  [9, 58],
  [52, 24],
  [-12, 52],
  [-27, 34],
  [-41, 26],
  [-6, 62],
];

export interface Streak {
  x: number;
  y: number;
  length: number;
}

export class SpeedLines {
  /** 0 (hidden) to 1 (fully lit). */
  strength = 0;
  private offset = 0;
  private direction = 1;

  /** The strength for a speed in px/frame. */
  static strengthFor(speed: number): number {
    return clamp((Math.abs(speed) - LINES_START_SPEED) / LINES_RANGE, 0, 1);
  }

  /** Call once per rendered frame with the player (or null). */
  update(delta: number, player: Player | null): void {
    if (!player || player.state === 'dead' || !Settings.data.speedEffects) {
      this.strength = 0;
      return;
    }
    const vx = player.grounded ? player.groundSpeed : player.velocity.x;
    const speed = player.grounded ? Math.abs(player.groundSpeed) : player.velocity.length();
    this.strength = SpeedLines.strengthFor(speed);
    if (Math.abs(vx) > 0.5) this.direction = vx < 0 ? -1 : 1;
    // The streaks slide at three times the run, so they read as speed and not as scenery.
    this.offset = (this.offset + speed * 3 * 60 * delta) % (VIEW_W * 4);
  }

  /** The streaks to draw now (empty while hidden). */
  streaks(): Streak[] {
    if (this.strength <= 0) return [];
    return ROWS.slice(0, LINE_COUNT).map(([row, length], i) => {
      const span = VIEW_W + length;
      const travelled = (this.offset * (0.8 + 0.1 * (i % 3)) + i * 97) % span;
      const x = this.direction > 0 ? VIEW_W - travelled : travelled - length;
      return { x: Math.round(x), y: row >= 0 ? row : VIEW_H + row, length };
    });
  }

  paint(g: Gfx): void {
    const color = COLOR.withAlpha(MAX_ALPHA * this.strength);
    for (const s of this.streaks()) g.rect(s.x, s.y, s.length, 1, color);
  }
}
