// Level objects: tickets, springs, booster, breakable wall, checkpoint,
// spikes, conveyors and the registry keys (after tests/levels/test_objects.gd).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import type { Player, PlayerState } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { LevelTypes } from '../../src/levels/common/level_loader';
import { Props } from '../../src/levels/common/props';
import { BreakableWall } from '../../src/levels/objects/breakable_wall';
import { Checkpoint } from '../../src/levels/objects/checkpoint';
import { SpeedBooster } from '../../src/levels/objects/speed_booster';
import { Spikes } from '../../src/levels/objects/spikes';
import { LevelSpring, SpringKind, SpringStrength } from '../../src/levels/objects/spring';
import { LevelTicket } from '../../src/levels/objects/ticket';
import { Conveyor } from '../../src/levels/objects/z3/conveyor';
import { Door } from '../../src/levels/objects/z3/door';
import { FloorSwitch } from '../../src/levels/objects/z3/floor_switch';
import { registerObjects } from '../../src/levels/registry_objects';
import { Prompts } from '../../src/core/prompts';
import { PROMPT_WAIT_FRAMES, PromptZone } from '../../src/levels/objects/prompt_zone';
import { PROMPT_KEYS, promptLine } from '../../src/ui/hud/prompt_line';
import { loadAct } from './level_world';
import { addFloor, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

type Placeable = Node2D & { applyProps?(p: Props): void };

let world: Node2D;
let player: Player;

/** A flat floor at y = 0 with `node` at `at`, then Sproto standing at `feet`. */
function flatWith<T extends Placeable>(node: T, at: Vec2, props: Record<string, unknown> = {}, feet = Vec2.ZERO): T {
  world = newWorld();
  addFloor(world);
  place(node, at, props);
  player = spawnPlayer(world, feet);
  settle(player, feet);
  return node;
}

function place<T extends Placeable>(node: T, at: Vec2, props: Record<string, unknown> = {}): T {
  node.applyProps?.(Props.of(props));
  node.position = at;
  world.addChild(node);
  return node;
}

/** Records the velocity the moment the player's state becomes `state`. */
function velocityOn(state: PlayerState): { v: Vec2 | null; attacking: boolean } {
  const seen: { v: Vec2 | null; attacking: boolean } = { v: null, attacking: false };
  player.stateChanged.connect((_old, next) => {
    if (next === state && !seen.v) {
      seen.v = player.velocity;
      seen.attacking = player.isAttacking();
    }
  });
  return seen;
}

/** Steps until `cond` holds (at most `max` ticks); returns the tick count or -1. */
function waitFor(cond: () => boolean, max: number): number {
  for (let i = 0; i < max; i++) {
    step(1);
    if (cond()) return i;
  }
  return -1;
}

beforeEach(() => {
  GameState.resetGame();
});

describe('tickets', () => {
  it('a ticket is collected once', () => {
    const ticket = flatWith(new LevelTicket(), new Vec2(100, -16));
    let changes = 0;
    GameState.ticketsChanged.connect(() => (changes += 1), { owner: ticket });
    player.groundSpeed = 4;
    step(40);
    expect(GameState.tickets).toBe(1);
    expect(changes).toBeGreaterThanOrEqual(1);
    expect(ticket.isCollected()).toBe(true);
  });

  it('two overlapping tickets count two', () => {
    flatWith(new LevelTicket(), new Vec2(100, -16));
    place(new LevelTicket(), new Vec2(100, -16));
    player.groundSpeed = 4;
    step(40);
    expect(GameState.tickets).toBe(2);
  });

  it('waits while hurt and ignores the dead', () => {
    flatWith(new LevelTicket(), new Vec2(400, -16));
    GameState.addTickets(3);
    player.hurt(player.globalPosition.add(new Vec2(-10, 0)));
    const ticket = place(new LevelTicket(), player.globalPosition);
    let collectedWhileHurt = false;
    for (let i = 0; i < 200; i++) {
      step(1);
      if (ticket.isCollected()) break;
      if (player.state === 'hurt' && GameState.tickets > 0) collectedWhileHurt = true;
      ticket.globalPosition = player.globalPosition;
    }
    expect(collectedWhileHurt).toBe(false);
    expect(ticket.isCollected()).toBe(true);
    expect(GameState.tickets).toBe(1);
    player.kill();
    const dead = place(new LevelTicket(), player.globalPosition);
    step(10);
    expect(dead.isCollected()).toBe(false);
  });

  it('a row of tickets at 16 px/frame skips none', () => {
    world = newWorld();
    addFloor(world);
    for (let i = 0; i < 12; i++) place(new LevelTicket(), new Vec2(200 + i * 16, -16));
    player = spawnPlayer(world, Vec2.ZERO);
    settle(player, Vec2.ZERO);
    player.groundSpeed = 16;
    step(30);
    expect(GameState.tickets).toBe(12);
  });
});

describe('springs', () => {
  for (const [strength, expected] of [
    [SpringStrength.YELLOW, 10],
    [SpringStrength.RED, 16],
  ] as const) {
    it(`an up spring launches at ${expected} px/frame, keeping x speed`, () => {
      flatWith(new LevelSpring(SpringKind.UP), new Vec2(120, 0), { strength });
      const seen = velocityOn('spring');
      player.groundSpeed = 3;
      press('move_right');
      step(40);
      release('move_right');
      expect(seen.v).not.toBeNull();
      expect(seen.v!.y).toBeCloseTo(-expected, 4);
      expect(seen.v!.x).toBeGreaterThan(2.5);
      expect(seen.attacking).toBe(false);
    });
  }

  it('a diagonal spring launches at 45 degrees both ways', () => {
    for (const facing of [1, -1]) {
      flatWith(new LevelSpring(SpringKind.DIAGONAL), new Vec2(0, 0), { facing }, new Vec2(0, 0));
      const seen = velocityOn('spring');
      step(10);
      expect(seen.v).not.toBeNull();
      expect(seen.v!.x).toBeCloseTo(10 * facing, 4);
      expect(seen.v!.y).toBeCloseTo(-10, 4);
    }
  });
});

describe('speed booster', () => {
  it('pushes 12 px/frame in its facing and keeps more', () => {
    flatWith(new SpeedBooster(), new Vec2(120, 0), { facing: 1 });
    player.groundSpeed = 3;
    press('move_right');
    const boosted = waitFor(() => player.groundSpeed >= 11.9, 60);
    release('move_right');
    expect(boosted).toBeGreaterThanOrEqual(0);
    expect(player.groundSpeed).toBeCloseTo(12, 1);
    expect(player.controlLock).toBeGreaterThan(0);

    flatWith(new SpeedBooster(), new Vec2(160, 0), { facing: 1 });
    player.groundSpeed = 14;
    press('move_right');
    const hit = waitFor(() => player.controlLock > 0, 30);
    release('move_right');
    expect(hit).toBeGreaterThanOrEqual(0);
    expect(player.groundSpeed).toBeGreaterThanOrEqual(13.9);
  });

  it('turns a player running into it backwards round at 12', () => {
    flatWith(new SpeedBooster(), new Vec2(-100, 0), { facing: 1 });
    player.groundSpeed = -4;
    expect(waitFor(() => player.groundSpeed >= 11.9, 60)).toBeGreaterThanOrEqual(0);
  });
});

describe('checkpoint', () => {
  it('sets once and never moves back', () => {
    const first = flatWith(new Checkpoint(), new Vec2(200, -19));
    const later = place(new Checkpoint(), new Vec2(600, -19));
    let count = 0;
    GameState.checkpointReached.connect(() => (count += 1), { owner: first });
    player.groundSpeed = 16;
    step(20);
    expect(first.isActive()).toBe(true);
    expect(GameState.checkpointPosition).toEqual(new Vec2(200, -19));
    step(40);
    expect(GameState.checkpointPosition).toEqual(new Vec2(600, -19));
    expect(count).toBe(2);
    player.respawnAt(new Vec2(200, -19));
    step(10);
    expect(GameState.checkpointPosition).toEqual(new Vec2(600, -19));
    expect(count).toBe(2);
    expect(later.isActive()).toBe(true);
  });
});

describe('spikes', () => {
  it('hurt from the points only', () => {
    flatWith(new Spikes(), new Vec2(200, 0), { width: 32 });
    GameState.addTickets(5);
    player.groundSpeed = 4;
    press('move_right');
    step(60);
    release('move_right');
    expect(player.state).not.toBe('hurt');
    expect(player.isInvincible()).toBe(false);
    player.respawnAt(new Vec2(200, -80));
    step(30);
    expect(player.isInvincible()).toBe(true);
  });
});

describe('breakable wall', () => {
  it('stops runners and breaks for rollers, once', () => {
    const wall = flatWith(new BreakableWall(), new Vec2(188, 0));
    player.groundSpeed = 6;
    press('move_right');
    step(60);
    release('move_right');
    expect(wall.isBroken()).toBe(false);
    expect(player.globalPosition.x).toBeLessThan(188 - 9);
    const score = GameState.score;
    player.respawnAt(new Vec2(0, -19));
    step(2);
    player.groundSpeed = 8;
    press('move_down');
    step(1);
    release('move_down');
    expect(player.state).toBe('roll');
    step(40);
    expect(wall.isBroken()).toBe(true);
    expect(GameState.score).toBe(score + BreakableWall.SCORE);
  });
});

describe('conveyor', () => {
  it('carries a standing player at its speed', () => {
    world = newWorld();
    const belt = place(new Conveyor(), new Vec2(-128, 0), { size: new Vec2(256, 48), speed: -4 });
    expect(belt.getMeta('conveyor_speed')).toBe(-4);
    player = spawnPlayer(world, Vec2.ZERO);
    settle(player, Vec2.ZERO);
    const x = player.globalPosition.x;
    step(10);
    expect(player.globalPosition.x).toBeCloseTo(x - 40, 0);
  });
});

describe('floor switch and door', () => {
  it('opens its door (also from the converted level data, doors = "Array")', () => {
    for (const doors of [['../HallDoor1'], 'Array']) {
      world = newWorld();
      addFloor(world);
      const door = place(new Door('HallDoor1'), new Vec2(300, 0));
      const sw = place(new FloorSwitch('FloorSwitch1'), new Vec2(100, 0), { doors });
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      expect(door.isOpening()).toBe(false);
      player.groundSpeed = 6;
      step(20);
      expect(sw.isPressed).toBe(true);
      expect(door.isOpening() || door.isOpen).toBe(true);
      step(30);
      expect(door.isOpen).toBe(true);
      expect(door.collisionLayer).toBe(0);
    }
  });
});

describe('registry', () => {
  it('registers every object and playground type the levels use', () => {
    registerObjects();
    const dir = join(__dirname, '../../src/levels/data');
    const missing: string[] = [];
    for (const sub of readdirSync(dir)) {
      if (sub === 'tilesets') continue;
      for (const file of readdirSync(join(dir, sub))) {
        const data = JSON.parse(readFileSync(join(dir, sub, file), 'utf8')) as { nodes: { scene?: string; script?: string }[] };
        for (const n of data.nodes) {
          const key = n.scene ?? n.script ?? '';
          if (!/levels\/objects\/|^res:\/\/playground\//.test(key) || key.endsWith('physics_playground.gd')) continue;
          if (key.endsWith('item_box.tscn')) continue; // owned by another port
          if (!LevelTypes.has(key)) missing.push(key);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('prompt zones', () => {
  beforeEach(() => Prompts.reset());

  it('shows its prompt after Sproto stands in it for 60 frames, once per run', () => {
    flatWith(new PromptZone(), new Vec2(0, 0), { prompt: 'spindash', width: 160, height: 96 });
    step(PROMPT_WAIT_FRAMES - 10);
    expect(Prompts.current).toBe('');
    step(12);
    expect(Prompts.current).toBe('spindash');
    expect(Prompts.secondsLeft).toBeGreaterThan(4);
    // It goes away on its own and does not come back in the same run, even after a respawn.
    Prompts.tick(10);
    expect(Prompts.current).toBe('');
    player.respawnAt(new Vec2(0, -19));
    step(PROMPT_WAIT_FRAMES + 10);
    expect(Prompts.current).toBe('');
    expect(Prompts.hasSeen('spindash')).toBe(true);
    // A fresh act start is a new run: the old scene's zone stays quiet, the new scene's zone asks again.
    GameState.startLevel('z1_retro_rush_hills', 1);
    expect(Prompts.hasSeen('spindash')).toBe(false);
    step(PROMPT_WAIT_FRAMES + 10);
    expect(Prompts.current).toBe('');
    flatWith(new PromptZone(), new Vec2(0, 0), { prompt: 'spindash', width: 160, height: 96 });
    step(PROMPT_WAIT_FRAMES + 2);
    expect(Prompts.current).toBe('spindash');
  });

  it('a runner passing through a standing prompt does not trigger it; an entry prompt shows at once', () => {
    flatWith(new PromptZone(), new Vec2(200, 0), { prompt: 'spindash', width: 160, height: 96 }, new Vec2(0, 0));
    press('move_right');
    step(140);
    release('move_right');
    expect(player.globalPosition.x).toBeGreaterThan(280);
    expect(Prompts.current).toBe('');

    flatWith(new PromptZone(), new Vec2(120, 0), { prompt: 'enemy', width: 96, height: 96, on_entry: true }, new Vec2(0, 0));
    expect(Prompts.current).toBe('');
    press('move_right');
    for (let i = 0; i < 120 && Prompts.current === ''; i++) step(1);
    release('move_right');
    expect(Prompts.current).toBe('enemy');
    expect(player.globalPosition.x).toBeLessThan(120 + 48 + 12);
  });

  it('is registered, and Zone 1 Act 1 teaches the spin dash, the first enemy and the first loop', async () => {
    expect(LevelTypes.has('hpos://objects/prompt_zone')).toBe(true);
    const root = await loadAct('src/levels/data/z1_retro_rush_hills/act1.json');
    const zones = root.findChildren<PromptZone>((n) => n instanceof PromptZone).sort((a, b) => a.globalPosition.x - b.globalPosition.x);
    expect(zones.map((z) => z.prompt)).toEqual(['spindash', 'enemy', 'speed']);
    expect(zones.map((z) => z.onEntry)).toEqual([false, true, true]);
    // A new player who stops at the foot of the first hill sees the spin-dash line within about a second.
    const p = root.player!;
    p.respawnAt(new Vec2(600, -19));
    step(PROMPT_WAIT_FRAMES + 6);
    expect(Prompts.current).toBe('spindash');
  });

  it('every prompt key has a line for every device, with the jump key from the bindings', () => {
    for (const key of PROMPT_KEYS) for (const device of ['keyboard', 'pad', 'touch'] as const) expect(promptLine(key, device)).not.toBe('');
    expect(promptLine('spindash', 'keyboard')).toBe('HOLD DOWN, TAP Z, LET GO: SPIN DASH');
    expect(promptLine('spindash', 'pad')).toBe('HOLD DOWN, TAP A, LET GO: SPIN DASH');
    expect(promptLine('spindash', 'touch')).toBe('HOLD DOWN, TAP JUMP, LET GO: SPIN DASH');
    expect(promptLine('enemy', 'keyboard')).toContain('ROLL THROUGH');
    expect(promptLine('speed', 'pad')).toBe('KEEP YOUR SPEED');
    expect(promptLine('nope', 'keyboard')).toBe('');
  });
});
