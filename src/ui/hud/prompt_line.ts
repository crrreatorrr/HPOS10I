// The text of a teaching prompt (Prompts, src/core/prompts.ts), built from
// the bindings of the device the player is using: key names on a keyboard,
// button names on a gamepad, the on-screen controls in touch mode.

import { InputHints } from '../common/input_hints';

export type PromptDevice = 'keyboard' | 'pad' | 'touch';

export const PROMPT_KEYS = ['enemy', 'spindash', 'speed'] as const;

function jumpName(device: PromptDevice): string {
  if (device === 'touch') return 'JUMP';
  if (device === 'pad') return InputHints.padKeys('jump').split(' ')[0] || 'JUMP';
  return InputHints.firstKey('jump') || 'JUMP';
}

/** The line for a prompt key ('' for a key this build does not know). */
export function promptLine(key: string, device: PromptDevice): string {
  const jump = jumpName(device);
  switch (key) {
    case 'enemy':
      return `PRESS ${jump} TO JUMP ON IT, OR HOLD DOWN TO ROLL THROUGH`;
    case 'spindash':
      return `HOLD DOWN, TAP ${jump}, LET GO: SPIN DASH`;
    case 'speed':
      return 'KEEP YOUR SPEED';
  }
  return '';
}
