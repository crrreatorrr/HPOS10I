// The menu helper every screen uses: a list of items with one focused, moved
// with ui_up/ui_down (arrows, D-pad, stick) and move_up/move_down (WASD),
// with key repeat while held; ui_accept or any jump key chooses; ui_cancel
// (and optionally pause) goes back; a pointer or finger taps an item (press
// and release on the same item, like a Button). Plays menu_move on focus
// changes and menu_select on choosing.
//
// Directions and buttons are polled once per rendered frame (call update()
// from process()), so a gamepad button that is both jump and ui_accept, or a
// D-pad that is both move_up and ui_up, counts once. Pointer events come in
// through handleEvent() from input(). Nothing is chosen on the frame the menu
// was reset() (the key that opened it), nor during `grace` seconds.

import { Audio } from '../../core/audio';
import { Input, InputEvent, type Action } from '../../runtime/input';
import type { InputEventLike } from '../../runtime/node';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import type { Gfx } from '../../runtime/gfx';
import { drawButton, type ButtonState } from './theme';

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_ACTIONS: Record<Direction, readonly Action[]> = {
  up: ['ui_up', 'move_up'],
  down: ['ui_down', 'move_down'],
  left: ['ui_left', 'move_left'],
  right: ['ui_right', 'move_right'],
};
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** Held this long, a direction starts repeating... */
export const REPEAT_DELAY = 0.4;
/** ...once per this many seconds. */
export const REPEAT_INTERVAL = 0.09;

export interface MenuItem {
  label: string | (() => string);
  /** Screen-space rectangle (drawing and pointer hits). Screens may move it every frame. */
  rect: Rect2;
  /** Locked items are drawn greyed out and skipped by navigation. Default true. */
  enabled?: boolean;
  /** Hidden items are skipped and not drawn. Default true. */
  visible?: boolean;
  onSelect?: () => void;
  /** Left/right on this item (-1 / +1). Return true when it did something (plays menu_move). */
  onStep?: (step: number) => boolean;
  /** Custom drawing instead of the theme button. */
  draw?: (g: Gfx, item: MenuItem, state: ButtonState) => void;
  /** Free data for the screen (zone/act for the zone select...). */
  data?: unknown;
}

export interface MenuOptions {
  /** Called on ui_cancel (and pause when cancelOnPause). Null: cancel does nothing. */
  onCancel?: (() => void) | null;
  /** Pause (but not Enter, which is also ui_accept) goes back too. */
  cancelOnPause?: boolean;
  /** Every jump key chooses too (default true). */
  acceptOnJump?: boolean;
  /** Seconds after reset() before input counts (a key still held from the previous screen). */
  grace?: number;
  /** Custom neighbours for grids: the item index to move to (or the same index). */
  links?: ((index: number, dir: Direction) => number) | null;
  /** Repeat left/right while held (default true). */
  repeatHorizontal?: boolean;
  /** Play menu_select when an item is chosen (default true). */
  selectSound?: boolean;
}

export function labelOf(item: MenuItem): string {
  return typeof item.label === 'function' ? item.label() : item.label;
}

export class MenuList {
  items: MenuItem[] = [];
  focus = 0;
  /** False: update() and handleEvent() do nothing. */
  enabled = true;
  onCancel: (() => void) | null;
  cancelOnPause: boolean;
  acceptOnJump: boolean;
  grace: number;
  links: ((index: number, dir: Direction) => number) | null;
  repeatHorizontal: boolean;
  selectSound: boolean;

  private clock = 0;
  private armedFrame = -1;
  private held: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };
  private repeat: Record<Direction, number> = { up: 0, down: 0, left: 0, right: 0 };
  /** Item under a pointer that went down on it (-1 = none), per pointer id. */
  private pressed = new Map<number, number>();
  private lastActivateFrame = -1;

  constructor(items: MenuItem[] = [], opts: MenuOptions = {}) {
    this.items = items;
    this.onCancel = opts.onCancel ?? null;
    this.cancelOnPause = opts.cancelOnPause ?? false;
    this.acceptOnJump = opts.acceptOnJump ?? true;
    this.grace = opts.grace ?? 0;
    this.links = opts.links ?? null;
    this.repeatHorizontal = opts.repeatHorizontal ?? true;
    this.selectSound = opts.selectSound ?? true;
    this.focus = this.firstUsable();
  }

  isUsable(i: number): boolean {
    const it = this.items[i];
    return !!it && it.enabled !== false && it.visible !== false;
  }

  firstUsable(): number {
    for (let i = 0; i < this.items.length; i++) if (this.isUsable(i)) return i;
    return 0;
  }

  get focused(): MenuItem | null {
    return this.items[this.focus] ?? null;
  }

  /** Starts over (menu opened): focus on `focus` quietly, ignore input this frame and for `grace`. */
  reset(focus = this.firstUsable()): void {
    this.focus = this.isUsable(focus) ? focus : this.firstUsable();
    this.clock = 0;
    this.armedFrame = tree.processFrames;
    this.pressed.clear();
    for (const d of DIRECTIONS) {
      this.held[d] = DIRECTION_ACTIONS[d].some((a) => Input.isActionPressed(a));
      this.repeat[d] = 0;
    }
  }

  /** True while input is ignored (the opening frame, or the grace time). */
  isSettling(): boolean {
    return tree.processFrames === this.armedFrame || this.clock < this.grace;
  }

  setFocus(i: number, quiet = false): void {
    if (!this.isUsable(i) || i === this.focus) return;
    this.focus = i;
    if (!quiet) Audio.playSfx('menu_move');
  }

  /** Chooses an item (once per frame). */
  activate(i = this.focus): void {
    if (!this.isUsable(i)) return;
    if (this.lastActivateFrame === tree.processFrames) return;
    this.lastActivateFrame = tree.processFrames;
    if (this.selectSound) Audio.playSfx('menu_select');
    this.items[i]!.onSelect?.();
  }

  /** Moves focus one step (the default list: up/down wrap, skipping locked items). */
  step(dir: Direction): void {
    const item = this.focused;
    if ((dir === 'left' || dir === 'right') && item?.onStep) {
      if (item.onStep(dir === 'left' ? -1 : 1)) {
        Audio.playSfx('menu_move');
        return;
      }
    }
    if (this.links) {
      this.setFocus(this.links(this.focus, dir));
      return;
    }
    if (dir === 'left' || dir === 'right') return;
    const n = this.items.length;
    const delta = dir === 'up' ? -1 : 1;
    for (let k = 1; k <= n; k++) {
      const i = (((this.focus + delta * k) % n) + n) % n;
      if (this.isUsable(i)) {
        this.setFocus(i);
        return;
      }
    }
  }

  /** Polls the actions; call once per frame from process(). */
  update(delta: number): void {
    if (!this.enabled) return;
    this.clock += delta;
    const settling = this.isSettling();
    const jp = (a: Action) => Input.isActionJustPressed(a);
    if (!settling) {
      const accept = jp('ui_accept') || (this.acceptOnJump && jp('jump'));
      const cancel = jp('ui_cancel') || (this.cancelOnPause && jp('pause') && !jp('ui_accept'));
      if (this.onCancel && cancel) {
        this.onCancel();
        this.syncHeld();
        return;
      }
      if (accept) {
        this.activate();
        this.syncHeld();
        return;
      }
    }
    let moved = false;
    for (const d of DIRECTIONS) {
      const actions = DIRECTION_ACTIONS[d];
      const just = actions.some((a) => jp(a));
      const down = actions.some((a) => Input.isActionPressed(a));
      const was = this.held[d];
      this.held[d] = down;
      if (settling) continue;
      if (just && !was) {
        this.repeat[d] = 0;
        if (!moved) this.step(d);
        moved = true;
      } else if (down && was && (this.repeatHorizontal || d === 'up' || d === 'down')) {
        this.repeat[d] += delta;
        if (this.repeat[d] >= REPEAT_DELAY) {
          this.repeat[d] -= REPEAT_INTERVAL;
          if (!moved) this.step(d);
          moved = true;
        }
      }
    }
  }

  private syncHeld(): void {
    for (const d of DIRECTIONS) this.held[d] = DIRECTION_ACTIONS[d].some((a) => Input.isActionPressed(a));
  }

  /** The usable item under a screen point, or -1. */
  itemAt(p: Vec2): number {
    for (let i = 0; i < this.items.length; i++) {
      if (this.isUsable(i) && this.items[i]!.rect.hasPoint(p)) return i;
    }
    return -1;
  }

  /**
   * Pointer events from input(): press focuses, release on the same item
   * chooses. Returns true when the event hit an item. Never marks it handled
   * (the touch controls and the display watcher see every pointer).
   */
  handleEvent(ev: InputEventLike): boolean {
    if (!this.enabled || ev.kind !== 'pointer' || !ev.pointer) return false;
    const id = ev instanceof InputEvent ? ev.pointerId : 0;
    const phase = ev instanceof InputEvent ? ev.pointerPhase : ev.pressed ? 'down' : 'up';
    const i = this.itemAt(ev.pointer);
    if (phase === 'down') {
      if (this.isSettling()) return false;
      if (i < 0) {
        this.pressed.delete(id);
        return false;
      }
      this.setFocus(i);
      this.pressed.set(id, i);
      return true;
    }
    if (phase === 'move') {
      if (i >= 0 && this.pressed.has(id)) {
        this.setFocus(i);
        this.pressed.set(id, i);
      }
      return i >= 0;
    }
    const was = this.pressed.get(id);
    this.pressed.delete(id);
    if (was !== undefined && was === i && i >= 0) {
      this.activate(i);
      return true;
    }
    return false;
  }

  /** True while a pointer holds this item down. */
  isPressed(i: number): boolean {
    for (const v of this.pressed.values()) if (v === i) return true;
    return false;
  }

  stateOf(i: number): ButtonState {
    if (this.items[i]?.enabled === false) return 'disabled';
    if (this.isPressed(i)) return 'pressed';
    return i === this.focus ? 'focus' : 'normal';
  }

  /** Draws every visible item (theme buttons unless an item draws itself). */
  draw(g: Gfx): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      if (it.visible === false) continue;
      const state = this.stateOf(i);
      if (it.draw) it.draw(g, it, state);
      else drawButton(g, it.rect, labelOf(it), state);
    }
  }
}
