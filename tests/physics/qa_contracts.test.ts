// QA contract checks against docs/CONTRACTS.md, the player, terrain and
// camera parts (port of tests/qa/test_contracts.gd). Method arity is checked
// as far as JavaScript shows it: Function.length counts the parameters before
// the first default, so it is the number of required arguments.

import { describe, it } from 'vitest';
import { GameCamera } from '../../src/camera/game_camera';
import { Layers } from '../../src/core/layers';
import { Player } from '../../src/player/player';
import type { Node } from '../../src/runtime/node';
import { Area2D } from '../../src/runtime/physics';
import { Signal } from '../../src/runtime/signal';
import { Vec2, type Rect2 } from '../../src/runtime/vec2';
import { TerrainLoop } from '../../src/terrain/loop';
import { checked, type Checks } from '../helpers/check';
import { newWorld, step } from '../helpers/world';

const PLAYER_STATES = ['idle', 'run', 'skid', 'jump', 'roll', 'spindash', 'spring', 'hurt', 'dead'];
/** name: max required args (the contract signatures). */
const PLAYER_METHODS: Record<string, number> = {
  isAttacking: 0,
  isInvincible: 0,
  hurt: 1,
  kill: 0,
  bounceOff: 1,
  launch: 1,
  pushGround: 1,
  setControlLock: 1,
  setCollisionPath: 1,
  freeze: 1,
  playPose: 1,
  respawnAt: 1,
};
const PLAYER_PROPERTIES: Record<string, (v: unknown) => boolean> = {
  groundSpeed: (v) => typeof v === 'number',
  velocity: (v) => v instanceof Vec2,
  groundAngle: (v) => typeof v === 'number',
  grounded: (v) => typeof v === 'boolean',
  collisionMode: (v) => Number.isInteger(v),
  state: (v) => typeof v === 'string',
  facing: (v) => Number.isInteger(v),
  clampRect: (v) => !!v && typeof (v as Rect2).hasArea === 'function',
};
const PLAYER_SIGNALS = ['stateChanged', 'hurtTaken', 'died'];
const CAMERA_METHODS: Record<string, number> = {
  setLevelBounds: 1,
  lockTo: 1,
  unlock: 0,
  startAutoscroll: 1,
  stopAutoscroll: 0,
  shake: 2,
};

function checkMethods(c: Checks, obj: object, label: string, methods: Record<string, number>): void {
  for (const [name, maxRequired] of Object.entries(methods)) {
    const fn = (obj as Record<string, unknown>)[name];
    if (typeof fn !== 'function') c.fail(`${label}: missing method ${name}`);
    else c.true(fn.length <= maxRequired, `${label}.${name}: ${fn.length} required args, contract ${maxRequired}`);
  }
}

function findHitboxes(node: Node): Area2D[] {
  const out: Area2D[] = [];
  const walk = (n: Node) => {
    if (n instanceof Area2D && (n.collisionLayer & Layers.PLAYER) !== 0) out.push(n);
    for (const ch of n.children) walk(ch);
  };
  walk(node);
  return out;
}

describe('QA contracts: player, terrain, camera', () => {
  it(
    'player contract',
    checked((c) => {
      const world = newWorld();
      const player = new Player();
      world.addChild(player);
      step(2);
      c.true(player.isInsideTree(), 'player stays in the tree');
      c.true(player.isInGroup('player'), "player must be in group 'player'");
      checkMethods(c, player, 'Player', PLAYER_METHODS);
      c.true(typeof Player.fromArea === 'function' && Player.fromArea.length <= 1, 'static Player.fromArea(area)');
      for (const [name, ok] of Object.entries(PLAYER_PROPERTIES)) c.true(ok((player as unknown as Record<string, unknown>)[name]), `Player.${name} has the contract type`);
      for (const name of PLAYER_SIGNALS) c.true((player as unknown as Record<string, unknown>)[name] instanceof Signal, `Player signal ${name}`);
      c.true(PLAYER_STATES.includes(player.state), `Player.state is '${player.state}', not a contract state`);
      c.true(player.facing === 1 || player.facing === -1, `Player.facing is ${player.facing}, must be 1 or -1`);
      c.true(player.collisionMode >= 0 && player.collisionMode <= 3, `Player.collisionMode is ${player.collisionMode}, must be 0..3`);
      const hitboxes = findHitboxes(player);
      c.true(hitboxes.length > 0, 'Player needs an Area2D hitbox on the player layer');
      if (hitboxes.length > 0) {
        c.eq(Player.fromArea(hitboxes[0]!), player, 'Player.fromArea(own hitbox) must return the player');
        const stranger = new Area2D();
        world.addChild(stranger);
        c.eq(Player.fromArea(stranger), null, 'Player.fromArea(other area) must return null');
      }
    }),
  );

  it(
    'camera contract',
    checked((c) => {
      const world = newWorld();
      const camera = new GameCamera();
      world.addChild(camera);
      step(2);
      c.true(camera.isInsideTree(), 'camera stays in the tree');
      c.true(camera.isInGroup('game_camera'), "camera must be in group 'game_camera'");
      checkMethods(c, camera, 'GameCamera', CAMERA_METHODS);
      c.eq(GameCamera.current(), camera, 'GameCamera.current() must return the live camera');
    }),
  );

  it(
    'the loop and the scattered ticket instantiate',
    checked((c) => {
      const world = newWorld();
      const loop = new TerrainLoop();
      world.addChild(loop);
      step(1);
      c.true(loop.isInsideTree(), 'the loop enters the tree');
      const mods = Object.values(import.meta.glob<{ ScatteredTicket?: new () => Node }>('../../src/player/scattered_ticket.ts', { eager: true }));
      const Ticket = mods[0]?.ScatteredTicket;
      if (Ticket) {
        const t = new Ticket();
        world.addChild(t);
        step(1);
        c.true(t.isInsideTree() || t.isQueuedForDeletion(), 'the scattered ticket instantiates');
      }
    }),
  );
});
