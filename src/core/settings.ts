// Player options, saved on this browser (not progress, not hub data).

import { SAVE_KEYS, Storage } from '../hub/storage';
import { Signal } from '../runtime/signal';

export interface SettingsData {
  /** Drop dash, charge run, shield bounce and the jump assist (never in Ranked). */
  extraMoves: boolean;
  /** Item boxes in levels (never in Ranked). */
  itemBoxes: boolean;
  /** Slower casual play and reduced camera motion and effects. */
  comfortMotion: boolean;
  /** Screen shake and hit-stop. */
  screenShake: boolean;
  /** Speed lines and the afterimage trail. */
  speedEffects: boolean;
  muted: boolean;
}

const DEFAULTS: SettingsData = {
  extraMoves: true,
  itemBoxes: true,
  comfortMotion: true,
  screenShake: true,
  speedEffects: true,
  muted: false,
};

class SettingsStore {
  data: SettingsData = { ...DEFAULTS };
  readonly changed = new Signal();

  get screenShakeEnabled(): boolean {
    return this.data.screenShake && !this.data.comfortMotion;
  }

  get speedEffectsEnabled(): boolean {
    return this.data.speedEffects && !this.data.comfortMotion;
  }

  load(): void {
    const raw = Storage.readJson(SAVE_KEYS.settings);
    const next = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof SettingsData)[]) {
      if (typeof raw[key] === 'boolean') next[key] = raw[key] as boolean;
    }
    this.data = next;
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data = { ...this.data, [key]: value };
    Storage.writeJson(SAVE_KEYS.settings, this.data);
    this.changed.emit();
  }

  reset(): void {
    this.data = { ...DEFAULTS };
  }
}

export const Settings = new SettingsStore();
