import { assetImage } from '../../../runtime/assets';
// A decorative waterfall (Retro Rush Hills): falling water streaks with a
// shimmer and a foam pool at the bottom. Purely visual, no collision; level
// builders put it behind the terrain. The origin is its top-left corner.

import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { fposmod } from '../../../runtime/math';
import { Node2D } from '../../../runtime/node';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import type { Configurable, Props } from '../../common/props';

const WATER = new Color(0.36, 0.66, 0.96);
const WATER_DARK = new Color(0.24, 0.5, 0.86);
const WATER_LIGHT = new Color(0.72, 0.9, 1.0);
const FOAM = new Color(0.95, 0.98, 1.0);

export class Waterfall extends Node2D implements Configurable {
  private _size = new Vec2(48, 128);
  private t = 0;
  /** The frame the art was last advanced (it animates every other tick, like the original redraw). */
  private shown = 0;

  constructor(name = 'Waterfall') {
    super(name);
  }

  get size(): Vec2 {
    return this._size;
  }

  set size(v: Vec2) {
    this._size = new Vec2(Math.max(v.x, 8), Math.max(v.y, 16));
  }

  applyProps(p: Props): void {
    this.size = p.vec('size', this._size);
  }

  override physicsProcess(): void {
    this.t += 1;
    if (this.t % 2 === 0) this.shown = this.t;
  }

  cullRect(): Rect2 {
    return new Rect2(-1, -1, this._size.x + 2, this._size.y + 2);
  }

  override draw(g: Gfx): void {
    const size = this._size;
    const t = this.shown;
    const water = assetImage('assets/sprites/z1_retro_rush_hills/waterfall/water.png');
    if (water) g.tiled(water, new Rect2(0, 0, size.x, size.y), new Vec2(0, t % water.height));
    else g.rect(0, 0, size.x, size.y, WATER);
    g.rect(0, 0, 2, size.y, WATER_DARK);
    g.rect(size.x - 2, 0, 2, size.y, WATER_DARK);
    // Streaks falling at two speeds.
    const columns = Math.trunc(size.x / 6);
    for (let c = 0; c < columns; c++) {
      const x = 3 + c * 6 + (c % 2);
      const speed = c % 2 === 0 ? 3 : 2;
      const length = 10 + ((c * 7) % 9);
      const y = fposmod(t * speed + c * 23, size.y + length) - length;
      const top = Math.max(y, 0);
      g.rect(x, top, 2, Math.min(length, size.y - top), WATER_LIGHT);
    }
    // Shimmer at the lip and foam at the bottom.
    const n = Math.trunc(size.x / 4);
    for (let i = 0; i < n; i++) {
      const lip = 1 + ((i + Math.trunc(t / 4)) % 3 === 0 ? 1 : 0);
      g.rect(i * 4, 0, 3, lip, FOAM);
      const foamH = 3 + 2 * Math.abs(Math.sin(i * 1.3 + t * 0.15));
      g.rect(i * 4 - 1, size.y - foamH, 5, foamH, FOAM);
    }
  }
}
