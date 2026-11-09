import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Audio } from '../../src/core/audio';
import { Emeralds } from '../../src/core/emeralds';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Scenes } from '../../src/core/scenes';
import { Settings } from '../../src/core/settings';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { HubClient } from '../../src/hub/hub_client';
import { RelicLoadout } from '../../src/hub/relic_loadout';
import { LevelHooks, LevelRoot } from '../../src/levels/common/level_root';
import { Gfx } from '../../src/runtime/gfx';
import { Input, KEY_BINDINGS, type Action } from '../../src/runtime/input';
import { Node, Node2D } from '../../src/runtime/node';
import { Transform2D } from '../../src/runtime/transform';
import { tree } from '../../src/runtime/tree';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { InputHints } from '../../src/ui/common/input_hints';
import { MenuList, REPEAT_DELAY } from '../../src/ui/common/menu';
import { DevMenu } from '../../src/ui/dev_menu';
import { Display } from '../../src/ui/display';
import { EmeraldIcon } from '../../src/ui/emerald/emerald_icon';
import { EndingScreen } from '../../src/ui/ending/ending';
import { GameOverScreen } from '../../src/ui/game_over/game_over';
import { Hud } from '../../src/ui/hud/hud';
import { OPTION_ROWS, PauseMenu } from '../../src/ui/pause/pause_menu';
import { RotateHint } from '../../src/ui/rotate_hint';
import { installUi, registerUiScenes } from '../../src/ui/setup';
import { SoundHint } from '../../src/ui/sound_hint/sound_hint';
import { ScoreTally } from '../../src/ui/tally/score_tally';
import { DISCLAIMER, TitleScreen } from '../../src/ui/title/title_screen';
import { JUMP_CENTER, PAD_CENTER, TouchControls, padActions } from '../../src/ui/touch_controls/touch_controls';
import { HINT_PAD, ZoneSelect } from '../../src/ui/zone_select/zone_select';
import { buildMiniLevel } from '../levels/level_world';

// --- Helpers ---------------------------------------------------------------------------

const PLAY_SCENE = 'test:ui_play';
let overlays: Node[] = [];

function frames(n: number): void {
  tree.advance(n);
}

function press(action: Action): void {
  Input.actionPress(action, 'test');
}

function release(action: Action): void {
  Input.actionRelease(action, 'test');
}

/** Press, one frame, release, one frame. */
function tapAction(action: Action): void {
  press(action);
  frames(1);
  release(action);
  frames(1);
}

/** A standard-mapping pad with nothing held (Input.feedPads drives it in node). */
function fakePad(): { index: number; id: string; connected: boolean; buttons: { pressed: boolean; value: number }[]; axes: number[] } {
  return { index: 0, id: 'test pad', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
}

function pointer(x: number, y: number, phase: 'down' | 'move' | 'up', id = 1, touch = true): void {
  Input.pointerEvent(new Vec2(x, y), phase, id, touch);
}

function showScene<T extends Node>(make: () => T): T {
  return tree.changeSceneNow(make) as T;
}

/** Every stage of every zone exists (plain nodes), like a full build. */
function registerFakeStages(): void {
  for (const zone of ZoneRegistry.allZones(true)) {
    for (let stage = 1; stage <= zone.acts.length + 1; stage++) {
      const id = ZoneRegistry.stagePath(zone.id, stage);
      if (id !== '') Scenes.register(id, () => new Node('FakeStage'));
    }
  }
  Scenes.register(PLAY_SCENE, () => new Node('Play'));
}

/** A Canvas2D stand-in that accepts every call (fonts and images are not loaded in tests). */
function fakeGfx(): Gfx {
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key as string];
      if (key === 'createPattern') return () => null;
      return () => undefined;
    },
    set(t, key, value) {
      t[key as string] = value;
      return true;
    },
  });
  return new Gfx(ctx as unknown as CanvasRenderingContext2D);
}

/** Calls draw() on every Node2D under `root`, like the renderer. */
function drawAll(root: Node, g: Gfx): void {
  const walk = (n: Node) => {
    if (n instanceof Node2D) {
      g._begin(Transform2D.IDENTITY, 1);
      n.draw(g);
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
}

function addOverlay<T extends Node>(node: T): T {
  tree.addAutoload(node);
  overlays.push(node);
  return node;
}

beforeEach(() => {
  registerFakeStages();
  registerUiScenes();
  Input.releaseAll();
  Input.lastDevice = 'keyboard';
  tree.paused = false;
  tree.timeScale = 1;
  Display.reset(false);
  GameState.resetGame();
  Settings.reset();
  RelicLoadout.reset();
  HubClient.lastBanked = null;
  showScene(() => new Node('Empty'));
  frames(1);
});

afterEach(() => {
  for (const o of overlays) o.free();
  overlays = [];
  Input.releaseAll();
  tree.paused = false;
  vi.restoreAllMocks();
});

// --- Menu helper -----------------------------------------------------------------------

describe('MenuList', () => {
  function list(chosen: string[]) {
    const items = ['A', 'B', 'C', 'D'].map((label, i) => ({
      label,
      rect: new Rect2(10, 10 + i * 20, 100, 18),
      enabled: label !== 'C',
      onSelect: () => chosen.push(label),
    }));
    return new MenuList(items);
  }

  class Host extends Node {
    constructor(readonly menu: MenuList) {
      super('Host');
    }
    override process(delta: number): void {
      this.menu.update(delta);
    }
    override input(ev: import('../../src/runtime/node').InputEventLike): void {
      this.menu.handleEvent(ev);
    }
  }

  it('wraps at both ends and skips locked items', () => {
    const chosen: string[] = [];
    const host = showScene(() => new Host(list(chosen)));
    frames(1);
    expect(host.menu.focus).toBe(0);
    tapAction('ui_down');
    expect(host.menu.focus).toBe(1);
    tapAction('move_down');
    expect(host.menu.focus).toBe(3); // C is locked
    tapAction('ui_down');
    expect(host.menu.focus).toBe(0); // wraps
    tapAction('ui_up');
    expect(host.menu.focus).toBe(3);
    expect(Audio.history).toContain('menu_move');
  });

  it('repeats while a direction is held, once per press otherwise', () => {
    const host = showScene(() => new Host(list([])));
    frames(1);
    press('ui_down');
    frames(1);
    expect(host.menu.focus).toBe(1);
    frames(Math.ceil(REPEAT_DELAY * 60) - 2);
    expect(host.menu.focus).toBe(1);
    frames(4);
    expect(host.menu.focus).not.toBe(1);
    release('ui_down');
  });

  it('a pad button that is both jump and accept chooses once', () => {
    const chosen: string[] = [];
    showScene(() => new Host(list(chosen)));
    frames(1);
    press('jump');
    press('ui_accept');
    frames(1);
    release('jump');
    release('ui_accept');
    frames(1);
    expect(chosen).toEqual(['A']);
    expect(Audio.history).toContain('menu_select');
  });

  it('a tap chooses the item under the finger', () => {
    const chosen: string[] = [];
    const host = showScene(() => new Host(list(chosen)));
    frames(1);
    pointer(20, 35, 'down');
    frames(1);
    expect(host.menu.focus).toBe(1);
    pointer(20, 35, 'up');
    frames(1);
    expect(chosen).toEqual(['B']);
    pointer(20, 55, 'down'); // the locked item
    frames(1);
    pointer(20, 55, 'up');
    frames(1);
    expect(chosen).toEqual(['B']);
  });

  it('ignores the key that opened it', () => {
    const chosen: string[] = [];
    const menu = list(chosen);
    press('ui_accept');
    menu.reset();
    menu.update(1 / 60);
    release('ui_accept');
    expect(chosen).toEqual([]);
  });
});

// --- Zone select -------------------------------------------------------------------------

describe('ZoneSelect', () => {
  function open(): ZoneSelect {
    const zs = showScene(() => new ZoneSelect());
    frames(20); // past the input grace
    return zs;
  }

  function focusedAct(zs: ZoneSelect): string {
    const d = zs.focusedItem()?.data as { zoneId: string; act: number } | undefined;
    return d ? `${d.zoneId}:${d.act}` : String(zs.menu.focus === zs.backIndex ? 'back' : zs.menu.focus);
  }

  it('opens every released zone and has 8 emerald slots, filled once won', () => {
    GameState.emeralds.add(Emeralds.key('z1_retro_rush_hills', 2));
    const zs = open();
    const open1 = zs.acts.filter((a) => a.open).map((a) => `${a.zoneId}:${a.act}`);
    expect(open1).toEqual([
      'z1_retro_rush_hills:1',
      'z1_retro_rush_hills:2',
      'z2_wizard_academy:1',
      'z2_wizard_academy:2',
      'z3_capital_mansion:1',
      'z3_capital_mansion:2',
      'z4_neon_rush_remix:1',
      'z4_neon_rush_remix:2',
    ]);
    for (const a of zs.acts) expect(a.open).toBe(ZoneRegistry.isReleased(a.zoneId));
    const slots = zs.emeraldSlots();
    expect(slots.length).toBe(8);
    expect(slots.filter((s) => !s.empty).length).toBe(1);
    expect(zs.acts.find((a) => a.zoneId === 'z1_retro_rush_hills' && a.act === 2)!.slot.empty).toBe(false);
    for (const s of slots) expect(s.small).toBe(true);
  });

  it('has no exchange entry point', () => {
    const zs = open();
    for (const it of zs.menu.items) {
      const label = typeof it.label === 'string' ? it.label : it.label();
      expect(label.toUpperCase()).not.toContain('EXCHANGE');
    }
  });

  it('navigation wraps through every zone', () => {
    const zs = open();
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:1');
    tapAction('ui_right');
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:2');
    tapAction('move_right');
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:1'); // wraps in the row
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('z2_wizard_academy:1');
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('z3_capital_mansion:1');
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('z4_neon_rush_remix:1');
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('back');
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:1'); // wraps
    tapAction('ui_up');
    expect(focusedAct(zs)).toBe('back');
  });

  it('choosing an act starts it exactly once', () => {
    const start = vi.spyOn(SceneRouter, 'startZone');
    const zs = open();
    tapAction('ui_down');
    tapAction('ui_right');
    tapAction('jump');
    tapAction('jump');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('z2_wizard_academy', 2);
    expect(zs.isBusy()).toBe(true);
  });

  it('pause goes back to the title but Enter chooses', () => {
    const title = vi.spyOn(SceneRouter, 'goTitle');
    const start = vi.spyOn(SceneRouter, 'startZone');
    open();
    // Enter: pause + ui_accept.
    press('pause');
    press('ui_accept');
    frames(1);
    release('pause');
    release('ui_accept');
    frames(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(title).not.toHaveBeenCalled();
    open();
    tapAction('pause');
    expect(title).toHaveBeenCalledTimes(1);
  });

  it('ignores input before the grace time and when it is not the current scene', () => {
    const start = vi.spyOn(SceneRouter, 'startZone');
    showScene(() => new ZoneSelect());
    tapAction('jump');
    expect(start).not.toHaveBeenCalled();
    const stray = new ZoneSelect();
    tree.root.addChild(stray);
    frames(30);
    tapAction('jump');
    expect(start).toHaveBeenCalledTimes(1); // the current one only
    expect(stray.isBusy()).toBe(false);
    stray.free();
  });

  it('the hint follows touch mode', () => {
    const zs = open();
    expect(zs.hintText()).toBe('JUMP OR ENTER: START     P: BACK TO TITLE');
    Display.setTouch(true);
    expect(zs.hintText()).toContain('TAP');
  });

  it('on a gamepad the hint names A and B, and B goes back to the title', () => {
    const zs = open();
    const back = vi.spyOn(SceneRouter, 'goTitle');
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(30);
    pad.buttons[1] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    expect(back).toHaveBeenCalledTimes(1);
    expect(zs.hintText()).toBe(HINT_PAD);
    Input.feedPads([null]);
  });

  it('a gamepad reaches HUB with the D-pad and A (return to the hub without the keyboard)', () => {
    const zs = open();
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(1);
    const tapButton = (b: number) => {
      pad.buttons[b] = { pressed: true, value: 1 };
      Input.feedPads([pad]);
      frames(1);
      pad.buttons[b] = { pressed: false, value: 0 };
      Input.feedPads([pad]);
      frames(1);
    };
    tapButton(12); // up wraps to the BACK / HUB row
    tapButton(15); // right: HUB
    expect(zs.menu.focus).toBe(zs.hubIndex);
    tapButton(0);
    expect(exit).toHaveBeenCalledTimes(1);
    Input.feedPads([null]);
  });

  it('gamepad Start chooses the focused act (as Enter does), P still goes back', () => {
    const zs = open();
    const start = vi.spyOn(SceneRouter, 'startZone').mockImplementation(() => undefined);
    const back = vi.spyOn(SceneRouter, 'goTitle');
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(1);
    pad.buttons[9] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    expect(back).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    expect(zs.isBusy()).toBe(true);
    pad.buttons[9] = { pressed: false, value: 0 };
    Input.feedPads([pad]);
    frames(1);
    Input.feedPads([null]);
    const zs2 = open();
    Input.keyDown('KeyP', false);
    frames(1);
    Input.keyUp('KeyP');
    expect(back).toHaveBeenCalledTimes(1);
    expect(zs2.isBusy()).toBe(true);
  });
});

// --- Pause menu --------------------------------------------------------------------------

describe('PauseMenu', () => {
  function enterGameplay(): void {
    SceneRouter.openScene(PLAY_SCENE);
    frames(2);
    expect(SceneRouter.inGameplay()).toBe(true);
  }

  it('does nothing outside gameplay', () => {
    const pm = addOverlay(new PauseMenu());
    SceneRouter.changeTo('title');
    frames(2);
    expect(SceneRouter.inGameplay()).toBe(false);
    tapAction('pause');
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
  });

  it('toggles in gameplay and resumes after two quiet physics frames', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    expect(tree.paused).toBe(true);
    expect(pm.visible).toBe(true);
    tapAction('pause');
    expect(pm.isResumePending()).toBe(true);
    frames(1);
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
  });

  it('Enter on the menu chooses instead of closing it', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    tapAction('ui_down'); // RESTART
    const restart = vi.spyOn(SceneRouter, 'restart').mockImplementation(() => undefined);
    press('pause');
    press('ui_accept');
    frames(1);
    release('pause');
    release('ui_accept');
    frames(1);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
  });

  it('lists resume, restart, options, exit to hub and quit to title, wrapping', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    const labels = pm.main.items.map((i) => i.label);
    expect(labels).toEqual(['RESUME', 'RESTART', 'OPTIONS', 'EXIT TO HUB', 'QUIT TO TITLE']);
    tapAction('ui_up');
    expect(pm.main.focus).toBe(4);
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    tapAction('ui_up');
    tapAction('jump');
    // Mid-run, EXIT TO HUB asks first, with KEEP PLAYING focused.
    expect(exit).not.toHaveBeenCalled();
    expect(pm.page).toBe('confirm');
    expect(pm.confirm.items.map((i) => i.label)).toEqual(['EXIT TO HUB', 'KEEP PLAYING']);
    expect(pm.confirm.focus).toBe(1);
    expect(tree.paused).toBe(true);
    tapAction('ui_up');
    tapAction('jump');
    expect(exit).toHaveBeenCalledTimes(1);
    expect(tree.paused).toBe(false);
  });

  it('KEEP PLAYING (or cancel) on the exit question goes back to the pause list', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    for (let i = 0; i < 3; i++) tapAction('ui_down'); // EXIT TO HUB
    tapAction('ui_accept');
    expect(pm.page).toBe('confirm');
    tapAction('ui_accept'); // KEEP PLAYING
    expect(pm.page).toBe('main');
    expect(pm.main.focus).toBe(3);
    expect(pm.isOpen()).toBe(true);
    tapAction('ui_accept');
    expect(pm.page).toBe('confirm');
    tapAction('ui_cancel');
    expect(pm.page).toBe('main');
    expect(pm.isOpen()).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it('the hub chrome asks mid-run: the menu opens on the question, and KEEP PLAYING resumes', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    pm.confirmExitToHub();
    expect(pm.isOpen()).toBe(true);
    expect(tree.paused).toBe(true);
    expect(pm.page).toBe('confirm');
    frames(1);
    tapAction('ui_accept'); // KEEP PLAYING
    frames(2);
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
    expect(exit).not.toHaveBeenCalled();
    pm.confirmExitToHub();
    frames(1);
    tapAction('ui_up');
    tapAction('ui_accept'); // EXIT TO HUB
    expect(exit).toHaveBeenCalledTimes(1);
    expect(tree.paused).toBe(false);
  });

  it('outside gameplay the hub chrome leaves at once, with no question', () => {
    const pm = addOverlay(new PauseMenu());
    SceneRouter.changeTo('title');
    frames(2);
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    pm.confirmExitToHub();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
  });

  it('options toggle the settings; sound goes to Audio', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    tapAction('ui_down');
    tapAction('ui_down');
    tapAction('ui_accept'); // OPTIONS
    expect(pm.page).toBe('options');
    expect(pm.options.items.length).toBe(OPTION_ROWS.length + 1);
    expect(Settings.data.extraMoves).toBe(true);
    tapAction('ui_accept');
    expect(Settings.data.extraMoves).toBe(false);
    tapAction('ui_right');
    expect(Settings.data.extraMoves).toBe(true);
    for (let i = 0; i < 4; i++) tapAction('ui_down'); // SOUND
    tapAction('ui_accept');
    expect(Settings.data.muted).toBe(true);
    expect(Audio.isMuted()).toBe(true);
    tapAction('ui_accept');
    expect(Audio.isMuted()).toBe(false);
    tapAction('ui_cancel');
    expect(pm.page).toBe('main');
    expect(pm.isOpen()).toBe(true);
  });

  it('closes when the game leaves gameplay', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    SceneRouter.changeTo('title');
    frames(2);
    expect(pm.isOpen()).toBe(false);
    expect(tree.paused).toBe(false);
  });

  describe('RESTART while dying (HPOS-DEC-01)', () => {
    const LEVEL_SCENE = 'test:ui_level';

    function enterLevel(): LevelRoot {
      Scenes.register(LEVEL_SCENE, () => buildMiniLevel());
      SceneRouter.openScene(LEVEL_SCENE);
      frames(3);
      expect(SceneRouter.inGameplay()).toBe(true);
      const level = tree.currentScene as LevelRoot;
      expect(level).toBeInstanceOf(LevelRoot);
      return level;
    }

    it('is enabled while playing, greyed out with a hint while dying, and focus skips it', () => {
      const pm = addOverlay(new PauseMenu());
      const level = enterLevel();
      tapAction('pause');
      expect(pm.isOpen()).toBe(true);
      expect(pm.canRestart()).toBe(true);
      expect(pm.main.items[1]!.enabled).toBe(true);
      expect(pm.main.stateOf(1)).not.toBe('disabled');
      expect(pm.restartHint()).toBe('');
      tapAction('pause');
      frames(2);
      expect(pm.isOpen()).toBe(false);

      level.player!.kill();
      frames(5);
      expect(level.phase()).toBe('dying');
      tapAction('pause');
      expect(pm.isOpen()).toBe(true);
      const restartItem = pm.main.items[1]!;
      expect(restartItem.visible).not.toBe(false);
      expect(restartItem.enabled).toBe(false);
      expect(pm.main.stateOf(1)).toBe('disabled');
      expect(pm.restartHint()).toBe('WAIT FOR RESPAWN');
      // Navigation skips it: RESUME -> OPTIONS.
      expect(pm.main.focus).toBe(0);
      tapAction('ui_down');
      expect(pm.main.focus).toBe(2);
      // Choosing it any way does nothing.
      const restart = vi.spyOn(SceneRouter, 'restart').mockImplementation(() => undefined);
      pm.main.activate(1);
      const r = restartItem.rect;
      pointer(r.x + 4, r.y + 4, 'down');
      pointer(r.x + 4, r.y + 4, 'up');
      frames(1);
      expect(restart).not.toHaveBeenCalled();
      expect(pm.isOpen()).toBe(true);
      expect(tree.paused).toBe(true);
      // It draws (greyed) without throwing.
      drawAll(pm, fakeGfx());
    });

    it('pausing does not take a life or skip the respawn; after it RESTART is enabled again', () => {
      const pm = addOverlay(new PauseMenu());
      const level = enterLevel();
      let requests = 0;
      level.respawnRequested.connect(() => requests++);
      const lives = GameState.lives;
      level.player!.kill();
      frames(5);
      tapAction('pause');
      frames(400);
      expect(requests).toBe(0);
      expect(GameState.lives).toBe(lives);
      expect(pm.canRestart()).toBe(false);
      tapAction('pause');
      frames(2);
      expect(pm.isOpen()).toBe(false);
      for (let i = 0; i < 300 && requests === 0; i++) frames(1);
      expect(requests).toBe(1);
      expect(level.phase()).toBe('respawning');
      frames(200);
      expect(requests).toBe(1);
      // The next attempt (a fresh LevelRoot) plays again: RESTART is back.
      SceneRouter.openScene(LEVEL_SCENE);
      frames(3);
      const next = tree.currentScene as LevelRoot;
      expect(next).not.toBe(level);
      expect(next.phase()).toBe('playing');
      tapAction('pause');
      expect(pm.canRestart()).toBe(true);
      expect(pm.main.items[1]!.enabled).toBe(true);
      expect(pm.restartHint()).toBe('');
    });

    it('is disabled while the act clear runs', () => {
      const saved = LevelHooks.tally;
      LevelHooks.tally = null;
      try {
        const pm = addOverlay(new PauseMenu());
        const level = enterLevel();
        frames(5);
        level.completeLevel();
        frames(2);
        expect(level.phase()).toBe('finishing');
        tapAction('pause');
        expect(pm.canRestart()).toBe(false);
        expect(pm.main.items[1]!.enabled).toBe(false);
        expect(pm.restartHint()).toBe('STAGE CLEAR');
      } finally {
        LevelHooks.tally = saved;
      }
    });

    it('scenes without a LevelRoot keep RESTART', () => {
      const pm = addOverlay(new PauseMenu());
      enterGameplay();
      tapAction('pause');
      expect(pm.canRestart()).toBe(true);
      expect(pm.main.items[1]!.enabled).toBe(true);
    });
  });

  it('gamepad B on the main page resumes instead of choosing the focused item', () => {
    const pm = addOverlay(new PauseMenu());
    const quit = vi.spyOn(SceneRouter, 'goTitle');
    enterGameplay();
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(1);
    pad.buttons[9] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    pad.buttons[9] = { pressed: false, value: 0 };
    Input.feedPads([pad]);
    frames(1);
    expect(pm.isOpen()).toBe(true);
    pm.main.setFocus(4, true); // QUIT TO TITLE
    pad.buttons[1] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    expect(quit).not.toHaveBeenCalled();
    expect(pm.isResumePending()).toBe(true);
    pad.buttons[1] = { pressed: false, value: 0 };
    Input.feedPads([pad]);
    frames(3);
    expect(pm.isOpen()).toBe(false);
    expect(SceneRouter.inGameplay()).toBe(true);
    Input.feedPads([null]);
  });

  it('the controls list names gamepad buttons from the bindings', () => {
    const pm = addOverlay(new PauseMenu());
    const rows = pm.controlsRows();
    expect(rows[2]![2]).toBe('A B X Y');
    expect(rows[3]![2]).toBe('START');
  });

  it('the controls list offers P and Enter, never Esc, and names keys from the bindings', () => {
    const pm = addOverlay(new PauseMenu());
    const rows = pm.controlsRows();
    expect(rows[3]![1]).toBe('P / ENTER');
    expect(rows[3]![1]).not.toContain('ESC');
    expect(rows[2]![1]).toBe('Z X C K SPACE');
    InputHints.learn('KeyZ', 'w'); // as if this layout printed W on that key
    expect(pm.controlsRows()[2]![1]).toContain('W');
    InputHints.reset();
    expect(KEY_BINDINGS.jump).toContain('KeyZ');
  });
});

// --- Tally -------------------------------------------------------------------------------

describe('ScoreTally', () => {
  function clearAct(zoneId: string, act: number, seconds: number, tickets: number): void {
    GameState.startLevel(zoneId, act);
    GameState.levelTime = seconds;
    GameState.tickets = tickets;
    GameState.completeLevel();
  }

  it('counts the bonuses into the score and emits finished once', () => {
    clearAct('z1_retro_rush_hills', 1, 40, 3);
    const tally = new ScoreTally('z1_retro_rush_hills');
    let finished = 0;
    tally.finished.connect(() => finished++);
    tree.root.addChild(tally);
    expect(tally.timeBonus).toBe(5000);
    expect(tally.ticketBonus).toBe(300);
    expect(tally.hasEmeraldMoment()).toBe(true);
    const before = GameState.score;
    for (let i = 0; i < 60 * 10 && finished === 0; i++) frames(1);
    frames(60);
    expect(finished).toBe(1);
    expect(GameState.score - before).toBe(5300);
    expect(Audio.history).toContain('emerald_get');
    expect(Audio.history).toContain('tally_tick');
    tally.free();
  });

  it('jump skips the count, then continues', () => {
    clearAct('z1_retro_rush_hills', 2, 100, 0);
    const tally = new ScoreTally();
    let finished = 0;
    tally.finished.connect(() => finished++);
    tree.root.addChild(tally);
    frames(30);
    const before = GameState.score;
    tapAction('jump');
    expect(tally.isCountingDone()).toBe(true);
    expect(GameState.score - before).toBe(1000);
    expect(finished).toBe(0);
    tapAction('jump');
    expect(finished).toBe(1);
    tally.free();
  });

  it('shows no emerald in the test zone or after a boss, a quiet one when won earlier', () => {
    clearAct('test_zone', 1, 10, 0);
    expect(ScoreTally.emeraldMode('test_zone', 1)).toBe('none');
    clearAct('z1_retro_rush_hills', 3, 10, 0);
    expect(ScoreTally.emeraldMode('z1_retro_rush_hills', 3)).toBe('none');
    clearAct('z1_retro_rush_hills', 1, 10, 0);
    clearAct('z1_retro_rush_hills', 1, 10, 0);
    expect(ScoreTally.emeraldMode('z1_retro_rush_hills', 1)).toBe('earlier');
  });

  it('says how many tickets this clear sent to the hub', () => {
    ScoreTally.watchBanks();
    HubClient.lastBanked = { amount: 5, acked: true };
    GameState.startLevel('z1_retro_rush_hills', 1);
    expect(ScoreTally.bankedThisAct()).toBe(0); // an earlier act's bank
    HubClient.lastBanked = { amount: 12, acked: false };
    const tally = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(tally);
    expect(tally.bankedLine()).toBe('+12 Tickets sent to the hub');
    const r = tally.panelRect();
    expect(r.y).toBeGreaterThanOrEqual(44);
    expect(r.bottom).toBeLessThanOrEqual(223);
    tally.free();
  });

  it('a tap continues', () => {
    clearAct('z1_retro_rush_hills', 1, 400, 0);
    const tally = new ScoreTally();
    let finished = 0;
    tally.finished.connect(() => finished++);
    tree.root.addChild(tally);
    frames(30);
    pointer(200, 120, 'down');
    frames(1);
    pointer(200, 120, 'up');
    frames(1);
    expect(tally.isCountingDone()).toBe(true);
    pointer(200, 120, 'down');
    frames(1);
    expect(finished).toBe(1);
    tally.free();
  });
});

// --- HUD, emerald icon, touch controls, small screens ------------------------------------------

describe('Hud', () => {
  it('formats and follows GameState', () => {
    expect(Hud.formatTime(0)).toBe('0:00');
    expect(Hud.formatTime(605.9)).toBe('10:05');
    expect(Hud.formatScore(123456789)).toBe('9999999');
    expect(Hud.formatLives(250)).toBe('x 99');
    const hud = new Hud();
    tree.root.addChild(hud);
    GameState.addScore(150);
    expect(hud.scoreText).toBe('150');
    GameState.addTickets(7);
    expect(hud.ticketsText).toBe('7');
    GameState.levelTime = 75;
    frames(1);
    expect(hud.timeText).toBe('1:15');
    hud.free();
  });

  it('shows the power-ups of the player in group player', () => {
    const fake = new Node('FakePlayer');
    fake.addToGroup('player');
    Object.assign(fake, { moves: { shield: true, speedShoesFrames: 125, invincibilityFrames: 0 } });
    tree.root.addChild(fake);
    const hud = new Hud();
    tree.root.addChild(hud);
    expect(hud.powerUps()).toEqual([
      { kind: 'shield', seconds: 0 },
      { kind: 'speed_shoes', seconds: 3 },
    ]);
    hud.free();
    fake.free();
  });

  it('moves the lives box for touch controls', () => {
    const hud = new Hud();
    tree.root.addChild(hud);
    const desktop = hud.livesPosition;
    Display.setTouch(true);
    expect(hud.livesPosition).not.toEqual(desktop);
    Display.setTouch(false);
    expect(hud.livesPosition).toEqual(desktop);
    hud.free();
  });
});

describe('EmeraldIcon', () => {
  it('keeps whole, even pixel widths and shows the back past edge-on', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const w = EmeraldIcon.widthFor(a, 48);
      expect(w % 2).toBe(0);
      expect(w).toBeGreaterThanOrEqual(2);
      expect(w).toBeLessThanOrEqual(48);
    }
    const icon = new EmeraldIcon({ phase: Math.PI });
    expect(icon.isBackFace()).toBe(true);
    icon.phase = Math.PI / 2;
    expect(icon.isEdgeOn()).toBe(true);
  });
});

describe('TouchControls', () => {
  function setup(): TouchControls {
    Display.reset(true);
    const tc = addOverlay(new TouchControls());
    SceneRouter.openScene(PLAY_SCENE);
    frames(2);
    return tc;
  }

  it('holds right on the pad and jump with a second finger', () => {
    const tc = setup();
    expect(tc.visible).toBe(true);
    pointer(PAD_CENTER.x + 20, PAD_CENTER.y, 'down', 1);
    pointer(JUMP_CENTER.x, JUMP_CENTER.y, 'down', 2);
    frames(1);
    expect(Input.isActionHeldNow('move_right')).toBe(true);
    expect(Input.isActionHeldNow('jump')).toBe(true);
    pointer(PAD_CENTER.x - 20, PAD_CENTER.y, 'move', 1);
    frames(1);
    expect(Input.isActionHeldNow('move_right')).toBe(false);
    expect(Input.isActionHeldNow('move_left')).toBe(true);
    pointer(JUMP_CENTER.x, JUMP_CENTER.y, 'up', 2);
    pointer(PAD_CENTER.x - 20, PAD_CENTER.y, 'up', 1);
    frames(1);
    expect(tc.heldActions()).toEqual([]);
  });

  it('is hidden and inert outside gameplay or touch mode', () => {
    const tc = setup();
    Display.setTouch(false);
    frames(1);
    expect(tc.visible).toBe(false);
    Display.setTouch(true);
    SceneRouter.changeTo('title');
    frames(2);
    expect(tc.visible).toBe(false);
    pointer(JUMP_CENTER.x, JUMP_CENTER.y, 'down', 3);
    frames(1);
    expect(Input.isActionHeldNow('jump')).toBe(false);
    pointer(JUMP_CENTER.x, JUMP_CENTER.y, 'up', 3);
  });

  it('pad angle bands', () => {
    expect(padActions(new Vec2(2, 0))).toEqual([]);
    expect(padActions(new Vec2(20, 0))).toEqual(['move_right']);
    expect(padActions(new Vec2(-20, 2))).toEqual(['move_left']);
    expect(padActions(new Vec2(0, 20))).toEqual(['move_down']);
    expect(padActions(new Vec2(14, -14))).toEqual(['move_right', 'move_up']);
  });
});

describe('Display', () => {
  it('flips to touch on a touch and back on a key', () => {
    const changes: boolean[] = [];
    Display.touchModeChanged.connect((t) => changes.push(t));
    addOverlay(new RotateHint());
    pointer(10, 10, 'down', 4, true);
    frames(1);
    expect(Display.isTouch).toBe(true);
    pointer(10, 10, 'up', 4, true);
    Input.keyDown('KeyZ', false);
    frames(1);
    Input.keyUp('KeyZ');
    expect(Display.isTouch).toBe(false);
    expect(changes).toEqual([true, false]);
  });
});

describe('screens', () => {
  it('title shows the disclaimer and goes to the zone select once', () => {
    expect(DISCLAIMER).toBe('A free, non-commercial fan parody. All characters and art are original.');
    const go = vi.spyOn(SceneRouter, 'goZoneSelect').mockImplementation(() => undefined);
    const title = showScene(() => new TitleScreen());
    tapAction('jump'); // inside the grace time
    expect(go).not.toHaveBeenCalled();
    frames(20);
    tapAction('jump');
    tapAction('jump');
    expect(go).toHaveBeenCalledTimes(1);
    expect(title.isLeaving()).toBe(true);
  });

  it('title: Esc never starts the game, P, Enter and a gamepad Start do', () => {
    const go = vi.spyOn(SceneRouter, 'goZoneSelect').mockImplementation(() => undefined);
    for (const code of ['Escape', 'KeyP', 'Enter']) {
      const title = showScene(() => new TitleScreen());
      frames(20);
      Input.keyDown(code, false);
      frames(1);
      Input.keyUp(code);
      frames(1);
      expect(title.isLeaving()).toBe(code !== 'Escape');
    }
    expect(go).toHaveBeenCalledTimes(2);
    const title = showScene(() => new TitleScreen());
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(20);
    pad.buttons[9] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    expect(title.isLeaving()).toBe(true);
    Input.feedPads([null]);
  });

  it('game over resets the game and goes to the title', () => {
    const go = vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    GameState.lives = 0;
    GameState.addScore(900);
    showScene(() => new GameOverScreen());
    frames(100);
    tapAction('ui_accept');
    expect(go).toHaveBeenCalledTimes(1);
    expect(GameState.score).toBe(0);
    expect(GameState.lives).toBe(3);
  });

  it('the ending rolls, then goes to the title', () => {
    const go = vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    const end = showScene(() => new EndingScreen());
    frames(40);
    tapAction('jump');
    expect(end.isRolled()).toBe(true);
    expect(go).not.toHaveBeenCalled();
    frames(60 * 5);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('a gamepad Start skips the ending roll, as it starts the title', () => {
    vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    const end = showScene(() => new EndingScreen());
    const pad = fakePad();
    Input.feedPads([pad]);
    frames(40);
    pad.buttons[9] = { pressed: true, value: 1 };
    Input.feedPads([pad]);
    frames(1);
    expect(end.isRolled()).toBe(true);
    Input.feedPads([null]);
  });

  it('the dev menu lists registered stages and starts them', () => {
    const start = vi.spyOn(SceneRouter, 'startZone').mockImplementation(() => undefined);
    const menu = showScene(() => new DevMenu());
    frames(1);
    const labels = menu.entries.map((e) => e.label);
    expect(labels).toContain('Retro Rush Hills Act 1');
    expect(labels).toContain('Capital Mansion Boss');
    expect(labels).toContain('Neon Rush Remix Act 2');
    expect(labels).toContain('Test Zone');
    Input.keyDown('Digit2', false);
    frames(1);
    Input.keyUp('Digit2');
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('installUi', () => {
  it('registers the menu scenes, the level hooks and the overlays', () => {
    const ui = installUi();
    for (const id of ['title', 'zone_select', 'game_over', 'ending', 'main']) expect(Scenes.exists(id)).toBe(true);
    expect(LevelHooks.hud).not.toBeNull();
    const tally = LevelHooks.tally!('z1_retro_rush_hills');
    expect(tally.finished).toBeDefined();
    expect(ui.overlays.some((o) => o instanceof PauseMenu)).toBe(true);
    expect(ui.overlays.some((o) => o instanceof TouchControls)).toBe(true);
    expect(ui.overlays.some((o) => o instanceof SoundHint)).toBe(true);
    expect(ui.overlays.some((o) => o instanceof RotateHint)).toBe(true);
  });

  it('every screen draws without fonts or images', () => {
    const g = fakeGfx();
    GameState.startLevel('z1_retro_rush_hills', 1);
    GameState.completeLevel();
    const pm = new PauseMenu();
    const nodes: Node[] = [new TitleScreen(), new ZoneSelect(), new Hud(), pm, new ScoreTally('z1_retro_rush_hills'), new GameOverScreen(), new EndingScreen(), new DevMenu(), new TouchControls(), new SoundHint(), new RotateHint(), new EmeraldIcon({ empty: true })];
    for (const n of nodes) tree.root.addChild(n);
    SceneRouter.openScene(PLAY_SCENE);
    frames(2);
    pm.openMenu();
    frames(1);
    for (const n of nodes) expect(() => drawAll(n, g)).not.toThrow();
    for (const n of nodes) n.free();
    tree.paused = false;
  });
});
