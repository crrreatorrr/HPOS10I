// A cracked rock wall: solid terrain (bit 1, so Sproto's wall sensors stop at
// it) until he hits it while attacking:
//   - on the ground: rolling (any speed), or spin dashing at |ground speed| >= 4.5;
//   - in the air: any attack (jump, roll).
// Running, standing or charging a spin dash against it does nothing. The check
// runs before the player moves each tick and looks one frame ahead, so it
// breaks before his sensors could stop him: a roll at 16 px/frame goes
// straight through without losing speed. Breaking: collision off, debris,
// +100 score, `break_wall` (once). The origin is the middle of the wall's
// base, on the floor.
//
// "Before the player moves": the original used process_physics_priority -10.
// The runtime has no priorities; levels add the player after their objects,
// so tree order gives the same result.

import { Audio } from '../../core/audio';
import { GameState } from '../../core/game_state';
import { Layers } from '../../core/layers';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { StaticBody2D } from '../../runtime/physics';
import { Signal } from '../../runtime/signal';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { LevelFx } from '../common/level_fx';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

const SCORE = 100;
const BREAK_SPEED = 4.5;
/** Extra reach of the look-ahead, beyond the player's speed this frame. */
const REACH = 4.0;
/** How far around the wall the detector area reaches (fastest approach + margin). */
const DETECT_MARGIN = 24.0;

const OUTLINE = new Color(0.16, 0.11, 0.1);
const STONE = new Color(0.62, 0.52, 0.44);
const STONE_LIGHT = new Color(0.78, 0.69, 0.58);
const STONE_DARK = new Color(0.42, 0.33, 0.28);
const CRACK = new Color(0.24, 0.17, 0.14);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class BreakableWall extends StaticBody2D implements Configurable {
  static readonly SCORE = SCORE;
  static readonly BREAK_SPEED = BREAK_SPEED;

  readonly broken = new Signal();

  private _size = new Vec2(24, 48);
  private isBrokenFlag = false;
  private readonly shape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private readonly areaShape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private readonly detector: PlayerArea;

  constructor(name = 'BreakableWall') {
    super(name);
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.processPriority = -10; // before the player moves
    this.addShape(this.shape);
    this.detector = new PlayerArea('Detector');
    this.detector.collisionLayer = 0;
    this.detector.addShape(this.areaShape);
    this.addChild(this.detector);
    this.layout();
  }

  get size(): Vec2 {
    return this._size;
  }

  set size(v: Vec2) {
    this._size = new Vec2(Math.max(v.x, 18), Math.max(v.y, 8));
    this.layout();
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this._size);
  }

  override enterTree(): void {
    this.collisionLayer = this.isBrokenFlag ? 0 : Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    super.enterTree();
  }

  isBroken(): boolean {
    return this.isBrokenFlag;
  }

  /** World rect of the wall. */
  wallRect(): Rect2 {
    const at = this.globalPosition;
    return new Rect2(at.x - this._size.x / 2, at.y - this._size.y, this._size.x, this._size.y);
  }

  /** True when `player` is in a state that breaks walls. */
  static canBreak(player: Player | null): boolean {
    if (!player || player.state === 'dead' || !player.isAttacking()) return false;
    if (!player.grounded) return true;
    return player.state === 'roll' || Math.abs(player.groundSpeed) >= BREAK_SPEED;
  }

  override physicsProcess(): void {
    if (this.isBrokenFlag) return;
    for (const player of this.detector.playersInside()) {
      if (BreakableWall.canBreak(player) && this.reaches(player)) {
        this.breakWall();
        return;
      }
    }
  }

  /** True when `player`'s box, moved by this frame's speed, touches the wall. */
  private reaches(player: Player): boolean {
    const r = player.getRadii();
    const v = player.velocity;
    const rx = Math.abs(v.x) + REACH;
    const ry = Math.abs(v.y) + REACH;
    const at = player.globalPosition;
    const box = new Rect2(at.x - r.x, at.y - r.y, r.x * 2, r.y * 2);
    return box.growIndividual(rx, ry, rx, ry).intersects(this.wallRect());
  }

  /** Breaks the wall (once). */
  breakWall(): void {
    if (this.isBrokenFlag) return;
    this.isBrokenFlag = true;
    this.collisionLayer = 0;
    this.shape.disabled = true;
    this.refresh();
    this.detector.monitoring = false;
    GameState.addScore(SCORE);
    Audio.playSfx('break_wall');
    LevelFx.debris(this.parent, this.wallRect(), STONE, OUTLINE, 10);
    this.hide();
    this.broken.emit();
  }

  private layout(): void {
    this.shape.size = this._size;
    this.shape.offset = new Vec2(0, -this._size.y / 2);
    this.areaShape.size = this._size.add(new Vec2(DETECT_MARGIN, DETECT_MARGIN).mul(2));
    this.areaShape.offset = this.shape.offset;
    this.shapesChanged();
    this.detector.shapesChanged();
  }

  cullRect(): Rect2 {
    return new Rect2(-this._size.x / 2 - 1, -this._size.y - 1, this._size.x + 2, this._size.y + 2);
  }

  override draw(g: Gfx): void {
    const size = this._size;
    const rect = new Rect2(-size.x / 2, -size.y, size.x, size.y);
    g.rectR(rect, OUTLINE);
    // Stone blocks in a staggered bond, lit from the top left.
    const rows = Math.max(1, Math.round(size.y / 12));
    const rowH = (size.y - 2) / rows;
    for (let row = 0; row < rows; row++) {
      const y = rect.y + 1 + row * rowH;
      const offset = row % 2 === 0 ? 0 : size.x / 4;
      let x = rect.x + 1 - offset;
      while (x < rect.right - 1) {
        const w = size.x / 2;
        const bx = Math.max(x, rect.x + 1);
        const bw = Math.min(x + w - 1, rect.right - 1) - bx;
        const bh = rowH - 1;
        if (bw > 1) {
          g.rect(bx, y, bw, bh, STONE);
          g.rect(bx, y, bw, 1, STONE_LIGHT);
          g.rect(bx, y + bh - 1, bw, 1, STONE_DARK);
        }
        x += w;
      }
    }
    // Cracks across the face, so it reads as breakable.
    const c = rect.center;
    const at = (dx: number, dy: number) => new Vec2(c.x + dx, c.y + dy);
    g.polyline([at(-6, -14), at(-1, -6), at(-4, 2), at(2, 9), at(0, 16)], CRACK, 1);
    g.polyline([at(-1, -6), at(6, -9)], CRACK, 1);
    g.polyline([at(-4, 2), at(-9, 5)], CRACK, 1);
  }
}
