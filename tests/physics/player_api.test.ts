// The rest of the Player contract: springs, boosters, control lock, paths,
// freeze, poses, respawn, clampRect and the hitbox.
//
// The accessory and blink cases need the player visuals (another port): they
// run only when src/player/visuals_setup.ts exists and builds a 'Visual' child.

import { afterEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { Layers } from '../../src/core/layers';
import { SceneRouter } from '../../src/core/scene_router';
import { Tuning } from '../../src/core/tuning';
import { PATH_B, Player, type PlayerState } from '../../src/player/player';
import type { Node, Node2D } from '../../src/runtime/node';
import { Area2D } from '../../src/runtime/physics';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { addFloor, addRect, feetY, newWorld, press, release, releaseAll, settle, spawnPlayer, step } from '../helpers/world';

type VisualsModule = { installPlayerVisuals?: () => void };
const visualsModules = Object.values(import.meta.glob<VisualsModule>('../../src/player/visuals_setup.ts', { eager: true }));
for (const mod of visualsModules) mod.installPlayerVisuals?.();
const HAS_VISUALS = visualsModules.length > 0;

let world: Node2D;
let player: Player;

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

function child(node: Node, name: string): Node | null {
  return node.children.find((n) => n.name === name) ?? null;
}

describe('player API', () => {
  it(
    'fromArea',
    checked((c) => {
      flat();
      c.eq(Player.fromArea(player.hitbox), player, 'hitbox maps to the player');
      const other = new Area2D();
      world.addChild(other);
      c.eq(Player.fromArea(other), null, 'other areas map to null');
      c.eq(Player.fromArea(null), null, 'null is safe');
      c.eq(player.hitbox.collisionLayer, Layers.PLAYER, 'hitbox on the player layer');
      c.true(player.isInGroup('player'), 'in group player');
    }),
  );

  it(
    'stateChanged signal',
    checked((c) => {
      flat();
      const changes: [PlayerState, PlayerState][] = [];
      player.stateChanged.connect((old, next) => changes.push([old, next]));
      press('move_right');
      step(2);
      c.eq(changes.length, 1, 'one change');
      c.eq(changes[0]?.join(), 'idle,run', 'idle -> run');
    }),
  );

  it(
    'launch is a spring, not a jump',
    checked((c) => {
      flat();
      player.launch(new Vec2(0, -10));
      c.eq(player.state, 'spring', 'spring state');
      c.true(!player.isAttacking(), 'springs do not attack');
      step(1);
      c.near(player.velocity.y, -10 + 0.21875, 1e-6, 'no jump-release cut (jump not held)');
      for (let i = 0; i < 200; i++) {
        step(1);
        if (player.grounded) break;
      }
      c.true(player.grounded, 'landed');
      c.eq(player.state, 'idle', 'spring state ends on landing');
    }),
  );

  it(
    'pushGround locks control',
    checked((c) => {
      flat();
      player.pushGround(10, 16);
      c.near(player.groundSpeed, 10, 1e-6, 'pushed');
      c.eq(player.controlLock, 16, 'locked');
      press('move_left');
      step(10);
      c.near(player.groundSpeed, 10 - 10 * 0.046875, 1e-6, 'input ignored (friction only)');
      step(10);
      c.true(player.groundSpeed < 10 - 20 * 0.046875 - 1, 'control back after the lock');
    }),
  );

  it(
    'collision path selects terrain',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(100, -100, 40, 100), Layers.TERRAIN_PATH_A);
      addRect(world, new Rect2(300, -100, 40, 100), Layers.TERRAIN_PATH_B);
      player = spawnPlayer(world, Vec2.ZERO);
      settle(player, Vec2.ZERO);
      player.groundSpeed = 4;
      step(60);
      c.near(player.globalPosition.x, 90, 0.01, 'path A wall blocks on path A');
      player.setCollisionPath(PATH_B);
      player.groundSpeed = 6;
      step(120);
      c.near(player.globalPosition.x, 290, 0.01, 'passed the A wall, stopped by the B wall');
    }),
  );

  it(
    'freeze',
    checked((c) => {
      flat();
      player.groundSpeed = 5;
      player.freeze(true);
      const x = player.globalPosition.x;
      press('move_right');
      step(20);
      c.eq(player.globalPosition.x, x, 'frozen in place');
      player.playPose('victory');
      c.eq(player.pose, 'victory', 'pose shown');
      player.freeze(false);
      step(5);
      c.true(player.globalPosition.x > x, 'moves again');
    }),
  );

  it(
    'respawnAt resets',
    checked((c) => {
      flat();
      player.kill();
      player.respawnAt(new Vec2(50, -19));
      c.eq(player.state, 'idle', 'idle');
      c.true(!player.isInvincible(), 'not invincible');
      step(2);
      c.true(player.grounded, 'on the floor');
      c.near(player.globalPosition.x, 50, 0.01, 'at the new spot');
    }),
  );

  it(
    'clampRect pushes and crushes',
    checked((c) => {
      world = newWorld();
      addFloor(world);
      addRect(world, new Rect2(200, -100, 40, 100));
      player = spawnPlayer(world, new Vec2(100, 0));
      settle(player, new Vec2(100, 0));
      player.clampRect = new Rect2(120, -300, 400, 400);
      step(1);
      c.near(player.globalPosition.x, 120 + Tuning.physics.width_radius, 0.01, 'pushed by the left edge');
      c.true(player.state !== 'dead', 'alive');
      for (let i = 0; i < 100; i++) {
        const r = player.clampRect;
        player.clampRect = new Rect2(r.x + 2, r.y, r.w, r.h);
        step(1);
        if (player.state === 'dead') break;
      }
      c.eq(player.state, 'dead', 'crushed against the wall');
    }),
  );

  it(
    'kill and the died signal',
    checked((c) => {
      flat();
      let died = 0;
      player.died.connect(() => (died += 1));
      player.kill();
      c.eq(player.state, 'dead', 'dead');
      step(70);
      c.eq(died, 1, 'died once');
      player.kill();
      c.eq(died, 1, 'kill while dead does nothing');
    }),
  );

  it.skipIf(!HAS_VISUALS)(
    'accessory follows the zone',
    checked((c) => {
      const oldZone = SceneRouter.zoneId;
      SceneRouter.zoneId = 'z2_wizard_academy';
      flat();
      type Accessory = Node2D & { accessory: string; refresh(): void };
      const visual = child(player, 'Visual');
      const accessory = (visual ? child(visual, 'Accessory') : null) as Accessory | null;
      c.true(accessory !== null, 'has an accessory node');
      if (!accessory) return;
      c.eq(accessory.accessory, 'wizard_hat', 'wizard hat in the wizard zone');
      SceneRouter.zoneId = 'z3_capital_mansion';
      accessory.refresh();
      c.eq(accessory.accessory, 'sunglasses', 'sunglasses in the mansion zone');
      SceneRouter.zoneId = oldZone;
      accessory.refresh();
      c.eq(accessory.accessory, '', 'none elsewhere');
      c.true(!accessory.visible, 'hidden when there is no accessory');
    }),
  );

  it(
    'respawnAt from a ball is exact',
    checked((c) => {
      flat();
      player.groundSpeed = 4;
      press('move_down');
      step(1);
      release('move_down');
      c.eq(player.state, 'roll', 'rolling');
      player.respawnAt(new Vec2(300, -19));
      c.true(player.globalPosition.equals(new Vec2(300, -19)), `exact after a roll (${player.globalPosition})`);
      // The respawned player is airborne for one tick before he lands; the
      // Godot harness's press landed on the second tick, after landing.
      step(1);
      press('jump');
      step(2);
      c.eq(player.state, 'jump', 'jumping');
      player.respawnAt(new Vec2(200, -19));
      c.true(player.globalPosition.equals(new Vec2(200, -19)), `exact after a jump (${player.globalPosition})`);
      step(2);
      c.true(player.grounded, 'on the floor');
      c.near(feetY(player), 0, 0.05, 'feet on the floor');
    }),
  );

  it.skipIf(!HAS_VISUALS)(
    'invincibility blink follows physics ticks',
    checked((c) => {
      flat();
      GameState.addTickets(1);
      player.hurt(player.globalPosition.add(new Vec2(-20, 0)));
      const visual = child(player, 'Visual') as Node2D | null;
      c.true(visual !== null, 'has a visual');
      if (!visual) return;
      const pattern: boolean[] = [];
      for (let i = 0; i < 16; i++) {
        step(1);
        // Extra render frames between ticks (a 144 Hz display) change nothing.
        visual.process(1 / 144);
        const seen = visual.visible;
        visual.process(1 / 144);
        visual.process(1 / 144);
        c.eq(visual.visible, seen, `tick ${i}: same at any refresh rate`);
        pattern.push(seen);
      }
      c.true(pattern.includes(true) && pattern.includes(false), 'blinks');
    }),
  );
});
