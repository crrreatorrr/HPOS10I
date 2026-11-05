// Title screen (boot goes here; ?dev still shows the boot menu). The logo,
// Sproto, a blinking "press jump or tap" prompt and the one-line disclaimer
// from docs/CONTRACTS.md. Jump, accept, pause (Start), a tap or a click goes
// to the zone select (once). Music: `title`. Input only counts while it is
// the current scene, so a stray copy never acts.

import { Audio } from '../../core/audio';
import { SceneRouter } from '../../core/scene_router';
import { Tuning } from '../../core/tuning';
import { Player } from '../../player/player';
import { Input } from '../../runtime/input';
import { Node, Node2D, type InputEventLike } from '../../runtime/node';
import { Vec2 } from '../../runtime/vec2';
import type { Gfx } from '../../runtime/gfx';
import { MenuBackdrop } from '../common/menu_backdrop';
import { drawCentered, UiLayer } from '../common/theme';

export const DISCLAIMER = 'A free, non-commercial fan parody. All characters and art are original.';
/** Sproto is drawn at 2x, standing on the backdrop's ground line. */
const SPROTO_SCALE = 2;
const SPROTO_X = 212;
/** Presses this soon after the screen appears are ignored (a key still held from the previous screen). */
export const INPUT_GRACE = 0.25;
const BLINK_PERIOD = 1;

class TitleText extends UiLayer {
  constructor(private readonly screen: TitleScreen) {
    super('Text', 10);
  }

  protected override paint(g: Gfx): void {
    drawCentered(g, 'HPOS10I', 20, 'title', { scale: 3 });
    drawCentered(g, 'STARRING SPROTO', 56, 'outline');
    if (this.screen.promptVisible()) drawCentered(g, 'PRESS JUMP OR TAP TO START', 84, 'hudValue');
    drawCentered(g, DISCLAIMER, 225, 'outline');
  }
}

export class TitleScreen extends Node {
  readonly backdrop = new MenuBackdrop();
  readonly sprotoSpot = new Node2D('SprotoSpot');
  sproto: Player | null = null;
  private clock = 0;
  private leaving = false;

  constructor() {
    super('TitleScreen');
    this.addChild(this.backdrop);
    this.addChild(this.sprotoSpot);
    this.addChild(new TitleText(this));
  }

  override ready(): void {
    Audio.playMusic('title');
    this.addSproto();
  }

  override process(delta: number): void {
    this.clock += delta;
    if (!this.accepting()) return;
    const go = Input.isActionJustPressed('jump') || Input.isActionJustPressed('ui_accept') || Input.isActionJustPressed('pause');
    if (go) this.start();
  }

  override input(ev: InputEventLike): void {
    if (!this.accepting()) return;
    if (ev.kind === 'pointer' && ev.pressed && !ev.echo) this.start();
  }

  promptVisible(): boolean {
    return this.clock % BLINK_PERIOD < BLINK_PERIOD * 0.65;
  }

  private accepting(): boolean {
    return !this.leaving && this.clock >= INPUT_GRACE && this.isInsideTree() && this.tree.currentScene === this;
  }

  /** Goes to the zone select. Only the first call counts. */
  start(): void {
    if (this.leaving) return;
    this.leaving = true;
    Audio.playSfx('menu_select');
    SceneRouter.goZoneSelect();
  }

  isLeaving(): boolean {
    return this.leaving;
  }

  /** Sproto himself (the player, frozen in his victory pose), so the art shows up here as soon as it exists. */
  private addSproto(): void {
    try {
      const sproto = new Player();
      sproto.name = 'Sproto';
      sproto.scale = new Vec2(SPROTO_SCALE, SPROTO_SCALE);
      // Not the gameplay player: keep the HUD and level objects from finding him.
      sproto.removeFromGroup('player');
      this.sprotoSpot.addChild(sproto);
      sproto.freeze(true);
      sproto.playPose('victory');
      const feet = Tuning.physics.height_radius ?? 19;
      sproto.position = new Vec2(SPROTO_X, this.backdrop.groundY - feet * SPROTO_SCALE).round();
      sproto.resetPhysicsInterpolation();
      this.sproto = sproto;
    } catch (err) {
      console.warn('[TitleScreen] could not show Sproto', err);
    }
  }
}
