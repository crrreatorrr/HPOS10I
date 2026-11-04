// Global pause menu. installUi() returns it as an overlay, added once above
// every scene; processMode is ALWAYS so it keeps running while the tree is
// paused.
//
// The `pause` action (Enter, Esc, P, gamepad Start, the touch pause button)
// toggles it, but only while SceneRouter.inGameplay(). Items:
//   RESUME         back to the game
//   RESTART        reload the stage from its checkpoint (or the playground),
//                  without losing a life (SceneRouter.restart())
//   OPTIONS        the Settings toggles (OptionsMenu below)
//   EXIT TO HUB    HubClient.exitToHub() (always offered, like the original)
//   QUIT TO TITLE  SceneRouter.goTitle()
// Arrows/WASD/D-pad move, Enter/Space/any jump button choose, mouse and touch
// tap. Left/right cycle the Relic skin when there is a choice. The panel also
// lists the controls for every device; key names come from the bindings
// (InputHints), and Esc is never offered for pause.
//
// Pausing releases every held game input. Resuming waits for two physics
// frames without a fresh jump press, so the key that closed the menu never
// makes Sproto jump. On the web, losing focus (tab switch, phone call)
// pauses the game.

import { Audio } from '../../core/audio';
import { SceneRouter } from '../../core/scene_router';
import { Settings, type SettingsData } from '../../core/settings';
import { HubClient } from '../../hub/hub_client';
import { RelicLoadout } from '../../hub/relic_loadout';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { ProcessMode, type InputEventLike } from '../../runtime/node';
import { Signal } from '../../runtime/signal';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2 } from '../../runtime/vec2';
import { InputHints } from '../common/input_hints';
import { MenuList, type MenuItem } from '../common/menu';
import { COLORS, drawButton, drawCentered, drawPanel, drawText, lineHeight, measure, PANEL_MARGIN_X, PANEL_MARGIN_Y, UiLayer, type ButtonState } from '../common/theme';
import { Display } from '../display';
import { skinLabel } from '../zone_select/zone_select';

export const QUIET_FRAMES_TO_RESUME = 2;
const BUTTON_W = 150;
const BUTTON_H = 18;
const BUTTON_SEP = 3;
const LAYOUT_SEP = 6;
const BACKDROP = new Color(0.02, 0.03, 0.09, 0.62);
const HEADER_ACTIVE = COLORS.gold;
const HEADER_IDLE = COLORS.idle;
const OPTION_W = 236;
export const MOVES_LINE = 'DOWN: ROLL   HOLD DOWN + JUMP: SPIN DASH   UP: LOOK';

type Device = 'keyboard' | 'pad' | 'touch';
const DEVICE_COLUMN: Record<Device, number> = { keyboard: 1, pad: 2, touch: 3 };

export interface OptionRow {
  key: keyof SettingsData;
  label: string;
  /** Shown as OFF IN RANKED while the session is ranked. */
  rankedOff: boolean;
  /** Sound is stored as `muted`: the row shows the opposite. */
  inverted?: boolean;
  /** One line under the list while the row is focused. */
  help: string;
}

export const OPTION_ROWS: readonly OptionRow[] = [
  { key: 'extraMoves', label: 'EXTRA MOVES', rankedOff: true, help: 'DROP DASH, CHARGE RUN AND SHIELD BOUNCE' },
  { key: 'itemBoxes', label: 'ITEM BOXES', rankedOff: true, help: 'SHIELDS, SPEED SHOES AND INVINCIBILITY' },
  { key: 'screenShake', label: 'SCREEN SHAKE', rankedOff: false, help: 'SHAKE AND HIT-STOP ON BIG IMPACTS' },
  { key: 'speedEffects', label: 'SPEED EFFECTS', rankedOff: false, help: 'SPEED LINES AND THE AFTERIMAGE TRAIL' },
  { key: 'muted', label: 'SOUND', rankedOff: false, inverted: true, help: 'MUSIC AND SOUND EFFECTS' },
];

/** Whether an option row reads ON. */
export function optionOn(row: OptionRow): boolean {
  const v = Settings.data[row.key];
  return row.inverted ? !v : v;
}

/** Flips an option and applies it (sound goes to Audio at once). */
export function toggleOption(row: OptionRow): void {
  const next = !Settings.data[row.key];
  Settings.set(row.key, next);
  if (row.key === 'muted') Audio.setMuted(next);
}

export class PauseMenu extends UiLayer {
  readonly opened = new Signal();
  readonly closed = new Signal();
  /** Losing focus pauses the game (web only; the browser build sets this). */
  pauseOnFocusLoss = typeof window !== 'undefined';

  readonly main: MenuList;
  readonly options: MenuList;
  /** 'main' or 'options' while open. */
  page: 'main' | 'options' = 'main';

  private open = false;
  private resumePending = false;
  private quietFrames = 0;
  private relicText = '';
  private domWired = false;
  private readonly onBlur = () => {
    if (this.pauseOnFocusLoss && !this.open && SceneRouter.inGameplay() && !tree.paused) this.openMenu();
  };
  private readonly onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.onBlur();
  };

  constructor() {
    super('PauseMenu', 101);
    // Before gameplay nodes each tick, so an unpause takes effect for the whole tick.
    this.processPriority = -100;
    this.processMode = ProcessMode.ALWAYS;
    this.visible = false;
    this.addToGroup('pause_menu');
    const items: MenuItem[] = [
      { label: 'RESUME', rect: new Rect2(), onSelect: () => this.requestResume() },
      { label: 'RESTART', rect: new Rect2(), onSelect: () => this.onRestart() },
      { label: 'OPTIONS', rect: new Rect2(), onSelect: () => this.showOptions() },
      { label: 'EXIT TO HUB', rect: new Rect2(), onSelect: () => this.onExitHub() },
      { label: 'QUIT TO TITLE', rect: new Rect2(), onSelect: () => this.onQuit() },
    ];
    for (const it of items) it.onStep = (step) => this.cycleSkin(step);
    this.main = new MenuList(items, { repeatHorizontal: false });
    const rows: MenuItem[] = OPTION_ROWS.map((row) => ({
      label: row.label,
      rect: new Rect2(),
      data: row,
      onSelect: () => toggleOption(row),
      onStep: () => {
        toggleOption(row);
        return true;
      },
      draw: (g, item, state) => this.drawOption(g, item, state, row),
    }));
    rows.push({ label: 'BACK', rect: new Rect2(), onSelect: () => this.showMain() });
    this.options = new MenuList(rows, { onCancel: () => this.showMain(), repeatHorizontal: false });
  }

  override enterTree(): void {
    if (!this.domWired && typeof window !== 'undefined') {
      this.domWired = true;
      window.addEventListener('blur', this.onBlur);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  override exitTree(): void {
    if (this.domWired && typeof window !== 'undefined') {
      this.domWired = false;
      window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  isResumePending(): boolean {
    return this.resumePending;
  }

  /** The list now taking input. */
  activeMenu(): MenuList {
    return this.page === 'options' ? this.options : this.main;
  }

  override process(delta: number): void {
    const jp = (a: 'pause' | 'ui_accept') => Input.isActionJustPressed(a);
    if (!this.open) {
      if (jp('pause') && SceneRouter.inGameplay() && !tree.paused) this.openMenu();
      return;
    }
    if (!SceneRouter.inGameplay()) {
      this.close();
      tree.paused = false;
      return;
    }
    if (!tree.paused) {
      // Someone else unpaused (a scene change, a test reset): just hide.
      this.close();
      return;
    }
    if (this.resumePending) return;
    const menu = this.activeMenu();
    // Enter is pause and accept: in the menu it chooses, it doesn't close it.
    if (jp('pause') && !jp('ui_accept') && !menu.isSettling() && !(this.page === 'options' && Input.isActionJustPressed('ui_cancel'))) {
      this.requestResume();
      return;
    }
    menu.update(delta);
  }

  override physicsProcess(): void {
    if (!this.resumePending) return;
    // A jump pressed this frame would reach the player the moment it unpauses,
    // so wait for two quiet physics frames in a row (about 33 ms).
    if (Input.isActionJustPressed('jump')) this.quietFrames = 0;
    else this.quietFrames += 1;
    if (this.quietFrames >= QUIET_FRAMES_TO_RESUME) {
      this.resumePending = false;
      this.close();
      tree.paused = false;
    }
  }

  override input(ev: InputEventLike): void {
    if (!this.open || this.resumePending) return;
    this.activeMenu().handleEvent(ev);
  }

  /** Pauses the game and shows the menu. */
  openMenu(): void {
    if (this.open) return;
    this.open = true;
    this.resumePending = false;
    tree.paused = true;
    PauseMenu.releaseGameInputs();
    this.page = 'main';
    this.refreshRelicLine();
    this.layout();
    this.main.reset(0);
    this.visible = true;
    Audio.playSfx('pause');
    this.opened.emit();
  }

  /** Closes the menu and unpauses once two physics frames in a row had no fresh jump press. */
  requestResume(): void {
    if (!this.open || this.resumePending) return;
    this.resumePending = true;
    this.quietFrames = 0;
    PauseMenu.releaseGameInputs();
  }

  /** Releases everything held (keys, pads, touch), so nothing stays down across the menu. */
  static releaseGameInputs(): void {
    Input.releaseAll();
  }

  private close(): void {
    this.open = false;
    this.resumePending = false;
    this.visible = false;
    this.page = 'main';
    this.closed.emit();
  }

  private leave(then: () => void): void {
    if (!this.open) return;
    PauseMenu.releaseGameInputs();
    this.close();
    tree.paused = false;
    tree.timeScale = 1;
    then();
  }

  private onRestart(): void {
    this.leave(() => SceneRouter.restart());
  }

  private onQuit(): void {
    this.leave(() => SceneRouter.goTitle());
  }

  private onExitHub(): void {
    this.leave(() => HubClient.exitToHub());
  }

  private showOptions(): void {
    this.page = 'options';
    this.layout();
    this.options.reset(0);
  }

  private showMain(): void {
    this.page = 'main';
    this.layout();
    this.main.reset(2);
    Audio.playSfx('menu_select');
  }

  private cycleSkin(step: number): boolean {
    if (!RelicLoadout.cycleBody(step)) return false;
    this.refreshRelicLine();
    this.layout();
    return true;
  }

  /** The Relic line under the buttons: skin, cape, focus key, how to switch. */
  refreshRelicLine(): void {
    const state = RelicLoadout.resolve();
    const body = state.body;
    const choices = state.body_choices;
    if (body === '' && !state.cape && choices.length < 2) {
      this.relicText = '';
      return;
    }
    const parts: string[] = [];
    if (state.ranked) parts.push('RANKED - LOOK ONLY');
    if (choices.length > 0 || body !== '') parts.push(`SKIN ${skinLabel(body)}`);
    if (state.cape) parts.push('CAPE DUELIST');
    if (state.time_focus) {
      const key = InputHints.actionKeys('focus');
      if (key !== '') parts.push(`FOCUS ${key}`);
    }
    if (choices.length >= 2) parts.push('LEFT RIGHT');
    this.relicText = parts.join('  ');
  }

  relicLine(): string {
    return this.relicText;
  }

  /** The controls table: [row label, keys, gamepad, touch]. Key names from the bindings. */
  controlsRows(): string[][] {
    return [
      ['', 'KEYS', 'GAMEPAD', 'TOUCH'],
      ['MOVE', InputHints.moveKeys(), 'D-PAD / STICK', 'LEFT PAD'],
      ['JUMP', InputHints.actionKeys('jump'), 'A B X Y', 'JUMP BUTTON'],
      ['PAUSE', InputHints.actionKeys('pause', ' / '), 'START', 'II BUTTON'],
    ];
  }

  /** The device column to highlight: the one the player used last. */
  activeColumn(): number {
    const device: Device = Display.isTouch ? 'touch' : Input.lastDevice;
    return DEVICE_COLUMN[device];
  }

  // --- Layout and drawing ----------------------------------------------------------

  private titleY = 0;
  private relicY = 0;
  private controls = new Rect2();
  private columnX: number[] = [];

  /** Places the items for the current page (centred vertically, like the VBox). */
  private layout(): void {
    const titleH = lineHeight('title');
    if (this.page === 'options') {
      const n = this.options.items.length;
      const listH = n * BUTTON_H + (n - 1) * BUTTON_SEP;
      const noteH = lineHeight('outline') * 2;
      const total = titleH + LAYOUT_SEP + listH + LAYOUT_SEP + noteH;
      let y = Math.floor((VIEW_H - total) / 2);
      this.titleY = y;
      y += titleH + LAYOUT_SEP;
      const x = Math.floor((VIEW_W - OPTION_W) / 2);
      for (const it of this.options.items) {
        it.rect = new Rect2(x, y, OPTION_W, BUTTON_H);
        y += BUTTON_H + BUTTON_SEP;
      }
      this.relicY = y - BUTTON_SEP + LAYOUT_SEP;
      return;
    }
    const n = this.main.items.length;
    const listH = n * BUTTON_H + (n - 1) * BUTTON_SEP;
    const relicH = this.relicText !== '' ? lineHeight('label') + LAYOUT_SEP : 0;
    // Controls panel: header, the 4-row grid, the moves line.
    const smallH = lineHeight('label');
    const gridH = 4 * smallH + 3;
    const panelInner = lineHeight('header') + 3 + gridH + 3 + smallH;
    const rows = this.controlsRows();
    const widths = [0, 1, 2, 3].map((c) => Math.max(...rows.map((r) => measure(r[c]!, 'label'))));
    const gridW = widths.reduce((a, b) => a + b, 0) + 10 * 3;
    const innerW = Math.max(gridW, measure(MOVES_LINE, 'label'), measure('CONTROLS', 'header'));
    const panelH = panelInner + PANEL_MARGIN_Y * 2;
    const panelW = innerW + PANEL_MARGIN_X * 2;
    const total = titleH + LAYOUT_SEP + listH + LAYOUT_SEP + relicH + panelH;
    let y = Math.floor((VIEW_H - total) / 2);
    this.titleY = y;
    y += titleH + LAYOUT_SEP;
    const x = Math.floor((VIEW_W - BUTTON_W) / 2);
    for (const it of this.main.items) {
      it.rect = new Rect2(x, y, BUTTON_W, BUTTON_H);
      y += BUTTON_H + BUTTON_SEP;
    }
    y += LAYOUT_SEP - BUTTON_SEP;
    this.relicY = y;
    y += relicH;
    this.controls = new Rect2(Math.floor((VIEW_W - panelW) / 2), y, panelW, panelH);
    const gx = this.controls.x + PANEL_MARGIN_X + Math.floor((innerW - gridW) / 2);
    this.columnX = [];
    let cx = gx;
    for (const w of widths) {
      this.columnX.push(cx);
      cx += w + 10;
    }
  }

  protected override paint(g: Gfx): void {
    if (!this.open) return;
    g.rect(0, 0, VIEW_W, VIEW_H, BACKDROP);
    if (this.page === 'options') {
      this.paintOptions(g);
      return;
    }
    drawCentered(g, 'PAUSED', this.titleY, 'title');
    this.main.draw(g);
    if (this.relicText !== '') drawCentered(g, this.relicText, this.relicY, 'label');
    const r = this.controls;
    drawPanel(g, r);
    let y = r.y + PANEL_MARGIN_Y;
    drawText(g, 'CONTROLS', r.x, y, 'header', { align: 'center', width: r.w });
    y += lineHeight('header') + 3;
    const rows = this.controlsRows();
    const active = this.activeColumn();
    const smallH = lineHeight('label');
    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        let color: Color | null = null;
        if (ri === 0) color = ci === active ? HEADER_ACTIVE : HEADER_IDLE;
        else if (ci === 0) color = COLORS.gold;
        drawText(g, cell, this.columnX[ci]!, y, 'label', { color });
      });
      y += smallH + 1;
    });
    y += 2;
    drawText(g, MOVES_LINE, r.x, y, 'label', { align: 'center', width: r.w, color: COLORS.soft });
  }

  private paintOptions(g: Gfx): void {
    drawCentered(g, 'OPTIONS', this.titleY, 'title');
    this.options.draw(g);
    const row = this.options.focused?.data as OptionRow | undefined;
    if (row) drawCentered(g, row.help, this.relicY, 'outline');
    if (RelicLoadout.resolve().ranked) drawCentered(g, 'RANKED: EXTRA MOVES AND ITEM BOXES ARE OFF', this.relicY + lineHeight('outline'), 'outline');
  }

  private drawOption(g: Gfx, item: MenuItem, state: ButtonState, row: OptionRow): void {
    drawButton(g, item.rect, row.label, state, 'left');
    const ranked = row.rankedOff && RelicLoadout.resolve().ranked;
    const on = optionOn(row);
    const value = on ? 'ON' : 'OFF';
    const r = item.rect;
    const ty = Math.round(r.y + (r.h - 11) / 2) + 1 + (state === 'pressed' ? 1 : 0);
    const valueColor = on ? COLORS.gold : COLORS.idle;
    drawText(g, value, r.x + 6, ty, 'hudValue', { align: 'right', width: r.w - 12, color: valueColor });
    if (ranked) {
      const vw = measure(value, 'hudValue');
      drawText(g, 'OFF IN RANKED', r.x + 6, ty + 1, 'label', { align: 'right', width: r.w - 12 - vw - 8, color: COLORS.warning });
    }
  }
}
