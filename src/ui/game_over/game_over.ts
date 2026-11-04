// Game over (scene id 'game_over', SceneRouter.respawn() goes here when the
// last life is lost): "GAME OVER" over the dimmed hills with the final score,
// music `game_over`. After a short wait, jump, accept, pause, a tap or a
// click continues: GameState.resetGame(), then the title. Only the first
// press counts, and only while it is the current scene.

import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { SceneRouter } from '../../core/scene_router';
import type { Gfx } from '../../runtime/gfx';
import { Input } from '../../runtime/input';
import { Node, type InputEventLike } from '../../runtime/node';
import { MenuBackdrop } from '../common/menu_backdrop';
import { drawCentered, UiLayer } from '../common/theme';

/** Presses before this are ignored (the jump still held when the last life went). */
export const CONTINUE_AFTER = 1.5;
const BLINK_PERIOD = 1;

class GameOverText extends UiLayer {
  constructor(private readonly screen: GameOverScreen) {
    super('Text', 10);
  }

  protected override paint(g: Gfx): void {
    drawCentered(g, 'GAME OVER', 70, 'title', { scale: 3 });
    drawCentered(g, `SCORE ${GameState.score}`, 112, 'hudValue');
    if (this.screen.canContinue() && this.screen.promptVisible()) drawCentered(g, 'PRESS JUMP OR TAP TO CONTINUE', 150, 'outline');
  }
}

export class GameOverScreen extends Node {
  private clock = 0;
  private leaving = false;

  constructor() {
    super('GameOver');
    this.addChild(new MenuBackdrop(196, 0.6));
    this.addChild(new GameOverText(this));
  }

  override ready(): void {
    Audio.playMusic('game_over');
  }

  override process(delta: number): void {
    this.clock += delta;
    if (!this.accepting()) return;
    if (Input.isActionJustPressed('jump') || Input.isActionJustPressed('ui_accept') || Input.isActionJustPressed('pause')) this.continueGame();
  }

  override input(ev: InputEventLike): void {
    if (this.accepting() && ev.kind === 'pointer' && ev.pressed && !ev.echo) this.continueGame();
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

  /** A fresh game from the title. Only the first call counts. */
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
