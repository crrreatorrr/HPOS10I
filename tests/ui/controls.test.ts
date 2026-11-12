// The controller settings (src/core/controls.ts and the CONTROLS screen,
// src/ui/controls/controls_screen.ts), the FULL SCREEN option
// (src/ui/fullscreen.ts) and the standard options every menu offers: MAIN
// MENU (except on the title), HUB, CONTROLS and FULL SCREEN.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls, DEADZONE_MAX, isReservedKey, menuClashKey } from '../../src/core/controls';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Scenes } from '../../src/core/scenes';
import { Settings } from '../../src/core/settings';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { HubClient } from '../../src/hub/hub_client';
import { memoryStore, SAVE_KEYS, Storage } from '../../src/hub/storage';
import { LEFT_STICK_DEADZONE, type PadLike } from '../../src/runtime/gamepad';
import { DEFAULT_KEY_BINDINGS, Input, InputManager, KEY_BINDINGS, PAD_BUTTONS, type Action, type CapturedInput } from '../../src/runtime/input';
import { Node } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Rect2 } from '../../src/runtime/vec2';
import { menuLabels } from '../../src/ui/common/standard_items';
import { ControlsScreen, controlsScreen } from '../../src/ui/controls/controls_screen';
import { Display } from '../../src/ui/display';
import { FullScreen, type FullscreenDoc } from '../../src/ui/fullscreen';
import { GameOverScreen } from '../../src/ui/game_over/game_over';
import { PauseMenu } from '../../src/ui/pause/pause_menu';
import { registerUiScenes } from '../../src/ui/setup';
import { TitleScreen } from '../../src/ui/title/title_screen';
import { ZoneSelect } from '../../src/ui/zone_select/zone_select';

const PLAY_SCENE = 'test:controls_play';
let overlays: Node[] = [];

/** A document with the Fullscreen API: requestFullscreen()/exitFullscreen() flip fullscreenElement. */
class FakeFullscreenDoc implements FullscreenDoc {
  fullscreenEnabled = true;
  fullscreenElement: Element | null = null;
  requests = 0;
  refuse = false;
  private listeners: (() => void)[] = [];
  readonly documentElement = {
    requestFullscreen: (): Promise<void> => {
      this.requests++;
      if (this.refuse) return Promise.reject(new Error('not a gesture'));
      this.fullscreenElement = {} as Element;
      this.listeners.forEach((l) => l());
      return Promise.resolve();
    },
  };
  exitFullscreen = (): Promise<void> => {
    this.fullscreenElement = null;
    this.listeners.forEach((l) => l());
    return Promise.resolve();
  };
  addEventListener(_type: 'fullscreenchange', fn: () => void): void {
    this.listeners.push(fn);
  }
}

function frames(n: number): void {
  tree.advance(n);
}

function tapAction(action: Action): void {
  Input.actionPress(action, 'test');
  frames(1);
  Input.actionRelease(action, 'test');
  frames(1);
}

function tapKey(code: string): void {
  Input.keyDown(code, false);
  frames(1);
  Input.keyUp(code);
  frames(1);
}

function fakePad(): PadLike & { buttons: { pressed: boolean; value: number }[]; axes: number[] } {
  return { index: 0, id: 'test pad', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
}

function showScene<T extends Node>(make: () => T): T {
  return tree.changeSceneNow(make) as T;
}

function addOverlay<T extends Node>(node: T): T {
  tree.addAutoload(node);
  overlays.push(node);
  return node;
}

function enterGameplay(): void {
  SceneRouter.openScene(PLAY_SCENE);
  frames(2);
  expect(SceneRouter.inGameplay()).toBe(true);
}

let doc: FakeFullscreenDoc;

beforeEach(() => {
  for (const zone of ZoneRegistry.allZones(true)) {
    for (let stage = 1; stage <= zone.acts.length + 1; stage++) {
      const id = ZoneRegistry.stagePath(zone.id, stage);
      if (id !== '') Scenes.register(id, () => new Node('FakeStage'));
    }
  }
  Scenes.register(PLAY_SCENE, () => new Node('Play'));
  registerUiScenes();
  Storage.use(memoryStore());
  Controls.resetDefaults();
  doc = new FakeFullscreenDoc();
  FullScreen.use(doc);
  Input.releaseAll();
  Input.lastDevice = 'keyboard';
  tree.paused = false;
  Display.reset(false);
  GameState.resetGame();
  Settings.reset();
  showScene(() => new Node('Empty'));
  frames(1);
});

afterEach(() => {
  controlsScreen().close();
  for (const o of overlays) o.free();
  overlays = [];
  Controls.resetDefaults();
  FullScreen.use(null);
  Input.captureNext(null);
  Input.releaseAll();
  tree.paused = false;
  vi.restoreAllMocks();
});

// --- Storage and mapping ---------------------------------------------------------

describe('controller settings: mapping and storage', () => {
  it('a remapped key drives the action at once, and the old one no longer does', () => {
    const r = Controls.bindKey('jump', 'KeyJ');
    expect(r.ok).toBe(true);
    expect(KEY_BINDINGS.jump).toEqual(['KeyJ', 'KeyX', 'KeyC', 'Space', 'KeyK']);
    Input.keyDown('KeyJ', false);
    expect(Input.isActionHeldNow('jump')).toBe(true);
    Input.keyUp('KeyJ');
    Input.keyDown('KeyZ', false);
    expect(Input.isActionHeldNow('jump')).toBe(false);
    Input.keyUp('KeyZ');
  });

  it('saves under its own key, loads it back, and RESET TO DEFAULTS restores everything', () => {
    Controls.bindKey('move_left', 'KeyJ');
    Controls.bindButton('focus', 6);
    Controls.stepDeadzone(2);
    const saved = JSON.parse(Storage.store.getItem(SAVE_KEYS.controls)!);
    expect(saved.keys).toEqual({ move_left: ['KeyJ', 'KeyA'] });
    expect(saved.pad).toEqual({ focus: [6, 5] });
    expect(saved.deadzone).toBeCloseTo(0.3);
    // A fresh boot: defaults, then the save.
    Controls.resetDefaults();
    Storage.store.setItem(SAVE_KEYS.controls, JSON.stringify(saved));
    Controls.load();
    expect(KEY_BINDINGS.move_left).toEqual(['KeyJ', 'KeyA']);
    expect(PAD_BUTTONS.focus).toEqual([6, 5]);
    expect(Input.stickDeadzone).toBeCloseTo(0.3);
    expect(Controls.isDefault()).toBe(false);
    Controls.resetDefaults();
    expect(KEY_BINDINGS.move_left).toEqual(DEFAULT_KEY_BINDINGS.move_left);
    expect(Input.stickDeadzone).toBe(LEFT_STICK_DEADZONE);
    expect(JSON.parse(Storage.store.getItem(SAVE_KEYS.controls)!).keys).toEqual({});
  });

  it('a broken or hostile save falls back to the defaults, and storage that throws is survived', () => {
    Storage.store.setItem(SAVE_KEYS.controls, JSON.stringify({ keys: { jump: [], pause: ['Escape'], move_up: [42] }, pad: { jump: [99] }, deadzone: 'x' }));
    Controls.load();
    expect(Controls.isDefault()).toBe(true);
    Storage.store.setItem(SAVE_KEYS.controls, '{not json');
    Controls.load();
    expect(Controls.isDefault()).toBe(true);
    Storage.use({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect(() => Controls.load()).not.toThrow();
    expect(Controls.bindKey('jump', 'KeyJ').ok).toBe(true);
    expect(KEY_BINDINGS.jump[0]).toBe('KeyJ');
  });

  it('conflicts: a key taken from another action moves, or the two swap when it was its only one', () => {
    const moved = Controls.bindKey('move_left', 'KeyX');
    expect(moved.message).toContain('MOVED FROM JUMP');
    expect(KEY_BINDINGS.move_left).toEqual(['KeyX', 'KeyA']);
    expect(KEY_BINDINGS.jump).not.toContain('KeyX');
    // F is Time Focus's only key: jump takes it, focus gets jump's old first key.
    const swapped = Controls.bindKey('jump', 'KeyF');
    expect(swapped.message).toContain('SWAPPED WITH TIME FOCUS');
    expect(KEY_BINDINGS.focus).toEqual(['KeyZ']);
    expect(KEY_BINDINGS.jump[0]).toBe('KeyF');
    // Every key is still on exactly one remappable action.
    const all = ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'pause', 'focus'].flatMap((a) => KEY_BINDINGS[a as Action]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('reserved keys and menu keys are refused; menu actions never change', () => {
    for (const code of ['Escape', 'KeyN', 'F5', 'F11', 'Tab']) {
      expect(isReservedKey(code)).toBe(true);
      expect(Controls.bindKey('jump', code).ok).toBe(false);
    }
    // An arrow on jump would choose menu items while moving through them.
    expect(menuClashKey('jump', 'ArrowDown')).toBe('ui_down');
    expect(Controls.bindKey('jump', 'ArrowDown').ok).toBe(false);
    expect(Controls.bindKey('move_up', 'Enter').ok).toBe(false);
    // The matching ones are fine: Up on look, Enter on pause.
    expect(Controls.bindKey('move_down', 'ArrowDown').ok).toBe(true);
    expect(Controls.bindKey('pause', 'Space').ok).toBe(true);
    expect(KEY_BINDINGS.ui_accept).toEqual(['Enter', 'NumpadEnter', 'Space']);
    expect(KEY_BINDINGS.ui_cancel).toEqual(['Escape']);
    expect(KEY_BINDINGS.jump).toEqual(['KeyZ', 'KeyX', 'KeyC', 'KeyK']);
  });

  it('pad buttons remap the same way; B is kept for cancel and menu buttons stay put', () => {
    expect(Controls.bindButton('jump', 4).message).toContain('MOVED FROM TIME FOCUS');
    expect(PAD_BUTTONS.jump).toEqual([4, 1, 2, 3]);
    expect(PAD_BUTTONS.focus).toEqual([5]);
    expect(Controls.bindButton('pause', 1).ok).toBe(false);
    expect(Controls.bindButton('focus', 0).ok).toBe(false); // A chooses in menus
    expect(Controls.bindButton('focus', 16).ok).toBe(false); // Home is the browser's
    expect(PAD_BUTTONS.ui_accept).toEqual([0]);
    // The new button drives the action through the pad reader.
    const input = new InputManager();
    const pad = fakePad();
    input.feedPads([pad]);
    input.beginProcessFrame();
    pad.buttons[4] = { pressed: true, value: 1 };
    input.feedPads([pad]);
    expect(input.isActionHeldNow('jump')).toBe(true);
    expect(input.isActionHeldNow('focus')).toBe(false);
  });

  it('the stick deadzone is the player setting, within its range', () => {
    const input = new InputManager();
    const pad = fakePad();
    input.feedPads([pad]);
    pad.axes = [0.5, 0, 0, 0];
    input.feedPads([pad]);
    expect(input.isActionHeldNow('move_right')).toBe(true);
    // A bigger deadzone: the same half push no longer counts.
    input.stickDeadzone = DEADZONE_MAX;
    input.feedPads([pad]);
    expect(input.isActionHeldNow('move_right')).toBe(false);
    for (let i = 0; i < 20; i++) Controls.stepDeadzone(1);
    expect(Controls.deadzone).toBeCloseTo(DEADZONE_MAX);
    expect(Controls.stepDeadzone(1)).toBe(false);
  });

  it('press-to-bind capture: the next key or pad button goes to the screen, never to the game', () => {
    const input = new InputManager();
    const got: CapturedInput[] = [];
    input.captureNext((c) => got.push(c));
    input.keyDown('KeyZ', false);
    expect(got).toEqual([{ kind: 'key', code: 'KeyZ' }]);
    expect(input.isActionHeldNow('jump')).toBe(false);
    input.keyUp('KeyZ');
    // A pad button: one already held when capture starts doesn't count; a fresh press does and is latched.
    const pad = fakePad();
    input.feedPads([pad]);
    pad.buttons[0] = { pressed: true, value: 1 };
    input.feedPads([pad]);
    input.captureNext((c) => got.push(c));
    input.feedPads([pad]);
    expect(got.length).toBe(1);
    pad.buttons[2] = { pressed: true, value: 1 };
    input.feedPads([pad]);
    expect(got[1]).toEqual({ kind: 'pad', button: 2 });
    expect(input.isActionHeldNow('jump')).toBe(true); // A, held since before
    pad.buttons[0] = { pressed: false, value: 0 };
    input.feedPads([pad]);
    expect(input.isActionHeldNow('jump')).toBe(false); // X (2) is latched until released
    pad.buttons[2] = { pressed: false, value: 0 };
    input.feedPads([pad]);
    pad.buttons[2] = { pressed: true, value: 1 };
    input.feedPads([pad]);
    expect(input.isActionHeldNow('jump')).toBe(true);
  });

  it('Esc that leaves browser full screen never reaches the game', () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const fakeDoc = { fullscreenElement: {} as Element | null, visibilityState: 'visible', addEventListener: () => undefined };
    const target = { document: fakeDoc, addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] ??= []).push(fn) };
    const input = new InputManager();
    input.attach(target as unknown as Window);
    const key = (code: string) => ({ code, repeat: false, preventDefault: () => undefined });
    listeners.keydown!.forEach((fn) => fn(key('Escape')));
    expect(input.isActionHeldNow('pause')).toBe(false);
    expect(input.isActionHeldNow('ui_cancel')).toBe(false);
    fakeDoc.fullscreenElement = null;
    listeners.keydown!.forEach((fn) => fn(key('Escape')));
    expect(input.isActionHeldNow('ui_cancel')).toBe(true);
  });
});

// --- FULL SCREEN -----------------------------------------------------------------

describe('FULL SCREEN', () => {
  it('toggles the page through the Fullscreen API and the label follows', async () => {
    expect(FullScreen.available()).toBe(true);
    expect(FullScreen.label()).toBe('FULL SCREEN: OFF');
    FullScreen.toggle();
    expect(doc.requests).toBe(1);
    expect(FullScreen.label()).toBe('FULL SCREEN: ON');
    // Esc or F11 leaving it (the browser's doing): the label reads the document.
    doc.fullscreenElement = null;
    expect(FullScreen.label()).toBe('FULL SCREEN: OFF');
    doc.refuse = true;
    FullScreen.toggle();
    await Promise.resolve();
    await Promise.resolve();
    expect(FullScreen.notice()).not.toBe('');
  });

  it('is left out where the browser cannot go full screen', () => {
    doc.fullscreenEnabled = false;
    const title = showScene(() => new TitleScreen());
    expect(menuLabels(title.menu.items)).not.toContain('FULL SCREEN: OFF');
    FullScreen.use(null);
    expect(FullScreen.available()).toBe(false);
  });
});

// --- Every menu's options ----------------------------------------------------------

describe('standard options on every menu', () => {
  it('title: START, CONTROLS, FULL SCREEN, HUB (no MAIN MENU: it is the main menu)', () => {
    const title = showScene(() => new TitleScreen());
    expect(menuLabels(title.menu.items)).toEqual(['START', 'CONTROLS', 'FULL SCREEN: OFF', 'HUB']);
    for (const it of title.menu.items) expect(it.rect.bottom).toBeLessThan(240);
  });

  it('zone select: MAIN MENU, HUB, CONTROLS and FULL SCREEN in its bottom row', () => {
    const zs = showScene(() => new ZoneSelect());
    const row = zs.grid[zs.grid.length - 1]!.map((i) => zs.menu.items[i]!);
    expect(menuLabels(row)).toEqual(['MAIN MENU', 'HUB', 'CONTROLS', 'FULL SCREEN: OFF']);
    const last = row[row.length - 1]!.rect;
    expect(last.right).toBeLessThanOrEqual(424);
  });

  it('pause menu and its OPTIONS page: MAIN MENU, EXIT TO HUB, CONTROLS, FULL SCREEN', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    const main = menuLabels(pm.main.items);
    for (const l of ['MAIN MENU', 'EXIT TO HUB', 'CONTROLS', 'FULL SCREEN: OFF']) expect(main).toContain(l);
    for (const it of pm.main.items) expect(it.rect.bottom).toBeLessThanOrEqual(238);
    const opts = menuLabels(pm.options.items);
    for (const l of ['MAIN MENU', 'EXIT TO HUB', 'CONTROLS', 'FULL SCREEN: OFF', 'BACK']) expect(opts).toContain(l);
  });

  it('game over: RETRY STAGE, MAIN MENU, HUB, CONTROLS, FULL SCREEN', () => {
    SceneRouter.startZone('z1_retro_rush_hills', 1);
    frames(2);
    GameState.lives = 0;
    const go = showScene(() => new GameOverScreen());
    expect(menuLabels(go.menu!.items)).toEqual(['RETRY STAGE', 'MAIN MENU', 'HUB', 'CONTROLS', 'FULL SCREEN: OFF']);
    for (const it of go.menu!.items) expect(it.rect.bottom).toBeLessThan(240);
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    frames(100);
    tapAction('ui_down');
    tapAction('ui_down');
    tapAction('ui_accept');
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('choosing FULL SCREEN in a menu calls the Fullscreen API from that press', () => {
    const title = showScene(() => new TitleScreen());
    frames(20);
    tapAction('ui_down');
    tapAction('ui_down');
    expect(menuLabels([title.menu.focused!])).toEqual(['FULL SCREEN: OFF']);
    tapAction('ui_accept');
    expect(doc.requests).toBe(1);
    expect(menuLabels([title.menu.focused!])).toEqual(['FULL SCREEN: ON']);
    expect(title.isLeaving()).toBe(false);
  });

  it('pause MAIN MENU asks first; KEEP PLAYING goes back, MAIN MENU goes to the title', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    const title = vi.spyOn(SceneRouter, 'goTitle').mockImplementation(() => undefined);
    tapAction('pause');
    pm.main.setFocus(5, true);
    tapAction('ui_accept');
    expect(pm.page).toBe('confirm');
    expect(pm.confirmKind).toBe('title');
    expect(menuLabels(pm.confirm.items)).toEqual(['MAIN MENU', 'KEEP PLAYING']);
    expect(pm.confirm.focus).toBe(1);
    tapAction('ui_accept');
    expect(pm.page).toBe('main');
    expect(pm.main.focus).toBe(5);
    expect(title).not.toHaveBeenCalled();
    tapAction('ui_accept');
    tapAction('ui_up');
    tapAction('ui_accept');
    expect(title).toHaveBeenCalledTimes(1);
    expect(tree.paused).toBe(false);
  });

  it('pause columns: left/right move between them when there is no skin to cycle', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    expect(pm.main.focus).toBe(0);
    tapAction('ui_right');
    expect(pm.main.focus).toBe(5);
    tapAction('ui_down');
    expect(pm.main.focus).toBe(6);
    tapAction('ui_left');
    expect(pm.main.focus).toBe(1);
  });
});

// --- The CONTROLS screen -------------------------------------------------------------

describe('CONTROLS screen', () => {
  function openFromTitle(): { title: TitleScreen; screen: ControlsScreen } {
    const title = showScene(() => new TitleScreen());
    frames(20);
    tapAction('ui_down'); // CONTROLS
    tapAction('ui_accept');
    const screen = controlsScreen();
    expect(screen.isOpen()).toBe(true);
    return { title, screen };
  }

  it('lists every remappable action and offers BACK, HUB and FULL SCREEN from the title', () => {
    const { screen } = openFromTitle();
    const labels = screen.labels();
    for (const l of ['MOVE LEFT KEY', 'MOVE LEFT BUTTON', 'JUMP KEY', 'JUMP BUTTON', 'PAUSE KEY', 'TIME FOCUS BUTTON', 'RESET TO DEFAULTS', 'BACK', 'HUB', 'FULL SCREEN: OFF']) expect(labels).toContain(l);
    expect(labels).not.toContain('MAIN MENU');
    expect(labels.some((l) => l.startsWith('STICK DEAD ZONE'))).toBe(true);
    for (const it of screen.menu.items) {
      expect(it.rect.bottom).toBeLessThan(240);
      expect(it.rect.right).toBeLessThanOrEqual(424);
    }
  });

  it('remaps a key by keyboard: choose the cell, press the new key; it takes effect at once', () => {
    const { title, screen } = openFromTitle();
    const jumpKey = screen.menu.items.findIndex((i) => i.label instanceof Function && i.label() === 'JUMP KEY');
    screen.menu.setFocus(jumpKey, true);
    tapAction('ui_accept');
    expect(screen.binding).toEqual({ action: 'jump', device: 'key' });
    tapKey('KeyJ');
    expect(screen.binding).toBeNull();
    expect(KEY_BINDINGS.jump[0]).toBe('KeyJ');
    expect(screen.message).toContain('JUMP');
    // Esc cancels the next one, and goes no further.
    tapAction('ui_accept');
    expect(screen.binding).not.toBeNull();
    tapKey('Escape');
    expect(screen.binding).toBeNull();
    expect(screen.isOpen()).toBe(true);
    expect(KEY_BINDINGS.jump[0]).toBe('KeyJ');
    // Esc again: back to the title, which neither starts nor leaves.
    tapKey('Escape');
    expect(screen.isOpen()).toBe(false);
    frames(2);
    expect(title.isLeaving()).toBe(false);
    expect(title.menu.focused?.label).toBe('CONTROLS');
    // The new key starts the game from the title (jump chooses START).
    title.menu.setFocus(0, true);
    tapKey('KeyJ');
    expect(title.isLeaving()).toBe(true);
  });

  it('remaps a pad button with the pad; B cancels', () => {
    const { screen } = openFromTitle();
    const pad = fakePad();
    const feed = (b: number, down: boolean) => {
      pad.buttons[b] = { pressed: down, value: down ? 1 : 0 };
      Input.feedPads([pad]);
      frames(1);
    };
    Input.feedPads([pad]);
    frames(1);
    const cell = screen.menu.items.findIndex((i) => i.label instanceof Function && i.label() === 'TIME FOCUS BUTTON');
    screen.menu.setFocus(cell, true);
    feed(0, true);
    feed(0, false);
    expect(screen.binding).toEqual({ action: 'focus', device: 'pad' });
    feed(7, true); // RT
    expect(screen.binding).toBeNull();
    expect(PAD_BUTTONS.focus).toEqual([7, 5]);
    feed(7, false);
    feed(0, true);
    feed(0, false);
    expect(screen.binding).not.toBeNull();
    feed(1, true); // B cancels
    expect(screen.binding).toBeNull();
    expect(screen.isOpen()).toBe(true);
    feed(1, false);
    expect(PAD_BUTTONS.focus).toEqual([7, 5]);
    Input.feedPads([null]);
  });

  it('from the pause menu: MAIN MENU and HUB ask the pause menu question; the game stays paused', () => {
    const pm = addOverlay(new PauseMenu());
    enterGameplay();
    tapAction('pause');
    pm.main.setFocus(7, true); // CONTROLS
    tapAction('ui_accept');
    const screen = controlsScreen();
    expect(screen.isOpen()).toBe(true);
    expect(screen.labels()).toEqual(expect.arrayContaining(['BACK', 'MAIN MENU', 'HUB', 'FULL SCREEN: OFF']));
    // Pause and Esc don't resume the game under it.
    tapAction('pause');
    expect(pm.isOpen()).toBe(true);
    expect(pm.isResumePending()).toBe(false);
    const hub = screen.menu.items.findIndex((i) => i.label === 'HUB');
    screen.menu.setFocus(hub, true);
    tapAction('ui_accept');
    expect(screen.isOpen()).toBe(false);
    expect(pm.page).toBe('confirm');
    expect(pm.confirmKind).toBe('hub');
    expect(tree.paused).toBe(true);
  });

  it('BACK from the zone select returns to it without going to the title', () => {
    const back = vi.spyOn(SceneRouter, 'goTitle');
    const zs = showScene(() => new ZoneSelect());
    frames(20);
    zs.menu.setFocus(zs.controlsIndex, true);
    tapAction('ui_accept');
    const screen = controlsScreen();
    expect(screen.isOpen()).toBe(true);
    expect(screen.labels()).toEqual(expect.arrayContaining(['BACK', 'MAIN MENU', 'HUB']));
    tapAction('ui_cancel');
    expect(screen.isOpen()).toBe(false);
    frames(2);
    expect(back).not.toHaveBeenCalled();
    expect(zs.menu.focus).toBe(zs.controlsIndex);
    expect(ControlsScreen.blocking()).toBe(false);
  });

  it('a click on a cell starts a bind and a click elsewhere cancels it', () => {
    const { screen } = openFromTitle();
    const r: Rect2 = screen.menu.items[0]!.rect;
    Input.pointerEvent(r.center, 'down', 1, false);
    Input.pointerEvent(r.center, 'up', 1, false);
    frames(1);
    expect(screen.binding).toEqual({ action: 'move_left', device: 'key' });
    frames(1);
    Input.pointerEvent(r.center, 'down', 1, false);
    frames(1);
    expect(screen.binding).toBeNull();
    Input.pointerEvent(r.center, 'up', 1, false);
    frames(1);
  });
});
