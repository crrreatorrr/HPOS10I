// RGBA colour in 0..1 floats, with the GDScript Color helpers the game uses.

export class Color {
  private _css: string | null = null;

  constructor(
    readonly r: number,
    readonly g: number,
    readonly b: number,
    readonly a: number = 1,
  ) {}

  static readonly WHITE = new Color(1, 1, 1, 1);
  static readonly BLACK = new Color(0, 0, 0, 1);
  static readonly TRANSPARENT = new Color(0, 0, 0, 0);

  /** 0..255 channels, like Color8(). */
  static rgb8(r: number, g: number, b: number, a = 255): Color {
    return new Color(r / 255, g / 255, b / 255, a / 255);
  }

  /** "#rrggbb" or "#rrggbbaa" (or without '#'). */
  static hex(text: string): Color {
    const h = text.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return Color.rgb8(r, g, b, a);
  }

  /** Godot's Color.from_hsv (h, s, v in 0..1). */
  static hsv(h: number, s: number, v: number, a = 1): Color {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (((i % 6) + 6) % 6) {
      case 0:
        return new Color(v, t, p, a);
      case 1:
        return new Color(q, v, p, a);
      case 2:
        return new Color(p, v, t, a);
      case 3:
        return new Color(p, q, v, a);
      case 4:
        return new Color(t, p, v, a);
      default:
        return new Color(v, p, q, a);
    }
  }

  get r8(): number {
    return Math.round(clamp01(this.r) * 255);
  }

  get g8(): number {
    return Math.round(clamp01(this.g) * 255);
  }

  get b8(): number {
    return Math.round(clamp01(this.b) * 255);
  }

  get a8(): number {
    return Math.round(clamp01(this.a) * 255);
  }

  withAlpha(a: number): Color {
    return new Color(this.r, this.g, this.b, a);
  }

  /** Component-wise multiply (modulate). */
  mul(o: Color): Color {
    return new Color(this.r * o.r, this.g * o.g, this.b * o.b, this.a * o.a);
  }

  lerp(o: Color, t: number): Color {
    return new Color(
      this.r + (o.r - this.r) * t,
      this.g + (o.g - this.g) * t,
      this.b + (o.b - this.b) * t,
      this.a + (o.a - this.a) * t,
    );
  }

  darkened(amount: number): Color {
    return new Color(this.r * (1 - amount), this.g * (1 - amount), this.b * (1 - amount), this.a);
  }

  lightened(amount: number): Color {
    return new Color(
      this.r + (1 - this.r) * amount,
      this.g + (1 - this.g) * amount,
      this.b + (1 - this.b) * amount,
      this.a,
    );
  }

  inverted(): Color {
    return new Color(1 - this.r, 1 - this.g, 1 - this.b, this.a);
  }

  get luminance(): number {
    return 0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b;
  }

  equals(o: Color): boolean {
    return this.r8 === o.r8 && this.g8 === o.g8 && this.b8 === o.b8 && this.a8 === o.a8;
  }

  /** CSS colour string (cached). */
  css(): string {
    if (this._css === null) {
      this._css = `rgba(${this.r8},${this.g8},${this.b8},${clamp01(this.a).toFixed(4)})`;
    }
    return this._css;
  }

  toHex(): string {
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(this.r8)}${h(this.g8)}${h(this.b8)}${this.a8 === 255 ? '' : h(this.a8)}`;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function rgb8(r: number, g: number, b: number, a = 255): Color {
  return Color.rgb8(r, g, b, a);
}

export function rgba(r: number, g: number, b: number, a = 1): Color {
  return new Color(r, g, b, a);
}
