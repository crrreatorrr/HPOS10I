import { describe, expect, it } from 'vitest';
import { CEILING, LEFT_WALL, PATH_A, RIGHT_WALL } from '../../src/player/player';
import { TerrainLoop } from '../../src/terrain/loop';
import { Vec2 } from '../../src/runtime/vec2';
import { addFloor, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

function setup(startX: number) {
  const w = newWorld();
  addFloor(w, -3000, 3000);
  const loop = new TerrainLoop();
  w.addChild(loop);
  const p = spawnPlayer(w, new Vec2(startX, 0));
  settle(p, new Vec2(startX, 0));
  return { w, loop, p };
}

function run(p: ReturnType<typeof setup>['p'], direction: number, goalX: number, limit = 600) {
  const modes = new Set<number>();
  let airborne = false;
  for (let i = 0; i < limit; i++) {
    step(1);
    modes.add(p.collisionMode);
    airborne = airborne || !p.grounded;
    if (p.globalPosition.x * direction > goalX * direction) break;
  }
  return { modes, airborne };
}

describe('loop', () => {
  it('runs a full lap left to right at top speed', () => {
    const { loop, p } = setup(-500);
    const exitX = loop.radius + loop.thickness + loop.floorMargin + 40;
    p.groundSpeed = 6;
    press('move_right');
    const r = run(p, 1, exitX);
    release('move_right');
    for (const m of [RIGHT_WALL, CEILING, LEFT_WALL]) expect(r.modes.has(m)).toBe(true);
    expect(r.airborne).toBe(false);
    expect(p.globalPosition.x).toBeGreaterThan(exitX);
    expect(p.grounded).toBe(true);
    expect(p.groundSpeed).toBeGreaterThan(0);
    expect(p.collisionPath).toBe(PATH_A);
  });

  it('runs a full lap right to left', () => {
    const { loop, p } = setup(500);
    const exitX = loop.radius + loop.thickness + loop.floorMargin + 40;
    p.groundSpeed = -6;
    press('move_left');
    const r = run(p, -1, -exitX);
    release('move_left');
    for (const m of [RIGHT_WALL, CEILING, LEFT_WALL]) expect(r.modes.has(m)).toBe(true);
    expect(r.airborne).toBe(false);
    expect(p.globalPosition.x).toBeLessThan(-exitX);
    expect(p.grounded && p.groundSpeed < 0).toBe(true);
  });
});
