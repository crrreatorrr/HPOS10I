// Drawing API handed to Node2D.draw(): Canvas2D with the node's transform
// already applied, plus helpers shaped like the original draw_* calls.

import { Color } from './color';
import { Transform2D } from './transform';
import { Rect2, Vec2 } from './vec2';

export type Texture = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

export function texSize(t: Texture): Vec2 {
  return new Vec2(t.width, t.height);
}

export interface TextureOptions {
  /** Source rectangle in the texture (default: all of it). */
  region?: Rect2;
  flipH?: boolean;
  flipV?: boolean;
  /** Tint; only the alpha is applied unless the texture is pre-tinted. */
  modulate?: Color;
  /** Draw size (default: region size). */
  size?: Vec2;
  /** Centre the texture on pos instead of using pos as the top-left. */
  centered?: boolean;
}

export class Gfx {
  /** Combined modulate of the node being drawn (alpha used). */
  alpha = 1;
  private base: Transform2D = Transform2D.IDENTITY;
  private current: Transform2D = Transform2D.IDENTITY;

  constructor(readonly ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
  }

  /** @internal Sets the transform for the next node (view * node). */
  _begin(t: Transform2D, alpha: number): void {
    this.base = t;
    this.current = t;
    this.alpha = alpha;
    this.apply();
  }

  /** Extra local transform for the following calls (like draw_set_transform). */
  setTransform(position: Vec2, rotation = 0, scale: Vec2 = Vec2.ONE): void {
    this.current = this.base.mul(Transform2D.from(position, rotation, scale));
    this.apply();
  }

  resetTransform(): void {
    this.current = this.base;
    this.apply();
  }

  get transform(): Transform2D {
    return this.current;
  }

  private apply(): void {
    const t = this.current;
    this.ctx.setTransform(t.a, t.b, t.c, t.d, t.tx, t.ty);
    this.ctx.globalAlpha = this.alpha;
  }

  private fill(color: Color): void {
    this.ctx.fillStyle = color.css();
  }

  rect(x: number, y: number, w: number, h: number, color: Color, filled = true, width = 1): void {
    if (filled) {
      this.fill(color);
      this.ctx.fillRect(x, y, w, h);
    } else {
      this.ctx.strokeStyle = color.css();
      this.ctx.lineWidth = width;
      this.ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
    }
  }

  rectR(r: Rect2, color: Color, filled = true, width = 1): void {
    this.rect(r.x, r.y, r.w, r.h, color, filled, width);
  }

  polygon(points: readonly Vec2[], color: Color): void {
    if (points.length < 3) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.closePath();
    this.fill(color);
    ctx.fill();
  }

  /** Flat number list x0, y0, x1, y1, ... */
  polygonXY(xy: readonly number[], color: Color): void {
    if (xy.length < 6) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(xy[0]!, xy[1]!);
    for (let i = 2; i < xy.length; i += 2) ctx.lineTo(xy[i]!, xy[i + 1]!);
    ctx.closePath();
    this.fill(color);
    ctx.fill();
  }

  polyline(points: readonly Vec2[], color: Color, width = 1, closed = false): void {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    if (closed) ctx.closePath();
    ctx.strokeStyle = color.css();
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  line(a: Vec2, b: Vec2, color: Color, width = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color.css();
    ctx.lineWidth = width;
    ctx.stroke();
  }

  circle(center: Vec2, radius: number, color: Color, filled = true, width = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(radius, 0), 0, Math.PI * 2);
    if (filled) {
      this.fill(color);
      ctx.fill();
    } else {
      ctx.strokeStyle = color.css();
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  arc(center: Vec2, radius: number, start: number, end: number, color: Color, width = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(radius, 0), start, end);
    ctx.strokeStyle = color.css();
    ctx.lineWidth = width;
    ctx.stroke();
  }

  ellipse(center: Vec2, rx: number, ry: number, color: Color): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, Math.max(rx, 0), Math.max(ry, 0), 0, 0, Math.PI * 2);
    this.fill(color);
    ctx.fill();
  }

  texture(tex: Texture, pos: Vec2, opts: TextureOptions = {}): void {
    const region = opts.region ?? new Rect2(0, 0, tex.width, tex.height);
    const size = opts.size ?? region.size;
    let x = pos.x;
    let y = pos.y;
    if (opts.centered) {
      x -= size.x / 2;
      y -= size.y / 2;
    }
    const ctx = this.ctx;
    const a = opts.modulate ? this.alpha * opts.modulate.a : this.alpha;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    if (opts.flipH || opts.flipV) {
      ctx.save();
      ctx.translate(x + (opts.flipH ? size.x : 0), y + (opts.flipV ? size.y : 0));
      ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
      ctx.drawImage(tex as CanvasImageSource, region.x, region.y, region.w, region.h, 0, 0, size.x, size.y);
      ctx.restore();
    } else {
      ctx.drawImage(tex as CanvasImageSource, region.x, region.y, region.w, region.h, x, y, size.x, size.y);
    }
    ctx.globalAlpha = this.alpha;
  }

  /** Tiles a texture over a rectangle (local coordinates). */
  tiled(tex: Texture, rect: Rect2, offset: Vec2 = Vec2.ZERO): void {
    const ctx = this.ctx;
    const pattern = ctx.createPattern(tex as CanvasImageSource, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.fillStyle = pattern;
    ctx.fillRect(rect.x - offset.x, rect.y - offset.y, rect.w, rect.h);
    ctx.restore();
  }

  /** Runs fn with a clip rectangle. */
  clipped(rect: Rect2, fn: () => void): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    fn();
    ctx.restore();
    this.apply();
  }

  withAlpha(alpha: number, fn: () => void): void {
    const old = this.alpha;
    this.alpha = old * alpha;
    this.ctx.globalAlpha = this.alpha;
    fn();
    this.alpha = old;
    this.ctx.globalAlpha = old;
  }

  /** Additive drawing (glows, flashes). */
  additive(fn: () => void): void {
    const ctx = this.ctx;
    const old = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    fn();
    ctx.globalCompositeOperation = old;
  }
}

/** Creates an offscreen canvas (DOM or OffscreenCanvas; null in Node tests). */
export function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
