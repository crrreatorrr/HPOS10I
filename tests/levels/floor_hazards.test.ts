import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { CeilingRam } from '../../src/levels/objects/hazards/ceiling_ram';
import { Burrower, LavaVent } from '../../src/levels/objects/hazards/floor_hazards';
import { FluidWell } from '../../src/levels/objects/hazards/fluid_well';
import { Enemy } from '../../src/levels/enemies/enemy_base';
import type { Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { addFloor, newWorld, press, release, releaseAll, spawnPlayer, step } from '../helpers/world';
import { loadAct, MIN_TELEGRAPH_FRAMES, place, waitFor } from './level_world';

beforeEach(() => GameState.resetGame());
afterEach(releaseAll);

const fast = { rest_frames: 6, telegraph_seconds: 0.01, extend_frames: 15, hold_frames: 12, retract_frames: 18 };

describe('floor hazards', () => {
  it.each(['lava', 'poison'])('jumps over the %s with a run-up, and takes damage if the jump is missed', (fluid) => {
    const half = fluid === 'lava' ? 48 : 56;
    function basin() {
      const world = newWorld();
      addFloor(world, -500, -half);
      addFloor(world, half, 500);
      addFloor(world, -half, half, 44);
      place(world, new FluidWell(), new Vec2(0, 14), { fluid, width: half * 2, depth: 30 });
      return spawnPlayer(world, new Vec2(-180, 0));
    }
    const runner = basin();
    GameState.addTickets(8);
    let hits = 0;
    runner.hurtTaken.connect(() => hits++);
    step(3);
    press('move_right');
    expect(waitFor(() => runner.globalPosition.x >= -75, 90)).toBeGreaterThanOrEqual(0);
    press('jump');
    step(34);
    release('jump');
    expect(waitFor(() => runner.globalPosition.x > 80 && runner.grounded, 70)).toBeGreaterThanOrEqual(0);
    expect(hits).toBe(0);
    expect(GameState.tickets).toBe(8);

    const walker = basin();
    walker.hurtTaken.connect(() => hits++);
    press('move_right');
    expect(waitFor(() => hits === 1, 120)).toBeGreaterThanOrEqual(0);
    expect(GameState.tickets).toBe(0);
    expect(walker.state).not.toBe('dead');
    step(16);
    expect(hits).toBe(1);
    release('move_right');
    expect(waitFor(() => walker.grounded, 75)).toBeGreaterThanOrEqual(0);
    press('move_left');
    press('jump');
    expect(waitFor(() => walker.globalPosition.x < -half - 12 && walker.grounded, 95)).toBeGreaterThanOrEqual(0);
    expect(walker.state).not.toBe('dead');
  });

  it('warns under a standing player before a vent hurts, then clears its hitbox on retraction', () => {
    const world = newWorld();
    addFloor(world);
    const player = spawnPlayer(world, Vec2.ZERO);
    GameState.addTickets(8);
    const vent = place(world, new LavaVent(), Vec2.ZERO, fast);
    let hits = 0;
    player.hurtTaken.connect(() => hits++);
    expect(waitFor(() => vent.cycle.phase === 'warning', 15)).toBeGreaterThanOrEqual(0);
    step(MIN_TELEGRAPH_FRAMES - 1);
    expect(vent.rise).toBe(0);
    expect(hits).toBe(0);
    expect(waitFor(() => hits > 0, 12)).toBeGreaterThanOrEqual(0);
    expect(waitFor(() => vent.cycle.phase === 'rest', 70)).toBeGreaterThanOrEqual(0);
    expect(vent.rise).toBe(0);
    expect(vent.playersInside()).toEqual([]);
  });

  it('lets the player wait outside the lava and run across while the outlet is safe', () => {
    const world = newWorld();
    addFloor(world);
    const player = spawnPlayer(world, new Vec2(-40, 0));
    const vent = place(world, new LavaVent(), Vec2.ZERO, { ...fast, rest_frames: 80 });
    expect(waitFor(() => vent.cycle.phase === 'hold', 170)).toBeGreaterThanOrEqual(0);
    expect(player.state).not.toBe('dead');
    expect(waitFor(() => vent.cycle.phase === 'rest', 50)).toBeGreaterThanOrEqual(0);
    press('move_right');
    expect(waitFor(() => player.globalPosition.x > 40, 75)).toBeGreaterThanOrEqual(0);
    expect(player.state).not.toBe('dead');
  });

  it('keeps the burrower harmless underground and rewards jumping into the exposed body', () => {
    const world = newWorld();
    addFloor(world);
    const player = spawnPlayer(world, new Vec2(-33, 0));
    const enemy = place(world, new Burrower(), Vec2.ZERO, { ...fast, height: 38, hold_frames: 60 });
    expect(waitFor(() => enemy.cycle.phase === 'warning', 12)).toBeGreaterThanOrEqual(0);
    expect(enemy.playersInside()).toEqual([]);
    expect(waitFor(() => enemy.cycle.phase === 'hold', 90)).toBeGreaterThanOrEqual(0);
    press('move_right');
    step(22);
    press('jump');
    step(7);
    release('jump');
    expect(waitFor(() => !enemy.alive, 55)).toBeGreaterThanOrEqual(0);
    expect(player.state).not.toBe('dead');
    expect(GameState.score).toBe(100);
  });

  it('leaves the hatch safe for a standing player after the burrower retracts', () => {
    const world = newWorld();
    addFloor(world);
    const player = spawnPlayer(world, new Vec2(-45, 0));
    const enemy = place(world, new Burrower(), Vec2.ZERO, fast);
    expect(waitFor(() => enemy.cycle.phase === 'hold', 65)).toBeGreaterThanOrEqual(0);
    expect(waitFor(() => enemy.cycle.phase === 'rest', 65)).toBeGreaterThanOrEqual(0);
    player.respawnAt(new Vec2(0, -19));
    step(14);
    expect(enemy.cycle.phase).toBe('warning');
    expect(enemy.playersInside()).toEqual([]);
    expect(player.state).not.toBe('dead');
  });

  it('starts an approach-triggered crusher from rest when the player gets close', () => {
    const world = newWorld();
    addFloor(world);
    const player = spawnPlayer(world, new Vec2(-180, 0));
    const ram = place(world, new CeilingRam(), new Vec2(0, -100), {
      ...fast, height: 20, travel: 80, wake_radius: 96,
    });
    step(250);
    expect(ram.cycle.phase).toBe('rest');
    expect(Math.abs(ram.cycle.elapsed)).toBe(0);
    player.respawnAt(new Vec2(-72, -19));
    expect(waitFor(() => ram.cycle.phase === 'warning', 12)).toBeGreaterThanOrEqual(0);
    expect(ram.position.y).toBe(-100);
  });

  it('crushes a player who stays in the lane, but a player who runs on the warning escapes', () => {
    function setup() {
      const world = newWorld();
      addFloor(world);
      const player = spawnPlayer(world, Vec2.ZERO);
      GameState.addTickets(8);
      const ram = place(world, new CeilingRam(), new Vec2(0, -100), { ...fast, height: 20, travel: 80 });
      return { player, ram };
    }
    const trapped = setup();
    expect(waitFor(() => trapped.ram.cycle.phase === 'warning', 12)).toBeGreaterThanOrEqual(0);
    step(MIN_TELEGRAPH_FRAMES - 1);
    expect(trapped.ram.position.y).toBe(-100);
    expect(trapped.player.state).not.toBe('dead');
    expect(waitFor(() => trapped.player.state === 'dead', 90)).toBeGreaterThanOrEqual(0);
    expect(GameState.tickets).toBe(8);
    expect(waitFor(() => trapped.ram.cycle.phase === 'rest', 55)).toBeGreaterThanOrEqual(0);
    expect(trapped.ram.position.y).toBe(-100);

    const escaped = setup();
    expect(waitFor(() => escaped.ram.cycle.phase === 'warning', 12)).toBeGreaterThanOrEqual(0);
    const mount = escaped.ram.getNode<Node2D>('Mount');
    const plate = escaped.ram.getNode<Node2D>('WarningPlate');
    const ceiling = mount.globalPosition;
    const floor = plate.globalPosition;
    press('move_right');
    expect(waitFor(() => escaped.ram.cycle.phase === 'hold', 100)).toBeGreaterThanOrEqual(0);
    expect(escaped.player.globalPosition.x).toBeGreaterThan(35);
    expect(mount.globalPosition).toEqual(ceiling);
    expect(plate.globalPosition).toEqual(floor);
    expect(escaped.player.state).not.toBe('dead');
  });
});


describe('optional hazard routes', () => {
  it.each([
    { name: 'Academy vent', act: 'z2_wizard_academy/act1', from: [8480, -544], steps: [[8500, -604], [8420, -660], [8336, -720]] },
    { name: 'Mansion burrower', act: 'z3_capital_mansion/act2', from: [18548, -192], steps: [[18464, -248], [18380, -304], [18298, -360], [18200, -416]] },
    { name: 'Mansion vent', act: 'z3_capital_mansion/act2', from: [23142, -448], steps: [[23218, -504], [23302, -560], [23386, -616], [23472, -672]] },
  ])('reaches the $name shelf with regular jumps from the lower route', async ({ act, from, steps }) => {
    const root = await loadAct(`src/levels/data/${act}.json`);
    for (const enemy of root.findChildren((n) => n instanceof Enemy && !(n instanceof Burrower))) enemy.queueFree();
    const player = root.player!;
    player.respawnAt(new Vec2(from[0]!, from[1]! - 19));
    step(3);
    expect(player.grounded).toBe(true);
    for (const [x, y] of steps) {
      press('jump');
      let landed = false;
      for (let i = 0; i < 75; i++) {
        const dx = x! - player.globalPosition.x;
        const vx = player.velocity.x;
        // Turn early enough to slow down before landing on the ledge.
        const left = dx - vx * Math.abs(vx) / 0.1875 < -2;
        const right = dx - vx * Math.abs(vx) / 0.1875 > 2;
        if (left) press('move_left'); else release('move_left');
        if (right) press('move_right'); else release('move_right');
        step();
        const feet = player.globalPosition.y + player.getRadii().y;
        if (player.grounded && Math.abs(feet - y!) < 2 && Math.abs(dx) < 24) {
          landed = true;
          break;
        }
      }
      release('jump');
      release('move_left');
      release('move_right');
      expect(landed, `landing near (${x}, ${y}), got ${player.globalPosition}`).toBe(true);
      step();
    }
  });
});
