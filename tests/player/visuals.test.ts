// Sproto's visuals: animation frame timing (tests/physics/test_animation_timing.gd),
// the node layout from player.tscn, the invincibility blink, the afterimage
// option, and scattered tickets (tests/physics/test_hurt.gd).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Settings } from '../../src/core/settings';
import { Tuning } from '../../src/core/tuning';
import { Afterimage } from '../../src/player/afterimage';
import type { Player } from '../../src/player/player';
import { BLINK_PERIOD_FRAMES, PlayerVisual } from '../../src/player/player_visual';
import { ScatteredTicket } from '../../src/player/scattered_ticket';
import { installPlayerVisuals } from '../../src/player/visuals_setup';
import type { Node2D } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';
import { addFloor, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

beforeAll(() => installPlayerVisuals());

function flat(): { world: Node2D; player: Player } {
  const world = newWorld();
  addFloor(world);
  const player = spawnPlayer(world, Vec2.ZERO);
  settle(player, Vec2.ZERO);
  return { world, player };
}

function visualOf(player: Player): PlayerVisual {
  return player.getNode<PlayerVisual>('Visual');
}

function ticketsIn(world: Node2D): ScatteredTicket[] {
  return world.children.filter((c): c is ScatteredTicket => c instanceof ScatteredTicket && !c.isQueuedForDeletion());
}

describe('player visuals: layout', () => {
  it('builds the player.tscn children in order', () => {
    const { player } = flat();
    expect(player.children.map((c) => c.name)).toEqual(['Hitbox', 'Afterimage', 'Visual', 'DebugOverlay', 'Effects']);
    const visual = visualOf(player);
    const names = visual.children.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Cape', 'SkinMarks', 'Accessory']));
    expect(names.indexOf('Cape')).toBeLessThan(names.indexOf('SkinMarks'));
    expect(names.indexOf('SkinMarks')).toBeLessThan(names.indexOf('Accessory'));
    expect(visual.getNode<Node2D>('Cape').showBehindParent).toBe(true);
    expect(visual.getNode<Node2D>('SkinMarks').zIndex).toBe(1);
    expect(visual.getNode<Node2D>('Accessory').zIndex).toBe(2);
  });
});

describe('player visuals: animation timing', () => {
  it('follows the Guide formula', () => {
    expect(PlayerVisual.frameTicks('run', 0)).toBe(9);
    expect(PlayerVisual.frameTicks('run', 2.5)).toBe(7);
    expect(PlayerVisual.frameTicks('run', 6)).toBe(3);
    expect(PlayerVisual.frameTicks('run', 12)).toBe(1);
    expect(PlayerVisual.frameTicks('run', -6)).toBe(3);
    expect(PlayerVisual.frameTicks('skid', 4)).toBe(5);
    expect(PlayerVisual.frameTicks('roll', 2)).toBe(3);
    expect(PlayerVisual.frameTicks('roll', 8)).toBe(1);
    expect(PlayerVisual.frameTicks('jump', 0)).toBe(5);
    expect(PlayerVisual.frameTicks('spindash', 0)).toBe(1);
    expect(PlayerVisual.frameTicks('idle', 0)).toBe(0);
  });

  it('advances run frames at the Guide rate', () => {
    const { player } = flat();
    const visual = visualOf(player);
    player.groundSpeed = 6;
    press('move_right');
    step(1);
    const start = visual.animFrame;
    step(30);
    release('move_right');
    // 3 ticks a frame at 6 px/f: 10 frames in 30 ticks.
    expect(visual.animFrame - start).toBe(10);
  });

  it('holds the frame while idle', () => {
    const { player } = flat();
    const visual = visualOf(player);
    const start = visual.animFrame;
    step(30);
    expect(player.state).toBe('idle');
    expect(visual.animFrame).toBe(start);
  });

  it('spins the charge-run legs faster with the charge', () => {
    expect(PlayerVisual.peelOutTicks(0)).toBeGreaterThan(PlayerVisual.peelOutTicks(1));
    expect(PlayerVisual.peelOutTicks(1)).toBe(1);
  });
});

describe('player visuals: blink and afterimage', () => {
  beforeEach(() => {
    GameState.tickets = 0;
    Settings.reset();
  });
  afterEach(() => {
    GameState.tickets = 0;
    Settings.reset();
  });

  it('blinks by invincibility ticks after a hit', () => {
    const { player } = flat();
    const visual = visualOf(player);
    GameState.addTickets(1);
    player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
    const seen = new Set<boolean>();
    for (let i = 0; i < BLINK_PERIOD_FRAMES * 4; i++) {
      tree.advance(1);
      const expected = player.invincibleFramesLeft() % (BLINK_PERIOD_FRAMES * 2) < BLINK_PERIOD_FRAMES;
      expect(visual.visible).toBe(expected);
      seen.add(visual.visible);
    }
    expect(seen.size).toBe(2);
  });

  it('leaves an afterimage above 10 px/f unless speed effects are off', () => {
    const { player } = flat();
    const after = player.getNode<Afterimage>('Afterimage');
    player.groundSpeed = 12;
    step(6);
    expect(after.copyCount()).toBeGreaterThan(0);

    Settings.data = { ...Settings.data, speedEffects: false };
    const { player: second } = flat();
    const quiet = second.getNode<Afterimage>('Afterimage');
    second.groundSpeed = 12;
    step(6);
    expect(quiet.copyCount()).toBe(0);
  });
});

describe('scattered tickets', () => {
  beforeEach(() => {
    GameState.tickets = 0;
  });
  afterEach(() => {
    GameState.tickets = 0;
  });

  it('scatters every lost ticket', () => {
    const { world, player } = flat();
    GameState.addTickets(10);
    player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
    expect(GameState.tickets).toBe(0);
    step(1);
    expect(ticketsIn(world).length).toBe(10);
  });

  it('scatters at most 32 tickets', () => {
    const { world, player } = flat();
    GameState.addTickets(50);
    player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
    step(1);
    expect(ticketsIn(world).length).toBe(32);
  });

  it('fans out at speed 4, then 2 for the inner ring', () => {
    const { world } = flat();
    const tickets = ScatteredTicket.scatter(world, new Vec2(0, -100), 32);
    expect(tickets.length).toBe(32);
    const p = Tuning.physics;
    expect(p.ticket_scatter_speed_first).toBe(4);
    expect(p.ticket_scatter_speed_second).toBe(2);
    tickets.forEach((t, i) => {
      expect(t.velocity.length()).toBeCloseTo(i < 16 ? 4 : 2, 6);
    });
    expect(tickets[0]!.velocity.y).toBeLessThan(0);
    expect(tickets[0]!.velocity.x).toBeLessThan(0);
    expect(tickets[1]!.velocity.x).toBeCloseTo(-tickets[0]!.velocity.x, 6);
    // 101.25 degrees, then 101.25 + 22.5 for the next pair.
    expect(Math.atan2(-tickets[0]!.velocity.y, tickets[0]!.velocity.x)).toBeCloseTo((101.25 * Math.PI) / 180, 6);
    expect(Math.atan2(-tickets[2]!.velocity.y, tickets[2]!.velocity.x)).toBeCloseTo((123.75 * Math.PI) / 180, 6);
    // The inner ring starts over at 101.25 degrees.
    expect(Math.atan2(-tickets[16]!.velocity.y, tickets[16]!.velocity.x)).toBeCloseTo((101.25 * Math.PI) / 180, 6);
    // Added deferred.
    expect(tickets[0]!.parent).toBeNull();
    step(1);
    expect(tickets[0]!.parent).toBe(world);
  });

  it('cannot be collected for 64 frames', () => {
    const { world, player } = flat();
    expect(Tuning.physics.ticket_recollect_delay_frames).toBe(64);
    const ticket = new ScatteredTicket();
    ticket.position = player.globalPosition;
    world.addChild(ticket);
    step(63);
    expect(GameState.tickets).toBe(0);
    expect(ticket.isQueuedForDeletion()).toBe(false);
    step(2);
    expect(GameState.tickets).toBe(1);
    expect(ticket.isFreed() || ticket.isQueuedForDeletion()).toBe(true);
  });

  it('bounces off the floor and vanishes after 256 frames', () => {
    const { world } = flat();
    const p = Tuning.physics;
    expect(p.ticket_lifetime_frames).toBe(256);
    const ticket = new ScatteredTicket();
    ticket.position = new Vec2(300, -60);
    world.addChild(ticket);
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      const before = ticket.velocity.y;
      step(1);
      if (before > 0.5 && ticket.velocity.y < 0) {
        bounced = true;
        expect(ticket.velocity.y).toBeCloseTo(p.ticket_bounce * (before + p.ticket_gravity), 2);
        break;
      }
    }
    expect(bounced).toBe(true);
    expect(ticket.globalPosition.y).toBeLessThanOrEqual(-ScatteredTicket.RADIUS + 0.5);
    const lived = ticket.ageFrames;
    step(p.ticket_lifetime_frames - lived - 1);
    expect(ticket.isFreed()).toBe(false);
    step(1);
    expect(ticket.isFreed()).toBe(true);
  });

  it('blinks during its last 64 frames', () => {
    const { world } = flat();
    const ticket = new ScatteredTicket();
    ticket.position = new Vec2(300, -60);
    world.addChild(ticket);
    step(256 - 64 - 1);
    expect(ticket.visible).toBe(true);
    const seen = new Set<boolean>();
    for (let i = 0; i < 16; i++) {
      step(1);
      seen.add(ticket.visible);
    }
    expect(seen.size).toBe(2);
  });
});
