import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameState } from '../../src/core/game_state';
import type { PlayerArea } from '../../src/levels/common/player_area';
import { OrbitGuard } from '../../src/levels/enemies/neon/orbit_guard';
import { Shockwave, ShockwavePill } from '../../src/levels/enemies/neon/shockwave_pill';
import { Splitter, SplitterMini } from '../../src/levels/enemies/neon/splitter';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { addFloor, addRect, newWorld, press, releaseAll, spawnPlayer, step } from '../helpers/world';
import { waitFor } from './level_world';

beforeEach(() => GameState.resetGame());
afterEach(releaseAll);

describe('Neon Rush enemy variants', () => {
  it('cracks harmlessly, then releases exactly two minis that hop apart', () => {
    const world = newWorld();
    addFloor(world);
    const enemy = world.addChild(new Splitter());
    const player = spawnPlayer(world, new Vec2(-90, 0));
    const attack = vi.spyOn(player, 'isAttacking').mockReturnValue(true);
    step(2);
    player.respawnAt(new Vec2(-12, -19));
    expect(waitFor(() => !enemy.monitorable, 8)).toBeGreaterThanOrEqual(0);
    expect(enemy.alive).toBe(true);
    expect(tree.getNodesInGroup('enemies')).toEqual([enemy]);
    attack.mockReturnValue(false);
    step(20);
    expect(player.state).not.toBe('dead');
    expect(waitFor(() => !enemy.alive, 8)).toBeGreaterThanOrEqual(0);
    const minis = tree.getNodesInGroup('enemies').filter((n): n is SplitterMini => n instanceof SplitterMini);
    expect(minis).toHaveLength(2);
    player.respawnAt(new Vec2(-100, -19));
    step(8);
    expect(minis[0]!.position.x).toBeLessThan(-12);
    expect(minis[1]!.position.x).toBeGreaterThan(12);
    expect(minis.every((mini) => mini.position.y < -5)).toBe(true);
    expect(GameState.score).toBe(100);
  });

  it('lets a jumping player hit the core between the physical orbit shields', () => {
    const world = newWorld();
    addFloor(world);
    const guard = world.addChild(new OrbitGuard());
    const player = spawnPlayer(world, new Vec2(-100, 0));
    vi.spyOn(player, 'isAttacking').mockReturnValue(true);
    const rebound = vi.spyOn(player, 'bounceOff');
    const shield = guard.getNode<PlayerArea>('ShieldA');
    player.respawnAt(shield.globalPosition.withY(-19));
    step(3);
    expect(guard.alive).toBe(true);
    expect(guard.isOpenTo(player)).toBe(false);
    expect(rebound.mock.calls.some(([, reverse]) => reverse)).toBe(true);

    player.respawnAt(new Vec2(-18, -29));
    expect(waitFor(() => !guard.alive, 8)).toBeGreaterThanOrEqual(0);
    expect(guard.isInsideTree()).toBe(false);
    expect(shield.isInsideTree()).toBe(false);
  });

  it('warns before a two-sided ground volley, which a timed jump avoids', () => {
    const world = newWorld();
    addFloor(world);
    const enemy = world.addChild(new ShockwavePill());
    const player = spawnPlayer(world, new Vec2(-95, 0));
    const waves = () => tree.getNodesInGroup<Shockwave>('pellets').filter((n) => n instanceof Shockwave);
    expect(waitFor(() => enemy.phase === 'warning', 6)).toBeGreaterThanOrEqual(0);
    step(enemy.telegraphFrames(0.9) - 1);
    expect(waves()).toHaveLength(0);
    step();
    const pair = waves();
    expect(pair.map((wave) => wave.direction)).toEqual([-1, 1]);
    const start = pair.map((wave) => wave.position.x);
    step(10);
    expect(pair[0]!.position.x).toBeLessThan(start[0]!);
    expect(pair[1]!.position.x).toBeGreaterThan(start[1]!);
    press('jump');
    step(40);
    expect(player.state).not.toBe('dead');
    expect(waves()).toHaveLength(0);
  });

  it('does not send a shockwave through a neighboring wall or across a ledge', () => {
    const world = newWorld();
    addFloor(world, -75, 300);
    addRect(world, new Rect2(12, -50, 8, 50));
    const enemy = world.addChild(new ShockwavePill());
    spawnPlayer(world, new Vec2(-65, 0));
    expect(waitFor(() => enemy.phase === 'recoil', 70)).toBeGreaterThanOrEqual(0);
    const waves = tree.getNodesInGroup<Shockwave>('pellets');
    expect(waves.map((wave) => wave.direction)).toEqual([-1]);
    step(40);
    expect(tree.getNodesInGroup('pellets')).toHaveLength(0);
  });
});
