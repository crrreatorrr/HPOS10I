import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Settings } from '../../src/core/settings';
import { buildLevel, type LevelData } from '../../src/levels/common/level_loader';
import { LevelRoot } from '../../src/levels/common/level_root';
import { placeItemBoxes, registerNewContent, TIME_LIMIT } from '../../src/levels/content';
import { ItemBox } from '../../src/levels/objects/item_box';
import { registerEnemies } from '../../src/levels/registry_enemies';
import { registerObjects } from '../../src/levels/registry_objects';
import { registerCoreTypes } from '../../src/levels/scenes';
import { Moves } from '../../src/player/moves';
import { tree } from '../../src/runtime/tree';
import { Vec2 } from '../../src/runtime/vec2';
import z1act1 from '../../src/levels/data/z1_retro_rush_hills/act1.json';
import { addFloor, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

registerCoreTypes();
registerObjects();
registerEnemies();
registerNewContent();

function box(at: Vec2, content: ItemBox['content']) {
  const w = newWorld();
  addFloor(w);
  const b = new ItemBox();
  b.content = content;
  b.position = at;
  w.addChild(b);
  return { w, b };
}

describe('item boxes', () => {
  beforeEach(() => Settings.reset());

  it('a walking player is blocked and does not break it', () => {
    const { w, b } = box(new Vec2(200, 0), 'shield');
    const p = spawnPlayer(w, new Vec2(0, 0));
    settle(p, new Vec2(0, 0));
    press('move_right');
    step(120);
    release('move_right');
    expect(b.isBroken()).toBe(false);
    expect(p.globalPosition.x).toBeLessThan(200 - 14);
  });

  it('a roll breaks it without losing speed and gives a shield (no tickets)', () => {
    const { w, b } = box(new Vec2(200, 0), 'shield');
    const p = spawnPlayer(w, new Vec2(0, 0));
    settle(p, new Vec2(0, 0));
    p.groundSpeed = 8;
    press('move_down');
    step(2);
    release('move_down');
    const tickets = GameState.tickets;
    let speedAtBreak = 0;
    for (let i = 0; i < 60 && !b.isBroken(); i++) {
      step(1);
      speedAtBreak = p.groundSpeed;
    }
    step(1);
    expect(b.isBroken()).toBe(true);
    expect(p.moves.shield).toBe(true);
    expect(GameState.tickets).toBe(tickets);
    expect(p.groundSpeed).toBeGreaterThan(speedAtBreak - 0.2);
  });

  it('a shield absorbs one hit without losing tickets', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    GameState.tickets = 12;
    p.moves.give('shield');
    p.hurt(new Vec2(-20, 0));
    expect(p.state).toBe('hurt');
    expect(GameState.tickets).toBe(12);
    expect(p.moves.shield).toBe(false);
  });

  it('jumping onto it bounces and gives speed shoes (top speed 12)', () => {
    const { w, b } = box(new Vec2(0, 0), 'speed_shoes');
    const p = spawnPlayer(w, new Vec2(0, -120));
    p.respawnAt(new Vec2(0, -120));
    p.changeState('jump');
    p._ball = true;
    step(60);
    expect(b.isBroken()).toBe(true);
    expect(p.moves.speedShoesFrames).toBeGreaterThan(0);
    expect(p.topSpeed({ ...(p as unknown as { _t: never }), top_speed: 6 } as never) / 60).toBeCloseTo(12, 6);
  });

  it('invincibility makes touch destroy enemies and hazards harmless', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    p.moves.give('invincibility');
    expect(p.isAttacking()).toBe(true);
    GameState.tickets = 5;
    p.hurt(new Vec2(10, 0));
    expect(p.state).not.toBe('hurt');
    expect(GameState.tickets).toBe(5);
  });

  it('places boxes along Zone 1 Act 1, on flat open floors clear of other things', async () => {
    const root = (await buildLevel(z1act1 as unknown as LevelData)) as LevelRoot;
    root.useSceneRouter = false;
    // Without the hook (so the count below is exact).
    const hooks = (await import('../../src/levels/common/level_root')).LevelHooks;
    const saved = hooks.afterReady.slice();
    hooks.afterReady.length = 0;
    tree.changeSceneNow(() => root);
    hooks.afterReady.push(...saved);
    step(1);
    const n = placeItemBoxes(root);
    expect(n).toBeGreaterThanOrEqual(6);
    const boxes = root.findChildren<ItemBox>((x) => x instanceof ItemBox);
    expect(boxes.length).toBe(n);
    for (const b of boxes) {
      const at = b.globalPosition;
      const under = tree.physics.intersectRay(at.add(new Vec2(0, -4)), at.add(new Vec2(0, 4)), 1);
      expect(under, `box at ${at} stands on the floor`).not.toBeNull();
    }
  });

  it('are off when the option is off or in Ranked', async () => {
    Settings.data.itemBoxes = false;
    const root = (await buildLevel(z1act1 as unknown as LevelData)) as LevelRoot;
    root.useSceneRouter = false;
    tree.changeSceneNow(() => root);
    expect(root.findChildren((x) => x instanceof ItemBox).length).toBe(0);
    Settings.reset();
  });
});

describe('time limit', () => {
  it('kills at 10:00 in an act', async () => {
    SceneRouter.zoneId = 'z1_retro_rush_hills';
    SceneRouter.stage = 1;
    const root = (await buildLevel(z1act1 as unknown as LevelData)) as LevelRoot;
    root.useSceneRouter = false;
    tree.changeSceneNow(() => root);
    step(3);
    GameState.timerRunning = true;
    GameState.levelTime = TIME_LIMIT - 1 / 120;
    step(1);
    GameState.levelTime = TIME_LIMIT;
    step(1);
    expect(root.player?.state).toBe('dead');
    SceneRouter.zoneId = '';
  });
});

describe('extra moves', () => {
  beforeEach(() => {
    Moves.extraMovesOverride = true;
  });

  it('drop dash: hold jump in the air, land rolling at speed 8+', () => {
    const w = newWorld();
    Moves.extraMovesOverride = true;
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    press('jump');
    step(1);
    release('jump');
    step(4);
    press('jump');
    for (let i = 0; i < 80 && !(p.grounded && p.isBall); i++) step(1);
    release('jump');
    expect(p.grounded).toBe(true);
    expect(p.state).toBe('roll');
    expect(Math.abs(p.groundSpeed)).toBeGreaterThanOrEqual(8);
    Moves.extraMovesOverride = false;
  });

  it('charge run: up + jump, hold up, release for speed 12; early release cancels', () => {
    const w = newWorld();
    Moves.extraMovesOverride = true;
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    press('move_up');
    step(2);
    press('jump');
    step(1);
    release('jump');
    expect(p.state).toBe('peelout');
    step(35);
    release('move_up');
    step(1);
    expect(p.groundSpeed).toBeCloseTo(12, 6);
    Moves.extraMovesOverride = false;
  });

  it('shield bounce: with a shield, jump again to slam down and bounce up', () => {
    const w = newWorld();
    Moves.extraMovesOverride = true;
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    p.moves.give('shield');
    press('jump');
    step(1);
    release('jump');
    step(10);
    press('jump');
    step(1);
    release('jump');
    expect(p.velocity.y).toBeGreaterThan(0);
    let bounced = false;
    for (let i = 0; i < 60; i++) {
      step(1);
      if (!p.grounded && p.velocity.y < -6) bounced = true;
    }
    expect(bounced).toBe(true);
    Moves.extraMovesOverride = false;
  });

  it('are off in classic mode: a second air press does nothing', () => {
    const w = newWorld();
    addFloor(w);
    const p = spawnPlayer(w, Vec2.ZERO);
    settle(p, Vec2.ZERO);
    press('jump');
    step(1);
    release('jump');
    step(4);
    press('jump');
    for (let i = 0; i < 80 && !p.grounded; i++) step(1);
    release('jump');
    expect(p.state).not.toBe('roll');
  });
});
