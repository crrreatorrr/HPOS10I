// The player's controller settings: remapped keys and gamepad buttons for the
// gameplay actions, and the left stick's deadzone. Saved on this browser
// (SAVE_KEYS.controls, through Storage, which never throws) and applied to
// the input layer at once (applyBindings in src/runtime/input.ts), so the
// game only ever sees actions: nothing downstream of the input layer changes.
//
// Remapping replaces an action's first (primary) key or button; the others
// stay (move left keeps A when Left is replaced, jump keeps its other keys).
// A key or button another remappable action already uses moves to the new
// action; when that leaves the other action with nothing, the two swap.
// Menu keys (the ui_* actions: arrows, Enter, Space, Esc; the D-pad, A, B)
// are fixed so a remap can never lock the menus. A key the menus use for one
// thing can't be given to an action that means something else in a menu
// (an arrow key on jump would choose items while moving through them), and
// Esc, the F keys, Tab and N (the feedback window) are never bound.
// There is no vibration setting: the game never vibrates the pad.

import { SAVE_KEYS, Storage } from '../hub/storage';
import { LEFT_STICK_DEADZONE } from '../runtime/gamepad';
import { applyBindings, DEFAULT_KEY_BINDINGS, DEFAULT_PAD_BUTTONS, Input, KEY_BINDINGS, PAD_BUTTONS, PAD_BUTTON_COUNT, type Action } from '../runtime/input';
import { Signal } from '../runtime/signal';

/** The actions the player can remap, in the order the CONTROLS screen lists them. */
export const REMAP_ACTIONS = ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'pause', 'focus'] as const satisfies readonly Action[];
export type RemapAction = (typeof REMAP_ACTIONS)[number];

/** Names on the CONTROLS screen. */
export const ACTION_LABELS: Record<RemapAction, string> = {
  move_left: 'MOVE LEFT',
  move_right: 'MOVE RIGHT',
  move_up: 'UP / LOOK',
  move_down: 'DOWN / ROLL',
  jump: 'JUMP',
  pause: 'PAUSE',
  focus: 'TIME FOCUS',
};

/** Keys never bound: Esc (back, and the browser's way out of full screen), F keys, Tab, N (feedback), modifiers' OS keys. */
export function isReservedKey(code: string): boolean {
  return code === 'Escape' || code === 'KeyN' || code === 'Tab' || /^F\d{1,2}$/.test(code) || code.startsWith('Meta') || code === 'ContextMenu' || code === '';
}

/** Home is the browser's; B cancels a pad bind. */
export function isReservedButton(button: number): boolean {
  return !Number.isInteger(button) || button < 0 || button >= PAD_BUTTON_COUNT || button === 1;
}

/** Which remappable actions may share a key or button with each fixed menu action. */
const MENU_PARTNERS: Partial<Record<Action, readonly RemapAction[]>> = {
  ui_up: ['move_up'],
  ui_down: ['move_down'],
  ui_left: ['move_left'],
  ui_right: ['move_right'],
  ui_accept: ['jump', 'pause'],
  ui_cancel: [],
};
const MENU_ACTIONS = Object.keys(MENU_PARTNERS) as Action[];

/** The fixed menu action that uses a key for something `action` doesn't mean, or null. */
export function menuClashKey(action: RemapAction, code: string): Action | null {
  for (const m of MENU_ACTIONS) if (DEFAULT_KEY_BINDINGS[m].includes(code) && !MENU_PARTNERS[m]!.includes(action)) return m;
  return null;
}

export function menuClashButton(action: RemapAction, button: number): Action | null {
  for (const m of MENU_ACTIONS) if ((DEFAULT_PAD_BUTTONS[m] ?? []).includes(button) && !MENU_PARTNERS[m]!.includes(action)) return m;
  return null;
}

export const DEADZONE_MIN = 0.1;
/** Past the 0.45 move threshold a bigger deadzone makes the stick need a longer push. */
export const DEADZONE_MAX = 0.7;
export const DEADZONE_STEP = 0.05;

export interface BindResult {
  ok: boolean;
  /** One line for the screen: what happened, or why not. */
  message: string;
}

interface ControlsData {
  keys: Partial<Record<RemapAction, string[]>>;
  pad: Partial<Record<RemapAction, number[]>>;
  deadzone: number;
}

function roundDeadzone(v: number): number {
  return Math.round(Math.min(DEADZONE_MAX, Math.max(DEADZONE_MIN, v)) / DEADZONE_STEP) * DEADZONE_STEP;
}

class ControlsStore {
  /** Emitted after every change (and load/reset). */
  readonly changed = new Signal();
  private data: ControlsData = { keys: {}, pad: {}, deadzone: LEFT_STICK_DEADZONE };

  /** Reads the save (bad entries fall back to the defaults) and applies it. */
  load(): void {
    const raw = Storage.readJson(SAVE_KEYS.controls);
    const next: ControlsData = { keys: {}, pad: {}, deadzone: LEFT_STICK_DEADZONE };
    const keys = raw.keys && typeof raw.keys === 'object' ? (raw.keys as Record<string, unknown>) : {};
    const pad = raw.pad && typeof raw.pad === 'object' ? (raw.pad as Record<string, unknown>) : {};
    for (const action of REMAP_ACTIONS) {
      const k = keys[action];
      if (Array.isArray(k) && k.length > 0 && k.every((c) => typeof c === 'string' && /^[A-Za-z0-9]+$/.test(c) && !isReservedKey(c))) next.keys[action] = [...new Set(k as string[])];
      const p = pad[action];
      if (Array.isArray(p) && p.length > 0 && p.every((b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < PAD_BUTTON_COUNT)) next.pad[action] = [...new Set(p as number[])];
    }
    if (typeof raw.deadzone === 'number' && Number.isFinite(raw.deadzone)) next.deadzone = roundDeadzone(raw.deadzone);
    this.data = next;
    this.apply(false);
  }

  /** Back to the defaults (saved). */
  resetDefaults(): void {
    this.data = { keys: {}, pad: {}, deadzone: LEFT_STICK_DEADZONE };
    this.apply(true);
  }

  /** The keys bound to an action right now. */
  keys(action: RemapAction): readonly string[] {
    return KEY_BINDINGS[action];
  }

  buttons(action: RemapAction): readonly number[] {
    return PAD_BUTTONS[action] ?? [];
  }

  get deadzone(): number {
    return this.data.deadzone;
  }

  /** Steps the deadzone by `step` notches. Returns true when it changed. */
  stepDeadzone(step: number): boolean {
    const next = roundDeadzone(this.data.deadzone + step * DEADZONE_STEP);
    if (Math.abs(next - this.data.deadzone) < 1e-9) return false;
    this.data = { ...this.data, deadzone: next };
    this.apply(true);
    return true;
  }

  /** True when nothing differs from the defaults. */
  isDefault(): boolean {
    return Object.keys(this.data.keys).length === 0 && Object.keys(this.data.pad).length === 0 && Math.abs(this.data.deadzone - LEFT_STICK_DEADZONE) < 1e-9;
  }

  /** Makes `code` the action's primary key. `label` names keys in the message. */
  bindKey(action: RemapAction, code: string, label: (code: string) => string = (c) => c): BindResult {
    if (isReservedKey(code)) return { ok: false, message: `${label(code)} CAN'T BE USED` };
    const clash = menuClashKey(action, code);
    if (clash) return { ok: false, message: `${label(code)} IS A MENU KEY` };
    const lists = this.currentLists('keys');
    const result = rebind(lists, action, code, label, (a, c) => menuClashKey(a, c) !== null);
    if (!result.ok) return result;
    this.data = { ...this.data, keys: diffFromDefaults(lists, DEFAULT_KEY_BINDINGS) };
    this.apply(true);
    return result;
  }

  /** Makes `button` the action's primary pad button. */
  bindButton(action: RemapAction, button: number, label: (button: number) => string = String): BindResult {
    if (isReservedButton(button)) return { ok: false, message: `${label(button)} CAN'T BE USED` };
    const clash = menuClashButton(action, button);
    if (clash) return { ok: false, message: `${label(button)} IS A MENU BUTTON` };
    const lists = this.currentLists('pad');
    const result = rebind(lists, action, button, label, (a, b) => menuClashButton(a, b) !== null);
    if (!result.ok) return result;
    this.data = { ...this.data, pad: diffFromDefaults(lists, DEFAULT_PAD_BUTTONS) };
    this.apply(true);
    return result;
  }

  private currentLists(kind: 'keys'): Record<RemapAction, string[]>;
  private currentLists(kind: 'pad'): Record<RemapAction, number[]>;
  private currentLists(kind: 'keys' | 'pad'): Record<RemapAction, (string | number)[]> {
    const out = {} as Record<RemapAction, (string | number)[]>;
    for (const a of REMAP_ACTIONS) out[a] = kind === 'keys' ? [...KEY_BINDINGS[a]] : [...(PAD_BUTTONS[a] ?? [])];
    return out;
  }

  private apply(save: boolean): void {
    applyBindings({ keys: this.data.keys, pad: this.data.pad });
    Input.stickDeadzone = this.data.deadzone;
    Input.rebind();
    if (save) Storage.writeJson(SAVE_KEYS.controls, { v: 1, keys: this.data.keys, pad: this.data.pad, deadzone: this.data.deadzone });
    this.changed.emit();
  }
}

/**
 * Puts `value` first on `action`, taking it from any other action that has it.
 * When that would leave the other action with nothing, the two swap (it gets
 * the replaced value), unless the replaced value is a menu clash there.
 */
function rebind<T extends string | number>(
  lists: Record<RemapAction, T[]>,
  action: RemapAction,
  value: T,
  label: (v: T) => string,
  clash: (action: RemapAction, v: T) => boolean,
): BindResult {
  const mine = lists[action];
  const old = mine[0];
  if (old === value) return { ok: true, message: `${ACTION_LABELS[action]} IS ALREADY ${label(value)}` };
  const next = { ...lists };
  let message = `${ACTION_LABELS[action]}: ${label(value)}`;
  for (const other of REMAP_ACTIONS) {
    if (other === action || !lists[other].includes(value)) continue;
    const rest = lists[other].filter((v) => v !== value);
    if (rest.length > 0) {
      next[other] = rest;
      message = `${label(value)} MOVED FROM ${ACTION_LABELS[other]}`;
    } else if (old !== undefined && !clash(other, old)) {
      next[other] = [old];
      message = `SWAPPED WITH ${ACTION_LABELS[other]}`;
    } else {
      return { ok: false, message: `${label(value)} IS THE ONLY ONE ON ${ACTION_LABELS[other]}` };
    }
  }
  next[action] = [value, ...mine.slice(1).filter((v) => v !== value)];
  Object.assign(lists, next);
  return { ok: true, message };
}

/** The entries that differ from the defaults (what the save keeps). */
function diffFromDefaults<T extends string | number>(lists: Record<RemapAction, T[]>, defaults: Readonly<Partial<Record<Action, readonly T[]>>>): Partial<Record<RemapAction, T[]>> {
  const out: Partial<Record<RemapAction, T[]>> = {};
  for (const a of REMAP_ACTIONS) {
    const d = defaults[a] ?? [];
    const l = lists[a];
    if (l.length !== d.length || l.some((v, i) => v !== d[i])) out[a] = [...l];
  }
  return out;
}

export const Controls = new ControlsStore();
