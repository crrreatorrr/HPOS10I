// Input actions, bound by physical key position (KeyboardEvent.code), so the
// WASD block works on AZERTY and QWERTZ keyboards too. Gamepads use the
// browser's standard mapping. Touch controls and scripted timelines press the
// same actions.
//
// "Just pressed" is counted per consumer clock: a press is seen as just
// pressed by the first physics tick after it (gameplay) and, separately, by
// the first rendered frame after it (menus). A tap that starts and ends
// between two ticks still counts as one press.

import { Vec2 } from './vec2';
import type { InputEventLike } from './node';

export type Action =
  | 'move_left'
  | 'move_right'
  | 'move_up'
  | 'move_down'
  | 'jump'
  | 'pause'
  | 'debug_overlay'
  | 'focus'
  | 'ui_accept'
  | 'ui_cancel'
  | 'ui_up'
  | 'ui_down'
  | 'ui_left'
  | 'ui_right';

export const ACTIONS: readonly Action[] = [
  'move_left',
  'move_right',
  'move_up',
  'move_down',
  'jump',
  'pause',
  'debug_overlay',
  'focus',
  'ui_accept',
  'ui_cancel',
  'ui_up',
  'ui_down',
  'ui_left',
  'ui_right',
];

/** Keys per action (KeyboardEvent.code). Gameplay keys first; the UI set follows the usual menu keys. */
export const KEY_BINDINGS: Record<Action, readonly string[]> = {
  move_left: ['ArrowLeft', 'KeyA'],
  move_right: ['ArrowRight', 'KeyD'],
  move_up: ['ArrowUp', 'KeyW'],
  move_down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'KeyX', 'KeyC', 'Space', 'KeyK'],
  pause: ['Enter', 'Escape', 'KeyP'],
  debug_overlay: ['F1'],
  focus: ['KeyF'],
  ui_accept: ['Enter', 'NumpadEnter', 'Space'],
  ui_cancel: ['Escape'],
  ui_up: ['ArrowUp'],
  ui_down: ['ArrowDown'],
  ui_left: ['ArrowLeft'],
  ui_right: ['ArrowRight'],
};

/** Standard-mapping gamepad buttons per action. */
export const PAD_BUTTONS: Partial<Record<Action, readonly number[]>> = {
  move_left: [14],
  move_right: [15],
  move_up: [12],
  move_down: [13],
  jump: [0, 1, 2, 3],
  pause: [9],
  focus: [4],
  ui_accept: [0],
  ui_cancel: [1],
  ui_up: [12],
  ui_down: [13],
  ui_left: [14],
  ui_right: [15],
};

/** Stick axes per action: [axis, direction, deadzone]. */
export const PAD_AXES: Partial<Record<Action, readonly [number, number, number]>> = {
  move_left: [0, -1, 0.45],
  move_right: [0, 1, 0.45],
  move_up: [1, -1, 0.75],
  move_down: [1, 1, 0.75],
  ui_left: [0, -1, 0.5],
  ui_right: [0, 1, 0.5],
  ui_up: [1, -1, 0.5],
  ui_down: [1, 1, 0.5],
};

const KEY_TO_ACTIONS = new Map<string, Action[]>();
for (const action of ACTIONS) {
  for (const code of KEY_BINDINGS[action]) {
    const list = KEY_TO_ACTIONS.get(code) ?? [];
    list.push(action);
    KEY_TO_ACTIONS.set(code, list);
  }
}

export class InputEvent implements InputEventLike {
  handled = false;

  constructor(
    readonly kind: 'key' | 'pad' | 'pointer' | 'virtual',
    readonly actions: readonly Action[],
    readonly pressed: boolean,
    readonly echo: boolean,
    readonly code: string | null = null,
    readonly pointer: Vec2 | null = null,
  ) {}

  get action(): string | null {
    return this.actions[0] ?? null;
  }

  isAction(action: Action): boolean {
    return this.actions.includes(action);
  }

  /** Pressed (not an echo unless allowEcho) and bound to `action`. */
  isActionPressed(action: Action, allowEcho = false): boolean {
    return this.pressed && (allowEcho || !this.echo) && this.actions.includes(action);
  }

  isActionReleased(action: Action): boolean {
    return !this.pressed && this.actions.includes(action);
  }
}

type Source = string; // "key:KeyZ", "pad:0:b3", "axis:0:1+", "virt"

class ActionState {
  readonly sources = new Set<Source>();
  /** Presses/releases since the physics clock last looked. */
  physPress = false;
  physRelease = false;
  procPress = false;
  procRelease = false;
  /** What the clocks currently report. */
  physJustPressed = false;
  physJustReleased = false;
  procJustPressed = false;
  procJustReleased = false;
  /** Pressed as seen by the physics clock (latched at tick start). */
  physDown = false;
  procDown = false;

  get down(): boolean {
    return this.sources.size > 0;
  }
}

export class InputManager {
  private states = new Map<Action, ActionState>();
  private eventQueue: InputEvent[] = [];
  private padSnapshot = new Map<string, boolean>();
  /** True while the tree runs physics (selects the clock for just-pressed). */
  inPhysics = false;
  /** Set when any device was used, for hints (key names vs pad glyphs). */
  lastDevice: 'keyboard' | 'pad' | 'touch' = 'keyboard';
  private attached = false;

  constructor() {
    for (const a of ACTIONS) this.states.set(a, new ActionState());
  }

  // --- Queries ----------------------------------------------------------------

  isActionPressed(action: Action): boolean {
    const s = this.states.get(action)!;
    return this.inPhysics ? s.physDown : s.procDown;
  }

  isActionJustPressed(action: Action): boolean {
    const s = this.states.get(action)!;
    return this.inPhysics ? s.physJustPressed : s.procJustPressed;
  }

  isActionJustReleased(action: Action): boolean {
    const s = this.states.get(action)!;
    return this.inPhysics ? s.physJustReleased : s.procJustReleased;
  }

  getAxis(negative: Action, positive: Action): number {
    return (this.isActionPressed(positive) ? 1 : 0) - (this.isActionPressed(negative) ? 1 : 0);
  }

  /** Raw state right now (ignores the clocks). */
  isActionHeldNow(action: Action): boolean {
    return this.states.get(action)!.down;
  }

  // --- Feeding ------------------------------------------------------------------

  /** Presses or releases an action as a virtual device (touch, timelines, tests). */
  actionPress(action: Action, source = 'virt'): void {
    this.setSource(action, `v:${source}`, true, 'virtual');
  }

  actionRelease(action: Action, source = 'virt'): void {
    this.setSource(action, `v:${source}`, false, 'virtual');
  }

  /** Releases everything (focus lost). */
  releaseAll(): void {
    for (const [action, s] of this.states) {
      if (s.sources.size > 0) {
        s.sources.clear();
        s.physRelease = s.procRelease = true;
        this.eventQueue.push(new InputEvent('virtual', [action], false, false));
      }
    }
  }

  keyDown(code: string, repeat: boolean): boolean {
    const actions = KEY_TO_ACTIONS.get(code);
    this.lastDevice = 'keyboard';
    this.eventQueue.push(new InputEvent('key', actions ?? [], true, repeat, code));
    if (!actions) return false;
    if (!repeat) for (const a of actions) this.setSource(a, `key:${code}`, true, null);
    return true;
  }

  keyUp(code: string): boolean {
    const actions = KEY_TO_ACTIONS.get(code);
    this.eventQueue.push(new InputEvent('key', actions ?? [], false, false, code));
    if (!actions) return false;
    for (const a of actions) this.setSource(a, `key:${code}`, false, null);
    return true;
  }

  pointerEvent(pos: Vec2, pressed: boolean): void {
    this.eventQueue.push(new InputEvent('pointer', [], pressed, false, null, pos));
  }

  private setSource(action: Action, source: Source, down: boolean, eventKind: InputEvent['kind'] | null): void {
    const s = this.states.get(action)!;
    const was = s.down;
    if (down) s.sources.add(source);
    else s.sources.delete(source);
    const now = s.down;
    if (!was && now) {
      s.physPress = s.procPress = true;
    } else if (was && !now) {
      s.physRelease = s.procRelease = true;
    }
    if (eventKind && was !== now) this.eventQueue.push(new InputEvent(eventKind, [action], now, false));
  }

  // --- Clocks ---------------------------------------------------------------------

  /** Start of a physics tick: latch presses and releases since the last tick. */
  beginPhysicsTick(): void {
    for (const s of this.states.values()) {
      s.physJustPressed = s.physPress;
      s.physJustReleased = s.physRelease;
      s.physDown = s.down;
      s.physPress = false;
      s.physRelease = false;
    }
  }

  /** Start of a rendered frame: latch for menus, poll pads. Returns queued events. */
  beginProcessFrame(): InputEvent[] {
    this.pollGamepads();
    for (const s of this.states.values()) {
      s.procJustPressed = s.procPress;
      s.procJustReleased = s.procRelease;
      s.procDown = s.down;
      s.procPress = false;
      s.procRelease = false;
    }
    const events = this.eventQueue;
    this.eventQueue = [];
    return events;
  }

  private pollGamepads(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const seen = new Map<string, boolean>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      for (const action of ACTIONS) {
        for (const b of PAD_BUTTONS[action] ?? []) {
          const btn = pad.buttons[b];
          const key = `pad:${pad.index}:b${b}:${action}`;
          seen.set(key, !!btn && btn.pressed);
        }
        const axis = PAD_AXES[action];
        if (axis) {
          const value = pad.axes[axis[0]] ?? 0;
          const key = `pad:${pad.index}:a${axis[0]}${axis[1]}:${action}`;
          seen.set(key, value * axis[1] >= axis[2]);
        }
      }
    }
    for (const [key, down] of seen) {
      const was = this.padSnapshot.get(key) ?? false;
      if (was === down) continue;
      const action = key.slice(key.lastIndexOf(':') + 1) as Action;
      if (down) this.lastDevice = 'pad';
      this.setSource(action, key, down, 'pad');
    }
    for (const [key, was] of this.padSnapshot) {
      if (was && !seen.has(key)) {
        const action = key.slice(key.lastIndexOf(':') + 1) as Action;
        this.setSource(action, key, false, 'pad');
      }
    }
    this.padSnapshot = seen;
  }

  // --- DOM ------------------------------------------------------------------------

  attach(target: Window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', (e) => {
      if (this.keyDown(e.code, e.repeat)) {
        // Keep the page from scrolling on arrows and space. F1 is ours too.
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => {
      if (this.keyUp(e.code)) e.preventDefault();
    });
    target.addEventListener('blur', () => this.releaseAll());
    target.document.addEventListener('visibilitychange', () => {
      if (target.document.visibilityState === 'hidden') this.releaseAll();
    });
  }
}

export const Input = new InputManager();
