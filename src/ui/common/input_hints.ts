// Key lists for on-screen hints, built from the bindings (KEY_BINDINGS in
// src/runtime/input.ts), named as printed on the player's keyboard: bindings
// are by physical position, so QWERTY WASD is ZQSD on AZERTY. Never hard-code
// key letters in the UI. Labels come from (in order) keys the player actually
// pressed, the browser's keyboard layout map where it has one, and the
// QWERTY name of the position. This also does the hint formatting
// (InputHints): Esc left out, letters first, "ARROWS / WASD" for movement.

import { KEY_BINDINGS, type Action } from '../../runtime/input';

/** Esc is bound to pause but browsers keep it for leaving fullscreen, so hints never offer it. */
export const HIDDEN_KEYS: readonly string[] = ['Escape'];
export const ARROWS: readonly string[] = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

const NAMED: Record<string, string> = {
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'KP ENTER',
  Escape: 'ESCAPE',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
};

/** code -> label learned from real key presses (KeyboardEvent.key). */
const learned = new Map<string, string>();
/** code -> label from navigator.keyboard.getLayoutMap() (Chromium). */
let layout: Map<string, string> | null = null;

/** The QWERTY name of a physical key position. */
export function defaultLabel(code: string): string {
  const named = NAMED[code];
  if (named) return named;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `KP ${code.slice(6)}`;
  return code.toUpperCase();
}

export const InputHints = {
  /** Remembers what a key at a physical position prints (call for every keydown). */
  learn(code: string, key: string): void {
    if (!/^(Key[A-Z]|Digit[0-9])$/.test(code)) return;
    if (key.length !== 1 || key === ' ') return;
    learned.set(code, key.toUpperCase());
  },

  /** Uses the browser's layout map when it has one (async; hints update once it lands). */
  loadLayout(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): void {
    const kb = (nav as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } } | undefined)?.keyboard;
    if (!kb?.getLayoutMap) return;
    kb.getLayoutMap().then(
      (map) => {
        layout = new Map();
        map.forEach((value, code) => layout!.set(code, value));
      },
      () => undefined,
    );
  },

  /** Forgets learned labels (tests). */
  reset(): void {
    learned.clear();
    layout = null;
  },

  /** The label printed on the key at this position: "W" ("Z" on AZERTY), "SPACE", "ENTER". */
  keyLabel(code: string): string {
    const l = learned.get(code);
    if (l) return l;
    const fromLayout = layout?.get(code);
    if (fromLayout && fromLayout.length === 1 && /^(Key|Digit)/.test(code)) return fromLayout.toUpperCase();
    return defaultLabel(code);
  },

  /** Physical keys bound to an action, in binding order (hidden keys left out). */
  keysFor(action: Action): string[] {
    const out: string[] = [];
    for (const code of KEY_BINDINGS[action]) {
      if (!HIDDEN_KEYS.includes(code) && !out.includes(code)) out.push(code);
    }
    return out;
  },

  /** "Z X C SPACE K": every key for an action, single letters first. */
  actionKeys(action: Action, separator = ' '): string {
    const short: string[] = [];
    const long: string[] = [];
    for (const code of InputHints.keysFor(action)) {
      const label = InputHints.keyLabel(code);
      if (label.length === 1) short.push(label);
      else long.push(label);
    }
    return [...short, ...long].join(separator);
  },

  /** The first key for an action ("Z"), or '' when none is bound. */
  firstKey(action: Action): string {
    const code = InputHints.keysFor(action)[0];
    return code ? InputHints.keyLabel(code) : '';
  },

  /** Labels of up to `max` keys bound to an action, e.g. "Z/X/C" (InputLabels.for_action). */
  forAction(action: Action, max = 3): string {
    return InputHints.keysFor(action)
      .slice(0, max)
      .map((c) => InputHints.keyLabel(c))
      .join('/');
  },

  /** "ARROWS / WASD": the arrow keys plus the letter keys for up/left/down/right. */
  moveKeys(): string {
    let letters = '';
    let hasArrows = true;
    for (const action of ['move_up', 'move_left', 'move_down', 'move_right'] as const) {
      const keys = InputHints.keysFor(action);
      hasArrows = hasArrows && keys.some((k) => ARROWS.includes(k));
      const letter = keys.find((k) => !ARROWS.includes(k));
      if (letter) letters += InputHints.keyLabel(letter);
    }
    if (hasArrows && letters !== '') return `ARROWS / ${letters}`;
    return hasArrows ? 'ARROWS' : letters;
  },

  /** The letter key for one move direction ("W"), for the dev menu hint. */
  moveLetter(action: 'move_up' | 'move_down' | 'move_left' | 'move_right'): string {
    const letter = InputHints.keysFor(action).find((k) => !ARROWS.includes(k));
    return letter ? InputHints.keyLabel(letter) : '';
  },
};
