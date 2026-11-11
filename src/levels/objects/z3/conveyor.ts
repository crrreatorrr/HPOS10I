// A conveyor belt (Capital Mansion; docs/CONTRACTS.md "Moving terrain",
// conveyors): a static floor segment carrying the `conveyor_speed` meta, so a
// grounded Sproto is carried `speed` px/frame along it (+ = right) on top of
// his own motion. The belt's chevrons roll in the carrying direction. The
// origin is the top-left corner of the belt surface.

import { Layers } from '../../../core/layers';
import { drawPropSprite, PropSprite } from '../prop_sprite';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { fposmod, signf } from '../../../runtime/math';
import { StaticBody2D } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import type { Configurable, Props } from '../../common/props';

const BELT = new Color(0.2, 0.2, 0.26);
const BELT_LIGHT = new Color(0.34, 0.34, 0.42);
const BELT_DARK = BELT.darkened(0.3);
const ROLLER = new Color(0.6, 0.62, 0.7);
const CHEVRON = new Color(0.98, 0.84, 0.4);
const CHEVRON_DIM = new Color(0.6, 0.5, 0.2);
const OUTLINE = new Color(0.08, 0.08, 0.12);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class Conveyor extends StaticBody2D implements Configurable {
  size = new Vec2(256, 48);
  /** Carry speed, px/frame; + carries right, - carries left. */
  speed = -4.0;
  private t = 0;
  private readonly shape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };

  constructor(name = 'Conveyor') {
    super(name);
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.addShape(this.shape);
    this.layout();
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this.size);
    this.speed = p.num('speed', this.speed);
    this.layout();
  }

  private layout(): void {
    this.setMeta('conveyor_speed', this.speed);
    this.shape.size = this.size;
    this.shape.offset = this.size.div(2);
    this.shapesChanged();
  }

  override enterTree(): void {
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.setMeta('conveyor_speed', this.speed);
    super.enterTree();
  }

  override physicsProcess(): void {
    this.t += 1;
  }

  cullRect(): Rect2 {
    return new Rect2(-1, -1, this.size.x + 2, this.size.y + 2);
  }

  override draw(g: Gfx): void {
    const size = this.size;
    g.rect(-1, -1, size.x + 2, size.y + 2, OUTLINE);
    g.rect(0, 0, size.x, size.y, BELT);
    g.rect(0, 0, size.x, 6, BELT_LIGHT);
    // Rollers at both ends, then chevrons rolling along the belt.
    for (const x of [6.0, size.x - 6.0]) {
      g.circle(new Vec2(x, 6), 5, OUTLINE);
      g.circle(new Vec2(x, 6), 4, ROLLER);
    }
    const dir = signf(this.speed);
    const phase = fposmod(this.t * Math.abs(this.speed) * 0.5, 24);
    let x = 16 - 24 + (dir > 0 ? phase : 24 - phase);
    let k = 0;
    while (x < size.x - 12) {
      if (x >= 12) {
        const tip = new Vec2(x + 4 * dir, 3);
        const color = k % 2 === 0 ? CHEVRON : CHEVRON_DIM;
        g.line(new Vec2(x - 2 * dir, 0.5), tip, color, 2);
        g.line(tip, new Vec2(x - 2 * dir, 5.5), color, 2);
      }
      x += 24;
      k += 1;
    }
    const faceHeight = size.y - 6;
    if (faceHeight > 0) {
      g.rect(0, 6, size.x, faceHeight, BELT_DARK);
      const count = Math.max(1, Math.round(size.x / 36));
      const width = size.x / count;
      for (let i = 0; i < count; i++) {
        drawPropSprite(g, PropSprite.conveyor, new Vec2((i + 0.5) * width, 6 + faceHeight / 2),
          new Vec2(width / 45, faceHeight / 19));
      }
      g.rect(0, 6, size.x, 1, OUTLINE);
    }
  }
}
