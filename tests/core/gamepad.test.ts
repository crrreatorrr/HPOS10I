// Gamepad mapping logic (src/runtime/gamepad.ts) and how InputManager feeds
// it, with fake pads: triggers, deadzone, digital stick directions, latch on
// connect, hot-plug and the bindings.

import { describe, expect, it } from 'vitest';
import {
  buttonDown,
  LEFT_STICK_DEADZONE,
  PAD,
  PadReader,
  radialDeadzone,
  readPad,
  stickDirection,
  TRIGGER_THRESHOLD,
  type PadLike,
} from '../../src/runtime/gamepad';
import { ACTIONS, InputManager, PAD_AXES, PAD_BUTTONS, type Action } from '../../src/runtime/input';

interface FakePad extends PadLike {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  connected: boolean;
}

function fakePad(index = 0, id = 'fake pad (standard)'): FakePad {
  return {
    index,
    id,
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

function hold(pad: FakePad, button: number, down = true): void {
  pad.buttons[button] = { pressed: down, value: down ? 1 : 0 };
}

/** One rendered frame with these pads connected. */
function frame(input: InputManager, ...pads: (FakePad | null)[]): void {
  input.feedPads(pads);
  input.beginProcessFrame();
}

describe('gamepad buttons and sticks', () => {
  it('reads triggers by value and never reads Home', () => {
    const pad = fakePad();
    pad.buttons[PAD.LT] = { pressed: true, value: TRIGGER_THRESHOLD - 0.1 };
    pad.buttons[PAD.RT] = { pressed: false, value: TRIGGER_THRESHOLD + 0.1 };
    hold(pad, PAD.HOME);
    expect(buttonDown(pad, PAD.LT)).toBe(false);
    expect(buttonDown(pad, PAD.RT)).toBe(true);
    expect(buttonDown(pad, PAD.HOME)).toBe(false);
    expect(buttonDown(pad, 40)).toBe(false);
  });

  it('radial deadzone zeroes small pushes and rescales from the edge', () => {
    expect(radialDeadzone(0.1, 0.1, 0.2)).toEqual([0, 0]);
    const [x, y] = radialDeadzone(0.6, 0, 0.2);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBe(0);
    const [dx, dy] = radialDeadzone(0.8, 0.8, 0.2);
    expect(Math.hypot(dx, dy)).toBeCloseTo(1);
    expect(dx).toBeCloseTo(dy);
  });

  it('stick directions: drift never counts, 45 degrees reads as horizontal', () => {
    const pad = fakePad();
    pad.axes = [LEFT_STICK_DEADZONE - 0.05, 0, 0, 0];
    expect(stickDirection(pad, 0, 1, 0.1)).toBe(false);
    pad.axes = [0.5, 0, 0, 0];
    expect(stickDirection(pad, 0, 1, PAD_AXES.move_right![2])).toBe(true);
    expect(stickDirection(pad, 0, -1, PAD_AXES.move_left![2])).toBe(false);
    pad.axes = [Math.SQRT1_2, Math.SQRT1_2, 0, 0];
    const states = readPad(pad, PAD_BUTTONS, PAD_AXES, ACTIONS);
    expect(states.get('pad:0:a01:move_right')).toBe(true);
    expect(states.get('pad:0:a11:move_down')).toBe(false);
    pad.axes = [0, 0.8, 0, 0];
    expect(readPad(pad, PAD_BUTTONS, PAD_AXES, ACTIONS).get('pad:0:a11:move_down')).toBe(true);
  });

  it('default layout: A jumps and confirms, B jumps and cancels, Start pauses, bumpers focus', () => {
    expect(PAD_BUTTONS.jump).toEqual([PAD.A, PAD.B, PAD.X, PAD.Y]);
    expect(PAD_BUTTONS.ui_accept).toEqual([PAD.A]);
    expect(PAD_BUTTONS.ui_cancel).toEqual([PAD.B]);
    expect(PAD_BUTTONS.pause).toEqual([PAD.START]);
    expect(PAD_BUTTONS.focus).toEqual([PAD.LB, PAD.RB]);
    for (const a of ACTIONS) expect(PAD_BUTTONS[a] ?? []).not.toContain(PAD.HOME);
  });
});

describe('PadReader latch on connect', () => {
  it('ignores a button held when the pad appears until it is released', () => {
    const reader = new PadReader(PAD_BUTTONS, PAD_AXES, ACTIONS);
    const pad = fakePad();
    hold(pad, PAD.A);
    let s = reader.poll([pad]);
    expect(s.get('pad:0:b0:jump')).toBe(false);
    expect(s.get('pad:0:b0:ui_accept')).toBe(false);
    expect(reader.activity).toBe(true);
    s = reader.poll([pad]);
    expect(s.get('pad:0:b0:jump')).toBe(false);
    expect(reader.activity).toBe(false);
    hold(pad, PAD.A, false);
    s = reader.poll([pad]);
    expect(s.get('pad:0:b0:jump')).toBe(false);
    hold(pad, PAD.A);
    s = reader.poll([pad]);
    expect(s.get('pad:0:b0:jump')).toBe(true);
  });

  it('latches a stick held at connect too, and only what was held', () => {
    const reader = new PadReader(PAD_BUTTONS, PAD_AXES, ACTIONS);
    const pad = fakePad();
    pad.axes = [0, -1, 0, 0];
    let s = reader.poll([pad]);
    expect(s.get('pad:0:a1-1:ui_up')).toBe(false);
    hold(pad, PAD.START);
    s = reader.poll([pad]);
    expect(s.get('pad:0:b9:pause')).toBe(true);
    expect(s.get('pad:0:a1-1:ui_up')).toBe(false);
    pad.axes = [0, 0, 0, 0];
    reader.poll([pad]);
    pad.axes = [0, -1, 0, 0];
    expect(reader.poll([pad]).get('pad:0:a1-1:ui_up')).toBe(true);
  });

  it('latches again after an unplug, or when another pad takes the slot', () => {
    const reader = new PadReader(PAD_BUTTONS, PAD_AXES, ACTIONS);
    const pad = fakePad();
    reader.poll([pad]);
    hold(pad, PAD.X);
    expect(reader.poll([pad]).get('pad:0:b2:jump')).toBe(true);
    expect(reader.poll([null]).size).toBe(0);
    expect(reader.poll([pad]).get('pad:0:b2:jump')).toBe(false);
    const other = fakePad(0, 'another pad');
    hold(other, PAD.Y);
    expect(reader.poll([other]).get('pad:0:b3:jump')).toBe(false);
  });

  it('a disconnected pad reads as absent', () => {
    const reader = new PadReader(PAD_BUTTONS, PAD_AXES, ACTIONS);
    const pad = fakePad();
    pad.connected = false;
    hold(pad, PAD.A);
    expect(reader.poll([pad]).size).toBe(0);
  });
});

describe('InputManager with gamepads', () => {
  const pressed = (input: InputManager, a: Action) => input.isActionPressed(a);

  it('the press that revealed the pad (the hub portal confirm) does nothing', () => {
    const input = new InputManager();
    const pad = fakePad();
    hold(pad, PAD.A);
    frame(input, pad);
    expect(input.isActionJustPressed('ui_accept')).toBe(false);
    expect(pressed(input, 'jump')).toBe(false);
    expect(input.lastDevice).toBe('pad');
    hold(pad, PAD.A, false);
    frame(input, pad);
    hold(pad, PAD.A);
    frame(input, pad);
    expect(input.isActionJustPressed('ui_accept')).toBe(true);
    expect(input.isActionJustPressed('jump')).toBe(true);
  });

  it('unplugging releases what the pad held', () => {
    const input = new InputManager();
    const pad = fakePad();
    frame(input, pad);
    hold(pad, PAD.RIGHT);
    pad.axes = [1, 0, 0, 0];
    frame(input, pad);
    expect(pressed(input, 'move_right')).toBe(true);
    frame(input, null);
    expect(pressed(input, 'move_right')).toBe(false);
    expect(input.isActionJustReleased('move_right')).toBe(true);
  });

  it('two pads both drive the single player; one releasing keeps the other held', () => {
    const input = new InputManager();
    const a = fakePad(0, 'one');
    const b = fakePad(1, 'two');
    frame(input, a, b);
    hold(a, PAD.LB);
    hold(b, PAD.RB);
    frame(input, a, b);
    expect(input.isActionJustPressed('focus')).toBe(true);
    hold(a, PAD.LB, false);
    frame(input, a, b);
    expect(pressed(input, 'focus')).toBe(true);
  });

  it('keyboard input is unaffected by a connected idle pad', () => {
    const input = new InputManager();
    frame(input, fakePad());
    input.keyDown('KeyZ', false);
    frame(input, fakePad());
    expect(input.isActionJustPressed('jump')).toBe(true);
    expect(input.lastDevice).toBe('keyboard');
  });
});
