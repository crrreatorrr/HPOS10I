import { assetImage } from '../../runtime/assets';
import type { Gfx } from '../../runtime/gfx';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';

// The first four columns are the motion loop. The last two are the charge flash.
const PATH = 'assets/sprites/common/pills/pills_sheet.png';
const CELL = 48;

export const PillSprite = {
  walker: 0, hopper: 1, spike: 2, pellet: 3,
  spellbook: 4, knight: 5, lantern: 6, spellbookDive: 7,
  drone: 8, clerk: 9, bouncer: 10, camera: 11,
  chandelier: 12, security: 13, neonChaser: 14,
  neonArmored: 16, neonSpike: 17, neonDive: 18, neonSniper: 19, neonDropper: 20,
  chaser: 21, floater: 22, armored: 23, sniper: 24, dropper: 25, diver: 26, droneDive: 27,
} as const;

/** Sprites face right and share a bottom anchor at y = 40. */
export function drawPillSprite(g: Gfx, row: number, feet = 0, facing = 1, charge = false, ticks = 6): boolean {
  const tex = assetImage(PATH);
  if (!tex) return false;
  const tick = Math.floor(tree.physicsFrames / ticks);
  const column = charge ? 4 + tick % 2 : tick % 4;
  g.texture(tex, new Vec2(-CELL / 2, feet - 40), {
    region: new Rect2(column * CELL, row * CELL, CELL, CELL),
    flipH: facing < 0,
  });
  return true;
}
