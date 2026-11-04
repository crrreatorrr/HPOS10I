// On-screen controls for phones and tablets. installUi() returns it as a
// global overlay; it shows itself only while Display.isTouch and
// SceneRouter.inGameplay(). Display.touchModeChanged hides it on the first
// key or gamepad press and shows it again on the next touch (touch laptops).
// In touch mode a mouse acts as one finger (desktop testing with ?touch).
//
// Left: a D-pad (left/right run, down rolls/crouches/spin dashes, up looks).
// Right: one big JUMP button. Top-right: a small pause button.
//
// Every finger is tracked on its own (pointer id), so holding right and
// tapping jump work together. A finger that lands on the pad keeps steering
// while it slides (left <-> right switches without lifting) until it moves
// well away. The node presses the normal input actions with
// Input.actionPress(action, `touch<id>`), exactly like a keyboard would, and
// releases them when the finger lifts or leaves the button, when the game
// pauses, leaves gameplay or leaves touch mode, and when the page loses focus.

import { SceneRouter } from '../../core/scene_router';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { Input, InputEvent, type Action } from '../../runtime/input';
import { radToDeg, TAU } from '../../runtime/math';
import { ProcessMode, type InputEventLike } from '../../runtime/node';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { pixelDisc } from '../common/pixel_art';
import { drawText, UiLayer } from '../common/theme';
import { Display } from '../display';

export enum Zone {
  NONE,
  PAD,
  JUMP,
  PAUSE,
}

/** Layout in game pixels (the 424x240 view). */
export const PAD_CENTER = new Vec2(58, 180);
/** A finger landing this close to the pad centre takes the pad... */
export const PAD_HIT_RADIUS = 56;
/** ...and so does one anywhere left of this line below PAD_ZONE_TOP. */
export const PAD_ZONE_RIGHT = 96;
export const PAD_ZONE_TOP = 104;
/** A finger already on the pad keeps steering until it is this far away. */
export const PAD_HOLD_RADIUS = 84;
export const PAD_DEAD_ZONE = 7;
/** Angle from horizontal (degrees): below MIN pure left/right, above MAX pure up/down, between both. */
export const PAD_DIAGONAL_MIN = 35;
export const PAD_DIAGONAL_MAX = 58;
const PAD_DRAW_RADIUS = 34;

export const JUMP_CENTER = new Vec2(370, 182);
export const JUMP_HIT_RADIUS = 50;
/** Everything right of this line below JUMP_ZONE_TOP is jump too. */
export const JUMP_ZONE_LEFT = 330;
export const JUMP_ZONE_TOP = 104;
const JUMP_DRAW_RADIUS = 25;

export const PAUSE_CENTER = new Vec2(404, 18);
export const PAUSE_HIT_RADIUS = 24;
const PAUSE_DRAW_SIZE = new Vec2(22, 18);

/** A finger that slides out of a button is released once it is this much outside the hit area. */
export const LEAVE_MARGIN = 8;

const ALL_ACTIONS: readonly Action[] = ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'pause'];

const COLOR_BASE = new Color(0.05, 0.06, 0.18, 0.4);
const COLOR_RIM = new Color(1, 1, 1, 0.5);
const COLOR_OUTLINE = new Color(0.06, 0.05, 0.14, 0.75);
const COLOR_ARM = new Color(0.24, 0.3, 0.6, 0.6);
const COLOR_PRESSED = new Color(1, 0.8, 0.22, 0.85);
const COLOR_ICON = new Color(1, 1, 1, 0.92);
const COLOR_JUMP = new Color(0.14, 0.2, 0.5, 0.55);
const SOURCE = 'touch';

interface Finger {
  zone: Zone;
  pos: Vec2;
}

/** Directions for a finger on the pad, from its offset to the pad centre. */
export function padActions(offset: Vec2): Action[] {
  const out: Action[] = [];
  if (offset.length() < PAD_DEAD_ZONE) return out;
  const angle = radToDeg(Math.atan2(Math.abs(offset.y), Math.abs(offset.x)));
  if (angle < PAD_DIAGONAL_MAX) out.push(offset.x > 0 ? 'move_right' : 'move_left');
  if (angle > PAD_DIAGONAL_MIN) out.push(offset.y > 0 ? 'move_down' : 'move_up');
  return out;
}

export class TouchControls extends UiLayer {
  private fingers = new Map<number, Finger>();
  /** Action -> true for every action this node holds down right now. */
  private held = new Set<Action>();
  private wasPaused = false;
  private domWired = false;
  private readonly onBlur = () => this.releaseAll();

  constructor() {
    super('TouchControls', 102);
    this.processMode = ProcessMode.ALWAYS;
    this.addToGroup('touch_controls');
    this.visible = TouchControls.isActive();
  }

  /** True when the player is using touch. */
  static isEnabled(): boolean {
    return Display.isTouch;
  }

  /** Shown and listening: touch mode, during gameplay. */
  static isActive(): boolean {
    return Display.isTouch && SceneRouter.inGameplay();
  }

  override enterTree(): void {
    Display.touchModeChanged.connect(this.onTouchMode, { owner: this });
    if (!this.domWired && typeof window !== 'undefined') {
      this.domWired = true;
      window.addEventListener('blur', this.onBlur);
    }
  }

  override exitTree(): void {
    this.releaseAll();
    Display.touchModeChanged.disconnect(this.onTouchMode);
    if (this.domWired && typeof window !== 'undefined') {
      this.domWired = false;
      window.removeEventListener('blur', this.onBlur);
    }
  }

  override process(): void {
    this.updateVisibility();
    const paused = tree.paused;
    if (paused !== this.wasPaused) {
      this.wasPaused = paused;
      if (paused) this.releaseAll();
    }
  }

  override input(ev: InputEventLike): void {
    if (!SceneRouter.inGameplay()) return;
    if (ev.kind !== 'pointer' || !ev.pointer) return;
    // A real touch while in keyboard mode counts at once: touch mode switches on this same event.
    if (!Display.isTouch) {
      Display.noteEvent(ev);
      if (!Display.isTouch) return;
      this.updateVisibility();
    }
    const id = ev instanceof InputEvent ? ev.pointerId : 0;
    const phase = ev instanceof InputEvent ? ev.pointerPhase : ev.pressed ? 'down' : 'up';
    if (phase === 'down') {
      this.fingers.set(id, { zone: this.zoneAt(ev.pointer, true), pos: ev.pointer });
    } else if (phase === 'up') {
      this.fingers.delete(id); // lifted or cancelled
    } else {
      const finger = this.fingers.get(id);
      if (!finger) return; // a mouse moving with no button down
      finger.pos = ev.pointer;
      finger.zone = this.zoneAfterSlide(finger.zone, ev.pointer);
    }
    this.sync();
  }

  private readonly onTouchMode = (): void => this.updateVisibility();

  private updateVisibility(): void {
    const active = TouchControls.isActive();
    if (active !== this.visible) {
      this.visible = active;
      if (!active) this.releaseAll();
    }
  }

  /** Releases everything this node holds and forgets every finger. */
  releaseAll(): void {
    this.fingers.clear();
    this.sync();
  }

  /** Actions currently held by touch (tests and debugging). */
  heldActions(): Action[] {
    return [...this.held];
  }

  fingerZone(id: number): Zone {
    return this.fingers.get(id)?.zone ?? Zone.NONE;
  }

  /** Which control a finger landing (or sliding in) at `pos` belongs to. */
  zoneAt(pos: Vec2, allowPause: boolean): Zone {
    if (allowPause && this.inPause(pos, 0)) return Zone.PAUSE;
    if (this.inJump(pos, 0)) return Zone.JUMP;
    if (this.inPad(pos)) return Zone.PAD;
    return Zone.NONE;
  }

  private zoneAfterSlide(zone: Zone, pos: Vec2): Zone {
    switch (zone) {
      case Zone.PAD:
        if (pos.distanceTo(PAD_CENTER) <= PAD_HOLD_RADIUS || this.inPad(pos)) return Zone.PAD;
        break;
      case Zone.JUMP:
        if (this.inJump(pos, LEAVE_MARGIN)) return Zone.JUMP;
        break;
      case Zone.PAUSE:
        return this.inPause(pos, LEAVE_MARGIN) ? Zone.PAUSE : Zone.NONE;
      default:
        break;
    }
    // Sliding into the pad or the jump button presses it (never pause).
    return this.zoneAt(pos, false);
  }

  private inPad(pos: Vec2): boolean {
    return pos.distanceTo(PAD_CENTER) <= PAD_HIT_RADIUS || (pos.x <= PAD_ZONE_RIGHT && pos.y >= PAD_ZONE_TOP);
  }

  private inJump(pos: Vec2, margin: number): boolean {
    return pos.distanceTo(JUMP_CENTER) <= JUMP_HIT_RADIUS + margin || (pos.x >= JUMP_ZONE_LEFT - margin && pos.y >= JUMP_ZONE_TOP - margin);
  }

  private inPause(pos: Vec2, margin: number): boolean {
    return pos.distanceTo(PAUSE_CENTER) <= PAUSE_HIT_RADIUS + margin;
  }

  /** Presses and releases actions so that exactly the wanted ones are held. */
  private sync(): void {
    const wanted = new Set<Action>();
    const paused = tree.paused;
    for (const finger of this.fingers.values()) {
      switch (finger.zone) {
        case Zone.PAD:
          if (!paused) for (const a of padActions(finger.pos.sub(PAD_CENTER))) wanted.add(a);
          break;
        case Zone.JUMP:
          if (!paused) wanted.add('jump');
          break;
        case Zone.PAUSE:
          wanted.add('pause');
          break;
        default:
          break;
      }
    }
    for (const action of ALL_ACTIONS) {
      if (this.held.has(action) && !wanted.has(action)) {
        this.held.delete(action);
        Input.actionRelease(action, SOURCE);
      }
    }
    for (const action of ALL_ACTIONS) {
      if (wanted.has(action) && !this.held.has(action)) {
        this.held.add(action);
        Input.actionPress(action, SOURCE);
      }
    }
  }

  // --- Drawing (simple pixel shapes at native resolution, so they scale up crisp) ---

  protected override paint(g: Gfx): void {
    const paused = tree.paused;
    if (!paused) {
      this.drawPad(g);
      this.drawJump(g);
    }
    this.drawPause(g, paused);
  }

  private drawPad(g: Gfx): void {
    const c = PAD_CENTER;
    pixelDisc(g, c.x, c.y, PAD_DRAW_RADIUS, COLOR_BASE);
    g.arc(c, PAD_DRAW_RADIUS, 0, TAU, COLOR_RIM);
    const arm = 9;
    const reach = PAD_DRAW_RADIUS - 5;
    // Dark outline under the cross, then the cross, then the pressed arms.
    g.rect(c.x - reach - 1, c.y - arm - 1, reach * 2 + 2, arm * 2 + 2, COLOR_OUTLINE);
    g.rect(c.x - arm - 1, c.y - reach - 1, arm * 2 + 2, reach * 2 + 2, COLOR_OUTLINE);
    g.rect(c.x - reach, c.y - arm, reach * 2, arm * 2, COLOR_ARM);
    g.rect(c.x - arm, c.y - reach, arm * 2, reach * 2, COLOR_ARM);
    const arms: [Action, Rect2][] = [
      ['move_left', new Rect2(c.x - reach, c.y - arm, reach - arm, arm * 2)],
      ['move_right', new Rect2(c.x + arm, c.y - arm, reach - arm, arm * 2)],
      ['move_up', new Rect2(c.x - arm, c.y - reach, arm * 2, reach - arm)],
      ['move_down', new Rect2(c.x - arm, c.y + arm, arm * 2, reach - arm)],
    ];
    for (const [action, r] of arms) if (this.held.has(action)) g.rectR(r, COLOR_PRESSED);
    const tip = reach - 4;
    this.arrow(g, c.add(new Vec2(-tip, 0)), Vec2.LEFT);
    this.arrow(g, c.add(new Vec2(tip, 0)), Vec2.RIGHT);
    this.arrow(g, c.add(new Vec2(0, -tip)), Vec2.UP);
    this.arrow(g, c.add(new Vec2(0, tip)), Vec2.DOWN);
  }

  private drawJump(g: Gfx): void {
    const pressed = this.held.has('jump');
    const c = pressed ? JUMP_CENTER.add(new Vec2(0, 1)) : JUMP_CENTER;
    pixelDisc(g, c.x, c.y, JUMP_DRAW_RADIUS + 1, COLOR_OUTLINE);
    pixelDisc(g, c.x, c.y, JUMP_DRAW_RADIUS, pressed ? COLOR_PRESSED : COLOR_JUMP);
    g.arc(c, JUMP_DRAW_RADIUS, 0, TAU, COLOR_RIM);
    g.arc(c, JUMP_DRAW_RADIUS - 3, 0, TAU, new Color(1, 1, 1, 0.18));
    drawText(g, 'JUMP', c.x - 30, c.y - 4, 'hudValue', { align: 'center', width: 60, color: COLOR_ICON });
  }

  private drawPause(g: Gfx, paused: boolean): void {
    const pressed = this.held.has('pause');
    const rect = Rect2.centered(PAUSE_CENTER, PAUSE_DRAW_SIZE);
    g.rectR(rect.grow(1), COLOR_OUTLINE);
    g.rectR(rect, pressed ? COLOR_PRESSED : COLOR_JUMP);
    g.rectR(rect, COLOR_RIM, false, 1);
    const c = PAUSE_CENTER;
    if (paused) {
      // A "play" triangle: tap again to resume.
      g.polygon([c.add(new Vec2(-3, -5)), c.add(new Vec2(4, 0)), c.add(new Vec2(-3, 5))], COLOR_ICON);
    } else {
      g.rect(c.x - 5, c.y - 5, 3, 10, COLOR_ICON);
      g.rect(c.x + 2, c.y - 5, 3, 10, COLOR_ICON);
    }
  }

  private arrow(g: Gfx, tip: Vec2, dir: Vec2): void {
    const side = new Vec2(-dir.y, dir.x);
    const back = tip.sub(dir.mul(5));
    g.polygon([tip, back.add(side.mul(5)), back.sub(side.mul(5))], COLOR_ICON);
  }
}
