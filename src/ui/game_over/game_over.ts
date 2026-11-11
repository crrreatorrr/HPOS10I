// Game over (scene id 'game_over', SceneRouter.respawn() goes here when the
// last life is lost): "GAME OVER" over the dimmed hills with the final score,
// music `game_over`. After a short wait there are two choices: RETRY STAGE
// (the default: a fresh game that starts again at the act or boss arena where
// the last life went, SceneRouter.retryStage()) and QUIT TO TITLE
// (GameState.resetGame(), then the title). Up/down move, jump, accept or a
// tap chooses. When there is no stage to retry (a sandbox scene) the screen
// shows one prompt and any of jump, accept, pause, a tap or a click goes to
// the title. Only the first choice counts, and only while it is the current
// scene.

import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { SceneRouter } from '../../core/scene_router';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { Node, type InputEventLike } from '../../runtime/node';
import { Rect2 } from '../../runtime/vec2';
import { MenuBackdrop } from '../common/menu_backdrop';
import { MenuList } from '../common/menu';
import { drawCentered, UiLayer } from '../common/theme';

/** Presses before this are ignored (the jump still held when the last life went). */
export const CONTINUE_AFTER = 1.5;
const BLINK_PERIOD = 1;
const BUTTON_W = 132;
const BUTTON_H = 22;

class GameOverText extends UiLayer {
  constructor(private readonly screen: GameOverScreen) {
    super('Text', 10);
  }

  protected override paint(g: Gfx): void {
    drawCentered(g, 'GAME OVER', 70, 'title', { scale: 3 });
    drawCentered(g, `SCORE ${this.screen.finalScore}`, 112, 'hudValue');
    if (!this.screen.canContinue()) return;
    if (this.screen.menu) this.screen.menu.draw(g);
    else if (this.screen.promptVisible()) drawCentered(g, 'PRESS JUMP OR TAP TO CONTINUE', 150, 'outline');
  }
}

export class GameOverScreen extends Node {
  /** RETRY STAGE and QUIT TO TITLE, or null when there is no stage to retry. */
  readonly menu: MenuList | null;
  /** The score when the last life went (a retry resets GameState.score before the scene changes). */
  readonly finalScore = GameState.score;
  private clock = 0;
  private leaving = false;

  constructor() {
    super('GameOver');
    this.addChild(new MenuBackdrop(196, 0.6));
    this.addChild(new GameOverText(this));
    const x = Math.floor((424 - BUTTON_W) / 2);
    this.menu = SceneRouter.canRetryStage()
      ? new MenuList(
          [
            { label: 'RETRY STAGE', rect: new Rect2(x, 140, BUTTON_W, BUTTON_H), onSelect: () => this.retryStage() },
            { label: 'QUIT TO TITLE', rect: new Rect2(x, 140 + BUTTON_H + 4, BUTTON_W, BUTTON_H), onSelect: () => this.continueGame() },
          ],
          { selectSound: false },
        )
      : null;
  }

  override ready(): void {
    Audio.playMusic('game_over');
    if (this.menu) this.menu.enabled = false;
  }

  override process(delta: number): void {
    this.clock += delta;
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
    if (!this.accepting()) return;
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

  isLeaving(): boolean {
    return this.leaving;
  }
}
