// The level's parallax backdrop (levels/common/level_root.gd _add_backdrop,
// and levels/common/placeholder_backdrop.gd). Four layers like the real art:
// 1 far (sky, full screen height), 2 distant, 3 mid and 4 near (shorter,
// transparent above their shapes), scrolling at 0.1 / 0.3 / 0.6 / 0.9 of the
// camera. Uses assets/backgrounds/<zone>/1_far.png .. 4_near.png when any of
// them exist, else placeholder layers drawn in code per zone style (rendered
// once into offscreen canvases and blitted). Every layer tiles horizontally.
//
// On screen a layer sits at scroll_offset - camera top-left x scroll_scale
// (Godot Parallax2D). The far layer sits at the top of the screen (it never
// moves vertically); the bottoms of the others sit on the horizon line when
// the camera is at its lowest. Below each layer its bottom row's colour
// continues, so the sky never shows through between it and the ground.
//
// The node lives in the world at z -100 (absolute), like the Godot holder.
// draw() reads the camera from its own draw transform (the renderer's
// rounded, interpolated view for this frame), so the backdrop never lags the
// world by a tick.

import { assetExists, assetImage } from '../../runtime/assets';
import { Color } from '../../runtime/color';
import { context2d, makeCanvas, type Gfx, type Texture } from '../../runtime/gfx';
import { fposmod, Rng, TAU } from '../../runtime/math';
import { Node2D } from '../../runtime/node';
import { VIEW_H, VIEW_W } from '../../runtime/tree';
import { Vec2 } from '../../runtime/vec2';
import { LevelHooks, type LevelRoot } from './level_root';

const BACKGROUND_DIR = 'assets/backgrounds';
export const BACKGROUND_FILES = ['1_far.png', '2_distant.png', '3_mid.png', '4_near.png'];
export const BACKGROUND_SCROLL = [0.1, 0.3, 0.6, 0.9];
/** Backdrop layers sit this far behind everything else. */
export const BACKGROUND_Z = -100;

/** Placeholder layer width (all shapes use whole periods of it) and heights. */
const WIDTH = 512;
const HEIGHTS = [240, 128, 96, 56];

interface Style {
  sky_top: Color;
  sky_bottom: Color;
  sun: Color;
  cloud: Color;
  cloud_shade: Color;
  distant: Color;
  distant_rim: Color;
  mid: Color;
  mid_rim: Color;
  trunk: Color;
  near: Color;
  near_rim: Color;
  accent: Color;
}

type StyleName = 'hills' | 'academy' | 'mansion' | 'neon';

const c = (r: number, g: number, b: number) => new Color(r, g, b);

const STYLES: Record<StyleName, Style> = {
  hills: {
    sky_top: c(0.31, 0.56, 0.95),
    sky_bottom: c(0.74, 0.9, 1.0),
    sun: c(1.0, 0.95, 0.7),
    cloud: c(1.0, 1.0, 1.0),
    cloud_shade: c(0.84, 0.92, 1.0),
    distant: c(0.45, 0.72, 0.78),
    distant_rim: c(0.62, 0.85, 0.86),
    mid: c(0.24, 0.58, 0.36),
    mid_rim: c(0.38, 0.72, 0.42),
    trunk: c(0.42, 0.28, 0.18),
    near: c(0.15, 0.42, 0.24),
    near_rim: c(0.3, 0.6, 0.32),
    accent: c(1.0, 0.86, 0.35),
  },
  academy: {
    sky_top: c(0.08, 0.05, 0.2),
    sky_bottom: c(0.4, 0.25, 0.52),
    sun: c(0.95, 0.93, 0.8),
    cloud: c(0.5, 0.38, 0.62),
    cloud_shade: c(0.36, 0.26, 0.48),
    distant: c(0.22, 0.15, 0.36),
    distant_rim: c(0.36, 0.26, 0.52),
    mid: c(0.17, 0.11, 0.27),
    mid_rim: c(0.3, 0.2, 0.42),
    trunk: c(0.95, 0.8, 0.4),
    near: c(0.12, 0.2, 0.18),
    near_rim: c(0.22, 0.34, 0.28),
    accent: c(0.95, 0.8, 0.4),
  },
  mansion: {
    sky_top: c(0.96, 0.55, 0.34),
    sky_bottom: c(1.0, 0.88, 0.6),
    sun: c(1.0, 0.97, 0.82),
    cloud: c(1.0, 0.8, 0.66),
    cloud_shade: c(0.94, 0.66, 0.52),
    distant: c(0.5, 0.46, 0.62),
    distant_rim: c(0.64, 0.6, 0.74),
    mid: c(0.3, 0.32, 0.5),
    mid_rim: c(0.86, 0.84, 0.78),
    trunk: c(1.0, 0.9, 0.55),
    near: c(0.16, 0.36, 0.22),
    near_rim: c(0.28, 0.5, 0.3),
    accent: c(0.95, 0.95, 0.9),
  },
  neon: {
    sky_top: c(0.03, 0.01, 0.08),
    sky_bottom: c(0.26, 0.04, 0.3),
    sun: c(1.0, 0.35, 0.75),
    cloud: c(0.2, 0.05, 0.28),
    cloud_shade: c(0.12, 0.03, 0.2),
    distant: c(0.08, 0.03, 0.14),
    distant_rim: c(1.0, 0.25, 0.75),
    mid: c(0.05, 0.05, 0.12),
    mid_rim: c(0.2, 0.95, 1.0),
    trunk: c(0.2, 0.95, 1.0),
    near: c(0.04, 0.02, 0.08),
    near_rim: c(1.0, 0.3, 0.8),
    accent: c(0.2, 0.95, 1.0),
  },
};

const ZONE_STYLES: Record<string, StyleName> = {
  test_zone: 'hills',
  z1_retro_rush_hills: 'hills',
  z2_wizard_academy: 'academy',
  z3_capital_mansion: 'mansion',
  z4_neon_rush_remix: 'neon',
};

/** Placeholder style of a zone (hills for unknown zones). */
export function placeholderStyle(zoneId: string): StyleName {
  return ZONE_STYLES[zoneId] ?? 'hills';
}

// --- Placeholder painting --------------------------------------------------------

/** Integer pixel painter over a canvas, shaped like Godot's Image fill_rect / set_pixel. */
class Painter {
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly height: number,
  ) {
    this.ctx = context2d(canvas);
  }

  fillRect(x: number, y: number, w: number, h: number, color: Color): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = color.css();
    this.ctx.fillRect(x, y, w, h);
  }

  setPixel(x: number, y: number, color: Color): void {
    this.fillRect(x, y, 1, 1, color);
  }
}

/** Godot roundi: halves away from zero. */
const roundi = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));
const clampi = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const idiv = (a: number, b: number): number => Math.trunc(a / b);
const wrapi = (v: number, lo: number, hi: number): number => lo + (((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo);

/** Layer `index` (0 far .. 3 near) of a placeholder style; null without a canvas (tests). */
export function drawPlaceholderLayer(style: StyleName, index: number): HTMLCanvasElement | null {
  const canvas = makeCanvas(WIDTH, HEIGHTS[index]!);
  if (!canvas) return null;
  const img = new Painter(canvas, HEIGHTS[index]!);
  const s = STYLES[style];
  switch (index) {
    case 0:
      drawSky(img, s, style);
      break;
    case 1:
      if (style === 'academy' || style === 'mansion') drawSkyline(img, s, style === 'academy', 7);
      else drawRidge(img, s.distant, s.distant_rim, 0.55, [2, 5, 9], [22, 9, 4]);
      break;
    case 2:
      if (style === 'hills') drawTrees(img, s);
      else drawSkyline(img, s, style === 'academy', 13, true);
      break;
    case 3:
      drawBushes(img, s);
      break;
  }
  return canvas;
}

/** Banded vertical gradient (retro steps), a sun or moon, and clouds or stars. */
function drawSky(img: Painter, s: Style, style: StyleName): void {
  const h = img.height;
  const bands = 12;
  for (let y = 0; y < h; y++) {
    const t = Math.floor((y / h) * bands) / (bands - 1);
    img.fillRect(0, y, WIDTH, 1, s.sky_top.lerp(s.sky_bottom, Math.min(Math.max(t, 0), 1)));
  }
  disc(img, 380, 54, 18, s.sun);
  if (style === 'academy' || style === 'neon') {
    const rng = new Rng(7);
    const star = s.sun.lerp(Color.WHITE, 0.5);
    for (let i = 0; i < 60; i++) {
      const x = rng.randiRange(0, WIDTH - 1);
      const y = rng.randiRange(0, idiv(h * 2, 3));
      img.setPixel(x, y, i % 3 ? star : s.accent);
    }
    if (style === 'academy') disc(img, 387, 49, 15, s.sky_top.lerp(s.sky_bottom, 0.25)); // crescent
  } else {
    for (const [cx, cy, scale] of [
      [60, 70, 1.0],
      [170, 40, 0.8],
      [270, 96, 1.2],
      [440, 120, 0.9],
    ] as const) {
      cloud(img, cx, cy, scale, s.cloud, s.cloud_shade);
    }
  }
}

/** Rolling hill silhouette: a sum of sines with whole periods across WIDTH. */
function drawRidge(img: Painter, color: Color, rim: Color, base: number, freqs: number[], amps: number[]): void {
  const h = img.height;
  for (let x = 0; x < WIDTH; x++) {
    let y = h * base;
    for (let i = 0; i < freqs.length; i++) y -= amps[i]! * Math.sin((TAU * freqs[i]! * x) / WIDTH + i * 1.7);
    const top = clampi(roundi(y), 0, h - 1);
    img.fillRect(x, top, 1, h - top, color);
    img.fillRect(x, top, 1, 2, rim);
  }
}

/** Rows of towers (academy spires) or blocks (mansion city), with lit windows. */
function drawSkyline(img: Painter, s: Style, spires: boolean, seed: number, front = false): void {
  const h = img.height;
  const rng = new Rng(seed);
  const color = front ? s.mid : s.distant;
  const rim = front ? s.mid_rim : s.distant_rim;
  let x = 0;
  while (x < WIDTH) {
    let w = front ? rng.randiRange(14, 22) : rng.randiRange(18, 40);
    w = Math.min(w, WIDTH - x);
    const top = front ? rng.randiRange(idiv(h, 3), idiv(h, 2)) : rng.randiRange(idiv(h, 4), idiv(h * 2, 3));
    img.fillRect(x, top, w, h - top, color);
    img.fillRect(x, top, w, 1, rim);
    if (spires) {
      for (let k = 0; k < idiv(w, 2); k++) img.fillRect(x + k, top - idiv(k * 3, 2), w - 2 * k, 1, color);
    }
    for (let wy = top + 6; wy < h - 6; wy += 10) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) {
        if (rng.randf() < 0.55) img.fillRect(wx, wy, 2, 3, s.accent);
      }
    }
    x += w + rng.randiRange(4, 14);
  }
}

/** Round-topped trees on a low hedge line. */
function drawTrees(img: Painter, s: Style): void {
  const h = img.height;
  drawRidgeInto(img, s.mid, s.mid_rim, h - 22, [3, 7], [5, 2]);
  for (const [cx, size] of [
    [30, 26],
    [118, 34],
    [196, 22],
    [300, 30],
    [372, 24],
    [455, 32],
  ] as const) {
    const r = idiv(size, 2) + 6;
    const top = h - 22 - size;
    img.fillRect(cx - 2, top + r, 5, h - top - r, s.trunk);
    disc(img, cx, top + idiv(r, 2), r, s.mid);
    disc(img, cx - idiv(r, 3), top + idiv(r, 3), idiv(r, 2), s.mid_rim);
  }
}

/** Foreground bushes along the bottom edge, with a few accent flowers. */
function drawBushes(img: Painter, s: Style): void {
  const h = img.height;
  const rng = new Rng(11);
  drawRidgeInto(img, s.near, s.near_rim, h - 12, [4, 11], [3, 2]);
  let x = 8;
  while (x < WIDTH) {
    const r = rng.randiRange(10, 18);
    disc(img, x, h - 8, r, s.near);
    disc(img, x - idiv(r, 3), h - 8 - idiv(r, 3), idiv(r, 2), s.near_rim);
    if (rng.randf() < 0.5) img.fillRect(wrapi(x + idiv(r, 2), 0, WIDTH), h - 14, 2, 2, s.accent);
    x += r + rng.randiRange(14, 40);
  }
}

function drawRidgeInto(img: Painter, color: Color, rim: Color, base: number, freqs: number[], amps: number[]): void {
  const h = img.height;
  for (let x = 0; x < WIDTH; x++) {
    let y = base;
    for (let i = 0; i < freqs.length; i++) y -= amps[i]! * Math.sin((TAU * freqs[i]! * x) / WIDTH + i);
    const top = clampi(roundi(y), 0, h - 1);
    img.fillRect(x, top, 1, h - top, color);
    img.fillRect(x, top, 1, 1, rim);
  }
}

/** Filled disc, wrapped horizontally so layers tile. */
function disc(img: Painter, cx: number, cy: number, r: number, color: Color): void {
  const h = img.height;
  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= h) continue;
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    for (const shift of [-WIDTH, 0, WIDTH]) {
      const x0 = Math.max(cx - half + shift, 0);
      const x1 = Math.min(cx + half + shift, WIDTH - 1);
      if (x1 >= x0) img.fillRect(x0, y, x1 - x0 + 1, 1, color);
    }
  }
}

const PUFFS = [
  [-18, 4, 10],
  [0, 0, 14],
  [18, 3, 11],
  [32, 6, 8],
] as const;

function cloud(img: Painter, cx: number, cy: number, scale: number, color: Color, shade: Color): void {
  for (const [px, py, pr] of PUFFS) disc(img, cx + roundi(px * scale), cy + roundi(py * scale) + 2, roundi(pr * scale), shade);
  for (const [px, py, pr] of PUFFS) disc(img, cx + roundi(px * scale), cy + roundi(py * scale), roundi(pr * scale) - 1, color);
}

/**
 * Placeholder canvases per style, painted once. They are tiny (4 styles x 4
 * layers, at most 512x240 each) and a page never exits, so they are kept.
 */
const placeholderCache = new Map<StyleName, (HTMLCanvasElement | null)[]>();

function placeholderLayers(style: StyleName): (HTMLCanvasElement | null)[] {
  let layers = placeholderCache.get(style);
  if (!layers) {
    layers = [0, 1, 2, 3].map((i) => drawPlaceholderLayer(style, i));
    placeholderCache.set(style, layers);
  }
  return layers;
}

/** The opaque colour of the bottom row's middle pixel, or null (transparent, unreadable). */
function bottomColor(tex: Texture): Color | null {
  let canvas: HTMLCanvasElement | null =
    typeof HTMLCanvasElement !== 'undefined' && tex instanceof HTMLCanvasElement ? tex : null;
  try {
    if (!canvas) {
      canvas = makeCanvas(tex.width, tex.height);
      if (!canvas) return null;
      context2d(canvas).drawImage(tex as CanvasImageSource, 0, 0);
    }
    const px = context2d(canvas).getImageData(Math.floor(tex.width / 2), tex.height - 1, 1, 1).data;
    if (px[3]! / 255 <= 0.9) return null;
    return Color.rgb8(px[0]!, px[1]!, px[2]!);
  } catch {
    return null;
  }
}

// --- The node ------------------------------------------------------------------------

interface Layer {
  index: number;
  texture: () => Texture | null;
  /** undefined = not read yet. */
  fill: Color | null | undefined;
}

export class Backdrop extends Node2D {
  readonly artZone: string;
  /** True when the zone's background files are used (else the placeholder). */
  readonly usesFiles: boolean;
  private readonly layers: Layer[] = [];

  constructor(
    private readonly root: LevelRoot,
    artZone: string,
  ) {
    super('Backdrop');
    this.artZone = artZone;
    this.zIndex = BACKGROUND_Z;
    this.zAsRelative = false;
    this.topLevel = true;
    const fileZone = artZone === 'test_zone' ? 'z1_retro_rush_hills' : artZone;
    const paths = BACKGROUND_FILES.map((file) => `${BACKGROUND_DIR}/${fileZone}/${file}`);
    this.usesFiles = artZone !== '' && paths.some((p) => assetExists(p));
    if (this.usesFiles) {
      paths.forEach((path, index) => {
        if (assetExists(path)) this.layers.push({ index, texture: () => assetImage(path), fill: undefined });
      });
    } else {
      const style = placeholderStyle(artZone);
      for (let index = 0; index < BACKGROUND_FILES.length; index++) {
        this.layers.push({ index, texture: () => placeholderLayers(style)[index] ?? null, fill: undefined });
      }
    }
  }

  /** Screen-space top-left of layer `index` for a camera top-left and layer size (Parallax2D placement). */
  layerOrigin(index: number, camera: Vec2, size: Vec2): Vec2 {
    const root = this.root;
    const scaleX = BACKGROUND_SCROLL[index]!;
    const scaleY = index === 0 ? 0 : scaleX * root.backgroundYScroll;
    const yOffset = root.backgroundYOffsets[index] ?? 0;
    let offsetY = yOffset;
    if (index !== 0) {
      const bounds = root.getBounds();
      const lowestTop = bounds.bottom - VIEW_H;
      const horizon = bounds.bottom - root.horizonHeight;
      offsetY = horizon - lowestTop + yOffset - size.y + lowestTop * scaleY;
    }
    return new Vec2(-camera.x * scaleX, offsetY - camera.y * scaleY);
  }

  override draw(g: Gfx): void {
    // Top-level at the origin: the draw transform is the frame's view, so its
    // translation is minus the (rounded, interpolated) camera top-left.
    const t = g.transform;
    const camera = new Vec2(-t.tx, -t.ty);
    g.setTransform(camera); // screen space from here on
    for (const layer of this.layers) {
      const tex = layer.texture();
      if (!tex || tex.width <= 0) continue;
      if (layer.fill === undefined) layer.fill = bottomColor(tex);
      const size = new Vec2(tex.width, tex.height);
      const origin = this.layerOrigin(layer.index, camera, size);
      const y = Math.round(origin.y);
      let x = fposmod(Math.round(origin.x), size.x) - size.x;
      if (y < VIEW_H && y + size.y > 0) {
        for (; x < VIEW_W; x += size.x) g.texture(tex, new Vec2(x, y));
      }
      if (layer.fill) {
        const fillH = layer.index === 0 ? (size.y < VIEW_H ? VIEW_H - size.y + 1 : 0) : VIEW_H * 2;
        const top = y + size.y;
        if (fillH > 0 && top < VIEW_H) g.rect(0, top, VIEW_W, Math.min(fillH, VIEW_H - top), layer.fill);
      }
    }
    g.resetTransform();
  }
}

/** Sets LevelHooks.backdrop so every level gets its parallax backdrop. */
export function installBackdrop(): void {
  LevelHooks.backdrop = (root, artZone) => new Backdrop(root, artZone);
}
