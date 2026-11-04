// A pure-math model of the community Physics Guide (the classic 16-bit
// trilogy; the second game's values where the games differ), written without
// reference to the player controller so the two can be compared frame by
// frame. Units are the Guide's: pixels per frame at 60 ticks a second. Every
// constant is written out here on purpose: a drifting value in the tuning
// file shows up as a comparison failure.
//
// Terrain is a list of surfaces: infinite lines at a Guide angle (0 = flat
// floor, positive = rising to the right) and circular arcs run on from the
// inside (loops, half-pipes). That covers the scenarios in reference.test.ts:
// running, rolling, jumping, landing bands, slipping, spin dash, hurt, death,
// rebounds, springs, and the speed kept through a loop or a half-pipe.
//
// Not modelled: walls and ceilings as obstacles, corners between two slopes,
// the sensor quirks on curves (the curve tests only compare exit speeds) and
// the valley rules.

import { Vec2 } from '../../src/runtime/vec2';

export const ACCELERATION = 0.046875;
export const DECELERATION = 0.5;
export const FRICTION = 0.046875;
export const TOP_SPEED = 6.0;
export const TURNAROUND = 0.5;
export const SKID_MIN = 4.0;
export const AIR_ACCELERATION = 0.09375;
export const GRAVITY = 0.21875;
export const JUMP_FORCE = 6.5;
export const JUMP_RELEASE = 4.0;
export const AIR_DRAG_MAX_UP = 4.0;
export const AIR_DRAG_MIN_X = 0.125;
export const AIR_ANGLE_EASE = 2.8125;
export const SLOPE_FACTOR = 0.125;
export const SLOPE_ROLL_UP = 0.078125;
export const SLOPE_ROLL_DOWN = 0.3125;
export const SLOPE_STAND_MIN = 0.05078125;
export const SLIP_SPEED = 2.5;
export const SLIP_ANGLE = 45.0;
export const FALL_ANGLE = 69.0;
export const CONTROL_LOCK = 30;
export const ROLL_FRICTION = 0.0234375;
export const ROLL_DECELERATION = 0.125;
export const ROLL_MIN = 1.03125;
export const UNROLL = 0.5;
export const SPINDASH_BASE = 8.0;
export const SPINDASH_PRESS = 2.0;
export const SPINDASH_MAX = 8.0;
export const HURT_X = 2.0;
export const HURT_Y = -4.0;
export const HURT_GRAVITY = 0.1875;
export const DEATH_Y = -7.0;
export const REBOUND_TRIM = 1.0;
export const SPRING_YELLOW = 10.0;
export const SPRING_RED = 16.0;
export const SPEED_CAP = 16.0;
export const WIDTH = 9.0;
export const HEIGHT = 19.0;
export const ROLL_WIDTH = 7.0;
export const ROLL_HEIGHT = 14.0;
export const PUSH = 10.0;
/** The floor-finding window while grounded: min(|speed| + 4, 14). */
export const SNAP_BASE = 4.0;
export const SNAP_MAX = 14.0;
/** Landing speed conversion bands (degrees from flat). */
export const LAND_FLAT_MAX = 23.0;
export const LAND_SLOPE_MAX = 45.0;

const FLOOR = 0;
const RIGHT_WALL = 1;
const CEILING = 2;
const LEFT_WALL = 3;

export type Surface =
  | { kind: 'line'; angle: number; point: Vec2 }
  | { kind: 'arc'; centre: Vec2; radius: number; fromAngle: number; toAngle: number; loop: boolean; lapped: boolean };

type SimHit = { distance: number; angle: number };

const deg = (a: number) => (a * Math.PI) / 180;
const fposmod = (a: number, b: number) => {
  const r = a % b;
  return r < 0 ? r + b : r;
};
const snapped = (a: number, step: number) => Math.floor(a / step + 0.5) * step;
const signf = (a: number) => (a > 0 ? 1 : a < 0 ? -1 : 0);
const moveToward = (from: number, to: number, d: number) => (Math.abs(to - from) <= d ? to : from + signf(to - from) * d);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export class ReferenceSim {
  /** Centre of the hitbox. */
  pos = Vec2.ZERO;
  gsp = 0;
  xsp = 0;
  ysp = 0;
  angle = 0;
  grounded = false;
  ball = false;
  jumped = false;
  airLocked = false;
  controlLock = 0;
  charge = 0;
  facing = 1;
  state = 'idle';
  /** Surfaces, see addLine() / addArc(). */
  surfaces: Surface[] = [];

  // Inputs for the current frame.
  left = false;
  right = false;
  down = false;
  jumpHeld = false;
  jumpPressed = false;

  constructor() {
    this.addLine(0, Vec2.ZERO);
  }

  /**
   * An infinite line at Guide angle `a` through `point`. The first surface
   * added is the flat floor through the origin; clear `surfaces` first for a
   * world without it.
   */
  addLine(a: number, point: Vec2): void {
    this.surfaces.push({ kind: 'line', angle: a, point });
  }

  /**
   * The inside of a circle, run on from `fromAngle` to `toAngle` (Guide
   * angles at the surface, counter-clockwise, 0 to 360 for a full loop). A
   * full loop works like the real one's path layers: its lower-right quarter
   * is solid on the way in and its lower-left quarter on the way out (the
   * switch happens while crossing the top), so a lap ends back on the floor.
   */
  addArc(centre: Vec2, radius: number, fromAngle = 0, toAngle = 360): void {
    this.surfaces.push({ kind: 'arc', centre, radius, fromAngle, toAngle, loop: fromAngle === 0 && toAngle === 360, lapped: false });
  }

  radii(): Vec2 {
    return this.ball ? new Vec2(ROLL_WIDTH, ROLL_HEIGHT) : new Vec2(WIDTH, HEIGHT);
  }

  static modeFor(a: number): number {
    a = fposmod(snapped(a, 0.001), 360);
    if (a <= 45 || a >= 315) return FLOOR;
    if (a < 135) return RIGHT_WALL;
    if (a <= 225) return CEILING;
    return LEFT_WALL;
  }

  static modeDown(mode: number): Vec2 {
    return [Vec2.DOWN, Vec2.RIGHT, Vec2.UP, Vec2.LEFT][mode]!;
  }

  static modeRight(mode: number): Vec2 {
    return [Vec2.RIGHT, Vec2.UP, Vec2.LEFT, Vec2.DOWN][mode]!;
  }

  static fromFlat(a: number): number {
    a = fposmod(a, 360);
    return Math.min(a, 360 - a);
  }

  static angleFromNormal(n: Vec2): number {
    const a = fposmod((Math.atan2(-n.x, -n.y) * 180) / Math.PI, 360);
    return a >= 359.9999 ? 0 : a;
  }

  /** Puts the player standing on surface `index` with the centre over `x`. */
  standAt(x: number, index = 0): void {
    this.ball = false;
    this.grounded = true;
    const s = this.surfaces[index]!;
    this.angle = s.kind === 'line' ? s.angle : 0;
    this.state = 'idle';
    this.pos = new Vec2(x, s.kind === 'line' ? s.point.y : 0);
    this.snap();
  }

  /** Puts the player in the air at `at` (centre) with the given speeds. */
  airborneAt(at: Vec2, vx: number, vy: number): void {
    this.grounded = false;
    this.pos = at;
    this.xsp = vx;
    this.ysp = vy;
    this.angle = 0;
    this.state = this.ball ? 'jump' : 'fall';
  }

  setInput(l: boolean, r: boolean, d: boolean, jHeld: boolean, jPressed: boolean): void {
    this.left = l;
    this.right = r;
    this.down = d;
    this.jumpHeld = jHeld;
    this.jumpPressed = jPressed;
  }

  dir(): number {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  // --- One frame ------------------------------------------------------------------

  step(): void {
    if (this.state === 'dead') {
      this.pos = this.pos.add(new Vec2(this.xsp, this.ysp));
      this.ysp = Math.min(this.ysp + GRAVITY, SPEED_CAP);
      return;
    }
    if (this.grounded) this.groundStep();
    else this.airStep();
  }

  private groundStep(): void {
    const d = this.controlLock === 0 ? this.dir() : 0;
    if (this.state === 'spindash') {
      this.spindashStep();
      return;
    }
    const crouching = !this.ball && this.gsp === 0 && this.down && d === 0;
    if (this.jumpPressed && crouching) {
      this.setBall(true);
      this.state = 'spindash';
      this.charge = 0;
      return;
    }
    this.slopeFactor();
    if (this.jumpPressed) {
      this.jump();
      return;
    }
    if (this.ball) this.rollInput(d);
    else this.runInput(d);
    if (!this.ball && this.down && d === 0 && Math.abs(this.gsp) >= ROLL_MIN) this.setBall(true);
    this.gsp = clamp(this.gsp, -SPEED_CAP, SPEED_CAP);
    const a = deg(this.angle);
    this.xsp = this.gsp * Math.cos(a);
    this.ysp = -this.gsp * Math.sin(a);
    this.pos = this.pos.add(new Vec2(this.xsp, this.ysp));
    if (!this.snap()) {
      this.grounded = false;
      this.state = this.ball ? 'roll' : 'fall';
      return;
    }
    this.slip();
    if (this.grounded) this.state = this.ball ? 'roll' : this.gsp === 0 ? 'idle' : 'run';
  }

  private spindashStep(): void {
    if (!this.down) {
      this.gsp = (SPINDASH_BASE + Math.floor(this.charge) / 2) * this.facing;
      this.charge = 0;
      this.state = 'roll';
      return;
    }
    this.charge -= Math.floor(this.charge / 0.125) / 256;
    if (this.jumpPressed) this.charge = Math.min(this.charge + SPINDASH_PRESS, SPINDASH_MAX);
  }

  private slopeFactor(): void {
    if (ReferenceSim.modeFor(this.angle) === CEILING) return;
    const s = Math.sin(deg(this.angle));
    let factor = SLOPE_FACTOR;
    if (this.ball) {
      const uphill = this.gsp !== 0 && signf(this.gsp) === signf(s);
      factor = uphill ? SLOPE_ROLL_UP : SLOPE_ROLL_DOWN;
    }
    const amount = factor * s;
    if (this.gsp === 0 && Math.abs(amount) < SLOPE_STAND_MIN) return;
    this.gsp -= amount;
  }

  private jump(): void {
    const a = deg(this.angle);
    this.xsp = this.gsp * Math.cos(a) - JUMP_FORCE * Math.sin(a);
    this.ysp = -this.gsp * Math.sin(a) - JUMP_FORCE * Math.cos(a);
    this.airLocked = this.ball;
    this.setBall(true);
    this.grounded = false;
    this.jumped = true;
    this.state = 'jump';
  }

  private runInput(d: number): void {
    if (d === 0) {
      this.gsp = moveToward(this.gsp, 0, FRICTION);
      return;
    }
    if (this.gsp * d < 0) {
      this.gsp += DECELERATION * d;
      if (this.gsp * d >= 0) {
        this.gsp = TURNAROUND * d;
        this.facing = d;
      }
    } else {
      if (this.gsp * d < TOP_SPEED) {
        this.gsp += ACCELERATION * d;
        if (this.gsp * d > TOP_SPEED) this.gsp = TOP_SPEED * d;
      }
      this.facing = d;
    }
  }

  private rollInput(d: number): void {
    if (d !== 0 && this.gsp * d < 0) {
      this.gsp += ROLL_DECELERATION * d;
      if (this.gsp * d >= 0) this.gsp = TURNAROUND * d;
    }
    this.gsp = moveToward(this.gsp, 0, ROLL_FRICTION);
    if (this.gsp !== 0) this.facing = signf(this.gsp);
    if (Math.abs(this.gsp) < UNROLL) this.setBall(false);
  }

  /** Keeps the feet in place when the hitbox changes. */
  private setBall(on: boolean): void {
    if (on === this.ball) return;
    const shift = HEIGHT - ROLL_HEIGHT;
    this.pos = this.pos.add(ReferenceSim.modeDown(ReferenceSim.modeFor(this.angle)).mul(on ? shift : -shift));
    this.ball = on;
  }

  private slip(): void {
    if (this.controlLock > 0) {
      this.controlLock -= 1;
      return;
    }
    const steep = ReferenceSim.fromFlat(this.angle);
    // Strictly past 45: a 1:1 hill is still held (the original checks the
    // angle past the floor quadrant, not at its edge).
    if (Math.abs(this.gsp) >= SLIP_SPEED || steep <= SLIP_ANGLE) return;
    this.controlLock = CONTROL_LOCK;
    if (steep > FALL_ANGLE) {
      this.grounded = false;
      this.state = 'fall';
    }
  }

  private airStep(): void {
    const d = this.state === 'hurt' ? 0 : this.dir();
    if (this.jumped && !this.jumpHeld && this.ysp < -JUMP_RELEASE) this.ysp = -JUMP_RELEASE;
    if (d !== 0) {
      if (!this.airLocked) {
        if (this.xsp * d < TOP_SPEED) {
          this.xsp += AIR_ACCELERATION * d;
          if (this.xsp * d > TOP_SPEED) this.xsp = TOP_SPEED * d;
        }
      }
      this.facing = d;
    }
    if (this.state !== 'hurt' && this.ysp < 0 && this.ysp > -AIR_DRAG_MAX_UP && Math.abs(this.xsp) >= AIR_DRAG_MIN_X) {
      this.xsp -= Math.trunc(this.xsp / 0.125) / 256;
    }
    this.pos = this.pos.add(new Vec2(this.xsp, this.ysp));
    this.ysp = Math.min(this.ysp + (this.state === 'hurt' ? HURT_GRAVITY : GRAVITY), SPEED_CAP);
    this.xsp = clamp(this.xsp, -SPEED_CAP, SPEED_CAP);
    if (this.angle !== 0) {
      if (this.angle < 180) this.angle = Math.max(this.angle - AIR_ANGLE_EASE, 0);
      else {
        this.angle += AIR_ANGLE_EASE;
        if (this.angle >= 360) this.angle = 0;
      }
    }
    if (this.ysp >= 0) this.tryLand();
  }

  /** Lands when a floor sensor (x +/- width, cast down from the centre) finds a surface at or above the feet. */
  private tryLand(): void {
    const r = this.radii();
    const hit = this.nearest(Vec2.RIGHT, Vec2.DOWN, r.x, r.y + 0.05);
    if (hit === null) return;
    const landAngle = hit.angle;
    const steep = ReferenceSim.fromFlat(landAngle);
    const downhill = -signf(Math.sin(deg(landAngle)));
    let speed = this.xsp;
    if (steep > LAND_FLAT_MAX && Math.abs(this.xsp) <= this.ysp) {
      speed = this.ysp * downhill * (steep <= LAND_SLOPE_MAX ? 0.5 : 1);
    }
    this.setBall(false);
    this.angle = landAngle;
    this.grounded = true;
    this.jumped = false;
    this.airLocked = false;
    this.gsp = this.state === 'hurt' ? 0 : speed;
    this.snap();
    this.state = this.gsp === 0 ? 'idle' : 'run';
  }

  /**
   * Snaps the centre so the nearer floor sensor rests on the ground (cast
   * along the mode's "down" from the centre +/- width along the mode's
   * "right") and takes the ground angle there. False when no surface is in
   * the snap window.
   */
  private snap(upReach = 0): boolean {
    const r = this.radii();
    const mode = ReferenceSim.modeFor(this.angle);
    const down = ReferenceSim.modeDown(mode);
    const tolerance = this.grounded ? Math.min(Math.abs(this.gsp) + SNAP_BASE, SNAP_MAX) : SNAP_MAX;
    const hit = this.nearest(ReferenceSim.modeRight(mode), down, r.x, upReach + r.y + tolerance, down.neg().mul(upReach));
    if (hit === null) return false;
    this.pos = this.pos.add(down.mul(hit.distance - upReach - r.y));
    this.angle = hit.angle;
    return true;
  }

  /**
   * The nearest hit of the two sensors (left first, like A before B) on any
   * surface within `reach`, or null. Crossing the top of a full loop switches
   * it to its "way out" quarter.
   */
  private nearest(right: Vec2, down: Vec2, halfWidth: number, reach: number, offset = Vec2.ZERO): SimHit | null {
    let best: SimHit | null = null;
    let bestSurface = -1;
    for (let i = 0; i < this.surfaces.length; i++) {
      for (const side of [-1, 1]) {
        const hit = this.cast(this.pos.add(offset).add(right.mul(side * halfWidth)), down, this.surfaces[i]!);
        if (hit === null || hit.distance > reach) continue;
        if (best === null || hit.distance < best.distance) {
          best = hit;
          bestSurface = i;
        }
      }
    }
    if (best !== null && bestSurface >= 0) {
      const s = this.surfaces[bestSurface]!;
      if (s.kind === 'arc' && s.loop && best.angle > 135 && best.angle < 225) s.lapped = true;
    }
    return best;
  }

  /** One ray against one surface, or null when it misses. */
  private cast(origin: Vec2, direction: Vec2, surface: Surface): SimHit | null {
    if (surface.kind === 'line') {
      const a = deg(surface.angle);
      const tangent = new Vec2(Math.cos(a), -Math.sin(a));
      const denom = direction.cross(tangent);
      if (Math.abs(denom) < 1e-9) return null;
      const t = surface.point.sub(origin).cross(tangent) / denom;
      return t >= 0 ? { distance: t, angle: surface.angle } : null;
    }
    // Inside a circle: the far intersection along the ray.
    const toCentre = surface.centre.sub(origin);
    const radius = surface.radius;
    const b = toCentre.dot(direction);
    const c = toCentre.lengthSquared() - radius * radius;
    const disc = b * b - c;
    if (disc < 0 || c > 0) return null;
    const t = b + Math.sqrt(disc);
    if (t < 0) return null;
    const hit = origin.add(direction.mul(t));
    const a = ReferenceSim.angleFromNormal(surface.centre.sub(hit).normalized());
    if (!ReferenceSim.inArc(a, surface.fromAngle, surface.toAngle)) return null;
    if (surface.loop && a < 90 && surface.lapped) return null; // the way-in quarter is the other path now
    if (surface.loop && a > 270 && !surface.lapped) return null; // the way-out quarter is the other path until the top
    return { distance: t, angle: a };
  }

  static inArc(a: number, fromAngle: number, toAngle: number): boolean {
    if (toAngle - fromAngle >= 360) return true;
    return a >= fromAngle - 0.001 && a <= toAngle + 0.001;
  }

  // --- Events ---------------------------------------------------------------------

  hurt(fromX: number): void {
    let away = signf(this.pos.x - fromX);
    if (away === 0) away = -this.facing;
    this.setBall(false);
    this.grounded = false;
    this.xsp = HURT_X * away;
    this.ysp = HURT_Y;
    this.jumped = false;
    this.airLocked = true;
    this.state = 'hurt';
  }

  die(): void {
    this.setBall(false);
    this.grounded = false;
    this.xsp = 0;
    this.ysp = DEATH_Y;
    this.state = 'dead';
  }

  /** Rebound off an enemy whose centre is at `enemyY`. */
  rebound(enemyY: number): void {
    if (this.grounded) return;
    if (this.pos.y > enemyY || this.ysp < 0) this.ysp -= signf(this.ysp) * REBOUND_TRIM;
    else this.ysp = -this.ysp;
  }

  spring(velocity: Vec2): void {
    this.setBall(false);
    this.grounded = false;
    this.xsp = clamp(velocity.x, -SPEED_CAP, SPEED_CAP);
    this.ysp = clamp(velocity.y, -SPEED_CAP, SPEED_CAP);
    this.jumped = false;
    this.airLocked = false;
    this.state = 'spring';
  }
}
