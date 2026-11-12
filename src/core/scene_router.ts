// Moves between title, zone select, acts and boss arenas. Missing scenes fall
// back to the dev menu so nothing hard-crashes. Only the first scene change
// requested in a frame takes effect, so a goal and a death landing on the same
// frame can't both fire.

import { Signal } from '../runtime/signal';
import { tree } from '../runtime/tree';
import { Audio } from './audio';
import { GameState } from './game_state';
import { ENDING_SCENE, GAME_OVER_SCENE, MAIN_SCENE, MENU_SCENES, Scenes, TITLE_SCENE, ZONE_SELECT_SCENE } from './scenes';
import { ZoneRegistry, type Zone } from './zone_registry';
import { TimeFocus } from '../player/time_focus';

class SceneRouterImpl {
  readonly stageStarted = new Signal<[string, number]>();
  /** Fires when the new scene is in the tree. */
  readonly sceneChanged = new Signal<[string]>();
  zoneId = '';
  /** 1-based. Acts are 1..n, the boss arena is n + 1. */
  stage = 1;
  /** Scene opened directly (dev menu, sandboxes): respawn reloads it. */
  freeScene = '';
  /** Id of the scene now running. */
  currentId = '';
  private changeFrame = -1;
  private loadToken = 0;

  goTitle(): void {
    if (this.claim('goTitle')) this.changeTo(this.titleOrMain());
  }

  goZoneSelect(): void {
    if (this.claim('goZoneSelect')) this.changeTo(Scenes.exists(ZONE_SELECT_SCENE) ? ZONE_SELECT_SCENE : MAIN_SCENE);
  }

  /** Starts a zone at a stage (1 = act 1). Resets tickets and the checkpoint. */
  startZone(zoneId: string, stage = 1): void {
    if (this.claim('startZone')) this.doStartZone(zoneId, stage);
  }

  /** Act 1 -> act 2 -> boss -> next zone (or the ending). */
  nextStage(): void {
    if (!this.claim('nextStage')) return;
    if (Scenes.exists(ZoneRegistry.stagePath(this.zoneId, this.stage + 1))) {
      this.doStartZone(this.zoneId, this.stage + 1);
      return;
    }
    let next = ZoneRegistry.nextZoneId(this.zoneId);
    while (next !== '' && !Scenes.exists(ZoneRegistry.stagePath(next, 1))) next = ZoneRegistry.nextZoneId(next);
    if (next !== '' && ZoneRegistry.isReleased(next)) this.doStartZone(next, 1);
    else if (Scenes.exists(ENDING_SCENE)) this.changeTo(ENDING_SCENE);
    else this.changeTo(this.titleOrMain());
  }

  /** After a death: takes a life (not in sandboxes), then reloads from the checkpoint, or game over. */
  respawn(): void {
    if (!this.claim('respawn')) return;
    if (this.freeScene === '') GameState.loseLife();
    if (GameState.lives <= 0) {
      if (Scenes.exists(GAME_OVER_SCENE)) this.changeTo(GAME_OVER_SCENE);
      else {
        GameState.resetGame();
        this.changeTo(this.titleOrMain());
      }
      return;
    }
    GameState.restartFromCheckpoint();
    if (this.freeScene !== '') this.changeTo(this.freeScene);
    else this.loadStage();
  }

  /** The pause menu's Restart: from the checkpoint, no life lost. */
  restart(): void {
    if (!this.claim('restart')) return;
    GameState.restartFromCheckpoint();
    if (this.freeScene !== '') this.changeTo(this.freeScene);
    else this.loadStage();
  }

  /** True when a game over can retry the stage it happened in (not in sandboxes). */
  canRetryStage(): boolean {
    return this.freeScene === '' && this.zoneId !== '' && Scenes.exists(ZoneRegistry.stagePath(this.zoneId, this.stage));
  }

  /**
   * After a game over: a fresh game (lives and score reset) that starts again
   * at the stage where the last life went, act or boss arena. A fresh start,
   * so the hub attempt id is new; the failed attempt never paid.
   */
  retryStage(): void {
    if (!this.canRetryStage()) {
      GameState.resetGame();
      this.goTitle();
      return;
    }
    if (!this.claim('retryStage')) return;
    const zoneId = this.zoneId;
    const stage = this.stage;
    GameState.resetGame();
    this.doStartZone(zoneId, stage);
  }

  /** The pause menu's Restart Act: the whole stage from 0:00, lives and score kept. */
  restartAct(): void {
    if (this.freeScene !== '' || this.zoneId === '') {
      this.restart();
      return;
    }
    if (this.claim('restartAct')) this.doStartZone(this.zoneId, this.stage);
  }

  /** Opens any scene directly (dev menu, sandboxes). Not tied to a zone. */
  openScene(id: string): void {
    if (!Scenes.exists(id)) {
      console.error(`[SceneRouter] openScene: no scene "${id}"`);
      return;
    }
    if (!this.claim('openScene')) return;
    this.zoneId = '';
    this.stage = 1;
    this.freeScene = id;
    GameState.startLevel('', 1);
    this.changeTo(id);
  }

  /** True while a level, boss arena or playground runs (not in menus). */
  inGameplay(): boolean {
    return this.currentId !== '' && !MENU_SCENES.includes(this.currentId);
  }

  currentZone(): Zone | null {
    return ZoneRegistry.getZone(this.zoneId);
  }

  private doStartZone(zoneId: string, stage: number): void {
    this.zoneId = zoneId;
    this.stage = stage;
    this.freeScene = '';
    GameState.startLevel(zoneId, stage);
    this.loadStage();
  }

  private loadStage(): void {
    const id = ZoneRegistry.stagePath(this.zoneId, this.stage);
    if (!Scenes.exists(id)) {
      console.warn(`[SceneRouter] stage not built yet: ${this.zoneId} stage ${this.stage}`);
      this.changeTo(MAIN_SCENE);
      return;
    }
    this.stageStarted.emit(this.zoneId, this.stage);
    const zone = this.currentZone();
    if (zone) Audio.playMusic(this.stage > zone.acts.length ? 'boss' : zone.music);
    this.changeTo(id);
  }

  private titleOrMain(): string {
    return Scenes.exists(TITLE_SCENE) ? TITLE_SCENE : MAIN_SCENE;
  }

  private claim(request: string): boolean {
    const frame = tree.processFrames * 100000 + tree.physicsFrames;
    if (frame === this.changeFrame) {
      console.info(`[SceneRouter] ignored ${request}: a scene change is already pending this frame`);
      return false;
    }
    this.changeFrame = frame;
    return true;
  }

  /** Switches scenes. Async factories (levels) load first; the old scene keeps running meanwhile. */
  changeTo(id: string): void {
    if (MENU_SCENES.includes(id)) GameState.timerRunning = false;
    tree.paused = false;
    TimeFocus.restore();
    tree.timeScale = 1;
    const factory = Scenes.factory(id) ?? Scenes.factory(MAIN_SCENE);
    if (!factory) return;
    const token = ++this.loadToken;
    const made = factory();
    const apply = (node: import('../runtime/node').Node) => {
      if (token !== this.loadToken) return;
      tree.changeScene(() => node);
      tree.callDeferred(() => {
        this.currentId = id;
        this.sceneChanged.emit(id);
      });
    };
    if (made instanceof Promise) {
      made.then(apply, (err: unknown) => {
        console.error(`[SceneRouter] could not load "${id}"`, err);
        if (id !== MAIN_SCENE) this.changeTo(MAIN_SCENE);
      });
    } else {
      apply(made);
    }
  }
}

export const SceneRouter = new SceneRouterImpl();
