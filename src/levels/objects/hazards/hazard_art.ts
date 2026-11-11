// Atlas rows (four frames each): lava, poison, eruption, burrower, ram,
// ceiling mount, floor outlet, piston shaft. Cells are anchored to their destination rect.
import { assetImage } from '../../../runtime/assets';
import type { Gfx } from '../../../runtime/gfx';
import { Rect2, Vec2 } from '../../../runtime/vec2';

export const HAZARD_ATLAS = 'assets/sprites/common/props/floor_hazards.png';
const CELL = 64;
export const HazardArt = { lava: 0, poison: 1, eruption: 2, burrower: 3, ram: 4, mount: 5, outlet: 6, shaft: 7 } as const;

export function drawHazardFrame(g: Gfx, row: number, frame: number, rect: Rect2): boolean {
  const tex = assetImage(HAZARD_ATLAS);
  if (!tex) return false;
  g.texture(tex, new Vec2(rect.x, rect.y), {
    region: new Rect2(frame % 4 * CELL, row * CELL, CELL, CELL),
    size: new Vec2(rect.w, rect.h),
  });
  return true;
}
