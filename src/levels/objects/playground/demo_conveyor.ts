// A minimal conveyor for the physics playground and tests (docs/CONTRACTS.md,
// "Moving terrain"): solid terrain with the meta `conveyor_speed` (px/frame,
// + = right). The origin is the top-left corner.

import { Layers } from '../../../core/layers';
import { FPS } from '../../../core/physics_constants';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { fposmod } from '../../../runtime/math';
import { StaticBody2D } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import type { Configurable, Props } from '../../common/props';

const STRIPE = 12.0;

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class DemoConveyor extends StaticBody2D implements Configurable {
  size = new Vec2(160, 8);
  color = new Color(0.35, 0.38, 0.45);
  private _speed = 2.0;
  private scroll = 0;
  private readonly shape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };

  constructor(name = 'DemoConveyor') {
    super(name);
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.setMeta('conveyor_speed', this._speed);
    this.addShape(this.shape);
    this.layout();
  }

  /** px/frame, + = right. */
  get speed(): number {
    return this._speed;
  }

  set speed(v: number) {
    this._speed = v;
    this.setMeta('conveyor_speed', v);
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this.size);
    this.speed = p.num('speed', this._speed);
    this.color = p.color('color', this.color);
    this.layout();
  }

  private layout(): void {
    this.shape.size = this.size;
    this.shape.offset = this.size.div(2);
    this.shapesChanged();
  }

  override enterTree(): void {
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    super.enterTree();
  }

  override process(delta: number): void {
    this.scroll = fposmod(this.scroll + this._speed * delta * FPS, STRIPE);
  }

  cullRect(): Rect2 {
    return new Rect2(0, 0, this.size.x, this.size.y);
  }

  override draw(g: Gfx): void {
    const size = this.size;
    g.rect(0, 0, size.x, size.y, this.color);
    // Chevrons pointing the way it carries, scrolling at its speed.
    const dir = this._speed >= 0 ? 1 : -1;
    const light = this.color.lightened(0.45);
    for (let x = this.scroll - STRIPE; x < size.x; x += STRIPE) {
      const tip = x + dir * 3;
      if (x >= 0 && tip <= size.x && tip >= 0) {
        g.polyline([new Vec2(x, 1.5), new Vec2(tip, size.y / 2), new Vec2(x, size.y - 1.5)], light, 1);
      }
    }
  }
}
