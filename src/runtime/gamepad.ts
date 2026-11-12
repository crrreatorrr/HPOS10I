// Gamepad reading for InputManager: the browser Gamepad API in the W3C
// "standard" mapping, polled once per rendered frame. Pure and DOM-free, so
// the tests drive it with fake pads.
//
// - Buttons: `pressed`, except the analog triggers (LT 6, RT 7), which count
//   above TRIGGER_THRESHOLD. Home (16) is never read: the browser owns it.
// - Left stick: a radial deadzone (LEFT_STICK_DEADZONE), then each direction
//   is a digital press past its own threshold (PAD_AXES in input.ts). Movement
//   is digital in this game, so the thresholds decide; the deadzone only
//   keeps a drifting stick from ever counting.
// - Latch on connect: when a pad appears (page load, coming from the hub,
//   reconnect), every input already held on it is ignored until released, so
//   the press that confirmed a hub portal never confirms the title screen.
// - Unplugging releases everything that pad held (InputManager diffs the
//   source map it returns against the last one).

/** Standard-mapping button indices. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,
} as const;

/** Labels for on-screen hints (generic face-button letters, by position). */
export const PAD_BUTTON_LABELS: Readonly<Record<number, string>> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'VIEW',
  9: 'START',
  10: 'L3',
  11: 'R3',
  12: 'D-PAD UP',
  13: 'D-PAD DOWN',
  14: 'D-PAD LEFT',
  15: 'D-PAD RIGHT',
};

/** Analog triggers count as pressed above this value. */
export const TRIGGER_THRESHOLD = 0.5;
/** Radial deadzone of the left stick (the right stick is not used in this game). */
export const LEFT_STICK_DEADZONE = 0.2;

export interface PadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

/** The parts of a browser Gamepad this module reads. */
export interface PadLike {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly buttons: readonly PadButtonLike[];
  readonly axes: readonly number[];
}

/** Buttons per binding name. */
export type PadButtonBindings = Readonly<Record<string, readonly number[] | undefined>>;
/** Stick directions per binding name: [axis, direction (-1/+1), threshold]. */
export type PadAxisBindings = Readonly<Record<string, readonly [number, number, number] | undefined>>;

/** Whether a button is down (triggers by value, Home never). */
export function buttonDown(pad: PadLike, index: number): boolean {
  if (index === PAD.HOME) return false;
  const b = pad.buttons[index];
  if (!b) return false;
  if (index === PAD.LT || index === PAD.RT) return b.value > TRIGGER_THRESHOLD;
  return b.pressed;
}

/**
 * Radial deadzone with rescaling: inside `deadzone` the stick is (0, 0);
 * outside, the magnitude is remapped from [deadzone, 1] to [0, 1], so motion
 * starts smoothly from zero and diagonals keep their direction.
 */
export function radialDeadzone(x: number, y: number, deadzone: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= deadzone || m === 0) return [0, 0];
  const scaled = Math.min(1, (m - deadzone) / (1 - deadzone));
  return [(x / m) * scaled, (y / m) * scaled];
}

/**
 * One digital stick direction: the raw component along `dir` reaches
 * `threshold`, and the stick is outside the radial deadzone. Thresholds are
 * on the raw component so they mean what docs/CONTRACTS.md says (0.75 keeps a
 * 45-degree push from reading as up or down).
 */
export function stickDirection(pad: PadLike, axis: number, dir: number, threshold: number, deadzone = LEFT_STICK_DEADZONE): boolean {
  const stick = axis <= 1 ? 0 : 2;
  const x = pad.axes[stick] ?? 0;
  const y = pad.axes[stick + 1] ?? 0;
  const [dx, dy] = radialDeadzone(x, y, deadzone);
  if (dx === 0 && dy === 0) return false;
  const raw = pad.axes[axis] ?? 0;
  return raw * dir >= threshold;
}

/**
 * Every source of one pad as `key -> down`. Keys are
 * `pad:<index>:b<button>:<name>` and `pad:<index>:a<axis><dir>:<name>`; the
 * binding name is always after the last ':'.
 */
export function readPad(pad: PadLike, buttons: PadButtonBindings, axes: PadAxisBindings, names: readonly string[], deadzone = LEFT_STICK_DEADZONE): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const name of names) {
    for (const b of buttons[name] ?? []) out.set(`pad:${pad.index}:b${b}:${name}`, buttonDown(pad, b));
    const axis = axes[name];
    if (axis) out.set(`pad:${pad.index}:a${axis[0]}${axis[1]}:${name}`, stickDirection(pad, axis[0], axis[1], axis[2], deadzone));
  }
  return out;
}

/** The binding name of a source key. */
export function sourceName(key: string): string {
  return key.slice(key.lastIndexOf(':') + 1);
}

/**
 * Reads every connected pad each frame, with the latch on connect. Returns
 * the filtered source states (latched sources read as up). `activity` is set
 * when a pad input went down this frame, latched or not (for the last-device
 * hints and the audio unlock toast).
 */
export class PadReader {
  /** Pad index -> id of the pads seen last frame. */
  private known = new Map<number, string>();
  /** Sources held when their pad appeared, ignored until released. */
  private latched = new Set<string>();
  private lastRaw = new Map<string, boolean>();
  /** Buttons ("<pad>:<button>") to latch on the next poll (latchButton). */
  private pendingLatch = new Set<string>();
  activity = false;
  /** Radial deadzone of the left stick (the player's setting in the CONTROLS screen). */
  deadzone = LEFT_STICK_DEADZONE;

  constructor(
    private readonly buttons: PadButtonBindings,
    private readonly axes: PadAxisBindings,
    private readonly names: readonly string[],
  ) {}

  poll(pads: Iterable<PadLike | null | undefined>): Map<string, boolean> {
    const out = new Map<string, boolean>();
    const present = new Map<number, string>();
    const raw = new Map<string, boolean>();
    this.activity = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      present.set(pad.index, pad.id);
      const fresh = this.known.get(pad.index) !== pad.id;
      const states = readPad(pad, this.buttons, this.axes, this.names, this.deadzone);
      for (const [key, down] of states) {
        raw.set(key, down);
        if (down && this.pendingLatch.size > 0) {
          const m = /^pad:(\d+):b(\d+):/.exec(key);
          if (m && this.pendingLatch.has(`${m[1]}:${m[2]}`)) this.latched.add(key);
        }
        if (down && !(this.lastRaw.get(key) ?? false)) this.activity = true;
        if (fresh) {
          if (down) this.latched.add(key);
          else this.latched.delete(key);
        } else if (!down) {
          this.latched.delete(key);
        }
        out.set(key, down && !this.latched.has(key));
      }
    }
    this.pendingLatch.clear();
    // A pad that went away drops its latches; it latches again if it comes back.
    for (const key of this.latched) if (!raw.has(key)) this.latched.delete(key);
    this.known = present;
    this.lastRaw = raw;
    return out;
  }

  /**
   * Ignores a button, under every binding, until it is released (the press
   * the CONTROLS screen just took for a new binding never reaches the game).
   */
  latchButton(padIndex: number, button: number): void {
    this.pendingLatch.add(`${padIndex}:${button}`);
  }

  /** True while a source is being ignored because it was held at connect. */
  isLatched(key: string): boolean {
    return this.latched.has(key);
  }
}
