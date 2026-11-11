// In-level HUD, added by LevelRoot (LevelHooks.hud): SCORE, TIME and TICKETS
// top-left in the classic chunky gold labels, lives bottom-left with Sproto's
// head, and small power-up indicators beside the counters (shield, speed
// shoes and invincibility with the seconds left) read from the player in
// group 'player'.
//
// Data comes from GameState: its tickets/score/lives signals, and
// GameState.levelTime for the clock (read every frame). At 0 tickets the
// TICKETS counter flashes red: the next hit costs a life. In touch mode the
// lives box moves under the counters so the on-screen pad does not cover it.
// Under the counters it draws the speed lines (speed_lines.ts).

import { GameState } from '../../core/game_state';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Vec2 } from '../../runtime/vec2';
import type { Player } from '../../player/player';
import { PixelArt } from '../common/pixel_art';
import { COLORS, drawText, UiLayer } from '../common/theme';
import { Display } from '../display';
import { SpeedLines } from './speed_lines';

/** Seconds per on/off cycle of the 0-ticket warning flash. */
export const FLASH_PERIOD = 0.5;
export const WARNING_COLOR = COLORS.warning;
export const MAX_SCORE_SHOWN = 9_999_999;
export const MAX_LIVES_SHOWN = 99;
/** Where the lives box goes when the touch pad sits in the bottom-left corner. */
export const TOUCH_LIVES_POSITION = new Vec2(3, 44);
export const DESKTOP_LIVES_POSITION = new Vec2(6, 216);
/** Power-up row: right of the counters, under the sound hint band. */
export const POWER_UPS_POSITION = new Vec2(142, 18);
const POWER_UP_STEP = 30;
/** Timers flash in their last seconds. */
const POWER_UP_WARN_SECONDS = 3;

export interface PowerUpView {
  kind: 'shield' | 'speed_shoes' | 'invincibility';
  /** Whole seconds left (0 for the shield, which has no timer). */
  seconds: number;
}

export class Hud extends UiLayer {
  livesPosition = DESKTOP_LIVES_POSITION;
  scoreText = '0';
  timeText = '0:00';
  ticketsText = '0';
  livesText = 'x 3';

  private shownSeconds = -1;
  private flashClock = 0;
  private warningLit = false;
  private clock = 0;
  readonly speedLines = new SpeedLines();

  constructor() {
    super('HUD', 10);
  }

  override enterTree(): void {
    this.placeLivesBox(Display.isTouch);
    Display.touchModeChanged.connect(this.onTouchMode, { owner: this });
    GameState.ticketsChanged.connect(this.onTickets, { owner: this });
    GameState.scoreChanged.connect(this.onScore, { owner: this });
    GameState.livesChanged.connect(this.onLives, { owner: this });
    this.onTickets(GameState.tickets);
    this.onScore(GameState.score);
    this.onLives(GameState.lives);
    this.updateTime();
  }

  override exitTree(): void {
    Display.touchModeChanged.disconnect(this.onTouchMode);
    GameState.ticketsChanged.disconnect(this.onTickets);
    GameState.scoreChanged.disconnect(this.onScore);
    GameState.livesChanged.disconnect(this.onLives);
  }

  override process(delta: number): void {
    this.clock += delta;
    this.speedLines.update(delta, this.isInsideTree() ? this.tree.getFirstNodeInGroup<Player>('player') : null);
    this.updateTime();
    this.flashClock = (this.flashClock + delta) % FLASH_PERIOD;
    this.updateWarning();
  }

  /** "m:ss". Minutes keep counting past 9 (10:00, 11:30, ...). */
  static formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  static formatScore(score: number): string {
    return String(Math.min(Math.max(Math.trunc(score), 0), MAX_SCORE_SHOWN));
  }

  static formatLives(lives: number): string {
    return `x ${Math.min(Math.max(Math.trunc(lives), 0), MAX_LIVES_SHOWN)}`;
  }

  /** True while the TICKETS counter is drawn in the warning colour. */
  isWarningLit(): boolean {
    return this.warningLit;
  }

  /** The power-ups the player has right now, in display order. */
  powerUps(): PowerUpView[] {
    const player = this.isInsideTree() ? this.tree.getFirstNodeInGroup<Player>('player') : null;
    const moves = player?.moves;
    if (!moves) return [];
    const out: PowerUpView[] = [];
    if (moves.shield) out.push({ kind: 'shield', seconds: 0 });
    if (moves.speedShoesFrames > 0) out.push({ kind: 'speed_shoes', seconds: Math.ceil(moves.speedShoesFrames / 60) });
    if (moves.invincibilityFrames > 0) out.push({ kind: 'invincibility', seconds: Math.ceil(moves.invincibilityFrames / 60) });
    return out;
  }

  private readonly onTouchMode = (touch: boolean): void => this.placeLivesBox(touch);

  private placeLivesBox(touch: boolean): void {
    this.livesPosition = touch ? TOUCH_LIVES_POSITION : DESKTOP_LIVES_POSITION;
  }

  private updateTime(): void {
    const seconds = Math.floor(GameState.levelTime);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.timeText = Hud.formatTime(GameState.levelTime);
    }
  }

  private updateWarning(): void {
    this.warningLit = GameState.tickets === 0 && this.flashClock < FLASH_PERIOD * 0.5;
  }

  private readonly onTickets = (value: number): void => {
    this.ticketsText = String(value);
    if (value === 0) this.flashClock = 0; // light up at once, then blink
    this.updateWarning();
  };

  private readonly onScore = (value: number): void => {
    this.scoreText = Hud.formatScore(value);
  };

  private readonly onLives = (value: number): void => {
    this.livesText = Hud.formatLives(value);
  };

  protected override paint(g: Gfx): void {
    this.speedLines.paint(g);
    // Counters (offsets from hud.tscn).
    drawText(g, 'SCORE', 18, 5, 'hudLabel');
    drawText(g, this.scoreText, 74, 5, 'hudValue', { align: 'right', width: 62 });
    drawText(g, 'TIME', 18, 17, 'hudLabel');
    drawText(g, this.timeText, 74, 17, 'hudValue', { align: 'right', width: 62 });
    PixelArt.ticket(g, 3, 30);
    const warn = this.warningLit ? WARNING_COLOR : null;
    if (warn) {
      // The gold label is baked; tint it by drawing the plain bold font in red over it.
      drawText(g, 'TICKETS', 18, 29, 'hudValue', { color: warn });
    } else {
      drawText(g, 'TICKETS', 18, 29, 'hudLabel');
    }
    drawText(g, this.ticketsText, 74, 29, 'hudValue', { align: 'right', width: 62, color: warn });
    // Lives.
    const l = this.livesPosition;
    PixelArt.sprotoHead(g, l.x, l.y + 1);
    drawText(g, 'SPROTO', l.x + 19, l.y, 'outline', { color: COLORS.gold });
    drawText(g, this.livesText, l.x + 19, l.y + 8, 'hudValue');
    this.paintPowerUps(g);
  }

  private paintPowerUps(g: Gfx): void {
    let x = POWER_UPS_POSITION.x;
    const y = POWER_UPS_POSITION.y;
    for (const p of this.powerUps()) {
      const lowFlash = p.seconds > 0 && p.seconds <= POWER_UP_WARN_SECONDS && this.clock % 0.4 < 0.2;
      if (!lowFlash) {
        if (p.kind === 'shield') PixelArt.shield(g, x, y);
        else if (p.kind === 'speed_shoes') PixelArt.shoe(g, x, y);
        else PixelArt.star(g, x, y);
      }
      if (p.seconds > 0) drawText(g, String(p.seconds), x + 11, y, 'hudValue', { color: p.seconds <= POWER_UP_WARN_SECONDS ? WARNING_COLOR : Color.WHITE });
      x += p.seconds > 0 ? POWER_UP_STEP : 14;
    }
  }
}
