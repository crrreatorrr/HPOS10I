// Four columns per row. Coordinates are the visible sprite's centre, so the
// renderer and collision shape can share an anchor at any in-game scale.
import { assetImage } from '../../../runtime/assets';
import type { Gfx } from '../../../runtime/gfx';
import { Rect2, Vec2 } from '../../../runtime/vec2';

export const REMIX_ATLAS = 'assets/sprites/common/pills/remix_enemies.png';
const CELL = 48;
export const RemixArt = { splitter: 0, mini: 1, guard: 2, shockwavePill: 3, satellite: 4, wave: 5, splitBurst: 6, warning: 7 } as const;

export function drawRemixSprite(g: Gfx, row: number, frame: number, at: Vec2, size: Vec2, facing = 1): boolean {
  const tex = assetImage(REMIX_ATLAS);
  if (!tex) return false;
  g.texture(tex, at, {
    region: new Rect2(frame % 4 * CELL, row * CELL, CELL, CELL),
    size,
    centered: true,
    flipH: facing < 0,
  });
  return true;
}
