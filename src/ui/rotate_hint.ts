// The "turn your device sideways" hint for touch devices held in portrait
// (from core/display.gd), and the display watcher: it runs every frame
// (processMode ALWAYS) and feeds input to Display so touch mode follows the
// device the player is using.

import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { ProcessMode, type InputEventLike } from '../runtime/node';
import { VIEW_H, VIEW_W } from '../runtime/tree';
import { drawText, UiLayer } from './common/theme';
import { Display } from './display';

const OVERLAY_LAYER = 100;
const SHADE = new Color(0.07, 0.08, 0.12, 0.92);
export const ROTATE_TEXT = 'Turn your device sideways to play';

export class RotateHint extends UiLayer {
  /** Tests (and the boot code) can force the orientation; null = read the window. */
  portraitOverride: boolean | null = null;

  constructor() {
    super('RotateHint', OVERLAY_LAYER + 10);
    this.processMode = ProcessMode.ALWAYS;
    this.visible = false;
  }

  override process(): void {
    Display.observeDevice();
    const portrait = this.portraitOverride ?? Display.isPortrait();
    this.visible = Display.isTouch && portrait;
  }

  override input(ev: InputEventLike): void {
    Display.noteEvent(ev);
  }

  protected override paint(g: Gfx): void {
    g.rect(0, 0, VIEW_W, VIEW_H, SHADE);
    drawText(g, ROTATE_TEXT, 0, Math.floor((VIEW_H - 11) / 2), 'hudValue', { align: 'center', width: VIEW_W });
  }
}
