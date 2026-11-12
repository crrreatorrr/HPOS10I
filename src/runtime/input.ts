// Input actions, bound by physical key position (KeyboardEvent.code), so the
// WASD block works on AZERTY and QWERTZ keyboards too. Gamepads use the
// browser's standard mapping, read by PadReader (gamepad.ts: deadzone,
// triggers, latch on connect). Touch controls and scripted timelines press the
// same actions.
//
// "Just pressed" is counted per consumer clock: a press is seen as just
// pressed by the first physics tick after it (gameplay) and, separately, by
// the first rendered frame after it (menus). A tap that starts and ends
// between two ticks still counts as one press.
//
// The player can remap keys and pad buttons (src/core/controls.ts, the
// CONTROLS screen): applyBindings() rewrites KEY_BINDINGS and PAD_BUTTONS in
// place, so every reader (hints, the pad reader) follows at once. This happens
// here, before anything downstream sees an action; the simulation only ever
// reads actions. captureNext() hands the next key or pad button press to the
// CONTROLS screen instead of the game (press-to-bind).

import { Vec2 } from './vec2';
import type { InputEventLike } from './node';
import { buttonDown, PadReader, sourceName, type PadLike } from './gamepad';

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
export const DEFAULT_KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
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

/** The live keys per action: the defaults, or the player's remap (applyBindings). */
export const KEY_BINDINGS: Record<Action, readonly string[]> = { ...DEFAULT_KEY_BINDINGS };

/**
 * Standard-mapping gamepad buttons per action (PAD in gamepad.ts names them).
 * Jump is on every face button, as on the classic pads this genre grew up on,
 * so the right thumb never has to find a particular one mid-run. Time Focus
 * (rare, once per act) is on either bumper. View, the sticks' clicks and
 * Home are unused.
 */
export const DEFAULT_PAD_BUTTONS: Readonly<Partial<Record<Action, readonly number[]>>> = {
  move_left: [14],
  move_right: [15],
  move_up: [12],
  move_down: [13],
  jump: [0, 1, 2, 3],
  pause: [9],
  focus: [4, 5],
  ui_accept: [0],
  ui_cancel: [1],
  ui_up: [12],
  ui_down: [13],
  ui_left: [14],
  ui_right: [15],
};

/** The live pad buttons per action: the defaults, or the player's remap (applyBindings). */
export const PAD_BUTTONS: Partial<Record<Action, readonly number[]>> = { ...DEFAULT_PAD_BUTTONS };

/**
 * Left-stick directions per action: [axis, direction, threshold on the raw
 * axis]. Applied after the radial deadzone (LEFT_STICK_DEADZONE).
 */
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

function rebuildKeyMap(): void {
  KEY_TO_ACTIONS.clear();
  for (const action of ACTIONS) {
    for (const code of KEY_BINDINGS[action]) {
      const list = KEY_TO_ACTIONS.get(code) ?? [];
      if (!list.includes(action)) list.push(action);
      KEY_TO_ACTIONS.set(code, list);
    }
  }
}
rebuildKeyMap();

/** Bindings to apply: actions left out keep their defaults. */
export interface BindingSet {
  keys?: Partial<Record<Action, readonly string[]>>;
  pad?: Partial<Record<Action, readonly number[]>>;
}

/**
 * Replaces the live bindings (KEY_BINDINGS, PAD_BUTTONS) with the defaults
 * overlaid by `set`. Callers release held inputs (InputManager.rebind()).
 */
export function applyBindings(set: BindingSet = {}): void {
  for (const action of ACTIONS) {
    KEY_BINDINGS[action] = [...(set.keys?.[action] ?? DEFAULT_KEY_BINDINGS[action])];
    const pad = set.pad?.[action] ?? DEFAULT_PAD_BUTTONS[action];
    if (pad) PAD_BUTTONS[action] = [...pad];
    else delete PAD_BUTTONS[action];
  }
  rebuildKeyMap();
}

/** What captureNext() hands over: a key (KeyboardEvent.code) or a pad button index. */
export type CapturedInput = { kind: 'key'; code: string } | { kind: 'pad'; button: number };

/** Every standard-mapping button index the pad reader can see (Home, 16, is the browser's). */
export const PAD_BUTTON_COUNT = 16;

export class InputEvent implements InputEventLike {
  handled = false;

  constructor(
    readonly kind: 'key' | 'pad' | 'pointer' | 'virtual',
    readonly actions: readonly Action[],
    readonly pressed: boolean,
    readonly echo: boolean,
    readonly code: string | null = null,
    readonly pointer: Vec2 | null = null,
    /** Pointer events: which finger/mouse (PointerEvent.pointerId). */
    readonly pointerId: number = -1,
    /** Pointer events: 'down', 'move' or 'up'. */
    readonly pointerPhase: 'down' | 'move' | 'up' | null = null,
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
  private readonly pads = new PadReader(PAD_BUTTONS, PAD_AXES, ACTIONS);
  /** Every pad button's raw state last frame ("<pad>:<button>"), for captureNext(). */
  private rawButtons = new Map<string, boolean>();
  private capture: ((input: CapturedInput) => void) | null = null;
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

  /** True while a gamepad (or a key) is one of the things holding `action` down right now. */
  isActionHeldBy(action: Action, device: 'pad' | 'key'): boolean {
    const prefix = `${device}:`;
    for (const src of this.states.get(action)!.sources) if (src.startsWith(prefix)) return true;
    return false;
  }

  /** The left stick's radial deadzone (the player's setting; LEFT_STICK_DEADZONE by default). */
  get stickDeadzone(): number {
    return this.pads.deadzone;
  }

  set stickDeadzone(value: number) {
    this.pads.deadzone = value;
  }

  /** After applyBindings(): lets go of everything, so no input stays down under its old binding. */
  rebind(): void {
    this.releaseAll();
  }

  /**
   * Hands the next fresh key press or pad button press to `handler` instead
   * of the game (press-to-bind). That press never becomes an action: a key
   * is swallowed, a pad button is ignored until it is released. Null stops
   * capturing.
   */
  captureNext(handler: ((input: CapturedInput) => void) | null): void {
    this.capture = handler;
  }

  isCapturing(): boolean {
    return this.capture !== null;
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
    if (this.capture) {
      this.lastDevice = 'keyboard';
      if (repeat) return true;
      const handler = this.capture;
      this.capture = null;
      handler({ kind: 'key', code });
      return true;
    }
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

  /** A pointer (mouse, finger, pen) in game pixels. Touch marks the device as touch. */
  pointerEvent(pos: Vec2, phase: 'down' | 'move' | 'up', pointerId = 0, touch = false): void {
    if (touch) this.lastDevice = 'touch';
    this.eventQueue.push(new InputEvent('pointer', [], phase !== 'up', phase === 'move', null, pos, pointerId, phase));
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
    this.feedPads(navigator.getGamepads());
  }

  /** Feeds one frame of pad states (the browser's list, or fakes in tests). */
  feedPads(pads: Iterable<PadLike | null | undefined>): void {
    const list = [...pads];
    this.captureButtons(list);
    const seen = this.pads.poll(list);
    if (this.pads.activity) this.lastDevice = 'pad';
    for (const [key, down] of seen) {
      const was = this.padSnapshot.get(key) ?? false;
      if (was === down) continue;
      this.setSource(sourceName(key) as Action, key, down, 'pad');
    }
    for (const [key, was] of this.padSnapshot) {
      if (was && !seen.has(key)) this.setSource(sourceName(key) as Action, key, false, 'pad');
    }
    this.padSnapshot = seen;
  }

  /** Raw presses of any button, for captureNext(); a captured button is latched until released. */
  private captureButtons(pads: readonly (PadLike | null | undefined)[]): void {
    const raw = new Map<string, boolean>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      for (let b = 0; b < PAD_BUTTON_COUNT; b++) {
        const key = `${pad.index}:${b}`;
        const down = buttonDown(pad, b);
        raw.set(key, down);
        // A pad seen for the first time counts nothing it already holds.
        if (!down || !this.rawButtons.has(key) || this.rawButtons.get(key)) continue;
        if (!this.capture) continue;
        const handler = this.capture;
        this.capture = null;
        this.lastDevice = 'pad';
        this.pads.latchButton(pad.index, b);
        handler({ kind: 'pad', button: b });
      }
    }
    this.rawButtons = raw;
  }

  // --- DOM ------------------------------------------------------------------------

  attach(target: Window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', (e) => {
      // Esc in browser full screen is the browser's (it leaves full screen): the game ignores it,
      // so one press never both leaves full screen and pauses or backs out of a menu.
      if (e.code === 'Escape' && target.document.fullscreenElement && !this.capture) return;
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
