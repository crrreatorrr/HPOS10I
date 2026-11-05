// Touch mode (port of core/display.gd's touch logic; canvas scaling lives in
// src/main.ts). `isTouch` starts true on touch devices (and with ?touch, via
// setTouch), flips to false on the first key or gamepad press and back to
// true on the next touch, so touch laptops get the right controls for how
// they are being used. `touchModeChanged` fires on every flip.
//
// The global DisplayWatcher overlay (the rotate-device hint) feeds every
// input event through noteEvent() and also watches Input.lastDevice, so a
// flip is seen even when a screen handled the event first.

import { Input } from '../runtime/input';
import type { InputEventLike } from '../runtime/node';
import { Signal } from '../runtime/signal';
import { InputHints } from './common/input_hints';

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches === true);
}

class DisplayImpl {
  /** Emitted when the player switches between touch and keyboard/gamepad. */
  readonly touchModeChanged = new Signal<[boolean]>();
  private touch: boolean | null = null;
  private seenDevice: string | null = null;
  private domAttached = false;

  /** True while the player is using touch. */
  get isTouch(): boolean {
    if (this.touch === null) this.touch = detectTouch();
    return this.touch;
  }

  set isTouch(value: boolean) {
    this.setTouch(value);
  }

  setTouch(touch: boolean): void {
    const was = this.isTouch;
    this.touch = touch;
    if (was !== touch) this.touchModeChanged.emit(touch);
  }

  /** Every input event: a touch turns touch mode on, a key or pad press turns it off. */
  noteEvent(ev: InputEventLike): void {
    if (ev.kind === 'pointer') {
      const phase = (ev as { pointerPhase?: string | null }).pointerPhase;
      if (ev.pressed && (phase === undefined || phase === null || phase === 'down') && Input.lastDevice === 'touch') this.setTouch(true);
    } else if ((ev.kind === 'key' || ev.kind === 'pad') && ev.pressed && !ev.echo) {
      this.setTouch(false);
    }
  }

  /** Once per frame: follows Input.lastDevice (catches events a screen consumed). */
  observeDevice(): void {
    const device = Input.lastDevice;
    if (this.seenDevice === null) {
      this.seenDevice = device;
      return;
    }
    if (device === this.seenDevice) return;
    this.seenDevice = device;
    this.setTouch(device === 'touch');
  }

  /** Portrait screen (for the rotate hint). */
  isPortrait(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  }

  /** Learns key labels from real key presses (browser only; called by installUi). */
  attachDom(target: Window): void {
    if (this.domAttached) return;
    this.domAttached = true;
    target.addEventListener('keydown', (e) => InputHints.learn(e.code, e.key), { capture: true, passive: true });
    InputHints.loadLayout(target.navigator);
  }

  /** Forgets the detected mode (tests). */
  reset(touch = false): void {
    this.touch = touch;
    this.seenDevice = null;
  }
}

export const Display = new DisplayImpl();
