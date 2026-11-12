// The options every menu offers besides its own: MAIN MENU (the title),
// HUB, CONTROLS (the controller settings screen, ui/controls) and FULL SCREEN
// (ui/fullscreen.ts; left out where the browser can't go full screen). The
// screens place the items; this keeps the labels and actions the same
// everywhere.

import { Rect2 } from '../../runtime/vec2';
import { FullScreen } from '../fullscreen';
import type { MenuItem } from './menu';

export const MAIN_MENU_LABEL = 'MAIN MENU';
export const HUB_LABEL = 'HUB';
export const CONTROLS_LABEL = 'CONTROLS';

/** FULL SCREEN: ON/OFF, or null when the browser can't go full screen. */
export function fullScreenItem(rect = new Rect2()): MenuItem | null {
  if (!FullScreen.available()) return null;
  return { label: () => FullScreen.label(), rect, onSelect: () => FullScreen.toggle(), data: 'fullscreen' };
}

/** The labels of a menu's items, for tests and checks. */
export function menuLabels(items: readonly MenuItem[]): string[] {
  return items.filter((i) => i.visible !== false).map((i) => (typeof i.label === 'function' ? i.label() : i.label));
}
