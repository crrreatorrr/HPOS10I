// A sunny hills backdrop for the title and zone select, drawn in code at
// 424x240 until background art exists: banded sky, sun, drifting clouds, two
// hill layers, and the Zone 1 ground (grass lip over argyle dirt).
// `groundY` sets the horizon of the ground; `dim` darkens it for menus.
// Everything but the clouds is drawn once into a cached canvas (when there
// is a DOM); the clouds never overlap the hills, so they go on top.

import { Color } from '../../runtime/color';
import { context2d, Gfx, makeCanvas } from '../../runtime/gfx';
import { fposmod } from '../../runtime/math';
import { Node2D } from '../../runtime/node';
import { VIEW_H, VIEW_W } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { pixelDisc } from './pixel_art';

const SKY = [
  Color.rgb8(56, 112, 224),
  Color.rgb8(72, 136, 236),
  Color.rgb8(96, 160, 244),
  Color.rgb8(124, 184, 250),
  Color.rgb8(156, 208, 252),
  Color.rgb8(188, 228, 255),
];
const SUN = Color.rgb8(255, 236, 140);
const SUN_CORE = Color.rgb8(255, 250, 210);
const CLOUD = Color.rgb8(255, 255, 255);
const CLOUD_SHADE = Color.rgb8(206, 226, 250);
const HILL_FAR = Color.rgb8(120, 196, 200);
const HILL_FAR_SHADE = Color.rgb8(100, 172, 184);
const HILL_NEAR = Color.rgb8(70, 172, 84);
const HILL_NEAR_SHADE = Color.rgb8(52, 140, 70);
const GRASS = Color.rgb8(92, 208, 72);
const GRASS_LIGHT = Color.rgb8(170, 240, 110);
const GRASS_DARK = Color.rgb8(40, 128, 48);
const DIRT_A = Color.rgb8(214, 120, 52);
const DIRT_B = Color.rgb8(176, 88, 40);
const DIRT_SHADE = Color.rgb8(120, 58, 30);

/** [x, y, scale] */
const CLOUDS: readonly [number, number, number][] = [
  [40, 46, 1.0],
  [170, 30, 0.8],
  [300, 54, 1.1],
  [410, 24, 0.7],
];

export class MenuBackdrop extends Node2D {
  groundY = 196;
  /** 0..1: darkens the whole backdrop (menus). */
  dim = 0;
  /** Cloud drift, pixels per second. */
  cloudSpeed = 6;

  private time = 0;
  private cached: HTMLCanvasElement | null = null;
  private cachedGround = -1;

  constructor(groundY = 196, dim = 0) {
    super('Backdrop');
    this.groundY = groundY;
    this.dim = dim;
  }

  override process(delta: number): void {
    this.time += delta;
  }

  override draw(g: Gfx): void {
    const w = VIEW_W;
    const h = VIEW_H;
    const still = this.staticLayer();
    if (still) g.ctx.drawImage(still, 0, 0);
    else this.drawStatic(g, w, h);
    for (const [cx, cy, s] of CLOUDS) {
      const x = fposmod(cx + this.time * this.cloudSpeed * s, w + 80) - 40;
      this.cloud(g, Math.round(x), cy, s);
    }
    if (this.dim > 0) g.rect(0, 0, w, h, new Color(0.02, 0.03, 0.1, this.dim));
  }

  private staticLayer(): HTMLCanvasElement | null {
    if (this.cached && this.cachedGround === this.groundY) return this.cached;
    const canvas = makeCanvas(VIEW_W, VIEW_H);
    if (!canvas) return null;
    this.drawStatic(new Gfx(context2d(canvas)), VIEW_W, VIEW_H);
    this.cached = canvas;
    this.cachedGround = this.groundY;
    return canvas;
  }

  private drawStatic(g: Gfx, w: number, h: number): void {
    const groundY = this.groundY;
    // Sky in flat bands, lighter toward the horizon (atmospheric depth).
    const band = Math.ceil(groundY / SKY.length);
    for (let i = 0; i < SKY.length; i++) g.rect(0, i * band, w, band + 1, SKY[i]!);
    pixelDisc(g, w - 70, 44, 20, SUN);
    pixelDisc(g, w - 70, 44, 14, SUN_CORE);
    // Far hills (light, bluish), then near hills (rich green).
    for (let i = 0; i < 6; i++) {
      const cx = fposmod(i * 92 - 20, w + 100) - 20;
      pixelDisc(g, cx, groundY + 26, 70 + (i % 2) * 18, HILL_FAR);
      pixelDisc(g, cx + 8, groundY + 30, 62 + (i % 2) * 18, HILL_FAR_SHADE);
    }
    for (let i = 0; i < 5; i++) {
      const cx = i * 110 + 30;
      pixelDisc(g, cx, groundY + 34, 52 + (i % 3) * 8, HILL_NEAR);
      pixelDisc(g, cx + 10, groundY + 40, 46 + (i % 3) * 8, HILL_NEAR_SHADE);
    }
    // Ground: argyle dirt with a shaded bottom, then the grass lip on top.
    const top = groundY;
    g.rect(0, top, w, h - top, DIRT_B);
    const cell = 12;
    const rows = Math.floor((h - top) / cell) + 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < Math.floor(w / cell) + 2; col++) {
        if ((row + col) % 2 !== 0) continue;
        const c = new Vec2(col * cell, top + 6 + row * cell);
        g.polygon([c.add(new Vec2(0, -cell * 0.5)), c.add(new Vec2(cell * 0.5, 0)), c.add(new Vec2(0, cell * 0.5)), c.add(new Vec2(-cell * 0.5, 0))], DIRT_A);
      }
    }
    g.rect(0, h - 8, w, 8, DIRT_SHADE.withAlpha(0.6));
    g.rect(0, top - 3, w, 7, GRASS);
    g.rect(0, top - 3, w, 1, GRASS_LIGHT);
    g.rect(0, top + 4, w, 1, GRASS_DARK);
    for (let x = 0; x < w; x += 6) {
      // Hanging tufts under the lip.
      g.rect(x + 2, top + 5, 2, 2 + (Math.floor(x / 6) % 2), GRASS_DARK);
    }
  }

  private cloud(g: Gfx, x: number, y: number, scale: number): void {
    const r = 9 * scale;
    for (const [px, py] of [
      [-r * 1.4, 2],
      [r * 1.4, 2],
      [0, -r * 0.4],
    ] as const) {
      pixelDisc(g, x + px, y + py + 2, r, CLOUD_SHADE);
    }
    for (const [px, py] of [
      [-r * 1.4, 0],
      [r * 1.4, 0],
      [0, -r * 0.6],
    ] as const) {
      pixelDisc(g, x + px, y + py, r, CLOUD);
    }
    g.rect(x - r * 2.2, y, r * 4.4, r * 0.9, CLOUD);
  }
}
