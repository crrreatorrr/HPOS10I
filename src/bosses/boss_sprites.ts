import moveLayout from '../../assets/sprites/common/bosses/boss_moves.json';
import { assetImage } from '../runtime/assets';
import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { clamp } from '../runtime/math';
import { Rect2, Vec2 } from '../runtime/vec2';
import { drawSpecialCue, sampleMotion, specialMotion } from './boss_specials';

const ART = 'assets/sprites/common/bosses';
export const BossSprite = { rug: 0, demon: 1, broccoli: 2, executive: 3 } as const;
export type BossSpriteId = (typeof BossSprite)[keyof typeof BossSprite];
export const BossPose = { idle: 0, travel: 1, windup: 2, strike: 3, recovery: 4, exposed: 5, hit: 6, defeat: 7 } as const;
export type BossPoseId = (typeof BossPose)[keyof typeof BossPose];

const ATLAS_CELL = 96;
const SEQUENCE_LENGTH = 6;
export const BOSS_RELEASE_FRAMES = 26;
const sustained = new Set(['sweep', 'zip_low', 'zip_high', 'fakeout', 'tornado', 'dash', 'arrow_slide']);

export function usesSustainedStrike(move: string): boolean {
  return sustained.has(move);
}
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
  g: Gfx, id: BossSpriteId, pose: BossPoseId, ticks: number, facing: number, feet: number, squash: number, move?: string, windupFrames = 0,
): boolean {
  const windup = pose === BossPose.windup;
  const strike = pose === BossPose.strike;
  const special = windup || strike ? specialMotion(move) : undefined;
  const source = special?.source ?? move;
  const layout = source ? moves[source] : undefined;
  const moveRow = layout?.boss === id
    ? pose === BossPose.windup ? layout.windup : pose === BossPose.strike ? layout.strike : undefined
    : undefined;
  const moveTexture = moveRow === undefined ? null : assetImage(`${ART}/boss_moves_sheet.png`);
  const tex = moveTexture ?? assetImage(`${ART}/bosses_sheet.png`);
  if (!tex) return false;
  const row = moveTexture && moveRow !== undefined ? moveRow : id * 8 + pose;
  const frame = Math.floor(ticks / (pose === BossPose.idle ? 9 : 4));
  const progress = windup ? clamp(ticks / Math.max(1, windupFrames - 1), 0, 1) : clamp(ticks / BOSS_RELEASE_FRAMES, 0, 1);
  const oneShot = windup || pose === BossPose.defeat || (strike && !!move && !usesSustainedStrike(move));
  const sequenceFrame = windup ? Math.floor(progress * SEQUENCE_LENGTH) : frame;
  const column = oneShot ? Math.min(SEQUENCE_LENGTH - 1, sequenceFrame) : sequenceFrame % SEQUENCE_LENGTH;
  const region = new Rect2(column * ATLAS_CELL, row * ATLAS_CELL, ATLAS_CELL, ATLAS_CELL);
  const key = special ? sampleMotion(windup ? special.windup : special.release, progress) : undefined;
  const width = Math.round(ATLAS_CELL * (key?.[2] ?? 1));
  const height = squash * (key?.[3] ?? 1);
  const anchor = feet - (key?.[4] ?? 0);
  if (key) g.setTransform(new Vec2(0, anchor), key[1] * facing);
  g.texture(tex, new Vec2(-Math.round(width / 2), (key ? 0 : anchor) - Math.round(89 * height)), {
    region,
    size: new Vec2(width, Math.round(ATLAS_CELL * height)),
    flipH: facing < 0 && id !== BossSprite.demon,
  });
  if (key && move) {
    g.resetTransform();
    drawSpecialCue(g, move, feet, facing, ticks, windup, progress);
  }
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
