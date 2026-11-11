import moveLayout from '../../assets/sprites/common/bosses/boss_moves.json';
import { assetImage } from '../runtime/assets';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { Rect2, Vec2 } from '../runtime/vec2';

const ART = 'assets/sprites/common/bosses';
export const BossSprite = { rug: 0, demon: 1, broccoli: 2, executive: 3 } as const;
export type BossSpriteId = (typeof BossSprite)[keyof typeof BossSprite];
export const BossPose = { idle: 0, travel: 1, windup: 2, strike: 3, recovery: 4, exposed: 5, hit: 6, defeat: 7 } as const;
export type BossPoseId = (typeof BossPose)[keyof typeof BossPose];

const ATLAS_CELL = 96;
const SEQUENCE_LENGTH = 6;
const moves: Readonly<Record<string, { boss: number; windup: number; strike: number }>> = moveLayout;
// Tight source crops keep projectiles legible at the size of their actual hazards.
const attackArt: Readonly<Record<string, readonly [row: number, x: number, y: number, w: number, h: number]>> = {
  DustWave: [0, 3, 9, 27, 16],
  InkDrop: [1, 10, 2, 13, 24],
  Page: [2, 5, 8, 24, 13],
  InkWave: [3, 3, 9, 27, 16],
  Can: [4, 8, 5, 17, 23],
  MiniCan: [4, 8, 5, 17, 23],
  Spark: [5, 6, 4, 20, 24],
  Briefcase: [6, 4, 5, 25, 22],
  Paper: [2, 5, 8, 24, 13],
  ChartArrow: [7, 6, 3, 21, 26],
};
const ATTACK_CELL = 32;

export function drawBossFrame(
  g: Gfx, id: BossSpriteId, pose: BossPoseId, ticks: number, facing: number, feet: number, squash: number, move?: string,
): boolean {
  const layout = move ? moves[move] : undefined;
  const moveRow = layout?.boss === id
    ? pose === BossPose.windup ? layout.windup : pose === BossPose.strike ? layout.strike : undefined
    : undefined;
  const moveTexture = moveRow === undefined ? null : assetImage(`${ART}/boss_moves_sheet.png`);
  const tex = moveTexture ?? assetImage(`${ART}/bosses_sheet.png`);
  if (!tex) return false;
  const row = moveTexture && moveRow !== undefined ? moveRow : id * 8 + pose;
  const frame = Math.floor(ticks / (pose === BossPose.idle ? 9 : 4));
  const column = pose === BossPose.windup ? Math.min(SEQUENCE_LENGTH - 1, frame) : frame % SEQUENCE_LENGTH;
  const region = new Rect2(column * ATLAS_CELL, row * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
  g.texture(tex, new Vec2(-48, feet - Math.round(89 * squash)), {
    region,
    size: new Vec2(ATLAS_CELL, Math.round(ATLAS_CELL * squash)),
    flipH: facing < 0 && id !== BossSprite.demon,
  });
  return true;
}

export function drawBossAttack(g: Gfx, name: string, age: number, size: Vec2, velocity: Vec2, opacity: number): boolean {
  const art = attackArt[name];
  if (!art) return false;
  const tex = assetImage(`${ART}/attacks_sheet.png`);
  if (!tex) return false;
  const col = Math.floor(age / 3) % 6;
  const [row, x, y, width, height] = art;
  const region = new Rect2(col * ATTACK_CELL + x, row * ATTACK_CELL + y, width, height);
  const drawSize = name === 'ChartArrow' ? new Vec2(16, 23) : size.add(new Vec2(2, 2));
  g.texture(tex, Vec2.ZERO, {
    region, size: drawSize, centered: true, flipH: velocity.x < 0,
    flipV: name === 'ChartArrow',
    modulate: Color.WHITE.withAlpha(opacity),
  });
  return true;
}

export function drawBossExplosion(g: Gfx, age: number, scale: number, opacity: number): boolean {
  const tex = assetImage(`${ART}/attacks_sheet.png`);
  if (!tex) return false;
  const frame = Math.min(5, Math.floor(age * 6 / 26));
  const size = Math.round(ATTACK_CELL * scale * 1.5);
  g.texture(tex, Vec2.ZERO, {
    region: new Rect2(frame * ATTACK_CELL, 8 * ATTACK_CELL, ATTACK_CELL, ATTACK_CELL),
    size: new Vec2(size, size), centered: true, modulate: Color.WHITE.withAlpha(opacity),
  });
  return true;
}

export function drawBossTornado(g: Gfx, ticks: number): boolean {
  const tex = assetImage(`${ART}/attacks_sheet.png`);
  if (!tex) return false;
  const frame = Math.floor(ticks / 3) % 6;
  g.texture(tex, new Vec2(-25, -45), {
    region: new Rect2(frame * ATTACK_CELL, 9 * ATTACK_CELL, ATTACK_CELL, ATTACK_CELL),
    size: new Vec2(50, 50),
  });
  return true;
}
