// The act-clear tally (LevelRoot adds it after the goal, LevelHooks.tally).
// Shows the zone and act, the time and ticket bonuses, counts them into the
// score with `tally_tick`, then emits `finished` once. Pauses with the game.
//
// The emerald moment: when GameState.emeraldJustWon, the big spinning
// emerald arrives in the middle with its name (Emeralds.NAME) and "N / 8"
// (sfx `emerald_get`). If this act's emerald was won before, a quiet small
// icon and "N / 8" instead. Nothing for the test zone or boss arenas. When
// this clear banked tickets with the hub (HubClient.lastBanked changed since
// the act started), a line says "+N Tickets sent to the hub", or that the
// hub's Ticket limit was reached when the hub refused the earn for a cap.
//
// After an act, a line shows this clear's time on the attempt clock
// (GameState.attemptTime: a death or a restart never shortens it), the saved
// best (HubClient.lastClear) or a flashing NEW BEST!, and the rank against
// the act's par ("TIME 1:23.45   BEST 1:20.10   RANK A"; the letter flashes
// with NEW! when it beat the saved rank). The time bonus comes from the same
// rank table (src/core/rank.ts): r = time / par, S 20,000 down to D 1,000,
// nothing past twice the par; a run with a death or a restart is capped at A.
// Stages with no par (boss arenas, sandboxes) keep the flat table below.
//
// Jump (any device) or a tap/click skips the count; once counted, it
// continues. Timing runs on seconds, so any frame rate gives the same tally.
// The panel stays between the HUD counters (y < 44) and the bottom line
// (y >= PANEL_BOTTOM, where the playground prints its control hints).

import { Audio } from '../../core/audio';
import { Emeralds } from '../../core/emeralds';
import { Difficulty } from '../../core/difficulty';
import { GameState } from '../../core/game_state';
import { rankFor, type Rank } from '../../core/rank';
import { ZoneRegistry } from '../../core/zone_registry';
import { HubClient, type ClearResult } from '../../hub/hub_client';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { clamp, lerp } from '../../runtime/math';
import type { InputEventLike } from '../../runtime/node';
import { Signal } from '../../runtime/signal';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { formatActTime } from '../common/act_time';
import { COLORS, drawPanel, drawText, lineHeight, measure, PANEL_MARGIN_X, PANEL_MARGIN_Y, UiLayer } from '../common/theme';
import { BIG_SIZE, EmeraldIcon } from '../emerald/emerald_icon';

/** Stages with no par: [under this many seconds, bonus]. Slower than the last entry: no bonus. */
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
export const NEW_BEST = 'NEW BEST!';
export const NEW_RANK = 'NEW!';
const GAP = '   ';
export const HUB_LIMIT_LINE = 'Hub Ticket limit reached';
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
  private clear: ClearResult | null = null;
  private par: number | null = null;
  private seconds = 0;
  /** This clear's rank (null for a stage with no par). */
  rank: Rank | null = null;
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

  /** The time bonus: from the rank table against `par`, or the flat table when the stage has no par. */
  static timeBonusFor(seconds: number, par: number | null = null, clean = true): number {
    if (par !== null) return rankFor(seconds, par, clean).bonus;
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
    this.par = Difficulty.parFor(this.zoneId, this.act);
    this.seconds = GameState.attemptTime;
    this.rank = this.par === null ? null : rankFor(this.seconds, this.par, GameState.cleanRun).rank;
    this.timeBonus = ScoreTally.timeBonusFor(this.seconds, this.par, GameState.cleanRun);
    this.ticketBonus = GameState.tickets * TICKET_BONUS;
    this.fillHeading();
    this.countText = `${GameState.emeraldCount()} / ${Emeralds.total()}`;
    this.mode = ScoreTally.emeraldMode(this.zoneId, this.act);
    this.banked = ScoreTally.bankedThisAct();
    const clear = HubClient.lastClear;
    this.clear = clear && clear.zone === this.zoneId && clear.act === this.act ? clear : null;
    this.layout();
  }

  /** True when this clear is the act's first or beat the saved best time. */
  isNewBest(): boolean {
    return this.clear?.newBest === true;
  }

  /** True when this clear's rank beat the saved one. */
  isNewRank(): boolean {
    return this.clear?.newRank === true;
  }

  /** The pieces of the times line, left to right ('' = not shown). */
  private timesParts(): { time: string; best: string; rank: string; fresh: string } {
    if (this.par === null && !this.clear) return { time: '', best: '', rank: '', fresh: '' };
    const c = this.clear;
    return {
      time: `TIME ${formatActTime(c ? c.time : this.seconds)}`,
      best: !c ? '' : c.newBest ? NEW_BEST : `BEST ${formatActTime(c.previousBest)}`,
      rank: this.rank ? `RANK ${this.rank}` : '',
      fresh: this.rank && c?.newRank ? NEW_RANK : '',
    };
  }

  /** "TIME m:ss.cc   BEST m:ss.cc   RANK A" (NEW BEST! and NEW! when beaten); '' for a stage with no par. */
  timesLine(): string {
    const p = this.timesParts();
    return [p.time, p.best, p.rank].filter((x) => x !== '').join(GAP) + (p.fresh !== '' ? ` ${p.fresh}` : '');
  }

  hasEmeraldMoment(): boolean {
    return this.mode === 'won';
  }

  emeraldModeShown(): EmeraldMode {
    return this.mode;
  }

  bankedLine(): string {
    if (this.banked <= 0) return '';
    // The hub refused this earn for its session or daily cap: nothing was added.
    if (HubClient.earnCapped && HubClient.lastBanked?.acked !== true) return HUB_LIMIT_LINE;
    return `+${this.banked} Tickets sent to the hub`;
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
    if (this.timesLine() !== '') parts.push({ key: 'times', h: lineHeight('outline') });
    parts.push({ key: 'rows', h: 3 * lineHeight('hudValue') + 2 * 2 });
    if (this.banked > 0) parts.push({ key: 'banked', h: lineHeight('outline') });
    parts.push({ key: 'continue', h: lineHeight('outline') });
    const area = PANEL_BOTTOM - PANEL_TOP;
    const content = (sep: number) => parts.reduce((a, p) => a + p.h, 0) + sep * (parts.length - 1);
    const fits = (sep: number) => content(sep) + PANEL_MARGIN_Y * 2 <= area;
    // Tighter rows first; with the emerald, the times and the hub line all
    // showing, the zone name gives way (the heading still names the act).
    this.sep = 3;
    if (!fits(3)) this.sep = 2;
    if (!fits(2)) parts.splice(parts.findIndex((p) => p.key === 'zone'), 1);
    if (!fits(2)) this.sep = 1;
    const innerH = content(this.sep);
    const widths = [
      MIN_WIDTH,
      measure(this.heading, 'title'),
      measure(this.zoneName, 'hudValue'),
      measure(this.bankedLine(), 'outline'),
      measure(HUB_LIMIT_LINE, 'outline'),
      measure(this.timesLine(), 'outline'),
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
        case 'times': {
          // One centred line; NEW BEST!, the rank letter and NEW! are gold, and what is new flashes.
          const p = this.timesParts();
          const flash = this.clock % 0.5 < 0.32;
          const segments: { text: string; gold: boolean; flashing: boolean }[] = [];
          if (p.time !== '') segments.push({ text: p.time, gold: false, flashing: false });
          if (p.best !== '') segments.push({ text: GAP + p.best, gold: p.best === NEW_BEST, flashing: p.best === NEW_BEST });
          if (p.rank !== '') {
            segments.push({ text: `${GAP}RANK `, gold: false, flashing: false });
            segments.push({ text: this.rank ?? '', gold: true, flashing: p.fresh !== '' });
          }
          if (p.fresh !== '') segments.push({ text: ` ${p.fresh}`, gold: true, flashing: true });
          let left = cx - Math.floor(measure(segments.map((sg) => sg.text).join(''), 'outline') / 2);
          for (const sg of segments) {
            if (!sg.flashing || flash) drawText(g, sg.text, left, row.y, 'outline', sg.gold ? { color: COLORS.gold } : {});
            left += measure(sg.text, 'outline');
          }
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
