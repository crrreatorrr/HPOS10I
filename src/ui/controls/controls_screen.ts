// CONTROLS: the controller settings screen, a global overlay (installUi)
// that any menu opens over itself with openControls(): the title, the zone
// select, the game over screen and the pause menu (its main and OPTIONS
// pages). processMode is ALWAYS, so it works while the game is paused. While
// it is open (and on the frame it closes) the menu under it takes no input:
// those screens check ControlsScreen.blocking().
//
// One row per remappable action (src/core/controls.ts) with what its keys
// and gamepad buttons are now. Choosing a cell waits for the next key (or
// pad button) and makes it that action's first one; Esc, the pad's B, a tap
// or eight seconds without a press cancel. Menu keys are fixed and listed
// under the table. Then the stick deadzone (left/right), RESET TO DEFAULTS,
// and the standard options: BACK, MAIN MENU and HUB (when the menu that
// opened it offers them) and FULL SCREEN. Everything saves and applies at
// once. Arrows / WASD / D-pad / stick move (left/right also between the
// keyboard and gamepad columns), Enter, Space or A chooses, Esc or B goes
// back, a click or tap chooses.

import { Audio } from '../../core/audio';
import { ACTION_LABELS, Controls, DEADZONE_MAX, DEADZONE_MIN, REMAP_ACTIONS, type RemapAction } from '../../core/controls';
import type { Gfx } from '../../runtime/gfx';
import { PAD_BUTTON_LABELS } from '../../runtime/gamepad';
import { Input, type CapturedInput } from '../../runtime/input';
import { posmod } from '../../runtime/math';
import { ProcessMode, type InputEventLike } from '../../runtime/node';
import { Color } from '../../runtime/color';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2 } from '../../runtime/vec2';
import { InputHints } from '../common/input_hints';
import { MenuList, type Direction, type MenuItem } from '../common/menu';
import { CONTROLS_LABEL, fullScreenItem, HUB_LABEL, MAIN_MENU_LABEL } from '../common/standard_items';
import { COLORS, drawButton, drawCentered, drawText, UiLayer, type ButtonState } from '../common/theme';
import { Display } from '../display';
import { Feedback } from '../feedback';
import { FullScreen } from '../fullscreen';

/** Seconds a press-to-bind waits before giving up. */
export const BIND_TIMEOUT = 8;
export const MENU_KEYS_LINE = 'MENU KEYS STAY: ARROWS ENTER SPACE ESC / D-PAD STICK A B';
const BACKDROP = new Color(0.02, 0.03, 0.09, 0.9);
const ROW_Y = 41;
const ROW_H = 14;
const ROW_STEP = 15;
const LABEL_X = 18;
const KEY_X = 118;
const KEY_W = 150;
const PAD_X = 272;
const PAD_W = 136;
const SMALL_H = 16;

/** What the menu that opened the screen offers on it. */
export interface ControlsHost {
  /** MAIN MENU on the screen (left out when absent, as on the title itself). */
  mainMenu?: () => void;
  /** HUB on the screen. */
  hub?: () => void;
  /** Called after BACK. */
  back?: () => void;
  /** The screen closes itself once this is false (the menu under it went away). */
  alive?: () => boolean;
}

interface Cell {
  action: RemapAction;
  device: 'key' | 'pad';
}

/** "LEFT / A", the keys of an action now. */
export function keysText(action: RemapAction): string {
  return Controls.keys(action)
    .map((c) => InputHints.keyLabel(c))
    .join(' / ');
}

/** "D-PAD LEFT + STICK", the pad buttons of an action now. */
export function padText(action: RemapAction): string {
  const names = Controls.buttons(action).map(padLabel);
  const stick = action.startsWith('move_') ? ' + STICK' : '';
  return (names.join(' / ') || 'NONE') + stick;
}

export function padLabel(button: number): string {
  return PAD_BUTTON_LABELS[button] ?? `BUTTON ${button}`;
}

let instance: ControlsScreen | null = null;

/** The screen (made and added to the tree on first use when installUi() didn't). */
export function controlsScreen(): ControlsScreen {
  if (!instance) instance = new ControlsScreen();
  if (!instance.isInsideTree()) tree.addAutoload(instance);
  return instance;
}

/** Opens CONTROLS over the calling menu. */
export function openControls(host: ControlsHost = {}): void {
  controlsScreen().open(host);
}

export class ControlsScreen extends UiLayer {
  /** True while the screen is open, and on the frame it closed (the menu under it ignores that frame). */
  static blocking(): boolean {
    return !!instance && instance.blocksInput();
  }

  menu = new MenuList();
  /** Message line (what a bind did, or why not). */
  message = '';
  /** The cell waiting for a press, or null. */
  binding: Cell | null = null;
  private host: ControlsHost = {};
  private opened = false;
  private closedFrame = -1;
  private bindClock = 0;
  private grid: number[][] = [];

  constructor() {
    super('ControlsScreen', 103);
    this.processMode = ProcessMode.ALWAYS;
    this.processPriority = -110;
    this.visible = false;
    instance = this;
  }

  isOpen(): boolean {
    return this.opened;
  }

  blocksInput(): boolean {
    return this.opened || this.closedFrame === tree.processFrames;
  }

  open(host: ControlsHost = {}): void {
    this.host = host;
    this.opened = true;
    this.visible = true;
    this.message = '';
    this.binding = null;
    this.build();
    this.menu.reset(0);
  }

  close(): void {
    if (!this.opened) return;
    this.stopBinding();
    this.opened = false;
    this.visible = false;
    this.closedFrame = tree.processFrames;
  }

  /** The visible option labels (tests). */
  labels(): string[] {
    return this.menu.items.map((i) => (typeof i.label === 'function' ? i.label() : i.label));
  }

  private build(): void {
    const items: MenuItem[] = [];
    this.grid = [];
    REMAP_ACTIONS.forEach((action, i) => {
      const y = ROW_Y + i * ROW_STEP;
      const k = items.length;
      items.push(this.cellItem({ action, device: 'key' }, new Rect2(KEY_X, y, KEY_W, ROW_H)));
      items.push(this.cellItem({ action, device: 'pad' }, new Rect2(PAD_X, y, PAD_W, ROW_H)));
      this.grid.push([k, k + 1]);
    });
    const y1 = ROW_Y + REMAP_ACTIONS.length * ROW_STEP + 14;
    const dz = items.length;
    items.push({
      label: () => `STICK DEAD ZONE  ${Controls.deadzone.toFixed(2)}`,
      rect: new Rect2(40, y1, 176, SMALL_H),
      data: 'deadzone',
      onStep: (step) => Controls.stepDeadzone(step),
      onSelect: () => {
        if (!Controls.stepDeadzone(1)) while (Controls.deadzone > DEADZONE_MIN + 1e-9) Controls.stepDeadzone(-1);
      },
    });
    items.push({
      label: 'RESET TO DEFAULTS',
      rect: new Rect2(222, y1, 162, SMALL_H),
      onSelect: () => {
        Controls.resetDefaults();
        this.message = 'CONTROLS RESET TO DEFAULTS';
      },
    });
    this.grid.push([dz, dz + 1]);
    const bottom: MenuItem[] = [{ label: 'BACK', rect: new Rect2(), onSelect: () => this.back() }];
    if (this.host.mainMenu) bottom.push({ label: MAIN_MENU_LABEL, rect: new Rect2(), onSelect: () => this.leave(this.host.mainMenu) });
    if (this.host.hub) bottom.push({ label: HUB_LABEL, rect: new Rect2(), onSelect: () => this.leave(this.host.hub) });
    const fs = fullScreenItem();
    if (fs) bottom.push(fs);
    const widths = bottom.map((b) => (b.data === 'fullscreen' ? 132 : b.label === 'BACK' ? 52 : b.label === HUB_LABEL ? 44 : 84));
    const total = widths.reduce((a, b) => a + b, 0) + (bottom.length - 1) * 4;
    let x = Math.floor((VIEW_W - total) / 2);
    const y2 = y1 + SMALL_H + 5;
    const row: number[] = [];
    bottom.forEach((b, i) => {
      b.rect = new Rect2(x, y2, widths[i]!, SMALL_H);
      x += widths[i]! + 4;
      row.push(items.length);
      items.push(b);
    });
    this.grid.push(row);
    this.menu = new MenuList(items, { onCancel: () => this.back(), links: (i, d) => this.link(i, d), repeatHorizontal: false });
  }

  private cellItem(cell: Cell, rect: Rect2): MenuItem {
    return {
      label: () => `${ACTION_LABELS[cell.action]} ${cell.device === 'key' ? 'KEY' : 'BUTTON'}`,
      rect,
      data: cell,
      onSelect: () => this.startBinding(cell),
      draw: (g, item, state) => this.drawCell(g, item, state, cell),
    };
  }

  private link(index: number, dir: Direction): number {
    let r = -1;
    let c = -1;
    this.grid.forEach((row, ri) => {
      const ci = row.indexOf(index);
      if (ci >= 0) {
        r = ri;
        c = ci;
      }
    });
    if (r < 0) return 0;
    if (dir === 'left' || dir === 'right') {
      const row = this.grid[r]!;
      return row[posmod(c + (dir === 'left' ? -1 : 1), row.length)]!;
    }
    const nr = posmod(r + (dir === 'up' ? -1 : 1), this.grid.length);
    const next = this.grid[nr]!;
    // Keep the column side (keyboard / gamepad) when moving between rows of different widths.
    const ratio = this.grid[r]!.length > 1 ? c / (this.grid[r]!.length - 1) : 0;
    return next[Math.round(ratio * (next.length - 1))]!;
  }

  private back(): void {
    this.close();
    Audio.playSfx('menu_select');
    this.host.back?.();
  }

  private leave(then: (() => void) | undefined): void {
    this.close();
    then?.();
  }

  // --- Press-to-bind ------------------------------------------------------------

  startBinding(cell: Cell): void {
    this.binding = cell;
    this.bindClock = 0;
    this.message = '';
    this.menu.enabled = false;
    Input.captureNext(this.onCaptured);
  }

  private stopBinding(): void {
    if (!this.binding) return;
    this.binding = null;
    Input.captureNext(null);
    this.menu.enabled = true;
    // The press that ended it never chooses the next item.
    this.menu.reset(this.menu.focus);
  }

  private readonly onCaptured = (input: CapturedInput): void => {
    const cell = this.binding;
    if (!cell) return;
    const cancel = (input.kind === 'key' && input.code === 'Escape') || (input.kind === 'pad' && input.button === 1);
    if (cancel) {
      this.message = 'NOTHING CHANGED';
      this.stopBinding();
      return;
    }
    if ((cell.device === 'key') !== (input.kind === 'key')) {
      // A pad button while waiting for a key (or the other way round): keep waiting.
      this.message = cell.device === 'key' ? 'PRESS A KEY' : 'PRESS A GAMEPAD BUTTON';
      Input.captureNext(this.onCaptured);
      return;
    }
    const result =
      input.kind === 'key'
        ? Controls.bindKey(cell.action, input.code, (c) => InputHints.keyLabel(c))
        : Controls.bindButton(cell.action, input.button, padLabel);
    this.message = result.message;
    Audio.playSfx(result.ok ? 'menu_select' : 'menu_move');
    this.stopBinding();
  };

  // --- Frame --------------------------------------------------------------------

  override process(delta: number): void {
    if (!this.opened) return;
    if (this.host.alive && !this.host.alive()) {
      this.close();
      return;
    }
    if (this.binding) {
      this.bindClock += delta;
      if (this.bindClock >= BIND_TIMEOUT) {
        this.message = 'NOTHING CHANGED';
        this.stopBinding();
      }
      return;
    }
    this.menu.update(delta);
  }

  override input(ev: InputEventLike): void {
    if (!this.opened) return;
    if (this.binding) {
      if (ev.kind === 'pointer' && ev.pressed && !ev.echo) {
        this.message = 'NOTHING CHANGED';
        this.stopBinding();
      }
      return;
    }
    this.menu.handleEvent(ev);
  }

  // --- Drawing ------------------------------------------------------------------

  private drawCell(g: Gfx, item: MenuItem, state: ButtonState, cell: Cell): void {
    const waiting = this.binding === cell;
    drawButton(g, item.rect, '', waiting ? 'pressed' : state);
    const text = waiting ? (cell.device === 'key' ? 'PRESS A KEY' : 'PRESS A BUTTON') : cell.device === 'key' ? keysText(cell.action) : padText(cell.action);
    const color = waiting || state === 'focus' ? COLORS.buttonFocus : COLORS.buttonText;
    drawText(g, text, item.rect.x + 4, item.rect.y + 3, 'label', { align: 'center', width: item.rect.w - 8, color });
  }

  protected override paint(g: Gfx): void {
    // SEND FEEDBACK's screenshot shows the game, as under the pause menu.
    if (!this.opened || Feedback.hidesMenus) return;
    g.rect(0, 0, VIEW_W, VIEW_H, BACKDROP);
    drawCentered(g, CONTROLS_LABEL, 6, 'title');
    const device = Display.isTouch ? 'touch' : Input.lastDevice;
    drawText(g, 'ACTION', LABEL_X, 30, 'label', { color: COLORS.idle });
    drawText(g, 'KEYBOARD', KEY_X, 30, 'label', { align: 'center', width: KEY_W, color: device === 'keyboard' ? COLORS.gold : COLORS.idle });
    drawText(g, 'GAMEPAD', PAD_X, 30, 'label', { align: 'center', width: PAD_W, color: device === 'pad' ? COLORS.gold : COLORS.idle });
    REMAP_ACTIONS.forEach((action, i) => drawText(g, ACTION_LABELS[action], LABEL_X, ROW_Y + i * ROW_STEP + 1, 'hudValue', { color: COLORS.gold }));
    drawCentered(g, MENU_KEYS_LINE, ROW_Y + REMAP_ACTIONS.length * ROW_STEP + 2, 'label', { color: COLORS.soft });
    this.menu.draw(g);
    const bottom = this.menu.items[this.menu.items.length - 1]!.rect.bottom;
    const line = FullScreen.notice() || this.message || this.helpLine();
    drawCentered(g, line, bottom + 5, 'outline');
  }

  /** The line under the buttons when there is no message. */
  helpLine(): string {
    if (this.binding) return this.binding.device === 'key' ? 'PRESS THE NEW KEY   ESC: CANCEL' : 'PRESS THE NEW BUTTON   B OR ESC: CANCEL';
    const f = this.menu.focused?.data;
    if (f === 'deadzone') return `LEFT / RIGHT: ${DEADZONE_MIN.toFixed(2)} TO ${DEADZONE_MAX.toFixed(2)}   HIGHER: A LONGER PUSH TO MOVE`;
    if (f && typeof f === 'object') return 'CHOOSE A BOX, THEN PRESS THE NEW KEY OR BUTTON';
    return '';
  }
}
