// Game over (scene id 'game_over', SceneRouter.respawn() goes here when the
// last life is lost): "GAME OVER" over the dimmed hills with the final score,
// music `game_over`. After a short wait there are the choices: RETRY STAGE
// (the default: a fresh game that starts again at the act or boss arena where
// the last life went, SceneRouter.retryStage()), MAIN MENU
// (GameState.resetGame(), then the title), HUB (the run is already over, so
// it goes at once), CONTROLS (the controller settings overlay) and FULL
// SCREEN (where the browser allows it). Up/down move, jump, accept or a
// tap chooses. When there is no stage to retry (a sandbox scene) the screen
// shows one prompt and any of jump, accept, pause, a tap or a click goes to
// the title. Only the first choice counts, and only while it is the current
// scene.

import { Audio } from '../../core/audio';
import { HubClient } from '../../hub/hub_client';
import { GameState } from '../../core/game_state';
import { SceneRouter } from '../../core/scene_router';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { Node, type InputEventLike } from '../../runtime/node';
import { Rect2 } from '../../runtime/vec2';
import { MenuBackdrop } from '../common/menu_backdrop';
import { MenuList, type MenuItem } from '../common/menu';
import { CONTROLS_LABEL, fullScreenItem, HUB_LABEL, MAIN_MENU_LABEL } from '../common/standard_items';
import { drawCentered, UiLayer } from '../common/theme';
import { ControlsScreen, openControls } from '../controls/controls_screen';
import { FullScreen } from '../fullscreen';

/** Presses before this are ignored (the jump still held when the last life went). */
export const CONTINUE_AFTER = 1.5;
const BLINK_PERIOD = 1;
const BUTTON_W = 132;
const BUTTON_H = 18;
const BUTTON_SEP = 4;
const MENU_Y = 112;

class GameOverText extends UiLayer {
  constructor(private readonly screen: GameOverScreen) {
    super('Text', 10);
  }

  protected override paint(g: Gfx): void {
    // Higher with the menu, so all its items fit.
    const top = this.screen.menu ? 50 : 70;
    drawCentered(g, 'GAME OVER', top, 'title', { scale: 3 });
    drawCentered(g, `SCORE ${this.screen.finalScore}`, top + 42, 'hudValue');
    if (!this.screen.canContinue()) return;
    if (this.screen.menu) {
      this.screen.menu.draw(g);
      const notice = FullScreen.notice();
      if (notice !== '') drawCentered(g, notice, 226, 'outline');
    } else if (this.screen.promptVisible()) drawCentered(g, 'PRESS JUMP OR TAP TO CONTINUE', 150, 'outline');
  }
}

export class GameOverScreen extends Node {
  /** RETRY STAGE, MAIN MENU, HUB, CONTROLS, FULL SCREEN; or null when there is no stage to retry. */
  readonly menu: MenuList | null;
  /** The score when the last life went (a retry resets GameState.score before the scene changes). */
  readonly finalScore = GameState.score;
  private clock = 0;
  private leaving = false;
  private controlsWasOpen = false;

  constructor() {
    super('GameOver');
    this.addChild(new MenuBackdrop(196, 0.6));
    this.addChild(new GameOverText(this));
    const x = Math.floor((424 - BUTTON_W) / 2);
    if (SceneRouter.canRetryStage()) {
      const items: MenuItem[] = [
        { label: 'RETRY STAGE', rect: new Rect2(), onSelect: () => this.retryStage() },
        { label: MAIN_MENU_LABEL, rect: new Rect2(), onSelect: () => this.continueGame() },
        { label: HUB_LABEL, rect: new Rect2(), onSelect: () => this.toHub() },
        { label: CONTROLS_LABEL, rect: new Rect2(), onSelect: () => this.showControls() },
      ];
      const fs = fullScreenItem();
      if (fs) items.push(fs);
      items.forEach((it, i) => (it.rect = new Rect2(x, MENU_Y + i * (BUTTON_H + BUTTON_SEP), BUTTON_W, BUTTON_H)));
      this.menu = new MenuList(items, { selectSound: false });
    } else {
      this.menu = null;
    }
  }

  override ready(): void {
    Audio.playMusic('game_over');
    if (this.menu) this.menu.enabled = false;
  }

  override process(delta: number): void {
    this.clock += delta;
    if (ControlsScreen.blocking()) {
      this.controlsWasOpen = true;
      return;
    }
    if (this.controlsWasOpen && this.menu) {
      this.controlsWasOpen = false;
      this.menu.reset(this.menu.focus);
    }
    if (this.menu) {
      const on = this.accepting();
      // The frame the wait ends, held keys are synced and nothing is chosen.
      if (on && !this.menu.enabled) this.menu.reset(0);
      this.menu.enabled = on;
      this.menu.update(delta);
      return;
    }
    if (!this.accepting()) return;
    if (Input.isActionJustPressed('jump') || Input.isActionJustPressed('ui_accept') || Input.isActionJustPressed('pause')) this.continueGame();
  }

  override input(ev: InputEventLike): void {
    if (!this.accepting() || ControlsScreen.blocking()) return;
    if (this.menu) this.menu.handleEvent(ev);
    else if (ev.kind === 'pointer' && ev.pressed && !ev.echo) this.continueGame();
  }

  canContinue(): boolean {
    return this.clock >= CONTINUE_AFTER;
  }

  promptVisible(): boolean {
    return this.clock % BLINK_PERIOD < BLINK_PERIOD * 0.65;
  }

  private accepting(): boolean {
    return !this.leaving && this.canContinue() && this.isInsideTree() && this.tree.currentScene === this;
  }

  /** A fresh game at the stage where the last life went. Only the first choice counts. */
  retryStage(): void {
    if (this.leaving) return;
    this.leaving = true;
    Audio.playSfx('menu_select');
    SceneRouter.retryStage();
  }

  /** A fresh game from the title. Only the first choice counts. */
  continueGame(): void {
    if (this.leaving) return;
    this.leaving = true;
    Audio.playSfx('menu_select');
    GameState.resetGame();
    SceneRouter.goTitle();
  }

  /** Straight to the hub: the run is already over. Only the first choice counts. */
  toHub(): void {
    if (this.leaving) return;
    this.leaving = true;
    Audio.playSfx('menu_select');
    HubClient.exitToHub();
  }

  showControls(): void {
    Audio.playSfx('menu_select');
    openControls({ mainMenu: () => this.continueGame(), hub: () => this.toHub(), alive: () => this.isInsideTree() && this.tree.currentScene === this && !this.leaving });
  }

  isLeaving(): boolean {
    return this.leaving;
  }
}
