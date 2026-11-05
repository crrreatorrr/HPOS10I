// Hurt, invincibility, ticket scatter and death.
//
// The scattered tickets live with the player visuals (another port). When
// src/player/visuals_setup.ts exists its installPlayerVisuals() is called;
// the ticket assertions run only once PlayerHooks.scatter is installed, and
// the ScatteredTicket cases only once src/player/scattered_ticket.ts exists.

import { afterEach, beforeEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Tuning } from '../../src/core/tuning';
import { PlayerHooks, type Player } from '../../src/player/player';
import type { Node, Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { addFloor, newWorld, press, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

type VisualsModule = { installPlayerVisuals?: () => void };
for (const mod of Object.values(import.meta.glob<VisualsModule>('../../src/player/visuals_setup.ts', { eager: true }))) mod.installPlayerVisuals?.();

interface TicketLike extends Node2D {
  velocity: Vec2;
}
interface TicketClass {
  new (): TicketLike;
  RADIUS: number;
  scatter(parent: Node, origin: Vec2, count: number): TicketLike[];
}
const ticketModules = Object.values(import.meta.glob<{ ScatteredTicket?: TicketClass }>('../../src/player/scattered_ticket.ts', { eager: true }));
const ScatteredTicket: TicketClass | null = ticketModules[0]?.ScatteredTicket ?? null;

let world: Node2D;
let player: Player;

beforeEach(() => {
  GameState.tickets = 0;
});

afterEach(() => {
  releaseAll();
  GameState.tickets = 0;
});

function flat(): void {
  world = newWorld();
  addFloor(world);
  player = spawnPlayer(world, Vec2.ZERO);
  settle(player, Vec2.ZERO);
}

function ticketCount(): number {
  return world.children.filter((n) => (ScatteredTicket ? n instanceof ScatteredTicket : n.constructor.name === 'ScatteredTicket')).length;
}

describe('hurt', () => {
  it(
    'hurt knocks back away from the source',
    checked((c) => {
      flat();
      GameState.addTickets(10);
      let hurtSignals = 0;
      player.hurtTaken.connect(() => (hurtSignals += 1));
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      c.eq(player.state, 'hurt', 'hurt state');
      c.near(player.velocity.x, 2, 1e-6, 'knocked right, away from a source on the left');
      c.near(player.velocity.y, -4, 1e-6, 'knocked up');
      c.true(!player.grounded, 'airborne');
      c.true(!player.isAttacking(), 'not attacking while hurt');
      c.eq(hurtSignals, 1, 'hurt_taken emitted');
      c.eq(GameState.tickets, 0, 'tickets lost');
      step(1);
      if (PlayerHooks.scatter) c.eq(ticketCount(), 10, 'every lost ticket scattered');
    }),
  );

  it(
    'hurt from the right goes left',
    checked((c) => {
      flat();
      GameState.addTickets(1);
      player.hurt(player.globalPosition.add(new Vec2(30, 5)));
      c.near(player.velocity.x, -2, 1e-6, 'knocked left');
    }),
  );

  it(
    'no control until landing, then stop',
    checked((c) => {
      flat();
      GameState.addTickets(1);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      press('move_left');
      step(5);
      c.near(player.velocity.x, 2, 1e-6, 'no air control while hurt');
      for (let i = 0; i < 120; i++) {
        step(1);
        if (player.grounded) break;
      }
      c.true(player.grounded, 'landed');
      c.eq(player.groundSpeed, 0, 'stopped on landing');
      c.true(player.state !== 'hurt', 'hurt state ends on landing');
    }),
  );

  it(
    'invincible for 120 frames',
    checked((c) => {
      flat();
      GameState.addTickets(5);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      step(119);
      c.true(player.isInvincible(), 'invincible after 119 frames');
      step(1);
      c.true(!player.isInvincible(), 'invincibility over after 120 frames');
    }),
  );

  it(
    'hits ignored while invincible',
    checked((c) => {
      flat();
      GameState.addTickets(5);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      for (let i = 0; i < 120; i++) {
        step(1);
        if (player.grounded) break;
      }
      GameState.addTickets(3);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      c.eq(GameState.tickets, 3, 'no tickets lost while invincible');
      c.true(player.state !== 'hurt', 'not hurt again');
    }),
  );

  it(
    'a hit with zero tickets kills',
    checked((c) => {
      flat();
      let died = 0;
      player.died.connect(() => (died += 1));
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      c.eq(player.state, 'dead', 'dead');
      c.near(player.velocity.y, -7, 1e-6, 'death hop');
      const startY = player.globalPosition.y;
      step(59);
      c.eq(died, 0, 'died not emitted yet');
      step(1);
      c.eq(died, 1, 'died emitted after 60 frames');
      step(60);
      c.true(player.globalPosition.y > startY + 100, 'fell through the floor, off screen');
    }),
  );

  it.skipIf(!PlayerHooks.scatter)(
    'scatter at most 32 tickets',
    checked((c) => {
      flat();
      GameState.addTickets(50);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      step(1);
      c.eq(ticketCount(), 32, '32 tickets at most');
    }),
  );

  it.skipIf(!ScatteredTicket)(
    'scatter pattern speeds',
    checked((c) => {
      flat();
      const tickets = ScatteredTicket!.scatter(world, new Vec2(0, -100), 32);
      c.eq(tickets.length, 32, '32 tickets');
      const p = Tuning.physics;
      for (let i = 0; i < 32; i++) {
        const expected = i < 16 ? p.ticket_scatter_speed_first : p.ticket_scatter_speed_second;
        c.near(tickets[i]!.velocity.length(), expected, 1e-6, `ticket ${i} speed`);
      }
      c.true(tickets[0]!.velocity.y < 0 && tickets[0]!.velocity.x < 0, 'first ticket up-left (101.25 degrees)');
      c.near(tickets[1]!.velocity.x, -tickets[0]!.velocity.x, 1e-6, 'second ticket mirrored');
    }),
  );

  it.skipIf(!ScatteredTicket)(
    'scattered ticket recollect delay',
    checked((c) => {
      flat();
      const ticket = new ScatteredTicket!();
      ticket.position = player.globalPosition;
      world.addChild(ticket);
      step(60);
      c.eq(GameState.tickets, 0, 'not collectable straight away');
      step(10);
      c.eq(GameState.tickets, 1, 'collected after the delay');
      c.true(ticket.isFreed() || ticket.isQueuedForDeletion(), 'ticket removed');
    }),
  );

  it.skipIf(!ScatteredTicket)(
    'scattered ticket bounces and vanishes',
    checked((c) => {
      flat();
      const ticket = new ScatteredTicket!();
      ticket.position = new Vec2(300, -60);
      world.addChild(ticket);
      let bounced = false;
      const p = Tuning.physics;
      for (let i = 0; i < 120; i++) {
        const before = ticket.velocity.y;
        step(1);
        if (before > 0.5 && ticket.velocity.y < 0) {
          bounced = true;
          c.near(ticket.velocity.y, p.ticket_bounce * (before + p.ticket_gravity), 0.01, 'bounce keeps 75%');
          break;
        }
      }
      c.true(bounced, 'bounced off the floor');
      c.true(ticket.globalPosition.y <= -ScatteredTicket!.RADIUS + 0.5, 'never below the floor');
      step(p.ticket_lifetime_frames);
      c.true(ticket.isFreed(), 'vanished after its lifetime');
    }),
  );

  it(
    'bounce off',
    checked((c) => {
      flat();
      player.respawnAt(new Vec2(0, -200));
      player.velocity = new Vec2(3, 5);
      player.bounceOff(player.globalPosition.y + 30);
      c.near(player.velocity.y, -5, 1e-6, 'falling onto the target: y speed reversed');
      player.velocity = new Vec2(3, -3);
      player.bounceOff(player.globalPosition.y + 30);
      c.near(player.velocity.y, -2, 1e-6, 'moving up: y speed trimmed by 1');
      player.velocity = new Vec2(3, 5);
      player.bounceOff(player.globalPosition.y - 30, true);
      c.near(player.velocity.y, 4, 1e-6, 'below the target: trimmed');
      c.near(player.velocity.x, -3, 1e-6, 'reverseX');
    }),
  );
});
