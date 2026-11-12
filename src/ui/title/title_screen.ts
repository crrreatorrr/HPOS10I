// Title screen, the game's main menu (boot goes here; ?dev still shows the
// boot menu). The logo, Sproto, a blinking "press jump or tap" prompt, the
// one-line disclaimer from docs/CONTRACTS.md, and a small menu on the left:
// START (focused), CONTROLS (the controller settings overlay), FULL SCREEN
// (where the browser allows it) and HUB (straight to the hub: a menu, nothing
// to confirm). Jump, accept, pause (P, a gamepad's Start) or a click on an
// item chooses the focused one; with START focused that is the old "press
// jump to start", and a tap or click anywhere off the menu still starts.
// Arrows / WASD / D-pad / stick move. Esc is back/close everywhere else, so it
// never starts the game here (it is pause and ui_cancel; the gamepad's B is a
// jump button too and still chooses). Music: `title`. Input only counts while
// it is the current scene, so a stray copy never acts.

import { Audio } from '../../core/audio';
import { SceneRouter } from '../../core/scene_router';
import { HubClient } from '../../hub/hub_client';
import { Tuning } from '../../core/tuning';
import { Player } from '../../player/player';
import { Input } from '../../runtime/input';
import { Node, Node2D, type InputEventLike } from '../../runtime/node';
import { Rect2, Vec2 } from '../../runtime/vec2';
import type { Gfx } from '../../runtime/gfx';
import { MenuBackdrop } from '../common/menu_backdrop';
import { MenuList, type MenuItem } from '../common/menu';
import { CONTROLS_LABEL, fullScreenItem, HUB_LABEL } from '../common/standard_items';
import { drawCentered, UiLayer } from '../common/theme';
import { ControlsScreen, openControls } from '../controls/controls_screen';
import { FullScreen } from '../fullscreen';

export const DISCLAIMER = 'A free, non-commercial fan parody. All characters and art are original.';
/** Sproto is drawn at 2x, standing on the backdrop's ground line. */
const SPROTO_SCALE = 2;
const SPROTO_X = 212;
/** Presses this soon after the screen appears are ignored (a key still held from the previous screen). */
export const INPUT_GRACE = 0.25;
const BLINK_PERIOD = 1;
export const START_LABEL = 'START';
const MENU_X = 18;
const MENU_Y = 100;
const MENU_W = 142;
const MENU_H = 18;
const MENU_SEP = 4;

class TitleText extends UiLayer {
  constructor(private readonly screen: TitleScreen) {
    super('Text', 10);
  }

  protected override paint(g: Gfx): void {
    drawCentered(g, 'HPOS10I', 20, 'title', { scale: 3 });
    drawCentered(g, 'STARRING SPROTO', 56, 'outline');
    if (this.screen.promptVisible()) drawCentered(g, 'PRESS JUMP OR TAP TO START', 84, 'hudValue');
    this.screen.menu.draw(g);
    const notice = FullScreen.notice();
    if (notice !== '') drawCentered(g, notice, 212, 'outline');
    drawCentered(g, DISCLAIMER, 225, 'outline');
  }
}

export class TitleScreen extends Node {
  readonly backdrop = new MenuBackdrop();
  readonly sprotoSpot = new Node2D('SprotoSpot');
  sproto: Player | null = null;
  /** START, CONTROLS, FULL SCREEN (when available), HUB. */
  readonly menu: MenuList;
  private clock = 0;
  private leaving = false;
  private controlsWasOpen = false;

  constructor() {
    super('TitleScreen');
    this.addChild(this.backdrop);
    this.addChild(this.sprotoSpot);
    this.addChild(new TitleText(this));
    const items: MenuItem[] = [
      { label: START_LABEL, rect: new Rect2(), onSelect: () => this.start(false) },
      { label: CONTROLS_LABEL, rect: new Rect2(), onSelect: () => this.showControls() },
    ];
    const fs = fullScreenItem();
    if (fs) items.push(fs);
    items.push({ label: HUB_LABEL, rect: new Rect2(), onSelect: () => this.toHub() });
    items.forEach((it, i) => (it.rect = new Rect2(MENU_X, MENU_Y + i * (MENU_H + MENU_SEP), MENU_W, MENU_H)));
    // No grace of its own: accepting() already waits INPUT_GRACE.
    this.menu = new MenuList(items);
    this.menu.enabled = false;
  }

  override ready(): void {
    Audio.playMusic('title');
    this.addSproto();
  }

  override process(delta: number): void {
    this.clock += delta;
    if (ControlsScreen.blocking()) {
      this.controlsWasOpen = true;
      return;
    }
    if (this.controlsWasOpen) {
      this.controlsWasOpen = false;
      this.menu.reset(this.menu.focus);
    }
    const on = this.accepting();
    // The frame the grace ends, held keys are synced and nothing is chosen by the menu.
    if (on && !this.menu.enabled) this.menu.reset(this.menu.focus);
    this.menu.enabled = on;
    if (!on) return;
    // P and a gamepad's Start choose too (Enter is pause and accept: it counts once); Esc never does.
    const jp = (a: 'jump' | 'ui_accept' | 'pause' | 'ui_cancel') => Input.isActionJustPressed(a);
    if (jp('pause') && !jp('ui_cancel') && !jp('ui_accept') && !jp('jump')) {
      this.menu.activate();
      return;
    }
    this.menu.update(delta);
  }

  override input(ev: InputEventLike): void {
    if (!this.accepting() || ControlsScreen.blocking()) return;
    if (this.menu.handleEvent(ev)) return;
    // A tap or click anywhere off the menu starts, as it always did.
    if (ev.kind === 'pointer' && ev.pressed && !ev.echo) this.start();
  }

  showControls(): void {
    openControls({ hub: () => this.toHub(), alive: () => this.isInsideTree() && this.tree.currentScene === this });
  }

  /** Straight to the hub: the title is a menu, so nothing is asked. */
  toHub(): void {
    if (this.leaving) return;
    this.leaving = true;
    HubClient.exitToHub();
  }

  promptVisible(): boolean {
    return this.clock % BLINK_PERIOD < BLINK_PERIOD * 0.65;
  }

  private accepting(): boolean {
    return !this.leaving && this.clock >= INPUT_GRACE && this.isInsideTree() && this.tree.currentScene === this;
  }

  /** Goes to the zone select. Only the first call counts. */
  start(sound = true): void {
    if (this.leaving) return;
    this.leaving = true;
    if (sound) Audio.playSfx('menu_select');
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
