// Bitmap fonts (BMFont text descriptors + PNG pages) for the Sproto Pixel
// typefaces in ui/font/src. Text is drawn glyph by glyph with drawImage, so it
// stays pixel-crisp. Tinted copies of a page are made once per colour.

import { Color } from './color';
import { loadImage } from './assets';
import { context2d, makeCanvas, type Gfx } from './gfx';
import { Vec2 } from './vec2';

import smallFnt from '../../ui/font/src/sproto_small.fnt?raw';
import smallOutlineFnt from '../../ui/font/src/sproto_small_outline.fnt?raw';
import boldFnt from '../../ui/font/src/sproto_bold.fnt?raw';
import boldGoldFnt from '../../ui/font/src/sproto_bold_gold.fnt?raw';
import smallPng from '../../ui/font/src/sproto_small.png?url';
import smallOutlinePng from '../../ui/font/src/sproto_small_outline.png?url';
import boldPng from '../../ui/font/src/sproto_bold.png?url';
import boldGoldPng from '../../ui/font/src/sproto_bold_gold.png?url';

interface Glyph {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  adv: number;
}

export type HAlign = 'left' | 'center' | 'right';

export class BitmapFont {
  readonly lineHeight: number;
  readonly base: number;
  private glyphs = new Map<number, Glyph>();
  private page: HTMLImageElement | null = null;
  private tinted = new Map<string, HTMLCanvasElement>();
  /** Fonts with colour baked in (gold, outlines) are not tinted. */
  readonly tintable: boolean;

  constructor(
    descriptor: string,
    private readonly url: string,
    tintable: boolean,
  ) {
    this.tintable = tintable;
    let lineHeight = 9;
    let base = 7;
    for (const line of descriptor.split(/\r?\n/)) {
      const kv = parseLine(line);
      if (line.startsWith('common ')) {
        lineHeight = Number(kv.lineHeight ?? 9);
        base = Number(kv.base ?? 7);
      } else if (line.startsWith('char ')) {
        const id = Number(kv.id);
        this.glyphs.set(id, {
          x: Number(kv.x),
          y: Number(kv.y),
          w: Number(kv.width),
          h: Number(kv.height),
          ox: Number(kv.xoffset),
          oy: Number(kv.yoffset),
          adv: Number(kv.xadvance),
        });
      }
    }
    this.lineHeight = lineHeight;
    this.base = base;
  }

  async load(): Promise<void> {
    this.page = await loadImage(this.url);
  }

  private glyph(code: number): Glyph | undefined {
    let g = this.glyphs.get(code);
    if (!g && code >= 97 && code <= 122) g = this.glyphs.get(code - 32);
    if (!g && code === 0xd7) g = this.glyphs.get(120) ?? this.glyphs.get(88);
    return g ?? this.glyphs.get(63);
  }

  /** Width of a single line in pixels. */
  measure(text: string): number {
    let w = 0;
    let max = 0;
    for (const ch of text) {
      if (ch === '\n') {
        max = Math.max(max, w);
        w = 0;
        continue;
      }
      w += this.glyph(ch.codePointAt(0)!)?.adv ?? 0;
    }
    return Math.max(max, w) - (text.length > 0 ? 1 : 0);
  }

  /** Wraps text to lines no wider than `width`. */
  wrap(text: string, width: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.measure(next) > width) {
          out.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      out.push(line);
    }
    return out;
  }

  private source(color: Color | null): CanvasImageSource | null {
    if (!this.page) return null;
    if (!color || !this.tintable || (color.r8 === 255 && color.g8 === 255 && color.b8 === 255)) return this.page;
    const key = color.withAlpha(1).css();
    let c = this.tinted.get(key);
    if (!c) {
      const canvas = makeCanvas(this.page.width, this.page.height);
      if (!canvas) return this.page;
      const ctx = context2d(canvas);
      ctx.drawImage(this.page, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.page, 0, 0);
      this.tinted.set(key, canvas);
      c = canvas;
    }
    return c;
  }

  /**
   * Draws text with its top-left at `pos` (or aligned within `width`).
   * Multi-line text steps by lineHeight.
   */
  draw(g: Gfx, text: string, pos: Vec2, color: Color | null = null, align: HAlign = 'left', width = 0): void {
    const src = this.source(color);
    if (!src) return;
    const ctx = g.ctx;
    const alpha = g.alpha * (color ? color.a : 1);
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    let y = Math.round(pos.y);
    for (const line of text.split('\n')) {
      let x = Math.round(pos.x);
      if (align !== 'left') {
        const w = this.measure(line);
        x += align === 'center' ? Math.floor((width - w) / 2) : width - w;
      }
      for (const ch of line) {
        const gl = this.glyph(ch.codePointAt(0)!);
        if (!gl) continue;
        if (gl.w > 0 && gl.h > 0) ctx.drawImage(src, gl.x, gl.y, gl.w, gl.h, x + gl.ox, y + gl.oy, gl.w, gl.h);
        x += gl.adv;
      }
      y += this.lineHeight;
    }
    ctx.globalAlpha = g.alpha;
  }
}

function parseLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=("[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  return out;
}

export const Fonts = {
  /** 5x7, 1 px strokes, white (menus). Tintable. */
  small: new BitmapFont(smallFnt, smallPng, true),
  /** The small glyphs with a baked dark outline (labels over gameplay). */
  smallOutline: new BitmapFont(smallOutlineFnt, smallOutlinePng, false),
  /** 7x7 bold with outline and soft shade. Tintable body. */
  bold: new BitmapFont(boldFnt, boldPng, true),
  /** Bold with a baked gold gradient (HUD labels). */
  boldGold: new BitmapFont(boldGoldFnt, boldGoldPng, false),
  async load(): Promise<void> {
    await Promise.all([this.small.load(), this.smallOutline.load(), this.bold.load(), this.boldGold.load()]);
  },
};
