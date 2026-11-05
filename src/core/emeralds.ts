// The emerald won for clearing an act (director, 2026-10-28): one for every
// act of every zone in ZONES, 8 in all. The test zone and boss arenas give
// none. It shows as a flat spinning icon made from the director's own image.
//
// The display name is the director's choice and a deliberate exception to
// the originality guardrails, allowlisted for this one line only
// (tools/qa/originality_allow.txt). Show it through Emeralds.NAME; never
// write the word anywhere else.
import { assetImage } from '../runtime/assets';
import { ZONES } from './zone_registry';

const NAME = 'Horcrux Emerald';

export const Emeralds = {
  NAME,
  /** 48x48 face for the act-clear moment; 16x16 for slots. */
  ICON_PATH: 'assets/sprites/common/emerald/emerald.png',
  ICON_SMALL_PATH: 'assets/sprites/common/emerald/emerald_small.png',

  key(zoneId: string, act: number): string {
    return `${zoneId}:${act}`;
  },

  isEmeraldAct(zoneId: string, act: number): boolean {
    const zone = ZONES.find((z) => z.id === zoneId);
    return !!zone && act >= 1 && act <= zone.acts.length;
  },

  allKeys(): string[] {
    const keys: string[] = [];
    for (const zone of ZONES) for (let act = 1; act <= zone.acts.length; act++) keys.push(Emeralds.key(zone.id, act));
    return keys;
  },

  total(): number {
    return Emeralds.allKeys().length;
  },

  /** The icon image, or null until it has loaded (draw a placeholder gem then). */
  icon(small = false): HTMLImageElement | null {
    return assetImage(small ? Emeralds.ICON_SMALL_PATH : Emeralds.ICON_PATH);
  },
};
