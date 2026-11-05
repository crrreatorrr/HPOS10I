// The flying-broom chase (Wizard Academy, docs/DESIGN.md): an autoscroll
// section. When Sproto crosses this node's x, the camera starts scrolling
// right at `speed` px/s (GameCamera.startAutoscroll, docs/CONTRACTS.md
// "Camera"), which keeps him inside the view through Player.clampRect: the
// left edge pushes him along, he can't run ahead of the right edge, and
// pinned against a wall by the left edge he is crushed (kill). He runs and
// jumps inside the moving window while an enchanted broom sweeps along the
// left edge (visual only). It stops (GameCamera.stopAutoscroll, which empties
// clampRect) when the view's right edge reaches the end, `length` px right of
// the start, or when the camera can't scroll further, or when he dies. A
// respawn reloads the act, so put a checkpoint before the start: the section
// then begins again from its trigger. Pausing pauses the scroll (the camera
// and this node both stop with the tree). The origin is the start line (any
// y); the end line is `length` px right.

import { GameCamera } from '../../../camera/game_camera';
import type { Player } from '../../../player/player';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { Node2D } from '../../../runtime/node';
import { Signal } from '../../../runtime/signal';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import type { Configurable, Props } from '../../common/props';

const BROOM_HANDLE = new Color(0.55, 0.34, 0.18);
const BROOM_BRISTLE = new Color(0.95, 0.8, 0.42);
const BROOM_BAND = new Color(0.6, 0.38, 0.86);
const SPARK = new Color(1.0, 0.92, 0.6);
const OUTLINE = new Color(0.14, 0.1, 0.2);

/** An enchanted broom sweeping upright along the screen's left edge. */
class Broom extends Node2D {
  private t = 0;

  override physicsProcess(): void {
    this.t += 1;
  }

  override draw(g: Gfx): void {
    const sway = Math.sin(this.t * 0.25) * 0.35;
    g.setTransform(Vec2.ZERO, sway);
    g.line(new Vec2(0, -70), new Vec2(0, 0), OUTLINE, 4);
    g.line(new Vec2(0, -70), new Vec2(0, 0), BROOM_HANDLE, 2);
    const bristles = [new Vec2(-4, -2), new Vec2(4, -2), new Vec2(10, 22), new Vec2(-10, 22)];
    g.polygon(bristles, BROOM_BRISTLE);
    g.polyline(bristles, OUTLINE, 1, true);
    g.rect(-5, -3, 10, 4, BROOM_BAND);
    for (let i = 0; i < 3; i++) {
      const x = -6 + i * 6;
      g.line(new Vec2(x * 0.5, 2), new Vec2(x, 20), BROOM_HANDLE, 1);
    }
    g.resetTransform();
    for (let i = 0; i < 3; i++) {
      g.rect(8 + ((this.t * 3 + i * 11) % 14), 18 - ((this.t * 2 + i * 7) % 30), 2, 2, SPARK);
    }
  }
}

export class AutoscrollSection extends Node2D implements Configurable {
  readonly started = new Signal();
  readonly finished = new Signal();

  /** Scroll length from the start line to where the view's right edge stops. */
  length = 1696.0;
  /** Scroll speed, px/s (90 px/s = 1.5 px/frame, a brisk run). */
  speed = 90.0;
  /** Draw the sweeping broom along the left edge while scrolling. */
  broom = true;

  active = false;
  done = false;
  private camera: GameCamera | null = null;
  private player: Player | null = null;
  private lastEnd = -Infinity;
  private still = 0;
  private broomNode: Broom | null = null;

  constructor(name = 'AutoscrollSection') {
    super(name);
  }

  applyProps(p: Props): void {
    this.length = p.num('length', this.length);
    this.speed = p.num('speed', this.speed);
    this.broom = p.bool('broom', this.broom);
  }

  override physicsProcess(): void {
    if (this.done) return;
    if (!this.player || this.player.isFreed()) {
      this.player = tree.getFirstNodeInGroup<Player>('player');
      if (!this.player) return;
    }
    const player = this.player;
    if (!this.active) {
      if (player.state !== 'dead' && player.globalPosition.x >= this.globalPosition.x) this.start();
      return;
    }
    if (!this.camera || this.camera.isFreed()) {
      this.stop();
      return;
    }
    if (player.state === 'dead') {
      this.stop();
      return;
    }
    const view = this.camera.viewRect();
    this.still = view.right <= this.lastEnd + 0.01 ? this.still + 1 : 0;
    this.lastEnd = view.right;
    if (view.right >= this.endX() || this.still >= 30) {
      this.stop();
      return;
    }
    if (this.broomNode) this.broomNode.globalPosition = this.broomAt(view);
  }

  /** The world x where the scroll stops (the view's right edge). */
  endX(): number {
    return this.globalPosition.x + this.length;
  }

  private broomAt(view: Rect2): Vec2 {
    return new Vec2(view.x + 10, view.center.y + 24);
  }

  private start(): void {
    this.camera = GameCamera.current();
    if (!this.camera) {
      this.done = true; // no scrolling camera: a normal stretch
      return;
    }
    this.active = true;
    this.camera.startAutoscroll(new Vec2(this.speed, 0));
    if (this.broom) {
      const broom = new Broom('Broom');
      broom.topLevel = true;
      broom.zIndex = 15;
      this.broomNode = broom;
      this.addChild(broom);
      broom.globalPosition = this.broomAt(this.camera.viewRect());
      broom.resetPhysicsInterpolation();
    }
    this.started.emit();
  }

  private stop(): void {
    this.active = false;
    this.done = true;
    if (this.camera && !this.camera.isFreed()) this.camera.stopAutoscroll();
    if (this.player && !this.player.isFreed()) this.player.clampRect = new Rect2();
    if (this.broomNode) {
      this.broomNode.queueFree();
      this.broomNode = null;
    }
    this.finished.emit();
  }

  override exitTree(): void {
    if (this.active) this.stop();
  }
}
