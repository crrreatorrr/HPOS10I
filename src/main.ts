// Boot: settings and saves, fonts, scenes and level types, the global
// overlays, input and audio, canvas scaling, the hub connection, then the
// first scene (a dev target from the URL, or the title).

import { Audio } from './core/audio';
import { Dev } from './core/dev';
import { GameState } from './core/game_state';
import { SceneRouter } from './core/scene_router';
import { MAIN_SCENE, Scenes, TITLE_SCENE } from './core/scenes';
import { Controls } from './core/controls';
import { Settings } from './core/settings';
import { HubClient } from './hub/hub_client';
import { RelicLoadout } from './hub/relic_loadout';
import { migrateGodotSave } from './hub/godot_migration';
import { installBackdrop } from './levels/common/backdrop';
import { releaseTileCaches } from './levels/common/level_nodes';
import { registerEnemies } from './levels/registry_enemies';
import { registerObjects } from './levels/registry_objects';
import { registerLevelScenes } from './levels/scenes';
import { registerNewContent } from './levels/content';
import { registerBosses } from './bosses/register';
import { installPlayerVisuals } from './player/visuals_setup';
import { TimeFocus } from './player/time_focus';
import { preload, assetUrl } from './runtime/assets';
import { crashGuard } from './runtime/crash_guard';
import { CrashPanel } from './runtime/crash_panel';
import { Fonts } from './runtime/font';
import { Input } from './runtime/input';
import { Node, ProcessMode } from './runtime/node';
import { tree, VIEW_H, VIEW_W } from './runtime/tree';
import { Vec2 } from './runtime/vec2';
import { installUi } from './ui/setup';
import { MENU_ART } from './ui/common/menu_backdrop';
import { SPROTO_SHEET } from './player/player_visual';
import { Display } from './ui/display';
import { Feedback } from './ui/feedback';
import { FullScreen } from './ui/fullscreen';
import { HubChrome } from './ui/hub_chrome';

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

/** Integer scaling only when it fills at least this much of the fractional fit. */
const FILL_FOR_INTEGER = 0.97;

function fitCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fractional = Math.min(w / VIEW_W, h / VIEW_H);
  // The game fills the window: one axis edge to edge, the page colour in the
  // spare bars, never stretched or cropped. Integer scaling in device pixels
  // keeps every game pixel the same size, so it is used when it fills nearly
  // as much (1280x720 is exactly 3x); otherwise the fractional fit wins.
  const deviceScale = Math.floor(Math.min((w * dpr) / VIEW_W, (h * dpr) / VIEW_H));
  const integerCss = deviceScale / dpr;
  const useInteger = !Display.isTouch && deviceScale >= 2 && integerCss / fractional >= FILL_FOR_INTEGER;
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

/**
 * Crash safety net: uncaught errors and rejections feed the crash guard, and when it halts
 * the game (a streak of failing frames) the "Something broke" panel offers a reload.
 * crashGuard.onCrash(fn) is where an opt-in crash reporter can attach later.
 */
const crashPanel = new CrashPanel(document, () => window.location.reload());
crashGuard.installGlobal(window);
// Errors while the tab was hidden (no frames ran) must not count toward a halt once it is back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') crashGuard.resetStreak();
});
crashGuard.onHalt((info) => {
  try {
    Audio.stopMusic();
  } catch {
    // Audio may be what broke; the panel matters more.
  }
  crashPanel.show(info.source === 'boot' ? 'retry' : 'reload');
});

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  Settings.load();
  // The player's remapped keys and buttons, before any input is read.
  Controls.load();
  await migrateGodotSave();
  await Promise.all([
    Fonts.load(),
    preload([
      assetUrl('assets/sprites/common/emerald/emerald.png'),
      assetUrl('assets/sprites/common/emerald/emerald_small.png'),
      // The title and zone select draw these on their first frame. Level art (tiles,
      // hazards, backdrops, boss sheets) loads with each level (levels/common/level_preload.ts).
      ...MENU_ART.map((p) => assetUrl(p)),
      assetUrl(SPROTO_SHEET),
    ].filter((u): u is string => !!u)),
  ]);

  // Types and scenes.
  installPlayerVisuals();
  installBackdrop();
  registerObjects();
  registerEnemies();
  registerLevelScenes();
  registerNewContent();
  registerBosses();
  // N twice: the feedback window. First, so its key listener runs before every other one.
  Feedback.install(canvas);
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
  // The hub Ticket balance and RETURN TO HUB, over the canvas on every screen.
  const chrome = new HubChrome(document, canvas, ui.pause);
  const refit = () => {
    fitCanvas(canvas);
    chrome.place();
  };
  window.addEventListener('resize', refit);
  Display.touchModeChanged.connect(refit);
  // Entering or leaving full screen (a menu's FULL SCREEN, Esc, F11) refits at once too.
  FullScreen.changed.connect(() => {
    refit();
    canvas.focus();
  });
  FullScreen.use(document as unknown as Parameters<typeof FullScreen.use>[0]);
  refit();

  // Respawns reuse the last level's tile geometry, merged edges and chunk pictures; a menu
  // means no respawn is coming, so they go (tens of MB for the big acts).
  SceneRouter.sceneChanged.connect(() => {
    if (SceneRouter.inGameplay()) return;
    releaseTileCaches();
    tree.physics.releaseMergeCache();
  });

  // The hub: redeems the portal ticket from #t= first thing. Never blocks the menus; a stage
  // start during a pending hub visit waits for it briefly (capped), so Ranked is known first.
  SceneRouter.beforeStage = () => HubClient.whenSettled();
  void HubClient.init();

  // First scene.
  // A dev target (?scene=, ?zone=) or ?dev only with the test hooks; production always opens the title.
  const target: { scene?: string; zone?: string; stage?: number } = __HPOS_TEST_HOOKS__ ? Dev.takeBootTarget() : {};
  if (target.scene && Scenes.exists(target.scene)) SceneRouter.openScene(target.scene);
  else if (target.zone) SceneRouter.startZone(target.zone, target.stage ?? 1);
  else if (!(__HPOS_TEST_HOOKS__ && Dev.args.dev) && Scenes.exists(TITLE_SCENE)) SceneRouter.goTitle();
  else SceneRouter.changeTo(MAIN_SCENE);

  if (__HPOS_TEST_HOOKS__ && typeof Dev.args.inputs === 'string') await playTimeline(Dev.args.inputs);

  document.getElementById('boot')?.classList.add('hidden');
  tree.playbackRate = () => {
    if (!Settings.data.comfortMotion || tree.paused || !SceneRouter.inGameplay()) return 1;
    // A portal session can resolve as Ranked after the first scene has loaded.
    if (HubClient.reach === 'pending' || RelicLoadout.resolve().ranked) return 1;
    return 0.8;
  };
  tree.start(canvas);
  canvas.focus();
  // Tests and the dev server only: compiled out of production builds, where it would let
  // anyone forge run times and Tickets from the console.
  if (__HPOS_TEST_HOOKS__) exposeDebugApi();
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

/** A small API for bots and smoke tests (window.hpos). Only with __HPOS_TEST_HOOKS__. */
function exposeDebugApi(): void {
  (window as unknown as { hpos: unknown }).hpos = {
    hooks: 'HPOS_TEST_HOOKS_ON',
    tree,
    router: SceneRouter,
    state: GameState,
    hub: HubClient,
    dev: Dev,
    feedback: Feedback,
    scenes: () => Scenes.ids(),
    play: (timeline: unknown) => Dev.play(timeline, SceneRouter.currentId),
  };
}

boot().then(
  // Loading is over: whatever went wrong during it does not count toward a halt.
  () => crashGuard.resetStreak(),
  (err: unknown) => {
    document.getElementById('boot')?.classList.add('hidden');
    // Logs once with the stack and shows the panel with RETRY (a stale chunk after a deploy, a failed load).
    crashGuard.report(err, 'boot');
  },
);
