import { Vec2 } from './vec2';

/** 2D affine transform: x axis (a, b), y axis (c, d), origin (tx, ty). */
export class Transform2D {
  constructor(
    readonly a = 1,
    readonly b = 0,
    readonly c = 0,
    readonly d = 1,
    readonly tx = 0,
    readonly ty = 0,
  ) {}

  static readonly IDENTITY = new Transform2D();

  static from(position: Vec2, rotation: number, scale: Vec2): Transform2D {
    if (rotation === 0) {
      return new Transform2D(scale.x, 0, 0, scale.y, position.x, position.y);
    }
    const cs = Math.cos(rotation);
    const sn = Math.sin(rotation);
    return new Transform2D(cs * scale.x, sn * scale.x, -sn * scale.y, cs * scale.y, position.x, position.y);
  }

  get origin(): Vec2 {
    return new Vec2(this.tx, this.ty);
  }

  /** this * o (apply o first, then this). */
  mul(o: Transform2D): Transform2D {
    return new Transform2D(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.tx + this.c * o.ty + this.tx,
      this.b * o.tx + this.d * o.ty + this.ty,
    );
  }

  xform(p: Vec2): Vec2 {
    return new Vec2(this.a * p.x + this.c * p.y + this.tx, this.b * p.x + this.d * p.y + this.ty);
  }

  xformX(x: number, y: number): number {
    return this.a * x + this.c * y + this.tx;
  }

  xformY(x: number, y: number): number {
    return this.b * x + this.d * y + this.ty;
  }

  basisXform(p: Vec2): Vec2 {
    return new Vec2(this.a * p.x + this.c * p.y, this.b * p.x + this.d * p.y);
  }

  affineInverse(): Transform2D {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return Transform2D.IDENTITY;
    const ia = this.d / det;
    const ib = -this.b / det;
    const ic = -this.c / det;
    const id = this.a / det;
    return new Transform2D(ia, ib, ic, id, -(ia * this.tx + ic * this.ty), -(ib * this.tx + id * this.ty));
  }

  isTranslationOnly(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1;
  }

  withOrigin(p: Vec2): Transform2D {
    return new Transform2D(this.a, this.b, this.c, this.d, p.x, p.y);
  }
}
