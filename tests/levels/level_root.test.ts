// LevelRoot (port of tests/levels/test_level_root.gd): spawning, the camera
// staying inside the bounds, the backdrop, pits, the death flow and
// respawning at a checkpoint through SceneRouter (docs/CONTRACTS.md, "Levels").

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Tuning } from '../../src/core/tuning';
import { Backdrop, BACKGROUND_SCROLL, installBackdrop } from '../../src/levels/common/backdrop';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { Checkpoint } from '../../src/levels/objects/checkpoint';
import { registerLevelScenes } from '../../src/levels/scenes';
import type { Node2D } from '../../src/runtime/node';
import { tree, VIEW_H, VIEW_W } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { addRect, press, release, releaseAll, step } from '../helpers/world';
import { flushPromises, miniLevel, resetRun } from './level_world';

const height = (): number => Tuning.physics.height_radius;

beforeEach(() => {
  resetRun();
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
  tree.paused = false;
});

afterEach(() => {
  releaseAll();
  tree.paused = false;
});

describe('LevelRoot', () => {
  it('spawns Sproto standing at PlayerStart', () => {
    const level = miniLevel(new Vec2(200, -19));
    const player = level.player!;
    expect(player.isInsideTree()).toBe(true);
    expect(player.isInGroup('player')).toBe(true);
    expect(tree.getNodesInGroup('player').length).toBe(1);
    step(30);
    expect(player.grounded).toBe(true);
    expect(player.globalPosition.x).toBeCloseTo(200, 2);
    expect(player.globalPosition.y).toBeCloseTo(-height(), 2);
  });

  it('lifts a marker on the ground line onto the floor', () => {
    const level = miniLevel(new Vec2(300, 0));
    step(10);
    expect(level.player!.grounded).toBe(true);
    expect(level.player!.globalPosition.y).toBeCloseTo(-height(), 2);
  });

  it('spawns at the checkpoint when one is set', () => {
    GameState.checkpointPosition = new Vec2(900, -19);
    const level = miniLevel(new Vec2(64, -19));
    step(10);
    expect(level.player!.globalPosition.x).toBeCloseTo(900, 2);
    expect(level.player!.grounded).toBe(true);
  });

  it('never shows anything outside the bounds', () => {
    const level = miniLevel();
    const camera = level.camera!;
    expect(camera.isInsideTree()).toBe(true);
    expect(tree.camera).toBe(camera);
    const bounds = level.getBounds();
    for (const action of ['move_right', 'move_left'] as const) {
      press(action);
      for (let i = 0; i < 360; i++) {
        step(1);
        const view = camera.viewRect();
        const out =
          view.x < bounds.x - 0.5 || view.right > bounds.right + 0.5 || view.y < bounds.y - 0.5 || view.bottom > bounds.bottom + 0.5;
        expect(out, `view ${view} left the bounds ${bounds} at frame ${i}`).toBe(false);
      }
      release(action);
    }
    expect(Math.abs(camera.viewRect().center.x - level.player!.globalPosition.x)).toBeLessThan(VIEW_W / 2);
    expect(camera.viewRect().h).toBe(VIEW_H);
  });

  it('adds the parallax backdrop: four layers at the contract scroll scales', () => {
    const saved = LevelHooks.backdrop;
    installBackdrop();
    try {
      const level = miniLevel();
      const backdrop = level.getNodeOrNull('Backdrop');
      expect(backdrop).toBeInstanceOf(Backdrop);
      expect(BACKGROUND_SCROLL).toEqual([0.1, 0.3, 0.6, 0.9]);
      // Each layer scrolls at its scale: moving the camera 100 px moves layer i by -100 * scale.
      const b = backdrop as Backdrop;
      const size = new Vec2(512, 128);
      for (let i = 0; i < 4; i++) {
        const dx = b.layerOrigin(i, new Vec2(100, 0), size).x - b.layerOrigin(i, Vec2.ZERO, size).x;
        expect(dx).toBeCloseTo(-100 * BACKGROUND_SCROLL[i]!, 5);
      }
    } finally {
      LevelHooks.backdrop = saved;
    }
  });

  it('a pit kills once fully below the bounds, then died after ~1 s and one respawn request ~1 s later', () => {
    // A pit from x 400 to 500.
    const level = miniLevel(new Vec2(64, -19), 0, 2000, (root) => {
      const terrain = root.getNode<Node2D>('Terrain');
      for (const c of terrain.children.slice()) c.free();
      addRect(terrain, new Rect2(0, 0, 400, 200));
      addRect(terrain, new Rect2(500, 0, 1500, 200));
      addRect(terrain, new Rect2(-32, -400, 32, 600));
    });
    const player = level.player!;
    const lives = GameState.lives;
    const events: [string, number][] = [];
    player.died.connect(() => events.push(['died', tree.physicsFrames]));
    level.respawnRequested.connect(() => events.push(['respawn', tree.physicsFrames]));
    const kill: number[] = [];
    player.stateChanged.connect((_old, next) => {
      if (next === 'dead' && kill.length === 0) kill.push(tree.physicsFrames, player.globalPosition.y - height());
    });
    player.respawnAt(new Vec2(450, -100));
    for (let i = 0; i < 400 && events.length < 2; i++) step(1);
    expect(kill.length, 'the pit killed him').toBe(2);
    expect(kill[1]!).toBeGreaterThan(level.getBounds().bottom);
    expect(events.map((e) => e[0])).toEqual(['died', 'respawn']);
    expect(Math.abs(events[0]![1] - kill[0]! - 60)).toBeLessThanOrEqual(5);
    expect(Math.abs(events[1]![1] - events[0]![1] - 60)).toBeLessThanOrEqual(10);
    expect(GameState.timerRunning).toBe(false);
    step(120);
    expect(events.length).toBe(2);
    expect(GameState.lives).toBe(lives);
  });

  it('pausing pauses the death wait', () => {
    const level = miniLevel();
    let requests = 0;
    level.respawnRequested.connect(() => requests++);
    level.player!.kill();
    step(70);
    tree.paused = true;
    step(200);
    expect(requests).toBe(0);
    tree.paused = false;
    step(80);
    expect(requests).toBe(1);
  });

  it('a death after the checkpoint respawns there through SceneRouter (life taken, tickets reset, timer resumes)', async () => {
    registerLevelScenes();
    const before = tree.currentScene;
    SceneRouter.startZone('test_zone', 1);
    let level: LevelRoot | null = null;
    for (let i = 0; i < 50 && (tree.currentScene === before || !(tree.currentScene instanceof LevelRoot)); i++) {
      await flushPromises();
      step(1);
    }
    level = tree.currentScene as LevelRoot;
    expect(level).toBeInstanceOf(LevelRoot);
    const checkpoint = level.getNode<Checkpoint>('Objects/Checkpoint');
    GameState.levelTime = 12;
    level.player!.respawnAt(checkpoint.globalPosition.add(new Vec2(-40, 0)));
    level.player!.groundSpeed = 4;
    press('move_right');
    step(30);
    release('move_right');
    expect(checkpoint.isActive()).toBe(true);
    expect(GameState.checkpointPosition?.equals(checkpoint.globalPosition)).toBe(true);
    const checkpointTime = GameState.checkpointTime;
    GameState.addTickets(5);
    const lives = GameState.lives;
    level.player!.kill();
    let reloaded: LevelRoot | null = null;
    for (let i = 0; i < 400 && !reloaded; i++) {
      step(1);
      await flushPromises();
      if (tree.currentScene instanceof LevelRoot && tree.currentScene !== level) reloaded = tree.currentScene;
    }
    expect(reloaded, 'the act reloaded').not.toBeNull();
    step(4);
    const player = reloaded!.player!;
    expect(player.globalPosition.x).toBeCloseTo(checkpoint.globalPosition.x, 2);
    expect(player.grounded).toBe(true);
    expect(GameState.lives).toBe(lives - 1);
    expect(GameState.tickets).toBe(0);
    expect(GameState.checkpointPosition?.equals(checkpoint.globalPosition)).toBe(true);
    expect(GameState.levelTime).toBeGreaterThanOrEqual(checkpointTime);
    expect(GameState.levelTime).toBeLessThan(checkpointTime + 0.3);
    expect(GameState.timerRunning).toBe(true);
    expect(reloaded!.getNode<Checkpoint>('Objects/Checkpoint').isActive()).toBe(true);
    reloaded!.useSceneRouter = false;
    SceneRouter.zoneId = '';
  });
});
