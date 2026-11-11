import { assetImage } from '../../runtime/assets';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Rect2, Vec2 } from '../../runtime/vec2';

const PATH = 'assets/sprites/common/props/props_sheet.png';
const CELL = 48;

export const PropSprite = {
  ticket: 0, ticketTurn: 1, ticketEdge: 2, sparkle: 3,
  spring: 6, checkpoint: 7, itemBox: 8, shoe: 9, shield: 10, invincible: 11,
  goal: 12, bumper: 13, spike: 14, bolt: 15,
  goldSpring: 16, inactiveCheckpoint: 17, life: 18, goalReverse: 19, neonBumper: 20,
  boosterStart: 21, flameStart: 24, book: 30, door: 31, paper: 32,
  springCompressed: 33, springExtended: 34, breakable: 35, bookshelf: 36,
  neonLedge: 37, grassLedge: 38, marbleLedge: 39, conveyor: 40,
  floorSwitch: 41, pressedSwitch: 42, stairTread: 43, tubeBracket: 44,
  neonTubeBracket: 45, tubeGlass: 46, dust: 47, dustCool: 48, pickupStar: 49, beamEmitter: 50,
} as const;

/** Every prop is centred in its cell. Scale 1 draws the original game pixels. */
export function drawPropSprite(
  g: Gfx, index: number, at: Vec2, scale = Vec2.ONE, opacity = 1,
): boolean {
  const tex = assetImage(PATH);
  if (!tex) return false;
  const region = new Rect2(index % 4 * CELL, Math.floor(index / 4) * CELL, CELL, CELL);
  g.texture(tex, at, {
    region, size: scale.mul(CELL), centered: true, modulate: Color.WHITE.withAlpha(opacity),
  });
  return true;
}
