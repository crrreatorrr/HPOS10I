import { describe, expect, it } from 'vitest';
import { Vec2 } from '../../src/runtime/vec2';
import { addFloor, feetY, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

describe('ground movement', () => {
  it('stands on a flat floor', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    expect(p.grounded).toBe(true);
    expect(feetY(p)).toBeCloseTo(0, 6);
    expect(p.state).toBe('idle');
  });

  it('reaches top speed 6 after exactly 128 frames', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    press('move_right');
    step(127);
    expect(p.groundSpeed).toBeLessThan(6);
    step(1);
    expect(p.groundSpeed).toBeCloseTo(6, 9);
    step(30);
    expect(p.groundSpeed).toBeCloseTo(6, 9);
    release('move_right');
  });

  it('friction brings it to a stop', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    p.groundSpeed = 3;
    step(64);
    expect(p.groundSpeed).toBeCloseTo(0, 9);
    expect(p.state).toBe('idle');
  });

  it('jumps to an apex of 99.84 px', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    const startY = p.globalPosition.y;
    press('jump');
    let minY = startY;
    let landed = false;
    for (let i = 0; i < 120; i++) {
      step(1);
      minY = Math.min(minY, p.globalPosition.y);
      if (i > 5 && p.grounded) {
        landed = true;
        break;
      }
    }
    release('jump');
    expect(landed).toBe(true);
    // Centre moved up by the apex height, plus the 5 px ball shift.
    expect(startY + 5 - minY).toBeCloseTo(99.84, 1);
  });
});
