// Sanity checks for the core singletons (port of tests/core/test_core.gd):
// physics constants and units, GameState, SceneRouter, Difficulty,
// ZoneRegistry, Emeralds, input actions and timelines. Godot-only checks
// (project layer names, display stretch, the boot menu scene, the export
// presets, InputMap focus-out handling) have no counterpart in the runtime.

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTimeline } from '../../src/core/dev';
import { Difficulty } from '../../src/core/difficulty';
import { Emeralds } from '../../src/core/emeralds';
import { GameState, START_LIVES } from '../../src/core/game_state';
import { Layers } from '../../src/core/layers';
import { accel, defaultPhysics, frames, speed } from '../../src/core/physics_constants';
import { SceneRouter } from '../../src/core/scene_router';
import { GAME_OVER_SCENE, MAIN_SCENE, MENU_SCENES, Scenes, TITLE_SCENE } from '../../src/core/scenes';
import { Tuning } from '../../src/core/tuning';
import { ZoneRegistry, ZONES } from '../../src/core/zone_registry';
import { ACTIONS, PAD_AXES } from '../../src/runtime/input';
import { Node } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { checked } from '../helpers/check';

/** A dummy scene that remembers which id built it. */
class Dummy extends Node {
  constructor(readonly sceneId: string) {
    super(`Dummy:${sceneId}`);
  }
}

const Z1 = 'z1_retro_rush_hills';
const Z2 = 'z2_wizard_academy';

/** Registers dummy scenes for the menus and Zone 1 (acts and boss). */
function registerDummies(): void {
  for (const id of [MAIN_SCENE, TITLE_SCENE, GAME_OVER_SCENE, ...ZoneRegistry.getZone(Z1)!.acts, ZoneRegistry.getZone(Z1)!.boss]) {
    Scenes.register(id, () => new Dummy(id));
  }
}

/** Flushes pending scene changes (they apply at the end of a tick). */
function flush(): void {
  tree.physicsStep();
}

function sceneId(): string {
  return tree.currentScene instanceof Dummy ? tree.currentScene.sceneId : '';
}

beforeEach(() => {
  GameState.resetGame();
  GameState.clearEmeralds();
  flush();
});

afterEach(() => {
  GameState.resetGame();
});

describe('physics constants', () => {
  it(
    'match the Guide',
    checked((c) => {
      const p = defaultPhysics();
      c.eq(p.acceleration, 0.046875, 'acceleration');
      c.eq(p.deceleration, 0.5, 'deceleration');
      c.eq(p.friction, 0.046875, 'friction');
      c.eq(p.top_speed, 6, 'top speed');
      c.eq(p.air_acceleration, 0.09375, 'air acceleration');
      c.eq(p.gravity, 0.21875, 'gravity');
      c.eq(p.jump_force, 6.5, 'jump force');
      c.eq(p.jump_release_speed, 4, 'jump release');
      c.eq(p.slope_factor_normal, 0.125, 'slope factor');
      c.eq(p.slope_factor_roll_up, 0.078125, 'roll uphill');
      c.eq(p.slope_factor_roll_down, 0.3125, 'roll downhill');
      c.eq(p.roll_friction, 0.0234375, 'roll friction');
      c.eq(p.roll_deceleration, 0.125, 'roll deceleration');
    }),
  );

  it(
    'unit conversion',
    checked((c) => {
      c.eq(speed(6), 360, 'top speed px/s');
      c.eq(accel(0.21875), 787.5, 'gravity px/s^2');
      c.eq(frames(120), 2, '120 frames');
    }),
  );

  it(
    'Tuning holds a live copy that resets to the shipped values',
    checked((c) => {
      Tuning.physics.top_speed = 9;
      c.eq(defaultPhysics().top_speed, 6, 'the defaults are not edited through Tuning');
      Tuning.reset();
      c.eq(Tuning.physics.top_speed, 6, 'reset restores them');
    }),
  );

  it(
    'collision layer bits follow the contract',
    checked((c) => {
      const expected: [number, number][] = [
        [Layers.TERRAIN_SOLID, 1],
        [Layers.TERRAIN_PATH_A, 2],
        [Layers.TERRAIN_PATH_B, 3],
        [Layers.TERRAIN_TOP_ONLY, 4],
        [Layers.PLAYER, 5],
        [Layers.ENEMIES, 6],
        [Layers.OBJECTS, 7],
        [Layers.HAZARDS, 8],
        [Layers.BOSS, 9],
      ];
      for (const [bit, index] of expected) c.eq(bit, 1 << (index - 1), `layer ${index}`);
    }),
  );
});

describe('input', () => {
  it(
    'has the game actions',
    checked((c) => {
      for (const a of ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'pause', 'debug_overlay']) c.true((ACTIONS as readonly string[]).includes(a), `missing input action ${a}`);
    }),
  );

  it(
    'stick diagonals read as horizontal',
    checked((c) => {
      c.true(PAD_AXES.move_down![2] > 0.71, '45-degree push must not press down');
      c.true(PAD_AXES.move_up![2] > 0.71, '45-degree push must not press up');
      c.true(PAD_AXES.move_right![2] < 0.71, '45-degree push still runs');
    }),
  );

  it(
    'an input timeline parses',
    checked((c) => {
      const events = parseTimeline(JSON.parse(readFileSync(new URL('../inputs/run_right.json', import.meta.url), 'utf8')));
      c.true(events.length >= 2, 'timeline has events');
      c.eq(events[0]?.[1], 'move_right', 'first action');
    }),
  );

  it(
    'bad timeline events are skipped',
    checked((c) => {
      const events = parseTimeline({ events: [[0, 'jump', true], ['oops'], [5, 'jump', false]] });
      c.eq(events.length, 2, 'the malformed event is skipped');
      c.eq(events[1]?.[0], 5, 'second event frame');
    }),
  );
});

describe('zones', () => {
  it(
    'stage order',
    checked((c) => {
      const z1 = ZoneRegistry.getZone(Z1)!;
      c.eq(ZoneRegistry.stagePath(Z1, 1), z1.acts[0], 'act 1');
      c.eq(ZoneRegistry.stagePath(Z1, 1), 'level:z1_retro_rush_hills/act1', 'act 1 scene id');
      c.eq(ZoneRegistry.stagePath(Z1, 3), 'boss:rug_pull', 'the boss arena after the acts');
      c.eq(ZoneRegistry.stagePath(Z1, 4), '', 'nothing after the boss');
      c.eq(ZoneRegistry.nextZoneId(Z1), Z2, 'next zone');
      c.eq(ZoneRegistry.nextZoneId('z4_neon_rush_remix'), '', 'no zone after the last');
      c.eq(ZoneRegistry.getZone(Z2)?.accessory, 'wizard_hat', 'zone 2 accessory');
      c.eq(ZoneRegistry.getZone('z3_capital_mansion')?.accessory, 'sunglasses', 'zone 3 accessory');
    }),
  );

  it(
    'release state',
    checked((c) => {
      c.true(ZoneRegistry.isReleased(Z1), 'Zone 1 released');
      c.true(ZoneRegistry.isReleased('test_zone'), 'the test zone is always open');
      c.true(ZoneRegistry.isReleased('z3_capital_mansion') && ZoneRegistry.isReleased('z4_neon_rush_remix'), 'Zones 3 and 4 released');
      c.true(!ZoneRegistry.isReleased('z9_unknown'), 'unknown zones are not');
    }),
  );
});

describe('difficulty', () => {
  it(
    'rises through the game',
    checked((c) => {
      const order: [string, number][] = [
        ['test_zone', 1],
        [Z1, 1],
        [Z1, 2],
        [Z2, 1],
        [Z2, 2],
        ['z3_capital_mansion', 1],
        ['z3_capital_mansion', 2],
        ['z4_neon_rush_remix', 1],
        ['z4_neon_rush_remix', 2],
      ];
      let previous = -1;
      for (const [zone, act] of order) {
        const d = Difficulty.forStage(zone, act);
        c.true(d > previous, `${zone} act ${act} should be harder than the act before`);
        previous = d;
      }
      c.eq(Difficulty.forStage(Z2, 3), Difficulty.BOSSES[Z2]!.d, "the boss stage uses the boss's own difficulty");
      c.eq(Difficulty.forStage('', 1), Difficulty.DEFAULT, 'playgrounds use the default');
    }),
  );

  it(
    'targets never get easier',
    checked((c) => {
      for (let d = 1; d <= Difficulty.MAX; d++) {
        const a = Difficulty.targets(d - 1);
        const b = Difficulty.targets(d);
        c.true(b.enemies_per_screen >= a.enemies_per_screen, `enemy density at D${d}`);
        c.true(b.direction >= a.direction, `direction difficulty at D${d}`);
        c.true(b.screens >= a.screens, `length at D${d}`);
        c.true(b.tickets_per_screen <= a.tickets_per_screen, `ticket generosity at D${d}`);
        c.eq(
          Object.values(b.tiers).reduce((s, v) => s + v, 0),
          100,
          `tier mix at D${d} adds to 100`,
        );
      }
    }),
  );

  it(
    'multipliers',
    checked((c) => {
      c.eq(Difficulty.speedMult(1), 1, 'D1 speed');
      c.near(Difficulty.speedMult(8), 1.42, 0.001, 'D8 speed');
      c.near(Difficulty.intervalMult(8), 0.65, 0.001, 'D8 interval');
      c.eq(Difficulty.speedMult(0), 1, 'test zone is not easier than D1 for enemies');
      c.eq(Difficulty.telegraph(0.4, 8), Difficulty.MIN_TELEGRAPH, 'telegraph floor');
      c.near(Difficulty.telegraph(1, 8), 0.72, 0.001, 'D8 telegraph');
    }),
  );

  it(
    'ramps up within each act',
    checked((c) => {
      c.near(Difficulty.ramp(0, false), -0.5, 0.001, 'easier opening');
      c.eq(Difficulty.ramp(0.5, false), 0, "middle is the act's own difficulty");
      c.near(Difficulty.ramp(1, false), 0.75, 0.001, 'harder finale');
      c.near(Difficulty.ramp(1, true), 1.5, 0.001, 'steepest before a boss');
      let previous = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const value = Difficulty.ramp(i / 20, true);
        c.true(value >= previous, `never gets easier as the act goes on (at ${i * 5}%)`);
        previous = value;
      }
      c.true(Difficulty.isPreBossAct(Z1, 2), 'Z1 act 2 leads to the boss');
      c.true(!Difficulty.isPreBossAct(Z1, 1), "Z1 act 1 doesn't");
      c.true(!Difficulty.isPreBossAct('test_zone', 1), 'the test zone has no boss');
      c.true(Difficulty.speedMult(0.75 + 8) > Difficulty.speedMult(8), "a pre-boss finale is faster than the act's middle");
    }),
  );

  it(
    'the last two bosses are the hardest',
    checked((c) => {
      let previous: ReturnType<typeof Difficulty.boss> = null;
      for (const zoneId of [Z1, Z2, 'z3_capital_mansion', 'z4_neon_rush_remix']) {
        const boss = Difficulty.boss(zoneId);
        c.true(boss !== null, `${zoneId} has boss tuning`);
        if (boss && previous) {
          c.true(boss.d > previous.d, `${zoneId} boss harder than the one before`);
          c.true(boss.weak_window <= previous.weak_window, `${zoneId} weak window not longer`);
          c.true(boss.attacks_per_cycle >= previous.attacks_per_cycle, `${zoneId} attack chain not shorter`);
        }
        previous = boss;
      }
      for (const zoneId of ['z3_capital_mansion', 'z4_neon_rush_remix']) {
        const hard = Difficulty.boss(zoneId)!;
        c.true(hard.d > Difficulty.MAX - 1, `${zoneId} boss is harder than its zone's acts`);
        c.true(hard.desperation, `${zoneId} has a desperation phase`);
        c.true(hard.ticket_refills <= 1, `${zoneId} gives almost no tickets`);
        c.true(Difficulty.telegraph(hard.telegraph, hard.d) >= Difficulty.MIN_TELEGRAPH, `${zoneId} still telegraphs every attack`);
      }
    }),
  );
});

describe('emeralds and GameState', () => {
  it(
    'one emerald per zone act',
    checked((c) => {
      c.eq(Emeralds.total(), 2 * ZONES.length, 'every act of every zone');
      c.eq(Emeralds.total(), 8, '4 zones x 2 acts');
      c.true(Emeralds.isEmeraldAct(Z1, 1), 'Z1 act 1 has one');
      c.true(Emeralds.isEmeraldAct('z4_neon_rush_remix', 2), 'Z4 act 2 has one');
      c.true(!Emeralds.isEmeraldAct(Z1, 3), 'the boss arena has none');
      c.true(!Emeralds.isEmeraldAct('test_zone', 1), 'the test zone has none');
      c.true(!Emeralds.isEmeraldAct('', 1), 'no zone, none');
    }),
  );

  it(
    'completing a level wins the act emerald once',
    checked((c) => {
      const won: string[] = [];
      const onWon = (zoneId: string, act: number) => won.push(Emeralds.key(zoneId, act));
      GameState.emeraldWon.connect(onWon);
      GameState.startLevel(Z2, 2);
      GameState.completeLevel();
      c.true(GameState.emeraldJustWon, 'first clear wins it');
      c.true(GameState.hasEmerald(Z2, 2), 'kept');
      c.eq(GameState.emeraldCount(), 1, 'count');
      GameState.startLevel(Z2, 2);
      GameState.completeLevel();
      c.true(!GameState.emeraldJustWon, "a replay doesn't win it again");
      GameState.startLevel('test_zone', 1);
      GameState.completeLevel();
      c.true(!GameState.emeraldJustWon, 'the test zone gives none');
      c.eq(won.join(), 'z2_wizard_academy:2', 'one signal');
      GameState.emeraldWon.disconnect(onWon);
      GameState.resetGame();
      c.eq(GameState.emeraldCount(), 1, 'a new run keeps the emeralds won on this save (HPOS-DEC-02)');
      GameState.clearEmeralds();
      c.eq(GameState.emeraldCount(), 0, 'clearEmeralds forgets them');
    }),
  );

  it(
    'tickets, lives and the level timer',
    checked((c) => {
      GameState.startLevel(Z1, 1);
      c.true(GameState.timerRunning, 'the timer runs from the act start');
      GameState.tick(1);
      c.eq(GameState.levelTime, 1, 'counted on ticks');
      GameState.addTickets(99);
      c.eq(GameState.lives, START_LIVES, 'no life at 99');
      GameState.addTickets(1);
      c.eq(GameState.lives, START_LIVES + 1, 'a life at 100 tickets');
      c.eq(GameState.loseTickets(), 100, 'all tickets lost');
      c.eq(GameState.tickets, 0, 'none left');
      GameState.addTickets(100);
      c.eq(GameState.lives, START_LIVES + 1, 'the 100 life is once per act');
      GameState.completeLevel();
      c.true(!GameState.timerRunning, 'the goal stops the timer');
    }),
  );
});

describe('SceneRouter', () => {
  beforeEach(() => {
    registerDummies();
    flush();
  });

  it(
    'menus are not gameplay',
    checked((c) => {
      c.true(MENU_SCENES.includes(MAIN_SCENE), 'main is a menu');
      c.true(MENU_SCENES.includes(TITLE_SCENE), 'title is a menu');
      SceneRouter.goTitle();
      flush();
      c.eq(SceneRouter.currentId, TITLE_SCENE, 'on the title');
      c.true(!SceneRouter.inGameplay(), 'the title is not gameplay');
    }),
  );

  it(
    'openScene rejects missing scenes',
    checked((c) => {
      const before = tree.currentScene;
      const errors: unknown[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        SceneRouter.openScene('level:does/not/exist');
        flush();
        tree.processStep(1 / 60);
      } finally {
        console.error = original;
      }
      c.eq(tree.currentScene, before, 'no scene change');
      c.eq(errors.length, 1, 'one error logged');
    }),
  );

  it(
    'startZone goes through the acts, the boss and on',
    checked((c) => {
      const started: string[] = [];
      const onStage = (zone: string, stage: number) => started.push(`${zone}:${stage}`);
      SceneRouter.stageStarted.connect(onStage);
      SceneRouter.startZone(Z1, 1);
      flush();
      c.eq(sceneId(), 'level:z1_retro_rush_hills/act1', 'act 1 loaded');
      c.eq(SceneRouter.currentId, 'level:z1_retro_rush_hills/act1', 'currentId');
      c.true(SceneRouter.inGameplay(), 'in gameplay');
      c.eq(GameState.zoneId, Z1, 'GameState zone');
      c.eq(GameState.act, 1, 'GameState act');
      SceneRouter.nextStage();
      flush();
      c.eq(sceneId(), 'level:z1_retro_rush_hills/act2', 'act 2');
      SceneRouter.nextStage();
      flush();
      c.eq(sceneId(), 'boss:rug_pull', 'the boss arena');
      SceneRouter.nextStage();
      flush();
      // Zone 2 has no scene registered here: the ending is missing too, so the title.
      c.eq(sceneId(), TITLE_SCENE, 'no next zone built: back to the title');
      c.eq(started.join(), 'z1_retro_rush_hills:1,z1_retro_rush_hills:2,z1_retro_rush_hills:3', 'stageStarted per stage');
      SceneRouter.stageStarted.disconnect(onStage);
    }),
  );

  it(
    'only the first scene change of a frame is taken',
    checked((c) => {
      SceneRouter.startZone(Z1, 1);
      flush();
      const logs: unknown[] = [];
      const original = console.info;
      console.info = (...args: unknown[]) => logs.push(args);
      try {
        // A goal and a death on the same tick: the first request wins.
        SceneRouter.nextStage();
        SceneRouter.respawn();
        flush();
      } finally {
        console.info = original;
      }
      c.eq(sceneId(), 'level:z1_retro_rush_hills/act2', 'the first request (next stage) wins');
      c.eq(GameState.lives, START_LIVES, 'the ignored respawn took no life');
      c.eq(logs.length, 1, 'the ignored request is logged');
      // The next frame takes requests again.
      SceneRouter.respawn();
      flush();
      c.eq(GameState.lives, START_LIVES - 1, 'a later respawn takes a life');
      c.eq(sceneId(), 'level:z1_retro_rush_hills/act2', 'and reloads the act');
    }),
  );

  it(
    'respawn with no lives left is game over',
    checked((c) => {
      SceneRouter.startZone(Z1, 1);
      flush();
      GameState.lives = 1;
      SceneRouter.respawn();
      flush();
      c.eq(sceneId(), GAME_OVER_SCENE, 'game over');
      c.eq(GameState.lives, 0, 'no lives');
    }),
  );

  it(
    'an unbuilt stage falls back to the dev menu',
    checked((c) => {
      const warnings: unknown[] = [];
      const original = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);
      try {
        SceneRouter.startZone(Z2, 1);
        flush();
      } finally {
        console.warn = original;
      }
      c.eq(sceneId(), MAIN_SCENE, 'main');
      c.eq(warnings.length, 1, 'warned');
    }),
  );

  it('restart keeps the lives', () => {
    SceneRouter.startZone(Z1, 2);
    flush();
    GameState.tickets = 12;
    SceneRouter.restart();
    flush();
    expect(sceneId()).toBe('level:z1_retro_rush_hills/act2');
    expect(GameState.lives).toBe(START_LIVES);
    expect(GameState.tickets).toBe(0);
  });
});
