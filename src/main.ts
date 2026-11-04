// Boot: settings and saves, fonts, scenes and level types, the global
// overlays, input and audio, canvas scaling, the hub connection, then the
// first scene (a dev target from the URL, or the title).

import { Audio } from './core/audio';
import { Dev } from './core/dev';
import { GameState } from './core/game_state';
import { SceneRouter } from './core/scene_router';
import { MAIN_SCENE, Scenes, TITLE_SCENE } from './core/scenes';
import { Settings } from './core/settings';
import { HubClient } from './hub/hub_client';
import { migrateGodotSave } from './hub/godot_migration';
import { installBackdrop } from './levels/common/backdrop';
import { registerEnemies } from './levels/registry_enemies';
import { registerObjects } from './levels/registry_objects';
import { registerLevelScenes } from './levels/scenes';
import { registerNewContent } from './levels/content';
import { installPlayerVisuals } from './player/visuals_setup';
import { TimeFocus } from './player/time_focus';
import { preload, assetUrl } from './runtime/assets';
import { Fonts } from './runtime/font';
import { Input } from './runtime/input';
import { Node, ProcessMode } from './runtime/node';
import { tree, VIEW_H, VIEW_W } from './runtime/tree';
import { Vec2 } from './runtime/vec2';
import { installUi } from './ui/setup';
import { Display } from './ui/display';

/** Ticks the run clock (GameState.levelTime) on physics ticks; pauses with the game. */
class GameClock extends Node {
  constructor() {
    super('GameClock');
    this.processMode = ProcessMode.PAUSABLE;
  }

  override physicsProcess(delta: number): void {
    GameState.tick(delta);
  }
}

/** Per-frame audio housekeeping (ducking while paused, the gamepad unlock hint). */
class AudioTicker extends Node {
  constructor() {
    super('AudioTicker');
    this.processMode = ProcessMode.ALWAYS;
  }

  override process(): void {
    Audio.tick(tree.paused, Input.lastDevice === 'pad');
  }
}

function fitCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fractional = Math.min(w / VIEW_W, h / VIEW_H);
  // Integer scaling in device pixels keeps every game pixel the same size.
  const deviceScale = Math.floor(Math.min((w * dpr) / VIEW_W, (h * dpr) / VIEW_H));
  const integerCss = deviceScale / dpr;
  const useInteger = !Display.isTouch && deviceScale >= 2 && integerCss / fractional >= 0.85;
  const scale = useInteger ? integerCss : fractional;
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}

function wirePointer(canvas: HTMLCanvasElement): void {
  const toGame = (e: PointerEvent): Vec2 => {
    const r = canvas.getBoundingClientRect();
    return new Vec2(((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H);
  };
  const touch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
    Input.pointerEvent(toGame(e), 'down', e.pointerId, touch(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    Input.pointerEvent(toGame(e), 'move', e.pointerId, touch(e));
  });
  const up = (e: PointerEvent) => {
    Input.pointerEvent(toGame(e), 'up', e.pointerId, touch(e));
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  Settings.load();
  await migrateGodotSave();
  await Promise.all([
    Fonts.load(),
    preload([assetUrl('assets/sprites/common/emerald/emerald.png'), assetUrl('assets/sprites/common/emerald/emerald_small.png')].filter((u): u is string => !!u)),
  ]);

  // Types and scenes.
  installPlayerVisuals();
  installBackdrop();
  registerObjects();
  registerEnemies();
  registerLevelScenes();
  registerNewContent();
  const ui = installUi();

  // Autoloads (before the first scene), then the global overlays.
  tree.addAutoload(Dev);
  tree.addAutoload(new GameClock());
  tree.addAutoload(TimeFocus);
  tree.addAutoload(new AudioTicker());
  for (const overlay of ui.overlays) tree.addAutoload(overlay);

  Input.attach(window);
  Audio.attach(window);
  if (Settings.data.muted || Dev.args.mute) Audio.setMuted(true);
  wirePointer(canvas);
  if (Dev.args.touch) Display.setTouch(true);
  const refit = () => fitCanvas(canvas);
  window.addEventListener('resize', refit);
  Display.touchModeChanged.connect(refit);
  refit();

  // The hub: redeems the portal ticket from #t= first thing. Never blocks play.
  void HubClient.init();

  // First scene.
  const target = Dev.takeBootTarget();
  if (target.scene && Scenes.exists(target.scene)) SceneRouter.openScene(target.scene);
  else if (target.zone) SceneRouter.startZone(target.zone, target.stage ?? 1);
  else if (!Dev.args.dev && Scenes.exists(TITLE_SCENE)) SceneRouter.goTitle();
  else SceneRouter.changeTo(MAIN_SCENE);

  if (typeof Dev.args.inputs === 'string') await playTimeline(Dev.args.inputs);

  document.getElementById('boot')?.classList.add('hidden');
  tree.start(canvas);
  canvas.focus();
  exposeDebugApi();
}

async function playTimeline(name: string): Promise<void> {
  if (import.meta.env.DEV) {
    const timelines = import.meta.glob('/tests/**/inputs/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
    const key = Object.keys(timelines).find((k) => k.endsWith(`/${name}.json`) || k.endsWith(`/${name}`));
    if (key) {
      Dev.play(await timelines[key]!());
      return;
    }
  }
  try {
    const res = await fetch(name);
    if (res.ok) Dev.play(await res.json());
  } catch {
    console.warn(`[Dev] could not load input timeline ${name}`);
  }
}

/** A small API for bots and smoke tests (window.hpos). */
function exposeDebugApi(): void {
  (window as unknown as { hpos: unknown }).hpos = {
    tree,
    router: SceneRouter,
    state: GameState,
    hub: HubClient,
    dev: Dev,
    scenes: () => Scenes.ids(),
    play: (timeline: unknown) => Dev.play(timeline, SceneRouter.currentId),
  };
}

boot().catch((err: unknown) => {
  console.error('[Boot] failed', err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'HPOS10I could not start. Please reload the page.';
});
