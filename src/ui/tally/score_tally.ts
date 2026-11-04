// The act-clear tally (LevelRoot adds it after the goal, LevelHooks.tally).
// Shows the zone and act, the time and ticket bonuses, counts them into the
// score with `tally_tick`, then emits `finished` once. Pauses with the game.
//
// The emerald moment: when GameState.emeraldJustWon, the big spinning
// emerald arrives in the middle with its name (Emeralds.NAME) and "N / 8"
// (sfx `emerald_get`). If this act's emerald was won before, a quiet small
// icon and "N / 8" instead. Nothing for the test zone or boss arenas. When
// this clear banked tickets with the hub (HubClient.lastBanked changed since
// the act started), a line says "+N Tickets sent to the hub".
//
// Jump (any device) or a tap/click skips the count; once counted, it
// continues. Timing runs on seconds, so any frame rate gives the same tally.
// The panel stays between the HUD counters (y < 44) and the bottom line
// (y >= PANEL_BOTTOM, where the playground prints its control hints).

import { Audio } from '../../core/audio';
import { Emeralds } from '../../core/emeralds';
import { GameState } from '../../core/game_state';
import { ZoneRegistry } from '../../core/zone_registry';
import { HubClient } from '../../hub/hub_client';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { clamp, lerp } from '../../runtime/math';
import type { InputEventLike } from '../../runtime/node';
import { Signal } from '../../runtime/signal';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { COLORS, drawPanel, drawText, lineHeight, measure, PANEL_MARGIN_X, PANEL_MARGIN_Y, UiLayer } from '../common/theme';
import { BIG_SIZE, EmeraldIcon } from '../emerald/emerald_icon';

/** [under this many seconds, bonus]. Slower than the last entry: no bonus. */
export const TIME_BONUS: readonly [number, number][] = [
  [30, 8000],
  [45, 5000],
  [60, 3000],
  [90, 2000],
  [120, 1000],
  [180, 500],
  [300, 100],
];
export const TICKET_BONUS = 100;
/** Points per second moved into the score while counting (100 a frame at 60). */
export const COUNT_RATE = 6000;
const TICK_INTERVAL = 1 / 15;
export const START_DELAY = 0.75;
/** With an emerald: when it arrives, and when counting starts. */
export const EMERALD_AT = 0.4;
export const EMERALD_COUNT_AT = 2.2;
/** How fast the emerald spins as it arrives, settling to its normal speed. */
const ARRIVAL_SPIN = 5;
const ARRIVAL_SECONDS = 0.9;
export const HOLD_SECONDS = 2;
/** Presses this soon after the tally appears are ignored (a held jump from the goal run shouldn't skip it). */
export const INPUT_GRACE = 0.4;
/** The panel never reaches below this line. */
export const PANEL_TOP = 44;
export const PANEL_BOTTOM = 223;
const MIN_WIDTH = 220;
const EMERALD_BOX_H = 52;
const QUIET_H = 18;

export type EmeraldMode = 'won' | 'earlier' | 'none';
type State = 'intro' | 'count' | 'hold';

/** HubClient.lastBanked as it was when the act started (see watchBanks()). */
let bankedAtStart: typeof HubClient.lastBanked = null;
let watching = false;

export class ScoreTally extends UiLayer {
  readonly finished = new Signal();

  /** Zone shown in the heading. LevelHooks.tally sets it; defaults to GameState's. */
  zoneId = '';
  act = 0;
  timeBonus = 0;
  ticketBonus = 0;

  readonly emerald: EmeraldIcon;
  readonly smallEmerald: EmeraldIcon;
  private clock = 0;
  private phaseClock = 0;
  private state: State = 'intro';
  private countBudget = 0;
  private tickClock = 0;
  private emeraldShown = false;
  private sparkled = false;
  private done = false;
  private mode: EmeraldMode = 'none';
  private textAlpha = 0;
  private continueAlpha = 0;
  private heading = '';
  private zoneName = '';
  private countText = '';
  private banked = 0;
  private panel = new Rect2();
  private rows: { key: string; y: number }[] = [];
  private sep = 3;

  constructor(zoneId = '') {
    super('ScoreTally', 20);
    this.zoneId = zoneId;
    this.emerald = this.addChild(new EmeraldIcon());
    this.emerald.visible = false;
    this.smallEmerald = this.addChild(new EmeraldIcon({ small: true }));
    this.smallEmerald.visible = false;
  }

  /** Remembers HubClient.lastBanked at every act start, so the tally only shows this clear's bank. Once. */
  static watchBanks(): void {
    if (watching) return;
    watching = true;
    bankedAtStart = HubClient.lastBanked;
    GameState.levelStarted.connect(() => {
      bankedAtStart = HubClient.lastBanked;
    });
  }

  /** Tickets this clear sent to the hub (0 = none). */
  static bankedThisAct(): number {
    const b = HubClient.lastBanked;
    return b && b !== bankedAtStart && b.amount > 0 ? b.amount : 0;
  }

  static timeBonusFor(seconds: number): number {
    for (const [limit, bonus] of TIME_BONUS) if (seconds < limit) return bonus;
    return 0;
  }

  /** What the emerald part shows for an act: won (just now), earlier (an earlier clear) or none. */
  static emeraldMode(zoneId: string, act: number): EmeraldMode {
    if (!Emeralds.isEmeraldAct(zoneId, act)) return 'none';
    if (GameState.emeraldJustWon) return 'won';
    if (GameState.hasEmerald(zoneId, act)) return 'earlier';
    return 'none';
  }

  override ready(): void {
    if (this.zoneId === '') this.zoneId = GameState.zoneId;
    if (this.act <= 0) this.act = GameState.act;
    this.timeBonus = ScoreTally.timeBonusFor(GameState.levelTime);
    this.ticketBonus = GameState.tickets * TICKET_BONUS;
    this.fillHeading();
    this.countText = `${GameState.emeraldCount()} / ${Emeralds.total()}`;
    this.mode = ScoreTally.emeraldMode(this.zoneId, this.act);
    this.banked = ScoreTally.bankedThisAct();
    this.layout();
  }

  hasEmeraldMoment(): boolean {
    return this.mode === 'won';
  }

  emeraldModeShown(): EmeraldMode {
    return this.mode;
  }

  bankedLine(): string {
    return this.banked > 0 ? `+${this.banked} Tickets sent to the hub` : '';
  }

  isCountingDone(): boolean {
    return this.state === 'hold' || this.done;
  }

  isFinished(): boolean {
    return this.done;
  }

  panelRect(): Rect2 {
    return this.panel;
  }

  override process(delta: number): void {
    if (this.done) return;
    this.clock += delta;
    this.phaseClock += delta;
    if (this.clock >= INPUT_GRACE && Input.isActionJustPressed('jump')) {
      this.skip();
      if (this.done) return;
    }
    switch (this.state) {
      case 'intro':
        if (this.hasEmeraldMoment()) {
          this.updateEmeraldArrival();
          if (this.phaseClock >= EMERALD_COUNT_AT) this.setState('count');
        } else if (this.phaseClock >= START_DELAY) {
          this.setState('count');
        }
        break;
      case 'count':
        this.updateEmeraldArrival();
        this.count(delta);
        break;
      case 'hold':
        this.continueAlpha = this.phaseClock % 0.8 < 0.55 ? 1 : 0;
        if (this.phaseClock >= HOLD_SECONDS) this.finish();
        break;
    }
  }

  override input(ev: InputEventLike): void {
    if (this.done || this.clock < INPUT_GRACE) return;
    // A tap or click; never marked handled, so the touch controls still see the finger.
    const phase = (ev as { pointerPhase?: string | null }).pointerPhase;
    if (ev.kind === 'pointer' && ev.pressed && (phase === undefined || phase === null || phase === 'down')) this.skip();
  }

  /** Jump/tap: finish the count at once, or continue if it is already counted. */
  skip(): void {
    if (this.done) return;
    if (this.state === 'hold') {
      this.finish();
      return;
    }
    this.showEmeraldNow();
    GameState.addScore(this.timeBonus + this.ticketBonus);
    this.timeBonus = 0;
    this.ticketBonus = 0;
    this.setState('hold');
  }

  private setState(state: State): void {
    this.state = state;
    this.phaseClock = 0;
    if (state === 'hold') this.continueAlpha = 1;
  }

  private count(delta: number): void {
    if (this.timeBonus <= 0 && this.ticketBonus <= 0) {
      this.setState('hold');
      return;
    }
    this.countBudget += COUNT_RATE * delta;
    const step = Math.trunc(this.countBudget);
    if (step <= 0) return;
    this.countBudget -= step;
    const fromTime = Math.min(this.timeBonus, step);
    const fromTickets = Math.min(this.ticketBonus, step);
    this.timeBonus -= fromTime;
    this.ticketBonus -= fromTickets;
    GameState.addScore(fromTime + fromTickets);
    this.tickClock += delta;
    if (this.tickClock >= TICK_INTERVAL) {
      this.tickClock = 0;
      Audio.playSfx('tally_tick');
    }
  }

  /** The emerald spins in fast, fades up and settles to its normal spin. */
  private updateEmeraldArrival(): void {
    if (!this.hasEmeraldMoment()) return;
    const t = this.clock - EMERALD_AT;
    if (t < 0) return;
    if (!this.emeraldShown) {
      this.emeraldShown = true;
      this.emerald.visible = true;
      Audio.playSfx('emerald_get');
    }
    const k = clamp(t / ARRIVAL_SECONDS, 0, 1);
    this.emerald.spinSpeed = lerp(ARRIVAL_SPIN, 1, k * k * (3 - 2 * k));
    this.emerald.modulate = Color.WHITE.withAlpha(clamp(t / 0.3, 0, 1));
    this.textAlpha = clamp((t - 0.5) / 0.3, 0, 1);
    if (k >= 1 && !this.sparkled) this.settleEmerald();
  }

  private settleEmerald(): void {
    this.emerald.spinSpeed = 1;
    this.emerald.modulate = Color.WHITE;
    this.textAlpha = 1;
    if (!this.sparkled) {
      this.sparkled = true;
      this.emerald.sparkle();
    }
  }

  private showEmeraldNow(): void {
    if (!this.hasEmeraldMoment()) return;
    if (!this.emeraldShown) {
      this.emeraldShown = true;
      this.emerald.visible = true;
      Audio.playSfx('emerald_get');
    }
    this.settleEmerald();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.continueAlpha = 0;
    this.finished.emit();
  }

  private fillHeading(): void {
    const zone = ZoneRegistry.getZone(this.zoneId);
    this.zoneName = (zone?.name ?? '').toUpperCase();
    const acts = zone?.acts.length ?? 0;
    let title = 'STAGE CLEAR!';
    if (acts > 0) title = this.act > acts ? 'BOSS DEFEATED!' : `ACT ${this.act} CLEAR!`;
    this.heading = title;
  }

  /** The VBox of score_tally.tscn: rows top to bottom, centred between the HUD and the bottom line. */
  private layout(): void {
    const parts: { key: string; h: number }[] = [
      { key: 'zone', h: lineHeight('hudValue') },
      { key: 'title', h: lineHeight('title') },
    ];
    if (this.mode === 'won') {
      parts.push({ key: 'emerald', h: EMERALD_BOX_H });
      parts.push({ key: 'emeraldLine', h: lineHeight('hudValue') });
    } else if (this.mode === 'earlier') {
      parts.push({ key: 'quiet', h: QUIET_H });
    }
    parts.push({ key: 'rows', h: 3 * lineHeight('hudValue') + 2 * 2 });
    if (this.banked > 0) parts.push({ key: 'banked', h: lineHeight('outline') });
    parts.push({ key: 'continue', h: lineHeight('outline') });
    const content = (sep: number) => parts.reduce((a, p) => a + p.h, 0) + sep * (parts.length - 1);
    const area = PANEL_BOTTOM - PANEL_TOP;
    this.sep = content(3) + PANEL_MARGIN_Y * 2 <= area ? 3 : 2;
    const innerH = content(this.sep);
    const widths = [
      MIN_WIDTH,
      measure(this.heading, 'title'),
      measure(this.zoneName, 'hudValue'),
      measure(this.bankedLine(), 'outline'),
      measure('JUMP OR TAP TO CONTINUE', 'outline'),
    ];
    const innerW = Math.max(...widths);
    const w = innerW + PANEL_MARGIN_X * 2;
    const h = innerH + PANEL_MARGIN_Y * 2;
    this.panel = new Rect2(Math.floor((424 - w) / 2), PANEL_TOP + Math.floor((area - h) / 2), w, h);
    let y = this.panel.y + PANEL_MARGIN_Y;
    this.rows = [];
    for (const p of parts) {
      this.rows.push({ key: p.key, y });
      y += p.h + this.sep;
    }
    const cx = Math.round(this.panel.center.x);
    const emeraldRow = this.rows.find((r) => r.key === 'emerald');
    if (emeraldRow) this.emerald.position = new Vec2(cx, emeraldRow.y + Math.round(EMERALD_BOX_H / 2));
    else this.emerald.position = new Vec2(cx, this.panel.y - BIG_SIZE);
    const quietRow = this.rows.find((r) => r.key === 'quiet');
    if (quietRow) {
      const textW = measure(this.countText, 'outline');
      const total = QUIET_H + 6 + textW;
      const left = cx - Math.floor(total / 2);
      this.smallEmerald.position = new Vec2(left + QUIET_H / 2, quietRow.y + QUIET_H / 2);
      this.smallEmerald.visible = true;
    }
  }

  protected override paint(g: Gfx): void {
    const r = this.panel;
    drawPanel(g, r);
    const x = r.x;
    const w = r.w;
    const cx = Math.round(r.center.x);
    for (const row of this.rows) {
      switch (row.key) {
        case 'zone':
          drawText(g, this.zoneName, x, row.y, 'hudValue', { align: 'center', width: w });
          break;
        case 'title':
          drawText(g, this.heading, x, row.y, 'title', { align: 'center', width: w });
          break;
        case 'emeraldLine': {
          if (this.textAlpha <= 0) break;
          const name = Emeralds.NAME.toUpperCase();
          const nw = measure(name, 'hudLabel');
          const cw = measure(this.countText, 'hudValue');
          const left = cx - Math.floor((nw + 10 + cw) / 2);
          g.withAlpha(this.textAlpha, () => {
            drawText(g, name, left, row.y, 'hudLabel');
            drawText(g, this.countText, left + nw + 10, row.y, 'hudValue');
          });
          break;
        }
        case 'quiet': {
          const textW = measure(this.countText, 'outline');
          const total = QUIET_H + 6 + textW;
          const left = cx - Math.floor(total / 2);
          drawText(g, this.countText, left + QUIET_H + 6, row.y + Math.floor((QUIET_H - 9) / 2), 'outline', { color: COLORS.soft });
          break;
        }
        case 'rows': {
          // A 2-column grid, centred: labels left, values right in 64 px.
          const labels = ['TIME BONUS', 'TICKET BONUS', 'SCORE'];
          const values = [this.timeBonus, this.ticketBonus, GameState.score];
          const labelW = Math.max(...labels.map((l) => measure(l, 'hudLabel')));
          const gridW = labelW + 16 + 64;
          const gx = cx - Math.floor(gridW / 2);
          labels.forEach((label, i) => {
            const y = row.y + i * (lineHeight('hudValue') + 2);
            drawText(g, label, gx, y, 'hudLabel');
            drawText(g, String(values[i]), gx + labelW + 16, y, 'hudValue', { align: 'right', width: 64 });
          });
          break;
        }
        case 'banked':
          drawText(g, this.bankedLine(), x, row.y, 'outline', { align: 'center', width: w });
          break;
        case 'continue':
          if (this.continueAlpha > 0) drawText(g, 'JUMP OR TAP TO CONTINUE', x, row.y, 'outline', { align: 'center', width: w });
          break;
      }
    }
  }
}
