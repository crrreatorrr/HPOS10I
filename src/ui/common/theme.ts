// The game theme (ui/theme/game_theme.tres) as drawing helpers: the label
// variations (fonts and colours), buttons and panels. Godot sizes text by
// integer multiples of the 8 px bitmap fonts; `scale` does the same here.
// Every helper draws nothing for text while the fonts are still loading (or
// in tests), and never throws.

import { Color } from '../../runtime/color';
import { BitmapFont, Fonts, type HAlign } from '../../runtime/font';
import type { Gfx } from '../../runtime/gfx';
import { CanvasLayer, Node2D } from '../../runtime/node';
import { Rect2, Vec2 } from '../../runtime/vec2';

export type TextStyle =
  /** Plain Label: small white font with a 1 px navy shadow. */
  | 'label'
  /** HudLabel: bold with the baked gold gradient. */
  | 'hudLabel'
  /** HudValue: bold, white (tintable). */
  | 'hudValue'
  /** HeaderLabel: bold in gold. */
  | 'header'
  /** OutlineLabel: small with a baked outline (over gameplay). */
  | 'outline'
  /** TitleLabel: bold gold at 2x. */
  | 'title';

export const COLORS = {
  gold: new Color(1, 0.86, 0.34),
  idle: new Color(0.62, 0.66, 0.82),
  soft: new Color(0.8, 0.86, 1),
  locked: new Color(0.5, 0.52, 0.62),
  shadow: new Color(0.09, 0.08, 0.19),
  warning: new Color(1, 0.24, 0.2),
  buttonText: new Color(0.86, 0.9, 1),
  buttonFocus: new Color(1, 0.88, 0.36),
  buttonPressed: new Color(1, 0.94, 0.6),
  buttonDisabled: new Color(0.5, 0.52, 0.62),
};

export function fontFor(style: TextStyle): BitmapFont {
  switch (style) {
    case 'hudLabel':
    case 'title':
      return Fonts.boldGold;
    case 'hudValue':
    case 'header':
      return Fonts.bold;
    case 'outline':
      return Fonts.smallOutline;
    default:
      return Fonts.small;
  }
}

export function defaultScale(style: TextStyle): number {
  return style === 'title' ? 2 : 1;
}

export interface TextOptions {
  align?: HAlign;
  /** Box width for centre/right alignment. */
  width?: number;
  color?: Color | null;
  /** Integer font scale (default 2 for 'title', else 1). */
  scale?: number;
  alpha?: number;
}

/** Width in pixels of `text` in a style. */
export function measure(text: string, style: TextStyle, scale = defaultScale(style)): number {
  return fontFor(style).measure(text) * scale;
}

/** Line height of a style (Label height in the Godot layouts). */
export function lineHeight(style: TextStyle, scale = defaultScale(style)): number {
  return fontFor(style).lineHeight * scale;
}

/** Draws text with its top-left at (x, y), or aligned within `width`. */
export function drawText(g: Gfx, text: string, x: number, y: number, style: TextStyle, opts: TextOptions = {}): void {
  if (text === '') return;
  const font = fontFor(style);
  const scale = opts.scale ?? defaultScale(style);
  const align = opts.align ?? 'left';
  const width = opts.width ?? 0;
  let color = opts.color ?? (style === 'header' ? COLORS.gold : null);
  if (color && opts.alpha !== undefined) color = color.withAlpha(color.a * opts.alpha);
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  const draw = () => {
    if (scale === 1) {
      if (style === 'label') font.draw(g, text, new Vec2(x + 1, y + 1), COLORS.shadow, align, width);
      font.draw(g, text, new Vec2(x, y), color, align, width);
      return;
    }
    // Integer scale around the text's own origin.
    g.setTransform(new Vec2(Math.round(x), Math.round(y)), 0, new Vec2(scale, scale));
    font.draw(g, text, Vec2.ZERO, color, align, width / scale);
    g.resetTransform();
  };
  if (alpha < 1 && !color) g.withAlpha(alpha, draw);
  else draw();
}

/** A text line centred on the screen width at y. */
export function drawCentered(g: Gfx, text: string, y: number, style: TextStyle, opts: TextOptions = {}): void {
  drawText(g, text, 0, y, style, { ...opts, align: 'center', width: opts.width ?? 424 });
}

export type ButtonState = 'normal' | 'focus' | 'pressed' | 'disabled';

const BUTTON_STYLES: Record<ButtonState, { bg: Color; border: Color; top: number; bottom: number }> = {
  normal: { bg: new Color(0.11, 0.14, 0.36, 0.92), border: new Color(0.36, 0.45, 0.82), top: 1, bottom: 2 },
  focus: { bg: new Color(0.16, 0.2, 0.48, 0.95), border: new Color(0.62, 0.72, 1), top: 1, bottom: 2 },
  pressed: { bg: new Color(0.5, 0.3, 0.06, 0.95), border: new Color(1, 0.84, 0.3), top: 2, bottom: 1 },
  disabled: { bg: new Color(0.1, 0.11, 0.2, 0.8), border: new Color(0.25, 0.27, 0.4), top: 1, bottom: 2 },
};
const FOCUS_RING = new Color(1, 0.84, 0.25);

function box(g: Gfx, r: Rect2, bg: Color, border: Color, top: number, bottom: number): void {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const w = Math.round(r.w);
  const h = Math.round(r.h);
  g.rect(x, y, w, h, bg);
  g.rect(x, y, w, top, border);
  g.rect(x, y + h - bottom, w, bottom, border);
  g.rect(x, y, 1, h, border);
  g.rect(x + w - 1, y, 1, h, border);
}

/** A theme Button: box, focus ring and its bold label centred. */
export function drawButton(g: Gfx, r: Rect2, label: string, state: ButtonState, align: HAlign = 'center'): void {
  const s = BUTTON_STYLES[state];
  box(g, r, s.bg, s.border, s.top, s.bottom);
  if (state === 'focus') {
    const f = r.grow(1);
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    const w = Math.round(f.w);
    const h = Math.round(f.h);
    g.rect(x, y, w, 1, FOCUS_RING);
    g.rect(x, y + h - 2, w, 2, FOCUS_RING);
    g.rect(x, y, 1, h, FOCUS_RING);
    g.rect(x + w - 1, y, 1, h, FOCUS_RING);
  }
  const color =
    state === 'disabled' ? COLORS.buttonDisabled : state === 'focus' ? COLORS.buttonFocus : state === 'pressed' ? COLORS.buttonPressed : COLORS.buttonText;
  const lh = Fonts.bold.lineHeight;
  const ty = Math.round(r.y + (r.h - lh) / 2) + (state === 'pressed' ? 1 : 0) + 1;
  const pad = 6;
  drawText(g, label, r.x + pad, ty, 'hudValue', { align, width: r.w - pad * 2, color });
}

/** The theme Panel: dark navy box with a pale 1 px border (content margins 8 x 6). */
export function drawPanel(g: Gfx, r: Rect2): void {
  box(g, r, new Color(0.06, 0.07, 0.2, 0.9), new Color(0.72, 0.8, 1), 1, 1);
}

export const PANEL_MARGIN_X = 8;
export const PANEL_MARGIN_Y = 6;

/** A Node2D whose drawing is a callback (screens draw their whole layout in one place). */
export class Painter extends Node2D {
  constructor(
    private readonly paintFn: (g: Gfx) => void,
    name = 'Painter',
  ) {
    super(name);
  }

  override draw(g: Gfx): void {
    this.paintFn(g);
  }
}

/** A screen-space layer with one Painter child that calls paint() (override it). */
export class UiLayer extends CanvasLayer {
  readonly painter: Painter;

  constructor(name: string, layer: number) {
    super(name);
    this.layer = layer;
    this.painter = this.addChild(new Painter((g) => this.paint(g)));
  }

  protected paint(_g: Gfx): void {}
}
