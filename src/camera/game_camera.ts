// The game camera, modelled on the classic games. Follows the first node in
// group `player` automatically.
//
// - Horizontal: a narrow deadzone around the screen centre; outside it the
//   camera catches up, capped per frame (20 px, above the 16 px/frame speed
//   cap). A look-ahead shifts the view in the direction of speed: from 2
//   px/frame up to 112 px at 9 px/frame and above, eased in and out. The
//   steady lead (camera centre minus Sproto) is the look-ahead less half the
//   deadzone: 56 px at top running speed (6), 104 px from 9, which leaves
//   0.74 s of warning at 6 px/frame and 0.44 s at 12 in the 424 px view.
// - Vertical: on the ground it follows with a cap that is low at walking
//   speed and high at high ground speed; in the air it holds still while
//   Sproto is inside a window around the focus.
// - A short hold after a spin dash release; look up / down after standing
//   still with up (or crouching) for a while.
// - Clamped to the level bounds (a level smaller than the screen is centred),
//   smoothly locked to arenas, autoscroll that pushes Sproto via
//   Player.clampRect, and a decaying shake.
// - Pixel-perfect: a whole-pixel offset from Sproto, so he never jitters.

import { FPS } from '../core/physics_constants';
import { Settings } from '../core/settings';
import { Tuning } from '../core/tuning';
import { Player } from '../player/player';
import { Input } from '../runtime/input';
import { clamp, moveToward, Rng, signf } from '../runtime/math';
import { Node2D } from '../runtime/node';
import { tree, VIEW_H, VIEW_W, type ViewProvider } from '../runtime/tree';
import { Rect2, Vec2 } from '../runtime/vec2';

const LOOK_GAP_FRAMES = 4;
const UNBOUNDED = new Rect2(-10000000, -10000000, 20000000, 20000000);
const VIEW = new Vec2(VIEW_W, VIEW_H);

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export class GameCamera extends Node2D implements ViewProvider {
  deadzoneWidth = 16;
  maxSpeedX = 20;
  lookAheadMax = 112;
  lookAheadStartSpeed = 2;
  lookAheadFullSpeed = 9;
  lookAheadSmoothTime = 0.3;
  lookAheadMaxRate = 4;
  verticalOffset = 16;
  groundFollowSlow = 6;
  groundFollowFast = 16;
  fastFollowGroundSpeed = 8;
  airWindow = 32;
  maxSpeedYAir = 16;
  spindashHoldFrames = 16;
  lookDelayFrames = 120;
  lookUpDistance = 104;
  lookDownDistance = 88;
  lookSpeed = 2;
  snapDistance = 256;

  focus = Vec2.ZERO;
  lookAhead = 0;
  lookShift = 0;
  holdFrames = 0;
  /** Shake offset this tick (whole pixels). */
  offset = Vec2.ZERO;

  private target: Node2D | null = null;
  private bounds = UNBOUNDED;
  private locked = false;
  private clampFrom = UNBOUNDED;
  private clampTo = UNBOUNDED;
  private clampT = 1;
  private clampDuration = 0;
  private autoscroll = Vec2.ZERO;
  private autoscrolling = false;
  private shakeStrength = 0;
  private shakeTime = 0;
  private shakeLeft = 0;
  private rng = new Rng(7);
  private lookAheadVelocity = 0;
  private lookDir = 0;
  private lookTimer = 0;
  private lookGap = 0;
  private lastFocus = Vec2.INF;
  private lastTarget = Vec2.INF;
  private prevCenter: Vec2 | null = null;
  private onStateChanged = (old: string, next: string) => {
    if (old === 'spindash' && next === 'roll' && this.target instanceof Player) {
      const extra = Math.abs(this.target.groundSpeed) - Tuning.physics.spindash_base_speed;
      this.holdFrames = Math.max(this.spindashHoldFrames - Math.trunc(extra), 0);
    }
  };

  constructor() {
    super('Camera');
    this.addToGroup('game_camera');
    // Runs after the player has moved this tick.
    this.processPriority = 100;
  }

  static current(): GameCamera | null {
    return tree.getFirstNodeInGroup<GameCamera>('game_camera');
  }

  override enterTree(): void {
    tree.camera = this;
  }

  override exitTree(): void {
    if (tree.camera === this) tree.camera = null;
  }

  // --- ViewProvider ---------------------------------------------------------------

  viewTopLeft(alpha: number): Vec2 {
    const cur = this.globalPosition;
    const prev = this.prevCenter ?? cur;
    const c = prev.distanceTo(cur) > 128 ? cur : prev.lerp(cur, alpha);
    return c.add(this.offset).sub(VIEW.div(2));
  }

  // --- Public API (docs/CONTRACTS.md) -------------------------------------------------

  setLevelBounds(rect: Rect2): void {
    this.bounds = rect.hasArea() ? rect : UNBOUNDED;
    if (!this.locked) this.setClamp(this.bounds, 0);
  }

  lockTo(rect: Rect2, transitionSeconds = 0.5): void {
    this.locked = true;
    this.setClamp(rect, transitionSeconds);
  }

  unlock(transitionSeconds = 0.5): void {
    this.locked = false;
    this.setClamp(this.bounds, transitionSeconds);
  }

  startAutoscroll(speedPxPerS: Vec2): void {
    this.autoscroll = speedPxPerS;
    this.autoscrolling = true;
  }

  stopAutoscroll(): void {
    this.autoscrolling = false;
    this.autoscroll = Vec2.ZERO;
    if (this.target instanceof Player) this.target.clampRect = new Rect2();
  }

  isAutoscrolling(): boolean {
    return this.autoscrolling;
  }

  shake(strengthPx: number, seconds: number): void {
    if (seconds <= 0 || strengthPx <= 0 || !Settings.data.screenShake) return;
    this.shakeStrength = Math.max(strengthPx, (this.shakeStrength * this.shakeLeft) / Math.max(this.shakeTime, 0.001));
    this.shakeTime = seconds;
    this.shakeLeft = seconds;
  }

  /** The area on screen (world space, before shake). */
  viewRect(): Rect2 {
    const c = this.globalPosition;
    return new Rect2(c.x - VIEW_W / 2, c.y - VIEW_H / 2, VIEW_W, VIEW_H);
  }

  // --- Update ---------------------------------------------------------------------

  // Runs after the player (processPriority 100) and updates in a deferred call
  // queued after his, so it also sees his end-of-tick moving-terrain pass
  // (Player.afterPhysicsStep). Input is read here, on the physics clock.
  override physicsProcess(delta: number): void {
    const upHeld = Input.isActionPressed('move_up');
    this.tree.callDeferred(() => {
      if (this.isInsideTree()) this.update(delta, upHeld);
    });
  }

  private update(delta: number, upHeld: boolean): void {
    this.prevCenter = this.globalPosition;
    const frames = delta * FPS;
    if (!this.target || this.target.isFreed() || !this.target.isInsideTree()) {
      this.target = tree.getFirstNodeInGroup<Node2D>('player');
      if (!this.target) return;
      if (this.target instanceof Player) this.target.stateChanged.connect(this.onStateChanged, { owner: this });
      this.snapToTarget();
    }
    this.advanceClamp(delta);
    const target = this.target.globalPosition;
    if (this.autoscrolling) this.focus = this.focus.add(this.autoscroll.mul(delta));
    else if (target.distanceTo(this.lastTarget) > this.snapDistance) this.snapToTarget();
    else if (!(this.target instanceof Player && this.target.state === 'dead')) this.follow(frames, upHeld);
    this.lastTarget = target;
    this.focus = this.clampCenter(this.focus, this.currentClamp());
    this.applyPosition();
    this.applyShake(delta);
    if (this.autoscrolling && this.target instanceof Player) this.target.clampRect = this.viewRect();
  }

  private follow(frames: number, upHeld: boolean): void {
    const target = this.target!.globalPosition;
    const player = this.target instanceof Player ? this.target : null;
    let speed = 0;
    if (player) speed = player.grounded ? player.groundSpeed : player.velocity.x;
    const span = Math.max(this.lookAheadFullSpeed - this.lookAheadStartSpeed, 0.001);
    const wanted = signf(speed) * this.lookAheadMax * clamp((Math.abs(speed) - this.lookAheadStartSpeed) / span, 0, 1);
    this.lookAhead = this.smoothDamp(this.lookAhead, wanted, this.lookAheadSmoothTime, this.lookAheadMaxRate * FPS, frames / FPS);
    let fx = this.focus.x;
    let fy = this.focus.y;
    if (this.holdFrames > 0) {
      this.holdFrames -= 1;
    } else {
      const tx = target.x + this.lookAhead;
      const half = this.deadzoneWidth / 2;
      let dx = 0;
      if (tx > fx + half) dx = tx - (fx + half);
      else if (tx < fx - half) dx = tx - (fx - half);
      fx += clamp(dx, -this.maxSpeedX * frames, this.maxSpeedX * frames);
    }
    this.updateLook(player, frames, upHeld);
    const ty = target.y + this.verticalOffset + this.lookShift;
    if (!player || player.grounded) {
      const fast = !!player && Math.abs(player.groundSpeed) >= this.fastFollowGroundSpeed;
      const cap = (fast ? this.groundFollowFast : this.groundFollowSlow) * frames;
      fy += clamp(ty - fy, -cap, cap);
    } else {
      let dy = 0;
      if (ty > fy + this.airWindow) dy = ty - (fy + this.airWindow);
      else if (ty < fy - this.airWindow) dy = ty - (fy - this.airWindow);
      fy += clamp(dy, -this.maxSpeedYAir * frames, this.maxSpeedYAir * frames);
    }
    this.focus = new Vec2(fx, fy);
  }

  private updateLook(player: Player | null, frames: number, upHeld: boolean): void {
    let dir = 0;
    if (player && player.grounded && player.state === 'idle' && player.groundSpeed === 0) {
      if (player.crouching) dir = 1;
      else if (upHeld) dir = -1;
    }
    if (dir !== 0 && dir === this.lookDir) {
      this.lookTimer += 1;
      this.lookGap = 0;
    } else if (dir === 0 && this.lookDir !== 0 && this.lookGap < LOOK_GAP_FRAMES) {
      this.lookGap += 1;
    } else {
      this.lookDir = dir;
      this.lookTimer = 0;
      this.lookGap = 0;
    }
    let wanted = 0;
    if (this.lookDir !== 0 && this.lookTimer >= this.lookDelayFrames) wanted = this.lookDir > 0 ? this.lookDownDistance : -this.lookUpDistance;
    this.lookShift = moveToward(this.lookShift, wanted, this.lookSpeed * frames);
  }

  /** Jumps straight to the target (first frame, respawns and other teleports). */
  snapToTarget(): void {
    if (!this.target) return;
    this.focus = this.target.globalPosition.add(new Vec2(0, this.verticalOffset));
    this.lookAhead = 0;
    this.lookAheadVelocity = 0;
    this.lookShift = 0;
    this.holdFrames = 0;
    this.lookTimer = 0;
    this.lastTarget = this.target.globalPosition;
    this.focus = this.clampCenter(this.focus, this.currentClamp());
    this.lastFocus = Vec2.INF;
    this.applyPosition();
    this.prevCenter = this.globalPosition;
    this.resetPhysicsInterpolation();
  }

  private applyPosition(): void {
    if (this.focus.isEqualApprox(this.lastFocus)) return;
    let snapped = this.focus.round();
    if (!this.autoscrolling && this.target) {
      const t = this.target.globalPosition;
      snapped = t.add(this.focus.sub(t).round());
    }
    const c = this.currentClamp();
    const half = VIEW.div(2);
    let x = snapped.x;
    let y = snapped.y;
    if (c.w > VIEW_W) x = clamp(x, Math.ceil(c.x + half.x), Math.floor(c.right - half.x));
    if (c.h > VIEW_H) y = clamp(y, Math.ceil(c.y + half.y), Math.floor(c.bottom - half.y));
    this.globalPosition = new Vec2(x, y);
    this.lastFocus = this.focus;
  }

  private applyShake(delta: number): void {
    if (this.shakeLeft <= 0) {
      this.offset = Vec2.ZERO;
      return;
    }
    const amount = (this.shakeStrength * this.shakeLeft) / this.shakeTime;
    this.offset = new Vec2(this.rng.randfRange(-1, 1), this.rng.randfRange(-1, 1)).mul(amount).round();
    this.shakeLeft -= delta;
    if (this.shakeLeft <= 0) {
      this.shakeLeft = 0;
      this.shakeStrength = 0;
      this.offset = Vec2.ZERO;
    }
  }

  // --- Clamping -----------------------------------------------------------------------

  private setClamp(rect: Rect2, transitionSeconds: number): void {
    this.clampFrom = transitionSeconds > 0 && this.isInsideTree() ? this.viewRect() : rect;
    this.clampTo = rect;
    this.clampDuration = transitionSeconds;
    this.clampT = transitionSeconds > 0 ? 0 : 1;
  }

  private advanceClamp(delta: number): void {
    if (this.clampT < 1) this.clampT = Math.min(this.clampT + delta / this.clampDuration, 1);
  }

  currentClamp(): Rect2 {
    if (this.clampT >= 1) return this.clampTo;
    const t = smoothstep(this.clampT);
    const start = this.clampFrom.position.lerp(this.clampTo.position, t);
    const end = this.clampFrom.end.lerp(this.clampTo.end, t);
    return new Rect2(start.x, start.y, end.x - start.x, end.y - start.y);
  }

  private clampCenter(center: Vec2, rect: Rect2): Vec2 {
    let x = center.x;
    let y = center.y;
    if (rect.w <= VIEW_W) x = rect.center.x;
    else x = clamp(x, rect.x + VIEW_W / 2, rect.right - VIEW_W / 2);
    if (rect.h <= VIEW_H) y = rect.center.y;
    else y = clamp(y, rect.y + VIEW_H / 2, rect.bottom - VIEW_H / 2);
    return new Vec2(x, y);
  }

  private smoothDamp(current: number, wanted: number, smoothTime: number, maxSpeed: number, dt: number): number {
    smoothTime = Math.max(smoothTime, 0.0001);
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = clamp(current - wanted, -maxSpeed * smoothTime, maxSpeed * smoothTime);
    const goal = current - change;
    const temp = (this.lookAheadVelocity + omega * change) * dt;
    this.lookAheadVelocity = (this.lookAheadVelocity - omega * temp) * decay;
    let result = goal + (change + temp) * decay;
    if (wanted - current > 0 === result > wanted) {
      result = wanted;
      this.lookAheadVelocity = 0;
    }
    return result;
  }
}
