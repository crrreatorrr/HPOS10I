// A row of spikes: a solid block (terrain bit 1, so it can be stood on and
// walked into like a wall) with a hurt area only along its pointed side.
// Touching the points calls player.hurt(globalPosition); touching the sides
// or the base never does (the player's wall sensors keep his hitbox off the
// side). The origin is the middle of the base, on the floor; the points face
// up (local -y). Rotate the node to point them another way. The hurt area
// sits on layer 8 (hazards) with mask 5 (player).

import { drawPropSprite, PropSprite } from './prop_sprite';
import { Layers } from '../../core/layers';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { StaticBody2D } from '../../runtime/physics';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

const HEIGHT = 16.0;
/** The hurt area reaches this far past the points, and stops this far short of the sides. */
const REACH = 6.0;
const INSET = 2.0;

const OUTLINE = new Color(0.24, 0.1, 0.04);
const BASE = new Color(0.55, 0.3, 0.12);
const SPIKE = new Color(1.0, 0.56, 0.12);
const SPIKE_LIGHT = new Color(1.0, 0.84, 0.5);
const SPIKE_DARK = new Color(0.78, 0.32, 0.06);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class Spikes extends StaticBody2D implements Configurable {
  static readonly HEIGHT = HEIGHT;

  private _width = 32.0;
  private readonly shape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private readonly areaShape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };
  private readonly hurtArea: PlayerArea;

  constructor(name = 'Spikes') {
    super(name);
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.addShape(this.shape);
    this.hurtArea = new PlayerArea('Hurt');
    this.hurtArea.collisionLayer = PlayerArea.LAYER_HAZARDS;
    this.hurtArea.monitorable = true;
    this.hurtArea.addShape(this.areaShape);
    this.addChild(this.hurtArea);
    this.layout();
  }

  /** Width of the row (16 px per pair of points). */
  get width(): number {
    return this._width;
  }

  set width(v: number) {
    this._width = Math.max(v, 16.0);
    this.layout();
  }

  applyProps(p: Props): void {
    this.width = p.num('width', this._width);
  }

  override enterTree(): void {
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    super.enterTree();
  }

  override physicsProcess(): void {
    for (const player of this.hurtArea.playersInside()) {
      if (player.state !== 'dead') player.hurt(this.globalPosition);
    }
  }

  private layout(): void {
    this.shape.size = new Vec2(this._width, HEIGHT);
    this.shape.offset = new Vec2(0, -HEIGHT / 2);
    this.areaShape.size = new Vec2(this._width - INSET * 2, REACH + 4.0);
    this.areaShape.offset = new Vec2(0, -HEIGHT - REACH / 2 + 2.0);
    this.shapesChanged();
    this.hurtArea.shapesChanged();
  }

  /** Square around the origin, so it stays right when the node is rotated. */
  cullRect(): Rect2 {
    const r = Math.max(this._width / 2, HEIGHT) + 2;
    return new Rect2(-r, -r, r * 2, r * 2);
  }

  override draw(g: Gfx): void {
    const width = this._width;
    const half = width / 2;
    const segments = Math.max(1, Math.round(width / 24));
    const stepWidth = width / segments;
    let loaded = false;
    for (let i = 0; i < segments; i++) {
      loaded = drawPropSprite(g, PropSprite.spike, new Vec2(-half + (i + 0.5) * stepWidth, -HEIGHT / 2), new Vec2(stepWidth / 48, HEIGHT / 21));
      if (!loaded) break;
    }
    if (loaded) return;
    g.rect(-half, -4, width, 4, OUTLINE);
    g.rect(-half + 1, -3, width - 2, 2, BASE);
    const count = Math.max(1, Math.floor(width / 8));
    const step = width / count;
    for (let i = 0; i < count; i++) {
      const x0 = -half + i * step;
      const tip = new Vec2(x0 + step / 2, -HEIGHT);
      const spike = [new Vec2(x0, -3), tip, new Vec2(x0 + step, -3)];
      g.polygon(spike, SPIKE);
      g.polygon([new Vec2(x0 + step / 2, -3), tip, new Vec2(x0 + step, -3)], SPIKE_DARK);
      g.line(new Vec2(x0 + 1.5, -4), tip.add(new Vec2(-0.5, 2)), SPIKE_LIGHT, 1);
      g.polyline(spike, OUTLINE, 1);
    }
  }
}
