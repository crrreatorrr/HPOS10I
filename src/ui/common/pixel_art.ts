// Small pixel-art icons drawn in code (one character per pixel), turned into
// canvases once and cached. Used by the HUD and menus until the art agent's
// sprites exist. Without a DOM (tests) the icons are drawn pixel by pixel, so
// nothing ever needs a canvas to exist.
//
// Also: crisp (non-antialiased) discs and tinted copies of images, shared by
// the backdrop, the emerald icon and the touch controls.

import { Color } from '../../runtime/color';
import { context2d, makeCanvas, type Gfx, type Texture } from '../../runtime/gfx';

/** Shared palette. Outlines are dark navy, never pure black (art direction). */
export const PALETTE: Record<string, Color> = {
  o: Color.rgb8(24, 20, 48),
  b: Color.rgb8(44, 104, 236),
  B: Color.rgb8(28, 64, 170),
  y: Color.rgb8(255, 216, 56),
  Y: Color.rgb8(220, 156, 28),
  w: Color.rgb8(255, 255, 255),
  s: Color.rgb8(255, 255, 255),
  k: Color.rgb8(20, 18, 40),
  r: Color.rgb8(232, 44, 52),
  R: Color.rgb8(150, 22, 40),
  p: Color.rgb8(255, 160, 160),
  g: Color.rgb8(255, 214, 64),
  G: Color.rgb8(214, 140, 24),
  h: Color.rgb8(255, 244, 170),
  c: Color.rgb8(110, 214, 255),
  C: Color.rgb8(40, 140, 220),
};

/** Sproto's head for the lives counter: soft tufts, blue/yellow split face, big round eyes, red clown nose, wide grin. */
export const SPROTO_HEAD: readonly string[] = [
  '.....oo..oo.....',
  '....obbooyyo....',
  '...obbbbyyyyo...',
  '..obwwbbyywwyo..',
  '.obwwwwbywwwwyo.',
  'obbwskwbywskwyyo',
  'obbwkkwbywkkwyyo',
  'obbbwwbbyywwyyyo',
  'obbbbbrrrryyyyyo',
  'oBbbbrprrrryyyYo',
  'oBbbbbrrrryyyyYo',
  '.oBRbbbbyyyyRYo.',
  '.oBbRkkkkkkRyYo.',
  '..oBbRrrrrRyYo..',
  '...ooBBBYYYoo...',
  '.....oooooo.....',
];

/** A golden ticket: punched side notches, a star and a perforation line. */
export const TICKET: readonly string[] = [
  'ooooooooooooo',
  'ohhhhhhhhhhgo',
  '.oggsggg.ggo.',
  'ogsssssgggggo',
  'oggsssgg.ggGo',
  '.ogsgsgggggo.',
  'ogggggggGgGGo',
  'oGGGGGGGGGGGo',
  'ooooooooooooo',
];

/** HUD power-up: the shield bubble. */
export const SHIELD: readonly string[] = [
  '..ooooo..',
  '.oCcccCo.',
  'oCwwcccCo',
  'ocwccccco',
  'occccccco',
  'occccccCo',
  'oCccccCCo',
  '.oCCCCCo.',
  '..ooooo..',
];

/** HUD power-up: a speed shoe. */
export const SHOE: readonly string[] = [
  '.........',
  '.ooo.....',
  '.orro....',
  '.orrro...',
  '.orwwroo.',
  '.orrrrrro',
  'orrrrrrro',
  'owwwwwwwo',
  '.ooooooo.',
];

/** HUD power-up: the invincibility star. */
export const STAR: readonly string[] = [
  '....o....',
  '...oho...',
  '...oyo...',
  'oooyhyooo',
  'oyyyhyyyo',
  '.oyyyyyo.',
  '..oyYyo..',
  '.oyYoYyo.',
  '.ooo.ooo.',
];

const cache = new Map<string, HTMLCanvasElement | null>();

/** A cached canvas for a pixel map (null without a DOM). `key` names the cache entry. */
export function pixelTexture(key: string, rows: readonly string[], palette: Record<string, Color> = PALETTE): HTMLCanvasElement | null {
  if (cache.has(key)) return cache.get(key)!;
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const canvas = makeCanvas(w, h);
  if (canvas) {
    const ctx = context2d(canvas);
    for (let y = 0; y < h; y++) {
      const row = rows[y]!;
      for (let x = 0; x < Math.min(w, row.length); x++) {
        const c = palette[row[x]!];
        if (!c) continue;
        ctx.fillStyle = c.css();
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  cache.set(key, canvas);
  return canvas;
}

/** Draws a pixel map with its top-left at (x, y): the cached canvas, or pixel by pixel without one. */
export function drawPixels(g: Gfx, key: string, rows: readonly string[], x: number, y: number, palette: Record<string, Color> = PALETTE): void {
  const tex = pixelTexture(key, rows, palette);
  if (tex) {
    g.ctx.drawImage(tex, Math.round(x), Math.round(y));
    return;
  }
  for (let py = 0; py < rows.length; py++) {
    const row = rows[py]!;
    for (let px = 0; px < row.length; px++) {
      const c = palette[row[px]!];
      if (c) g.rect(Math.round(x) + px, Math.round(y) + py, 1, 1, c);
    }
  }
}

export const PixelArt = {
  sprotoHead: (g: Gfx, x: number, y: number) => drawPixels(g, 'sproto_head', SPROTO_HEAD, x, y),
  ticket: (g: Gfx, x: number, y: number) => drawPixels(g, 'ticket', TICKET, x, y),
  shield: (g: Gfx, x: number, y: number) => drawPixels(g, 'shield', SHIELD, x, y),
  shoe: (g: Gfx, x: number, y: number) => drawPixels(g, 'shoe', SHOE, x, y),
  star: (g: Gfx, x: number, y: number) => drawPixels(g, 'star', STAR, x, y),
};

/** A filled disc in whole-pixel rows (like draw_circle without antialiasing). */
export function pixelDisc(g: Gfx, cx: number, cy: number, radius: number, color: Color): void {
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const r = Math.max(0, radius);
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const span = r * r - dy * dy;
    if (span < 0) continue;
    const half = Math.floor(Math.sqrt(span));
    g.rect(x0 - half, y0 + dy, half * 2 + 1, 1, color);
  }
}

const tinted = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();

/** A copy of `tex` multiplied by `color` (cached per colour); the original when no canvas can be made. */
export function tintedTexture(tex: Texture, color: Color): Texture {
  let byColor = tinted.get(tex);
  if (!byColor) {
    byColor = new Map();
    tinted.set(tex, byColor);
  }
  const key = color.withAlpha(1).css();
  let out = byColor.get(key);
  if (out === undefined) {
    out = makeCanvas(tex.width, tex.height);
    if (out) {
      const ctx = context2d(out);
      ctx.drawImage(tex as CanvasImageSource, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(tex as CanvasImageSource, 0, 0);
    }
    byColor.set(key, out);
  }
  return out ?? tex;
}
