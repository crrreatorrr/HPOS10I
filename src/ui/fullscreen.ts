// FULL SCREEN, the option every menu has: the browser Fullscreen API on the
// whole page (the canvas refits on the resize that follows, src/main.ts).
// The menus call toggle() while handling the key, button, click or tap that
// chose it, so the browser still counts the user gesture. Hidden where the
// page can't go full screen (document.fullscreenEnabled false: an iframe
// without permission, some phones). A gamepad press is not a gesture to the
// browser: when it refuses, the menu says to use a key or a click instead.
// Esc and F11 leaving full screen are the browser's; the labels read
// document.fullscreenElement, so they are right whichever way it changed.

import { Signal } from '../runtime/signal';

/** The parts of Document this uses (a fake in tests). */
export interface FullscreenDoc {
  readonly fullscreenEnabled?: boolean;
  readonly fullscreenElement?: Element | null;
  readonly documentElement: { requestFullscreen?: () => Promise<void> };
  exitFullscreen?: () => Promise<void>;
  addEventListener(type: 'fullscreenchange', fn: () => void): void;
}

export const FULL_SCREEN_LABEL = 'FULL SCREEN';
/** Shown for a moment when the browser refused (a gamepad press is not a gesture to it). */
export const FULL_SCREEN_REFUSED = 'USE A KEY OR A CLICK FOR FULL SCREEN';
const REFUSED_SECONDS = 3;

class FullScreenImpl {
  /** Emitted when the page enters or leaves full screen. */
  readonly changed = new Signal<[boolean]>();
  private doc: FullscreenDoc | null = typeof document === 'undefined' ? null : (document as unknown as FullscreenDoc);
  private wired = false;
  private refusedAt = -Infinity;

  /** Uses another document (tests); null turns the option off. */
  use(doc: FullscreenDoc | null): void {
    this.doc = doc;
    this.wired = false;
    this.refusedAt = -Infinity;
    this.wire();
  }

  private wire(): void {
    if (this.wired || !this.doc) return;
    this.wired = true;
    this.doc.addEventListener('fullscreenchange', () => this.changed.emit(this.isOn()));
  }

  /** Whether the option is offered at all. */
  available(): boolean {
    const d = this.doc;
    return !!d && d.fullscreenEnabled === true && typeof d.documentElement.requestFullscreen === 'function';
  }

  isOn(): boolean {
    return !!this.doc?.fullscreenElement;
  }

  /** "FULL SCREEN: ON" / "FULL SCREEN: OFF". */
  label(): string {
    return `${FULL_SCREEN_LABEL}: ${this.isOn() ? 'ON' : 'OFF'}`;
  }

  /** Enters or leaves full screen. Call it from the input that chose the option. */
  toggle(): void {
    const d = this.doc;
    if (!d || !this.available()) return;
    this.wire();
    const refused = () => {
      this.refusedAt = now();
    };
    try {
      const p = this.isOn() ? d.exitFullscreen?.() : d.documentElement.requestFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(refused);
    } catch {
      refused();
    }
  }

  /** The refusal line while it shows, else ''. */
  notice(): string {
    return now() - this.refusedAt < REFUSED_SECONDS ? FULL_SCREEN_REFUSED : '';
  }
}

function now(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

export const FullScreen = new FullScreenImpl();
