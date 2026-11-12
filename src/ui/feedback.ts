// In-game feedback: N twice (or SEND FEEDBACK in the pause menu) opens the hub SDK's feedback
// window. This file is only the game's side of it: how to freeze and unfreeze the game, what to
// say about "right now", which events to remember, and the window's colours.
//
// - The window is a DOM overlay from the SDK (vendor/hub-sdk, feedback.js). It takes the
//   screenshot before it appears and stops key events at the window, in the capture phase, so
//   install() runs before any other key listener is added (main.ts, before installUi).
// - The screenshot is the whole page (SDK 0.7.2): #game, named in `canvases`, is copied directly
//   and the page's HTML (the hub chrome bar) is drawn over it (pageShot.js). The menus, HUD and
//   pause menu are drawn on #game, so they are in it either way. Leave the SDK's `overlay` on.
// - Freezing is tree.suspended, not tree.paused: nothing runs, not even the pause menu, so
//   whatever was on screen (a run, the pause menu, a title, a tally) is exactly the same when the
//   window closes. Held inputs are released on both sides, so nothing stays down across it.
// - Only signed-in hub players can send. Standalone, the SDK shows a one-line toast instead.
// - Outside a browser (tests) everything here is a no-op.

import { installFeedback, type FeedbackContext, type FeedbackHandle } from '@hub-sdk';
import { Audio } from '../core/audio';
import { Difficulty } from '../core/difficulty';
import { GameState } from '../core/game_state';
import { SceneRouter } from '../core/scene_router';
import { HubClient } from '../hub/hub_client';
import { RelicLoadout } from '../hub/relic_loadout';
import { LevelHooks, LevelRoot } from '../levels/common/level_root';
import { TimeFocus } from '../player/time_focus';
import { crashGuard, type CrashInfo } from '../runtime/crash_guard';
import { Input } from '../runtime/input';
import type { Node } from '../runtime/node';
import type { Signal } from '../runtime/signal';
import { tree } from '../runtime/tree';
import type { Vec2 } from '../runtime/vec2';
import { Display } from './display';

/** Crash-guard errors kept for a note (the SDK attaches the last 10). */
const ERRORS_KEPT = 10;

/** What pause() hands to resume(): the state to put back. */
interface FreezeToken {
  suspended: boolean;
  at: number;
}

/** The bits of a boss the breadcrumbs and the context read (bosses/boss_base.ts). */
interface BossLike extends Node {
  phase: number;
  hitsLeft: number;
  phaseChanged: Signal<[number]>;
  defeated: Signal;
  telegraphStarted: Signal<[string, number]>;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
const point = (v: Vec2): { x: number; y: number } => ({ x: r1(v.x), y: r1(v.y) });

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

function isBossStage(): boolean {
  const zone = SceneRouter.currentZone();
  return !!zone && SceneRouter.stage > zone.acts.length;
}

function mode(): string {
  if (!SceneRouter.inGameplay()) return 'menu';
  if (SceneRouter.freeScene !== '') return 'sandbox';
  return isBossStage() ? 'boss' : 'act';
}

/** The game right now, for a feedback note. Cheap: plain reads, no searches beyond two group lookups. */
export function feedbackContext(): FeedbackContext {
  const playing = SceneRouter.inGameplay();
  const level = playing ? LevelRoot.find(null) : null;
  const player = level?.player ?? null;
  const context: FeedbackContext = {
    level: SceneRouter.currentId,
    mode: mode(),
    extra: {
      zone: SceneRouter.zoneId,
      stage: SceneRouter.stage,
      difficulty: playing && SceneRouter.zoneId !== '' ? Difficulty.current() : null,
      paused: tree.paused,
      timeScale: tree.timeScale,
      physicsFrames: tree.physicsFrames,
      ranked: RelicLoadout.resolve().ranked,
      hub: HubClient.reach,
      device: Display.isTouch ? 'touch' : Input.lastDevice,
      emeralds: GameState.emeraldCount(),
    },
  };
  if (playing) {
    context.gameTime = GameState.levelTime;
    const checkpoint = GameState.checkpointPosition;
    context.player = {
      lives: GameState.lives,
      tickets: GameState.tickets,
      score: GameState.score,
      checkpoint: checkpoint ? point(checkpoint) : null,
      phase: level?.phase() ?? null,
    };
  }
  if (player && !player.isFreed()) {
    context.position = point(player.globalPosition);
    const velocity = player.velocity;
    Object.assign(context.player!, {
      state: player.state,
      // px per frame at 60 fps, as in docs/PHYSICS.md.
      groundSpeed: r1(player.groundSpeed),
      velocity: point(velocity),
      grounded: player.grounded,
      ball: player.isBall,
      facing: player.facing,
      shield: player.moves.shield,
      invincible: player.isInvincible(),
    });
  }
  const boss = playing ? tree.getFirstNodeInGroup<BossLike>('boss') : null;
  if (boss) context.extra!.boss = { name: boss.name, phase: boss.phase, hitsLeft: boss.hitsLeft };
  return context;
}

class FeedbackImpl {
  /**
   * True for the one frame between SEND FEEDBACK and the screenshot: the pause menu does not
   * draw itself, so the picture shows the game.
   */
  hidesMenus = false;

  private handle: FeedbackHandle | null = null;
  private readonly errors: { message: string; stack: string; at: number; source: string }[] = [];

  /** Once, at boot, before the game adds its own key listeners. `canvas` is #game. */
  install(canvas: HTMLCanvasElement): void {
    if (this.handle || typeof window === 'undefined') return;
    crashGuard.onCrash((info) => this.onCrash(info));
    this.handle = installFeedback({
      title: 'HPOS10I',
      version: __BUILD_ID__,
      transport: HubClient.feedbackTransport(),
      pause: () => this.freeze(),
      resume: (token) => this.unfreeze(token as FreezeToken),
      context: feedbackContext,
      canvases: () => [canvas],
      errors: () => this.errors,
      theme: THEME,
    });
    this.wireBreadcrumbs();
  }

  /** Opens the window now. `fromMenu`: asked from the pause menu, which hides for the screenshot. */
  open(fromMenu = false): void {
    if (!this.handle || this.handle.isOpen()) return;
    this.hidesMenus = fromMenu;
    this.handle.open();
    // The SDK takes the screenshot in the next frame, after the game drew it. If it refused
    // instead (no hub session: a toast), the menu comes back in that same frame.
    if (fromMenu && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => (this.hidesMenus = false));
  }

  isOpen(): boolean {
    return this.handle?.isOpen() ?? false;
  }

  /** Remembers a game event; the last 24 go with a note. */
  breadcrumb(type: string, data?: Record<string, unknown>): void {
    this.handle?.breadcrumb(type, data);
  }

  private freeze(): FreezeToken {
    const token: FreezeToken = { suspended: tree.suspended, at: nowMs() };
    this.hidesMenus = false;
    tree.suspended = true;
    Input.releaseAll();
    // The loop is not there to duck the music, so do it here; AudioTicker undoes it on resume.
    Audio.tick(true, false);
    return token;
  }

  private unfreeze(token: FreezeToken): void {
    // Keys released under the window never reached the game: let go of everything.
    Input.releaseAll();
    TimeFocus.skip(nowMs() - token.at);
    tree.suspended = token.suspended;
  }

  private onCrash(info: CrashInfo): void {
    this.errors.push({ message: info.message, stack: info.stack, at: Math.round(nowMs()), source: info.source });
    if (this.errors.length > ERRORS_KEPT) this.errors.shift();
  }

  private wireBreadcrumbs(): void {
    const time = () => r1(GameState.levelTime);
    SceneRouter.stageStarted.connect((zone, stage) => this.breadcrumb(isBossStage() ? 'boss_stage_start' : 'act_start', { zone, stage, lives: GameState.lives }));
    SceneRouter.sceneChanged.connect((id) => this.breadcrumb('scene', { id }));
    GameState.checkpointReached.connect((at) => this.breadcrumb('checkpoint', { ...point(at), time: time() }));
    GameState.levelCompleted.connect(() => this.breadcrumb('act_clear', { zone: GameState.zoneId, stage: GameState.act, time: time(), tickets: GameState.tickets }));
    LevelHooks.afterReady.push((root) => {
      const player = root.player;
      player?.died.connect(() => this.breadcrumb('death', { ...point(player.globalPosition), time: time(), lives: GameState.lives }), { owner: root });
      for (const boss of tree.getNodesInGroup<BossLike>('boss')) {
        let started = false;
        boss.telegraphStarted.connect((attack) => {
          if (started) return;
          started = true;
          this.breadcrumb('boss_start', { boss: boss.name, attack, time: time() });
        }, { owner: root });
        boss.phaseChanged.connect((phase) => this.breadcrumb('boss_phase', { boss: boss.name, phase, time: time() }), { owner: root });
        boss.defeated.connect(() => this.breadcrumb('boss_defeated', { boss: boss.name, time: time() }), { owner: root });
      }
    });
  }
}

/** The window in the game's look: the menu palette (ui/common/theme.ts, hub_chrome.ts), square corners. */
const PIXEL_FONT = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace";
const THEME = {
  font: PIXEL_FONT,
  titleFont: PIXEL_FONT,
  background: 'rgba(5, 8, 23, 0.62)',
  panel: '#12141f',
  text: '#dbe6ff',
  muted: '#9ea8d1',
  accent: '#ffdb57',
  accentText: '#12141f',
  border: 'rgba(255, 219, 87, 0.45)',
  radius: '0',
  css: `
.panel { border-width: 2px; box-shadow: 6px 6px 0 rgba(5, 8, 23, 0.8); font-size: 13px; }
.title { color: #ffdb57; text-transform: uppercase; letter-spacing: 0.12em; text-shadow: 2px 2px 0 #171430; }
.sub, .hint, .shotbar { text-transform: uppercase; letter-spacing: 0.06em; }
.chip, .btn, .mini { text-transform: uppercase; letter-spacing: 0.04em; }
.btn.primary { box-shadow: 0 3px 0 #a8791a; }
.shot canvas { image-rendering: pixelated; }
.toast { box-shadow: 4px 4px 0 rgba(5, 8, 23, 0.8); }
`,
};

export const Feedback = new FeedbackImpl();
