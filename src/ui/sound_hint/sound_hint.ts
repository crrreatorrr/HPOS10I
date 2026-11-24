// A short toast while audio is still locked and the player is on a gamepad
// (browsers only unlock audio on a key, click or tap). The first gamepad
// press on each screen (scene) while locked shows it for SHOW_SECONDS, then it
// fades; later presses on the same screen leave it hidden, so it never keeps
// covering a menu title. It frees itself once audio unlocks. installUi()
// returns it as a global overlay.
//
// Placed top-centre, right of the HUD counters (their values end at x 139)
// and left of the corner widgets (the hub chrome, whose left edge sits at
// x 317 or more on a desktop canvas; the playground's ticket count; the touch
// pause button), in a band that is empty in every gameplay scene; under the
// pause menu.

import { Audio } from '../../core/audio';
import type { Gfx } from '../../runtime/gfx';
import { clamp } from '../../runtime/math';
import { ProcessMode } from '../../runtime/node';
import { COLORS, drawText, UiLayer } from '../common/theme';

export const SHOW_SECONDS = 4;
export const FADE_SECONDS = 0.6;
export const SOUND_HINT_TEXT = 'PRESS A KEY OR CLICK FOR SOUND';
/** The band the text is centred in: between the HUD values and the hub chrome. */
export const HINT_X = 141;
export const HINT_WIDTH = 174;

export class SoundHint extends UiLayer {
  private timeLeft = 0;
  private alpha = 1;
  /** The scene it was last shown on (once per screen). */
  private shownOn: unknown = undefined;

  constructor() {
    super('SoundHint', 99);
    this.processMode = ProcessMode.ALWAYS;
    this.visible = false;
  }

  override enterTree(): void {
    Audio.unlockHintChanged.connect(this.onUnlockHintChanged, { owner: this });
    if (Audio.needsUnlockHint()) this.showOncePerScreen();
  }

  override exitTree(): void {
    Audio.unlockHintChanged.disconnect(this.onUnlockHintChanged);
  }

  /** Shows it unless it was already shown on this screen. */
  showOncePerScreen(): void {
    const scene = this.isInsideTree() ? this.tree.currentScene : null;
    if (scene === this.shownOn) return;
    this.shownOn = scene;
    this.showHint();
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
    if (show) this.showOncePerScreen();
    else if (!Audio.isLocked()) this.queueFree();
  };

  protected override paint(g: Gfx): void {
    g.withAlpha(this.alpha, () => drawText(g, SOUND_HINT_TEXT, HINT_X, 4, 'outline', { align: 'center', width: HINT_WIDTH, color: COLORS.gold }));
  }
}
