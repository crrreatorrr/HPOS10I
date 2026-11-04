// A short toast while audio is still locked and the player is on a gamepad
// (browsers only unlock audio on a key, click or tap). Each gamepad press
// while locked shows it for SHOW_SECONDS, then it fades; it frees itself once
// audio unlocks. installUi() returns it as a global overlay.
//
// Placed top-centre, right of the HUD counters and left of the corner
// widgets (the playground's ticket count, the touch pause button), in a band
// that is empty in every gameplay scene; under the pause menu.

import { Audio } from '../../core/audio';
import type { Gfx } from '../../runtime/gfx';
import { clamp } from '../../runtime/math';
import { ProcessMode } from '../../runtime/node';
import { COLORS, drawText, UiLayer } from '../common/theme';

export const SHOW_SECONDS = 4;
export const FADE_SECONDS = 0.6;
export const SOUND_HINT_TEXT = 'PRESS A KEY OR CLICK FOR SOUND';

export class SoundHint extends UiLayer {
  private timeLeft = 0;
  private alpha = 1;

  constructor() {
    super('SoundHint', 99);
    this.processMode = ProcessMode.ALWAYS;
    this.visible = false;
  }

  override enterTree(): void {
    Audio.unlockHintChanged.connect(this.onUnlockHintChanged, { owner: this });
    if (Audio.needsUnlockHint()) this.showHint();
  }

  override exitTree(): void {
    Audio.unlockHintChanged.disconnect(this.onUnlockHintChanged);
  }

  showHint(): void {
    this.timeLeft = SHOW_SECONDS;
    this.alpha = 1;
    this.visible = true;
  }

  override process(delta: number): void {
    if (!this.visible) return;
    this.timeLeft -= delta;
    if (this.timeLeft <= 0) this.visible = false;
    else this.alpha = clamp(this.timeLeft / FADE_SECONDS, 0, 1);
  }

  private readonly onUnlockHintChanged = (show: boolean): void => {
    if (show) this.showHint();
    else if (!Audio.isLocked()) this.queueFree();
  };

  protected override paint(g: Gfx): void {
    g.withAlpha(this.alpha, () => drawText(g, SOUND_HINT_TEXT, 146, 4, 'outline', { align: 'center', width: 190, color: COLORS.gold }));
  }
}
