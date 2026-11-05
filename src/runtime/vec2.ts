// Immutable 2D vector with the GDScript Vector2 API the game code uses.
// y points down (screen space), like the original.

export class Vec2 {
  constructor(
    readonly x: number = 0,
    readonly y: number = 0,
  ) {}

  static readonly ZERO = new Vec2(0, 0);
  static readonly ONE = new Vec2(1, 1);
  static readonly LEFT = new Vec2(-1, 0);
  static readonly RIGHT = new Vec2(1, 0);
  static readonly UP = new Vec2(0, -1);
  static readonly DOWN = new Vec2(0, 1);
  static readonly INF = new Vec2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

  static fromAngle(rad: number): Vec2 {
    return new Vec2(Math.cos(rad), Math.sin(rad));
  }

  add(o: Vec2): Vec2 {
    return new Vec2(this.x + o.x, this.y + o.y);
  }

  sub(o: Vec2): Vec2 {
    return new Vec2(this.x - o.x, this.y - o.y);
  }

  mul(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  mulv(o: Vec2): Vec2 {
    return new Vec2(this.x * o.x, this.y * o.y);
  }

  div(s: number): Vec2 {
    return new Vec2(this.x / s, this.y / s);
  }

  neg(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }

  dot(o: Vec2): number {
    return this.x * o.x + this.y * o.y;
  }

  cross(o: Vec2): number {
    return this.x * o.y - this.y * o.x;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalized(): Vec2 {
    const l = this.length();
    return l === 0 ? Vec2.ZERO : new Vec2(this.x / l, this.y / l);
  }

  /** Rotated 90 degrees counter-clockwise on screen: (y, -x), like Godot. */
  orthogonal(): Vec2 {
    return new Vec2(this.y, -this.x);
  }

  rotated(rad: number): Vec2 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  angleTo(o: Vec2): number {
    return Math.atan2(this.cross(o), this.dot(o));
  }

  angleToPoint(o: Vec2): number {
    return Math.atan2(o.y - this.y, o.x - this.x);
  }

  distanceTo(o: Vec2): number {
    return Math.hypot(o.x - this.x, o.y - this.y);
  }

  distanceSquaredTo(o: Vec2): number {
    const dx = o.x - this.x;
    const dy = o.y - this.y;
    return dx * dx + dy * dy;
  }

  directionTo(o: Vec2): Vec2 {
    return o.sub(this).normalized();
  }

  lerp(o: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t);
  }

  moveToward(to: Vec2, delta: number): Vec2 {
    const d = to.sub(this);
    const len = d.length();
    return len <= delta || len === 0 ? to : this.add(d.mul(delta / len));
  }

  clamp(min: Vec2, max: Vec2): Vec2 {
    return new Vec2(Math.min(Math.max(this.x, min.x), max.x), Math.min(Math.max(this.y, min.y), max.y));
  }

  limitLength(len: number): Vec2 {
    const l = this.length();
    return l > len && l > 0 ? this.mul(len / l) : this;
  }

  abs(): Vec2 {
    return new Vec2(Math.abs(this.x), Math.abs(this.y));
  }

  floor(): Vec2 {
    return new Vec2(Math.floor(this.x), Math.floor(this.y));
  }

  round(): Vec2 {
    return new Vec2(Math.round(this.x), Math.round(this.y));
  }

  sign(): Vec2 {
    return new Vec2(Math.sign(this.x), Math.sign(this.y));
  }

  withX(x: number): Vec2 {
    return new Vec2(x, this.y);
  }

  withY(y: number): Vec2 {
    return new Vec2(this.x, y);
  }

  isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y);
  }

  isZero(): boolean {
    return this.x === 0 && this.y === 0;
  }

  equals(o: Vec2): boolean {
    return this.x === o.x && this.y === o.y;
  }

  isEqualApprox(o: Vec2, eps = 0.00001): boolean {
    return Math.abs(this.x - o.x) < eps && Math.abs(this.y - o.y) < eps;
  }

  toString(): string {
    return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }
}

export function v2(x: number, y: number): Vec2 {
  return new Vec2(x, y);
}

/** Axis-aligned rectangle (position = top-left), like Godot's Rect2. */
export class Rect2 {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly w = 0,
    readonly h = 0,
  ) {}

  static fromPoints(a: Vec2, b: Vec2): Rect2 {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return new Rect2(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  static centered(center: Vec2, size: Vec2): Rect2 {
    return new Rect2(center.x - size.x / 2, center.y - size.y / 2, size.x, size.y);
  }

  get position(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  get size(): Vec2 {
    return new Vec2(this.w, this.h);
  }

  get end(): Vec2 {
    return new Vec2(this.x + this.w, this.y + this.h);
  }

  get right(): number {
    return this.x + this.w;
  }

  get bottom(): number {
    return this.y + this.h;
  }

  get center(): Vec2 {
    return new Vec2(this.x + this.w / 2, this.y + this.h / 2);
  }

  hasArea(): boolean {
    return this.w > 0 && this.h > 0;
  }

  hasPoint(p: Vec2): boolean {
    return p.x >= this.x && p.y >= this.y && p.x < this.x + this.w && p.y < this.y + this.h;
  }

  intersects(o: Rect2, includeBorders = false): boolean {
    if (includeBorders) {
      return this.x <= o.x + o.w && o.x <= this.x + this.w && this.y <= o.y + o.h && o.y <= this.y + this.h;
    }
    return this.x < o.x + o.w && o.x < this.x + this.w && this.y < o.y + o.h && o.y < this.y + this.h;
  }

  encloses(o: Rect2): boolean {
    return o.x >= this.x && o.y >= this.y && o.x + o.w <= this.x + this.w && o.y + o.h <= this.y + this.h;
  }

  grow(by: number): Rect2 {
    return new Rect2(this.x - by, this.y - by, this.w + by * 2, this.h + by * 2);
  }

  growIndividual(left: number, top: number, right: number, bottom: number): Rect2 {
    return new Rect2(this.x - left, this.y - top, this.w + left + right, this.h + top + bottom);
  }

  merge(o: Rect2): Rect2 {
    const x = Math.min(this.x, o.x);
    const y = Math.min(this.y, o.y);
    return new Rect2(x, y, Math.max(this.right, o.right) - x, Math.max(this.bottom, o.bottom) - y);
  }

  expand(p: Vec2): Rect2 {
    const x = Math.min(this.x, p.x);
    const y = Math.min(this.y, p.y);
    return new Rect2(x, y, Math.max(this.right, p.x) - x, Math.max(this.bottom, p.y) - y);
  }

  translated(d: Vec2): Rect2 {
    return new Rect2(this.x + d.x, this.y + d.y, this.w, this.h);
  }

  intersection(o: Rect2): Rect2 {
    const x = Math.max(this.x, o.x);
    const y = Math.max(this.y, o.y);
    const r = Math.min(this.right, o.right);
    const b = Math.min(this.bottom, o.bottom);
    if (r <= x || b <= y) return new Rect2(x, y, 0, 0);
    return new Rect2(x, y, r - x, b - y);
  }
}
