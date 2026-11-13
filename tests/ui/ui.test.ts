import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Audio } from '../../src/core/audio';
import { Emeralds } from '../../src/core/emeralds';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Scenes } from '../../src/core/scenes';
import { Settings } from '../../src/core/settings';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { HubClient } from '../../src/hub/hub_client';
import { memoryStore, SAVE_KEYS, Storage } from '../../src/hub/storage';
import { RELIC_BELT, RELIC_CONES, RELIC_CROWN, RELIC_GENESIS, RelicLoadout } from '../../src/hub/relic_loadout';
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
import { feedbackContext } from '../../src/ui/feedback';
import { EmeraldIcon } from '../../src/ui/emerald/emerald_icon';
import { EndingScreen, rankLines } from '../../src/ui/ending/ending';
import { Difficulty } from '../../src/core/difficulty';
import { betterRank, rankFor } from '../../src/core/rank';
import { GameOverScreen } from '../../src/ui/game_over/game_over';
import { Hud } from '../../src/ui/hud/hud';
import { SpeedLines } from '../../src/ui/hud/speed_lines';
import { promptLine } from '../../src/ui/hud/prompt_line';
import { Prompts } from '../../src/core/prompts';
import { measure } from '../../src/ui/common/theme';
import { EXTRA_MOVES_LINES, MOVES_LINE, OPTION_ROWS, PauseMenu } from '../../src/ui/pause/pause_menu';
import { RotateHint } from '../../src/ui/rotate_hint';
import { installUi, registerUiScenes } from '../../src/ui/setup';
import { SoundHint } from '../../src/ui/sound_hint/sound_hint';
import { ScoreTally } from '../../src/ui/tally/score_tally';
import { DISCLAIMER, TitleScreen } from '../../src/ui/title/title_screen';
import { JUMP_CENTER, PAD_CENTER, TouchControls, padActions } from '../../src/ui/touch_controls/touch_controls';
import { BOSS_REPLAY_NOTE, HINT_PAD, isActUnlocked, isBossUnlocked, UNLOCK_HINT, ZoneSelect } from '../../src/ui/zone_select/zone_select';
import { formatActTime } from '../../src/ui/common/act_time';
import { buildMiniLevel } from '../levels/level_world';

/** Empties the saved progress (device copy and legacy save) and reopens it. */
function resetProgress(): void {
  Storage.store.removeItem(SAVE_KEYS.progress);
  Storage.store.removeItem(SAVE_KEYS.legacyProgress);
  HubClient.save.loadAll();
}

/** Saves stage `id` (`zone:act`) as cleared, through the progress store. */
function clearStage(id: string): void {
  const [zone, stage] = id.split(':');
  HubClient.save.recordStageClear(zone!, Number(stage));
}

/** Saves a best rank for act `id` (`zone:act`); the act is cleared with a slow time. */
function saveRank(id: string, rank: 'S' | 'A' | 'B' | 'C' | 'D'): void {
  const [zone, act] = id.split(':');
  HubClient.save.recordClear(zone!, Number(act), 3600, rank);
}


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
  GameState.clearEmeralds();
  Settings.reset();
  RelicLoadout.reset();
  HubClient.lastBanked = null;
  HubClient.lastClear = null;
  HubClient.earnCapped = false;
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
  /** A save with every act cleared (everything unlocked), as most tests want. */
  function clearAllActs(): void {
    for (const zone of ZoneRegistry.allZones(false)) zone.acts.forEach((_, i) => clearStage(`${zone.id}:${i + 1}`));
  }

  beforeEach(() => {
    resetProgress();
    clearAllActs();
  });

  afterEach(() => {
    resetProgress();
  });

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
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:3'); // the boss
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

  it('a fresh save opens only the first act; clearing an act opens the next, and the last act opens the boss', () => {
    resetProgress();
    let zs = open();
    const openActs = () => zs.acts.filter((a) => a.open).map((a) => `${a.zoneId}:${a.act}`);
    expect(openActs()).toEqual(['z1_retro_rush_hills:1']);
    expect(zs.bosses.length).toBe(4);
    expect(zs.bosses.every((b) => !b.open)).toBe(true);
    // Navigation skips everything locked: act 1, then BACK.
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:1');
    tapAction('ui_right');
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:1');
    tapAction('ui_down');
    expect(focusedAct(zs)).toBe('back');
    expect(zs.infoText()).toBe(UNLOCK_HINT);
    for (const b of zs.bosses) expect(zs.menu.stateOf(zs.menu.items.findIndex((i) => (i.data as { zoneId?: string; boss?: boolean } | undefined)?.boss === true && (i.data as { zoneId: string }).zoneId === b.zoneId))).toBe('disabled');

    clearStage('z1_retro_rush_hills:1');
    zs = open();
    expect(openActs()).toEqual(['z1_retro_rush_hills:1', 'z1_retro_rush_hills:2']);
    expect(zs.bosses.some((b) => b.open)).toBe(false);

    clearStage('z1_retro_rush_hills:2');
    zs = open();
    expect(openActs()).toEqual(['z1_retro_rush_hills:1', 'z1_retro_rush_hills:2', 'z2_wizard_academy:1']);
    expect(zs.bosses.filter((b) => b.open).map((b) => b.zoneId)).toEqual(['z1_retro_rush_hills']);

    // An act cleared before the rule existed stays open, even with a gap before it.
    clearStage('z3_capital_mansion:2');
    zs = open();
    expect(openActs()).toContain('z3_capital_mansion:2');
    expect(openActs()).not.toContain('z3_capital_mansion:1');
    expect(isActUnlocked('z4_neon_rush_remix', 1)).toBe(true);
    expect(isBossUnlocked('z3_capital_mansion')).toBe(true);
    expect(isBossUnlocked('z2_wizard_academy')).toBe(false);
  });

  it('a save from before the unlock rule (v0 or v1) keeps every act open, whatever it had cleared', () => {
    for (const old of [
      { cleared: ['z3_capital_mansion:2'], best_times: {} },
      { v: 1, cleared: ['z1_retro_rush_hills:1', 'z3_capital_mansion:1'], best_times: {}, emeralds: [] },
    ]) {
      Storage.use(memoryStore());
      Storage.writeJson(SAVE_KEYS.legacyProgress, old);
      HubClient.save.loadAll();
      const zs = open();
      expect(zs.acts.every((a) => a.open), JSON.stringify(old)).toBe(true);
      expect(zs.infoText()).not.toBe(UNLOCK_HINT);
    }
    // A new save starts with the first act only.
    Storage.use(memoryStore());
    HubClient.save.loadAll();
    expect(open().acts.filter((a) => a.open).length).toBe(1);
  });

  it('BOSS starts the boss arena (stage acts + 1) and says when a replay banks nothing', () => {
    const start = vi.spyOn(SceneRouter, 'startZone').mockImplementation(() => undefined);
    const zs = open();
    tapAction('ui_right');
    tapAction('ui_right');
    expect(focusedAct(zs)).toBe('z1_retro_rush_hills:3');
    expect(zs.infoText()).toBe('BOSS ARENA');
    clearStage('z1_retro_rush_hills:3');
    expect(zs.infoText()).toBe(BOSS_REPLAY_NOTE);
    tapAction('jump');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('z1_retro_rush_hills', 3);
  });

  it('shows the saved best time of the focused act, or --:--', () => {
    HubClient.save.recordClear('z1_retro_rush_hills', 1, 83.456);
    const zs = open();
    saveRank('z1_retro_rush_hills:1', 'A');
    expect(zs.infoText()).toBe('ACT 1   BEST 1:23.45   RANK A');
    tapAction('ui_right');
    expect(zs.infoText()).toBe('ACT 2   BEST --:--   RANK -');
    expect(formatActTime(0)).toBe('0:00.00');
    expect(formatActTime(59.999)).toBe('0:59.99');
    expect(formatActTime(600)).toBe('10:00.00');
    expect(formatActTime(null)).toBe('--:--');
    drawAll(zs, fakeGfx());
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
  function showLevel(): LevelRoot {
    Scenes.register('test:ui_level2', () => buildMiniLevel());
    SceneRouter.openScene('test:ui_level2');
    frames(3);
    return tree.currentScene as LevelRoot;
  }

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

  it('lists resume, restart, restart act, options, exit to hub, main menu, send feedback and controls, wrapping', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    const labels = pm.main.items.map((i) => i.label);
    // No FULL SCREEN here: node has no Fullscreen API (tests/ui/controls.test.ts covers it).
    expect(labels).toEqual(['RESUME', 'RESTART', 'RESTART ACT', 'OPTIONS', 'EXIT TO HUB', 'MAIN MENU', 'SEND FEEDBACK', 'CONTROLS']);
    // The whole page still fits the 240 px screen, in two columns.
    for (const it of pm.main.items) expect(it.rect.bottom).toBeLessThan(240);
    expect(pm.main.items[5]!.rect.x).toBeGreaterThan(pm.main.items[0]!.rect.right);
    tapAction('ui_up');
    expect(pm.main.focus).toBe(7);
    tapAction('ui_up');
    expect(pm.main.focus).toBe(6);
    tapAction('ui_up');
    expect(pm.main.focus).toBe(5);
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

  it('RESTART ACT starts the stage again as a fresh attempt: clock at 0:00, lives and score kept', () => {
    const pm = addOverlay(new PauseMenu());
    SceneRouter.startZone('z1_retro_rush_hills', 2);
    frames(2);
    GameState.lives = 2;
    GameState.addScore(400);
    GameState.tick(30);
    GameState.restartFromCheckpoint();
    expect(GameState.cleanRun).toBe(false);
    expect(GameState.attemptTime).toBe(30);
    const start = vi.spyOn(GameState, 'startLevel');
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    tapAction('ui_down');
    tapAction('ui_down');
    expect(pm.main.focused?.label).toBe('RESTART ACT');
    tapAction('jump');
    expect(pm.isOpen()).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('z1_retro_rush_hills', 2);
    expect(GameState.attemptTime).toBe(0);
    expect(GameState.levelTime).toBe(0);
    expect(GameState.cleanRun).toBe(true);
    expect(GameState.lives).toBe(2);
    expect(GameState.score).toBe(400);
  });

  it('KEEP PLAYING (or cancel) on the exit question goes back to the pause list', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    for (let i = 0; i < 4; i++) tapAction('ui_down'); // EXIT TO HUB
    tapAction('ui_accept');
    expect(pm.page).toBe('confirm');
    tapAction('ui_accept'); // KEEP PLAYING
    expect(pm.page).toBe('main');
    expect(pm.main.focus).toBe(4);
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
    tapAction('ui_down');
    tapAction('ui_accept'); // OPTIONS
    expect(pm.page).toBe('options');
    // The toggles, then CONTROLS, EXIT TO HUB, MAIN MENU and BACK (FULL SCREEN too where the browser has it).
    expect(pm.options.items.length).toBe(OPTION_ROWS.length + 4);
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

  it('feedback context: scene and mode in a menu; position, time and player state in a level; no hub answers standalone', async () => {
    SceneRouter.changeTo('title');
    frames(2);
    const menu = feedbackContext();
    expect(menu).toMatchObject({ level: 'title', mode: 'menu' });
    expect(menu.position).toBeUndefined();
    Scenes.register('test:feedback_level', () => buildMiniLevel());
    SceneRouter.openScene('test:feedback_level');
    frames(3);
    const level = tree.currentScene as LevelRoot;
    const at = feedbackContext();
    expect(at).toMatchObject({ level: 'test:feedback_level', mode: 'sandbox', gameTime: GameState.levelTime });
    expect(at.position!.x).toBeCloseTo(level.player!.globalPosition.x, 0);
    expect(at.player).toMatchObject({ lives: GameState.lives, tickets: 0, state: level.player!.state, checkpoint: null, phase: 'playing' });
    expect(() => JSON.stringify(at)).not.toThrow();
    HubClient.shutdown();
    expect(await HubClient.feedbackTransport().access()).toEqual({ ok: false, reason: 'standalone' });
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
      // Navigation skips it and RESTART ACT: RESUME -> OPTIONS.
      expect(pm.main.focus).toBe(0);
      expect(pm.main.items[2]!.enabled).toBe(false);
      tapAction('ui_down');
      expect(pm.main.focus).toBe(3);
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
    pm.main.setFocus(5, true); // MAIN MENU
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

  it('the moves lines name the extra moves only while they are on, and the page fits the screen', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    expect(pm.movesLines()).toEqual([MOVES_LINE, ...EXTRA_MOVES_LINES]);
    const extra = EXTRA_MOVES_LINES.join(' ');
    expect(extra).toContain('DROP DASH');
    expect(extra).toContain('CHARGE RUN');
    expect(extra).toContain('BOUNCE');
    const b = pm.layoutBounds();
    expect(b.top).toBeGreaterThanOrEqual(2);
    expect(b.bottom).toBeLessThanOrEqual(238);
    expect(b.left).toBeGreaterThanOrEqual(2);
    expect(b.right).toBeLessThanOrEqual(422);
    drawAll(pm, fakeGfx());
    tapAction('pause');
    frames(3);
    // The worst case still fits: a Relic line and the restart hint on top of the extra moves.
    const reach = HubClient.reach;
    HubClient.reach = 'ready';
    HubClient.relics = [RELIC_GENESIS, RELIC_CONES, RELIC_CROWN, RELIC_BELT];
    HubClient.revision++;
    RelicLoadout.reset();
    const level = showLevel();
    level.player!.kill();
    frames(5);
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    expect(pm.restartHint()).not.toBe('');
    const worst = pm.layoutBounds();
    expect(worst.top).toBeGreaterThanOrEqual(1);
    expect(worst.bottom).toBeLessThanOrEqual(239);
    drawAll(pm, fakeGfx());
    expect(pm.relicLine()).toContain('SKIN');
    expect(pm.relicLine()).toContain('CAPE');
    HubClient.reach = reach;
    HubClient.relics = [];
    HubClient.revision++;
    RelicLoadout.reset();
    SceneRouter.openScene(PLAY_SCENE);
    frames(3);
    Settings.set('extraMoves', false);
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    expect(pm.movesLines()).toEqual([MOVES_LINE]);
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
    GameState.attemptTime = seconds;
    GameState.tickets = tickets;
    GameState.completeLevel();
  }

  it('counts the bonuses into the score and emits finished once', () => {
    // Half of par: rank S and its bonus.
    clearAct('z1_retro_rush_hills', 1, Difficulty.parFor('z1_retro_rush_hills', 1)! * 0.5, 3);
    const tally = new ScoreTally('z1_retro_rush_hills');
    let finished = 0;
    tally.finished.connect(() => finished++);
    tree.root.addChild(tally);
    expect(tally.rank).toBe('S');
    expect(tally.timeBonus).toBe(20000);
    expect(tally.ticketBonus).toBe(300);
    expect(tally.hasEmeraldMoment()).toBe(true);
    const before = GameState.score;
    for (let i = 0; i < 60 * 10 && finished === 0; i++) frames(1);
    frames(60);
    expect(finished).toBe(1);
    expect(GameState.score - before).toBe(20300);
    expect(Audio.history).toContain('emerald_get');
    expect(Audio.history).toContain('tally_tick');
    tally.free();
  });

  it('jump skips the count, then continues', () => {
    // Twice par less a second: rank D, 1000.
    clearAct('z1_retro_rush_hills', 2, Difficulty.parFor('z1_retro_rush_hills', 2)! * 2 - 1, 0);
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

  it('the time bonus and rank follow time / par; a run with a death is capped at A; a boss keeps the flat table', () => {
    const par = 100;
    const cases: [number, string, number][] = [
      [70, 'S', 20000],
      [70.5, 'A', 12000],
      [85, 'A', 12000],
      [100, 'B', 8000],
      [150, 'C', 3000],
      [200, 'D', 1000],
      [200.5, 'D', 0],
    ];
    for (const [seconds, rank, bonus] of cases) {
      expect(rankFor(seconds, par), `${seconds} s`).toEqual({ rank, bonus });
      expect(ScoreTally.timeBonusFor(seconds, par)).toBe(bonus);
    }
    expect(rankFor(50, par, false)).toEqual({ rank: 'A', bonus: 12000 });
    expect(rankFor(120, par, false)).toEqual({ rank: 'C', bonus: 3000 });
    expect(betterRank('S', 'A')).toBe(true);
    expect(betterRank('B', 'B')).toBe(false);
    expect(betterRank('D', null)).toBe(true);
    // No par (a boss arena): the old flat table by seconds.
    expect(ScoreTally.timeBonusFor(40)).toBe(5000);
    expect(ScoreTally.timeBonusFor(400)).toBe(0);
    clearAct('z1_retro_rush_hills', 3, 40, 0);
    const boss = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(boss);
    expect(boss.rank).toBeNull();
    expect(boss.timeBonus).toBe(5000);
    expect(boss.timesLine()).toBe('');
    boss.free();
    // Every act has a par, and a par-pace run is a B.
    for (const zone of ZoneRegistry.allZones(true)) {
      zone.acts.forEach((_, i) => {
        const p = Difficulty.parFor(zone.id, i + 1);
        expect(p, `${zone.id} act ${i + 1}`).not.toBeNull();
        expect(rankFor(p!, p!).rank).toBe('B');
      });
      expect(Difficulty.parFor(zone.id, zone.acts.length + 1)).toBeNull();
    }
    // A death in the run: S pace shows as A on the tally.
    GameState.startLevel('z1_retro_rush_hills', 1);
    GameState.attemptTime = 10;
    GameState.restartFromCheckpoint();
    GameState.completeLevel();
    const capped = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(capped);
    expect(capped.rank).toBe('A');
    expect(capped.timeBonus).toBe(12000);
    capped.free();
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

  it('shows this clear\'s time with the saved best, NEW BEST! when it beat it, and still fits', () => {
    // The times sit either side of the act's par (a C, then a B), whatever the par is.
    const par = Difficulty.parFor('z1_retro_rush_hills', 1)!;
    const slow = Math.round(par * 1.04) + 0.456;
    const quick = Math.round(par * 0.9);
    const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t * 100) % 100)).padStart(2, '0')}`;
    expect(rankFor(slow, par).rank).toBe('C');
    expect(rankFor(quick, par).rank).toBe('B');
    clearAct('z1_retro_rush_hills', 1, slow, 4);
    HubClient.lastClear = { zone: 'z1_retro_rush_hills', act: 1, time: slow, previousBest: 80.1, newBest: false, rank: 'C', previousRank: 'C', newRank: false, clean: true };
    HubClient.lastBanked = { amount: 4, acked: false };
    let tally = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(tally);
    expect(tally.timesLine()).toBe(`TIME ${clock(slow)}   BEST 1:20.10   RANK C`);
    expect(tally.isNewBest()).toBe(false);
    expect(tally.isNewRank()).toBe(false);
    expect(tally.hasEmeraldMoment()).toBe(true);
    let r = tally.panelRect();
    expect(r.y).toBeGreaterThanOrEqual(44);
    expect(r.bottom).toBeLessThanOrEqual(223);
    drawAll(tally, fakeGfx());
    tally.free();

    clearAct('z1_retro_rush_hills', 1, quick, 4);
    HubClient.lastClear = { zone: 'z1_retro_rush_hills', act: 1, time: quick, previousBest: 80.1, newBest: true, rank: 'B', previousRank: 'C', newRank: true, clean: true };
    HubClient.lastBanked = { amount: 4, acked: false };
    tally = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(tally);
    expect(tally.timesLine()).toBe(`TIME ${clock(quick)}   NEW BEST!   RANK B NEW!`);
    expect(tally.isNewBest()).toBe(true);
    expect(tally.isNewRank()).toBe(true);
    expect(tally.panelRect().w).toBeLessThanOrEqual(416);
    r = tally.panelRect();
    expect(r.bottom).toBeLessThanOrEqual(223);
    drawAll(tally, fakeGfx());
    tally.free();

    // Another act's record is not this tally's.
    HubClient.lastClear = { zone: 'z1_retro_rush_hills', act: 2, time: 70, previousBest: null, newBest: true, rank: 'S', previousRank: null, newRank: true, clean: true };
    tally = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(tally);
    expect(tally.timesLine()).toBe(`TIME ${clock(quick)}   RANK B`);
    tally.free();
    HubClient.lastClear = null;
  });

  it('says when the hub refused the earn for its Ticket limit', () => {
    ScoreTally.watchBanks();
    GameState.startLevel('z1_retro_rush_hills', 1);
    HubClient.lastBanked = { amount: 12, acked: false };
    const tally = new ScoreTally('z1_retro_rush_hills');
    tree.root.addChild(tally);
    expect(tally.bankedLine()).toBe('+12 Tickets sent to the hub');
    HubClient.earnCapped = true;
    expect(tally.bankedLine()).toBe('Hub Ticket limit reached');
    HubClient.earnCapped = false;
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

  it('speed lines fade in above top running speed and follow the speed effects option', () => {
    expect(SpeedLines.strengthFor(4)).toBe(0);
    expect(SpeedLines.strengthFor(6)).toBe(0);
    expect(SpeedLines.strengthFor(9)).toBeCloseTo(0.5, 6);
    expect(SpeedLines.strengthFor(-12)).toBe(1);
    expect(SpeedLines.strengthFor(16)).toBe(1);
    const lines = new SpeedLines();
    const runner = { state: 'run', grounded: true, groundSpeed: 9, groundAngle: 0, velocity: new Vec2(9, 0) } as unknown as Parameters<SpeedLines['update']>[1];
    lines.update(1 / 60, runner);
    expect(lines.strength).toBeCloseTo(0.5, 6);
    const streaks = lines.streaks();
    expect(streaks.length).toBeGreaterThanOrEqual(6);
    expect(streaks.length).toBeLessThanOrEqual(10);
    // Edge bands only: never across the middle of the screen.
    for (const s of streaks) expect(s.y < 64 || s.y > 240 - 64).toBe(true);
    expect(() => lines.paint(fakeGfx())).not.toThrow();
    Settings.set('speedEffects', false);
    lines.update(1 / 60, runner);
    expect(lines.strength).toBe(0);
    expect(lines.streaks()).toEqual([]);
    Settings.set('speedEffects', true);
    lines.update(1 / 60, { ...(runner as object), groundSpeed: 5 } as never);
    expect(lines.streaks()).toEqual([]);
  });

  it('shows the teaching prompt a level asked for, worded for the device, then lets it go', () => {
    const hud = new Hud();
    tree.root.addChild(hud);
    expect(hud.promptText()).toBe('');
    Prompts.reset();
    Prompts.show('spindash');
    expect(hud.promptText()).toBe('HOLD DOWN, TAP Z, LET GO: SPIN DASH');
    Display.setTouch(true);
    expect(hud.promptText()).toBe('HOLD DOWN, TAP JUMP, LET GO: SPIN DASH');
    Display.setTouch(false);
    expect(measure(hud.promptText(), 'outline')).toBeLessThanOrEqual(416);
    expect(measure(promptLine('enemy', 'keyboard'), 'outline')).toBeLessThanOrEqual(416);
    drawAll(hud, fakeGfx());
    frames(60 * 6);
    expect(hud.promptText()).toBe('');
    expect(Prompts.show('spindash')).toBe(false); // once per run
    Prompts.reset();
    hud.free();
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

  it('game over in a stage: RETRY STAGE is the default and restarts that stage with fresh lives', () => {
    const start = vi.spyOn(GameState, 'startLevel');
    SceneRouter.startZone('z3_capital_mansion', 3);
    frames(2);
    start.mockClear();
    GameState.lives = 0;
    GameState.addScore(900);
    const title = vi.spyOn(SceneRouter, 'goTitle');
    const go = showScene(() => new GameOverScreen());
    expect(go.menu).not.toBeNull();
    expect(go.menu!.items.map((i) => i.label)).toEqual(['RETRY STAGE', 'MAIN MENU', 'HUB', 'CONTROLS']);
    for (const it of go.menu!.items) expect(it.rect.bottom).toBeLessThan(240);
    expect(go.finalScore).toBe(900);
    tapAction('jump'); // inside the 1.5 s grace
    expect(go.isLeaving()).toBe(false);
    frames(100);
    expect(go.menu!.focus).toBe(0);
    tapAction('jump');
    tapAction('jump');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('z3_capital_mansion', 3);
    expect(title).not.toHaveBeenCalled();
    expect(GameState.score).toBe(0);
    expect(GameState.lives).toBe(3);
    expect(SceneRouter.zoneId).toBe('z3_capital_mansion');
    expect(SceneRouter.stage).toBe(3);
  });

  it('game over in a stage: MAIN MENU resets the game and goes to the title', () => {
    SceneRouter.startZone('z1_retro_rush_hills', 2);
    frames(2);
    const go = vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    const retry = vi.spyOn(SceneRouter, 'retryStage');
    GameState.lives = 0;
    GameState.addScore(900);
    const screen = showScene(() => new GameOverScreen());
    frames(100);
    tapAction('ui_down');
    expect(screen.menu!.focus).toBe(1);
    tapAction('ui_accept');
    expect(go).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(GameState.score).toBe(0);
    expect(GameState.lives).toBe(3);
  });

  it('game over: a tap on RETRY STAGE retries', () => {
    SceneRouter.startZone('z1_retro_rush_hills', 1);
    frames(2);
    const retry = vi.spyOn(SceneRouter, 'retryStage').mockImplementation(() => undefined);
    GameState.lives = 0;
    const screen = showScene(() => new GameOverScreen());
    frames(100);
    const r = screen.menu!.items[0]!.rect;
    pointer(r.x + 5, r.y + 5, 'down');
    pointer(r.x + 5, r.y + 5, 'up');
    frames(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('game over outside a stage (a sandbox scene) keeps the single prompt and goes to the title', () => {
    SceneRouter.openScene(PLAY_SCENE);
    frames(2);
    const go = vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    GameState.lives = 0;
    GameState.addScore(900);
    const screen = showScene(() => new GameOverScreen());
    expect(screen.menu).toBeNull();
    frames(100);
    tapAction('ui_accept');
    expect(go).toHaveBeenCalledTimes(1);
    expect(GameState.score).toBe(0);
    expect(GameState.lives).toBe(3);
  });

  it('the ending lists the best rank of all eight acts', () => {
    resetProgress();
    saveRank('z1_retro_rush_hills:1', 'S');
    saveRank('z4_neon_rush_remix:2', 'C');
    const lines = rankLines();
    expect(lines.length).toBe(4);
    expect(lines[0]).toBe('RETRO RUSH HILLS   S  -');
    expect(lines[3]).toBe('NEON RUSH REMIX   -  C');
    const end = showScene(() => new EndingScreen());
    const texts = end.lines.map((l) => l.text);
    expect(texts).toContain('BEST RANKS');
    for (const l of lines) expect(texts).toContain(l);
    resetProgress();
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
