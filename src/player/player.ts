// Sproto. Classic momentum physics after the community Physics Guide, with a
// raycast sensor system (docs/PHYSICS.md is the audit of every rule).
//
// Units: the public API uses classic pixels per frame. Internally speeds are
// px/s and accelerations px/s^2, integrated with the fixed 60 Hz delta. Rules
// that are inherently per frame (air drag, spin dash decay, counters) run once
// per tick with the classic formulas. Constants are read from Tuning.physics
// every tick so live tuning works. The node position is the hitbox centre.

import { Audio } from '../core/audio';
import { GameState } from '../core/game_state';
import { Layers } from '../core/layers';
import { accel, FPS, speed, type PhysicsConstants } from '../core/physics_constants';
import { Tuning } from '../core/tuning';
import { RelicLoadout } from '../hub/relic_loadout';
import { Input } from '../runtime/input';
import { clamp, degToRad, fposmod, moveToward, signf, snappedf, wrapf } from '../runtime/math';
import { Node, Node2D } from '../runtime/node';
import { Area2D, rectShape, type CollisionObject2D } from '../runtime/physics';
import { Signal } from '../runtime/signal';
import { Rect2, Vec2 } from '../runtime/vec2';
import { Hit, isMovingTerrain, PlayerSensors, terrainMask } from './sensors';
import { TimeFocus } from './time_focus';
import { Moves } from './moves';

export const FLOOR = 0;
export const RIGHT_WALL = 1;
export const CEILING = 2;
export const LEFT_WALL = 3;
export type CollisionMode = 0 | 1 | 2 | 3;

export const PATH_A = 0;
export const PATH_B = 1;

export type PlayerState =
  | 'idle'
  | 'run'
  | 'skid'
  | 'jump'
  | 'roll'
  | 'spindash'
  | 'spring'
  | 'hurt'
  | 'dead'
  | 'dropdash'
  | 'peelout'
  | 'airdash';

const ATTACK_STATES: readonly PlayerState[] = ['jump', 'roll', 'spindash', 'dropdash', 'airdash'];

const JUMP_CLEARANCE = 6.0;
const FLAT_WALL_SENSOR_DROP = 8.0;
export const SNAP_BASE = 4.0;
export const SNAP_MAX = 14.0;
const TOP_ONLY_GRACE = 8.0;
const SUSPICIOUS_ANGLE_STEP = 45.0;
const VALLEY_REST_SPEED = 0.5;
const VALLEY_PROBE_REACH = 48.0;
const CONTACT_EPSILON = 0.05;
const WALKABLE_SLOPE_MAX = 45.5;
export const PUSH_LOCK_FRAMES = 16;
const LANDING_FLAT_MAX = 23.0;
const LANDING_SLOPE_MAX = 45.0;
const SLOPE_LANDING_FACTOR = 0.5;
const MIN_SUB_STEP = 2.0;
const SUB_STEP_MARGIN = 2.0;
export const HITBOX_HEIGHT_TRIM = 3.0;
const CRUSH_TOLERANCE = 1.0;
const MAX_CARRY = 64.0;
const FLOOR_LABELS = ['A', 'B', 'AB'];
const CEILING_LABELS = ['C', 'D', 'CD'];
const VALLEY_LABELS = ['A', 'B'];
const WALL_SIDES = [-1, 1];

/** Builds the player's scattered tickets (set by scattered_ticket.ts, avoids an import cycle). */
export const PlayerHooks: {
  scatter: ((parent: Node, origin: Vec2, count: number) => void) | null;
  makeVisuals: ((player: Player) => void) | null;
} = { scatter: null, makeVisuals: null };

export class Player extends Node2D {
  readonly stateChanged = new Signal<[PlayerState, PlayerState]>();
  readonly hurtTaken = new Signal();
  readonly died = new Signal();
  /** Fired when a hit was absorbed by a shield instead (item boxes). */
  readonly shieldLost = new Signal();

  /** Physics Guide degrees: 0 flat, counter-clockwise. */
  groundAngle = 0;
  grounded = false;
  collisionMode: CollisionMode = FLOOR;
  /** 1 right, -1 left. */
  facing = 1;
  /** Non-empty: kept inside (autoscroll). Crushed against a wall = kill(). */
  clampRect = new Rect2();
  collisionPath = PATH_A;
  /** Frames left with left/right ignored on the ground. */
  controlLock = 0;
  /** Down held while standing still (entry to the spin dash). */
  crouching = false;
  spindashCharge = 0;
  /** Pose override for the visuals (e.g. 'victory'). Cleared on state change. */
  pose = '';
  /** Looking up/down while standing (camera and visuals). */
  lookingUp = false;

  readonly hitbox: Area2D;
  readonly sensors = new PlayerSensors();
  /** Power-ups from item boxes (shield, speed shoes, invincibility). */
  readonly moves: Moves;

  /** @internal */ _gsp = 0;
  /** @internal */ _vel = Vector2Zero();
  private _state: PlayerState = 'idle';
  /** @internal */ _ball = false;
  /** @internal */ _jumped = false;
  /** @internal */ _airLocked = false;
  private _skidding = false;
  private _hitWall = false;
  private _wallBlocked = false;
  private _inValley = false;
  private _invincibleFrames = 0;
  private _deathFrames = 0;
  private _frozen = false;
  private _support: CollisionObject2D | null = null;
  private _supportOrigin = Vec2.ZERO;
  private _rideDown = 0;
  /** The moving-terrain pass (carry, push-out) is still due before the next own step. */
  private _contactPending = true;
  /** Crushed by the end-of-tick pass: the next tick is the kill tick (no death motion yet). */
  private _killedAfterStep = false;
  private readonly _afterStep = () => this.afterPhysicsStep();

  constructor() {
    super('Player');
    this.addToGroup('player');
    this.hitbox = new Area2D('Hitbox');
    this.hitbox.collisionLayer = Layers.PLAYER;
    this.hitbox.collisionMask = 0;
    this.hitbox.monitoring = false;
    this.hitbox.addShape(rectShape(new Vec2(18, 32)));
    this.hitbox.setMeta('player', this);
    this.addChild(this.hitbox);
    this.moves = new Moves(this);
    PlayerHooks.makeVisuals?.(this);
  }

  // --- Classic units ---------------------------------------------------------------

  /** Ground speed, px/frame. */
  get groundSpeed(): number {
    return this._gsp / FPS;
  }

  set groundSpeed(v: number) {
    this._gsp = speed(v);
  }

  /** x/y speed, px/frame. */
  get velocity(): Vec2 {
    return this._vel.div(FPS);
  }

  set velocity(v: Vec2) {
    this._vel = v.mul(FPS);
  }

  get state(): PlayerState {
    return this._state;
  }

  set state(v: PlayerState) {
    this.changeState(v);
  }

  /** Read through a method so TypeScript doesn't narrow it across calls that can kill. */
  isDead(): boolean {
    return this._state === 'dead';
  }

  get isBall(): boolean {
    return this._ball;
  }

  get frozen(): boolean {
    return this._frozen;
  }

  /** The player whose hitbox is `area`, or null. */
  static fromArea(area: Area2D | null): Player | null {
    if (!area) return null;
    const p = area.getMeta<Player | undefined>('player');
    return p instanceof Player && p.hitbox === area ? p : null;
  }

  /** Physics Guide ranges, boundaries inclusive. */
  static modeForAngle(angle: number): CollisionMode {
    const a = fposmod(snappedf(angle, 0.001), 360);
    if (a <= 45 || a >= 315) return FLOOR;
    if (a < 135) return RIGHT_WALL;
    if (a <= 225) return CEILING;
    return LEFT_WALL;
  }

  static modeDown(mode: number): Vec2 {
    switch (mode) {
      case RIGHT_WALL:
        return Vec2.RIGHT;
      case CEILING:
        return Vec2.UP;
      case LEFT_WALL:
        return Vec2.LEFT;
    }
    return Vec2.DOWN;
  }

  static modeRight(mode: number): Vec2 {
    switch (mode) {
      case RIGHT_WALL:
        return Vec2.UP;
      case CEILING:
        return Vec2.LEFT;
      case LEFT_WALL:
        return Vec2.DOWN;
    }
    return Vec2.RIGHT;
  }

  /** Degrees away from flat floor (0..180). */
  static angleFromFlat(angle: number): number {
    return Math.min(angle, 360 - angle);
  }

  override ready(): void {
    this.updateHitbox();
  }

  // --- Public API (docs/CONTRACTS.md) -------------------------------------------------

  isAttacking(): boolean {
    return ATTACK_STATES.includes(this._state) || this.moves.invincible();
  }

  isInvincible(): boolean {
    return this._invincibleFrames > 0 || this.moves.invincible();
  }

  canCollectTickets(): boolean {
    return this._state !== 'hurt' && this._state !== 'dead';
  }

  invincibleFramesLeft(): number {
    return this._invincibleFrames;
  }

  getRadii(): Vec2 {
    const p = Tuning.physics;
    return this._ball ? new Vec2(p.roll_width_radius, p.roll_height_radius) : new Vec2(p.width_radius, p.height_radius);
  }

  hurt(sourcePosition: Vec2): void {
    if (this._state === 'dead' || this._state === 'hurt' || this.isInvincible()) return;
    const p = Tuning.physics;
    const shielded = this.moves.absorbHit();
    let lost = 0;
    if (!shielded) {
      lost = GameState.loseTickets();
      if (lost <= 0) {
        this.kill();
        return;
      }
      PlayerHooks.scatter?.(this.parent ?? this, this.globalPosition, Math.min(lost, p.max_scattered_tickets));
    }
    let away = signf(this.globalPosition.x - sourcePosition.x);
    if (away === 0) away = -this.facing;
    this.leaveGround();
    this.setBall(false);
    this._vel = new Vec2(speed(p.hurt_x_speed) * away, speed(p.hurt_y_speed));
    this._jumped = false;
    this._airLocked = true;
    this._invincibleFrames = p.invincibility_frames;
    this.changeState('hurt');
    Audio.playSfx('hurt');
    if (shielded) this.shieldLost.emit();
    else Audio.playSfx('ticket_loss');
    this.hurtTaken.emit();
  }

  kill(): void {
    if (this._state === 'dead') return;
    TimeFocus.restore();
    this.moves.clearAll();
    this._frozen = false;
    this.leaveGround();
    this.setBall(false);
    this.groundAngle = 0;
    this._gsp = 0;
    this._vel = new Vec2(0, speed(Tuning.physics.death_y_speed));
    this._invincibleFrames = 0;
    this._deathFrames = 0;
    this.zIndex = 100;
    this.hitbox.monitorable = false;
    this.changeState('dead');
    Audio.playSfx('death');
  }

  /** Rebound after destroying an enemy or hitting a boss. reverseX also reverses horizontal speed. */
  bounceOff(targetY: number, reverseX = false): void {
    if (this._state === 'dead') return;
    if (this.grounded) {
      if (reverseX) this._gsp = -this._gsp;
      return;
    }
    if (this.globalPosition.y > targetY || this._vel.y < 0) {
      this._vel = this._vel.withY(this._vel.y - signf(this._vel.y) * speed(Tuning.physics.bounce_trim));
    } else {
      this._vel = this._vel.withY(-this._vel.y);
    }
    if (reverseX) this._vel = this._vel.withX(-this._vel.x);
    this.moves.onBounce();
  }

  /** Airborne launch (springs). Not attacking, no variable jump. */
  launch(velocityPf: Vec2): void {
    if (this._state === 'dead') return;
    this.leaveGround();
    this.setBall(false);
    this._vel = velocityPf.mul(FPS);
    this.capVelocity(Tuning.physics);
    if (velocityPf.x !== 0) this.facing = signf(velocityPf.x);
    this._jumped = false;
    this._airLocked = false;
    this.changeState('spring');
  }

  /** Horizontal springs and boosters. */
  pushGround(speedPf: number, lockFrames = PUSH_LOCK_FRAMES): void {
    if (this._state === 'dead') return;
    if (speedPf !== 0) this.facing = signf(speedPf);
    if (this.grounded) {
      this._gsp = speed(speedPf);
      this.crouching = false;
      if (this._state === 'spindash' || this._state === 'peelout') this.changeState(this._state === 'spindash' ? 'roll' : 'run');
      else if (!this._ball) this.changeState('run');
    } else {
      this._vel = this._vel.withX(speed(speedPf));
    }
    this.controlLock = lockFrames;
  }

  setControlLock(frames: number): void {
    this.controlLock = Math.max(frames, 0);
  }

  setCollisionPath(path: number): void {
    this.collisionPath = path === PATH_B ? PATH_B : PATH_A;
  }

  freeze(frozen: boolean): void {
    this._frozen = frozen;
    if (frozen) {
      this._gsp = 0;
      this._vel = Vec2.ZERO;
      this.crouching = false;
      this._skidding = false;
      if (this.grounded && this._state !== 'dead') {
        this.setBall(false);
        this.changeState('idle');
      }
    } else {
      this.pose = '';
    }
  }

  playPose(pose: string): void {
    this.pose = pose;
  }

  respawnAt(newPosition: Vec2): void {
    this.leaveGround();
    this.setBall(false);
    this.globalPosition = newPosition;
    this.resetPhysicsInterpolation();
    this.groundAngle = 0;
    this._gsp = 0;
    this._vel = Vec2.ZERO;
    this._jumped = false;
    this._airLocked = false;
    this._skidding = false;
    this.crouching = false;
    this.spindashCharge = 0;
    this.controlLock = 0;
    this._invincibleFrames = 0;
    this._deathFrames = 0;
    this._frozen = false;
    this.pose = '';
    this.zIndex = 0;
    this.collisionPath = PATH_A;
    this._rideDown = 0;
    this._contactPending = true;
    this._killedAfterStep = false;
    this.hitbox.monitorable = true;
    this.moves.clearAll();
    this.changeState('idle');
    this.updateHitbox();
  }

  // --- Main loop -------------------------------------------------------------------
  // Each tick: carry with moving terrain and get pushed out of it, then the own
  // step (the Godot order). Godot drew a moving body where the physics server
  // had it, one tick behind its script; this runtime draws it where its script
  // put it this tick. So the moving-terrain pass for the next tick runs at the
  // end of this one, after the world step (a deferred call): the same sequence
  // of operations against the same geometry, and he is drawn on the platform
  // where it is drawn. When that pass didn't run (first tick, respawn, a tick
  // he skipped) it runs at the start of the tick instead.

  override physicsProcess(delta: number): void {
    if (this._frozen) return;
    if (this._state !== 'dead' && Input.isActionJustPressed('focus')) TimeFocus.tryStart();
    const p = Tuning.physics;
    this.sensors.beginFrame(this.tree.physics);
    if (this._invincibleFrames > 0) this._invincibleFrames -= 1;
    if (this._state === 'dead') {
      // Crushed by the end-of-tick pass: this is the tick Godot killed him in.
      if (this._killedAfterStep) this._killedAfterStep = false;
      else this.deadStep(p, delta);
      return;
    }
    this.moves.tick();
    if (this._contactPending) {
      this.movingTerrainPass(p);
      if (this.isDead()) return;
    }
    if (this.grounded) this.groundStep(p, delta);
    else this.airStep(p, delta);
    this.applyClampRect(p);
    this.updateHitbox();
    this._contactPending = true;
    this.tree.callDeferred(this._afterStep);
  }

  /** Carry by moving terrain, then get pushed out of it (or crushed). */
  private movingTerrainPass(p: PhysicsConstants): void {
    this._contactPending = false;
    this.carry(p);
    if (!this.isDead()) this.resolveMovingTerrain(p);
  }

  /** End of the tick, after the world step: the next tick's moving-terrain pass. */
  private afterPhysicsStep(): void {
    if (!this._contactPending || this._frozen || this.isDead() || !this.isInsideTree()) return;
    this.movingTerrainPass(Tuning.physics);
    if (this.isDead()) this._killedAfterStep = true;
  }

  private inputDir(): number {
    return (Input.isActionPressed('move_right') ? 1 : 0) - (Input.isActionPressed('move_left') ? 1 : 0);
  }

  // --- Ground ----------------------------------------------------------------------

  private groundStep(p: PhysicsConstants, dt: number): void {
    this._wallBlocked = this._hitWall;
    this._hitWall = false;
    const dir = this.controlLock === 0 ? this.inputDir() : 0;
    const downHeld = Input.isActionPressed('move_down');
    const upHeld = Input.isActionPressed('move_up');
    const jumpPressed = Input.isActionJustPressed('jump');

    // 1. Spin dash, charge run and crouch. Charging and the release frame skip
    //    the rest of the step (no slope factor, friction or movement).
    if (this._state === 'spindash') {
      this.spindashStep(p, downHeld, jumpPressed);
      this.stickToGround();
      return;
    }
    if (this._state === 'peelout') {
      if (this.moves.peelOutStep(upHeld, jumpPressed)) {
        this.stickToGround();
        return;
      }
    }
    if (jumpPressed && (this.crouching || (this.isForceRolling(p) && downHeld))) {
      this.crouching = false;
      this.spindashCharge = 0;
      this.setBall(true);
      this.changeState('spindash');
      Audio.playSfx('spindash_charge');
      this.stickToGround();
      return;
    }
    if (jumpPressed && this.lookingUp && this.moves.canPeelOut()) {
      this.moves.startPeelOut();
      this.stickToGround();
      return;
    }

    // 2. Slope factor.
    this.applySlopeFactor(p, dt);

    // 3. Jump (no movement on the jump frame).
    if (jumpPressed && this.hasJumpClearance()) {
      this.jump(p);
      return;
    }

    // 4. Input, acceleration and friction.
    if (this._ball) this.rollInput(p, dt, dir);
    else this.runInput(p, dt, dir);

    // 5. Start a roll, or crouch / look up.
    if (!this._ball && downHeld && dir === 0 && Math.abs(this._gsp) >= speed(p.roll_min_speed)) {
      this.setBall(true);
      Audio.playSfx('roll');
    }
    this.crouching = !this._ball && downHeld && dir === 0 && this._gsp === 0;
    this.lookingUp = !this._ball && upHeld && !downHeld && dir === 0 && this._gsp === 0;

    const cap = speed(p.speed_cap);
    this._gsp = clamp(this._gsp, -cap, cap);

    // 6-8. Move, wall sensors E/F, floor sensors A/B.
    this.moveOnGround(p, dt);
    if (!this.grounded) {
      if (this._state === 'skid') this.changeState('run');
      return;
    }

    // 9. Slipping on steep slopes.
    this.checkSlip(p);
    if (this.grounded) this.updateGroundState();
  }

  private spindashStep(p: PhysicsConstants, downHeld: boolean, jumpPressed: boolean): void {
    if (!downHeld) {
      this._gsp = speed(p.spindash_base_speed + Math.floor(this.spindashCharge) / 2) * this.facing;
      this.spindashCharge = 0;
      this.changeState('roll');
      Audio.playSfx('spindash_release');
      return;
    }
    // Classic per-frame decay first, then a press adds charge.
    this.spindashCharge -= Math.floor(this.spindashCharge / 0.125) / 256;
    if (jumpPressed) {
      this.spindashCharge = Math.min(this.spindashCharge + this.spindashChargePerPress(p), p.spindash_max_charge);
      Audio.playSfx('spindash_charge');
    }
  }

  private applySlopeFactor(p: PhysicsConstants, dt: number): void {
    // The classic games skip the slope factor on ceilings.
    if (this.collisionMode === CEILING) return;
    const s = Math.sin(degToRad(this.groundAngle));
    let factor = p.slope_factor_normal;
    if (this._ball) {
      const uphill = this._gsp !== 0 && signf(this._gsp) === signf(s);
      factor = uphill ? p.slope_factor_roll_up : p.slope_factor_roll_down;
    }
    const amount = factor * s;
    if (this._gsp === 0 && Math.abs(amount) < p.slope_stand_min) return;
    this._gsp -= accel(amount) * dt;
  }

  /** @internal */
  hasJumpClearance(): boolean {
    const r = this.getRadii();
    const up = Player.modeDown(this.collisionMode).neg();
    const hit = this.sensors.castPair(
      CEILING_LABELS,
      this.globalPosition,
      Player.modeRight(this.collisionMode),
      up,
      r.x,
      r.y + JUMP_CLEARANCE,
      this.terrainMask(false),
    );
    return hit === null;
  }

  private isForceRolling(p: PhysicsConstants): boolean {
    return this._ball && this._state === 'roll' && Math.abs(this._gsp) <= speed(p.unroll_speed) + 0.001 && !this.hasStandingHeadroom(p);
  }

  private hasStandingHeadroom(p: PhysicsConstants): boolean {
    const reach = p.height_radius * 2 - p.roll_height_radius;
    const hit = this.sensors.castPair(
      CEILING_LABELS,
      this.globalPosition,
      Player.modeRight(this.collisionMode),
      Player.modeDown(this.collisionMode).neg(),
      p.width_radius,
      reach,
      this.terrainMask(false),
    );
    return hit === null;
  }

  private jump(p: PhysicsConstants): void {
    const a = degToRad(this.groundAngle);
    const force = speed(p.jump_force);
    let vx = this._gsp * Math.cos(a);
    let vy = -this._gsp * Math.sin(a);
    vx -= force * Math.sin(a);
    vy -= force * Math.cos(a);
    this._vel = new Vec2(vx, vy);
    this._airLocked = this._ball; // jumping out of a roll locks air control
    this.setBall(true);
    this.leaveGround();
    this._jumped = true;
    this.crouching = false;
    this.changeState('jump');
    this.moves.onJump();
    Audio.playSfx('jump');
  }

  /** Ground and air top speed (Nobu's 1.05 unranked; speed shoes double it). */
  topSpeed(p: PhysicsConstants): number {
    return speed(p.top_speed) * RelicLoadout.resolve().speed_mult * this.moves.topSpeedMult();
  }

  private accelMult(): number {
    return this.moves.accelMult();
  }

  private spindashChargePerPress(p: PhysicsConstants): number {
    const relic = RelicLoadout.resolve().spindash_charge;
    return relic > 0 ? relic : p.spindash_charge_per_press;
  }

  private runInput(p: PhysicsConstants, dt: number, dir: number): void {
    const acc = accel(p.acceleration) * this.accelMult() * dt;
    const dec = accel(p.deceleration) * dt;
    const top = this.topSpeed(p);
    this._skidding = false;
    if (dir === 0) {
      this._gsp = moveToward(this._gsp, 0, accel(p.friction) * this.accelMult() * dt);
      return;
    }
    if (this._gsp * dir < 0) {
      // Pressing against the motion: decelerate, turning around at 0.5.
      if (Math.abs(this._gsp) >= speed(p.skid_min_speed) && this.collisionMode === FLOOR) this._skidding = true;
      else if (this._state === 'skid') this._skidding = true;
      this._gsp += dec * dir;
      if (this._gsp * dir >= 0) {
        this._gsp = speed(p.turnaround_speed) * dir;
        this._skidding = false;
        this.facing = dir;
      }
    } else {
      // Accelerating: up to top speed, never reducing a higher speed.
      if (this._gsp * dir < top) {
        this._gsp += acc * dir;
        if (this._gsp * dir > top) this._gsp = top * dir;
      }
      this.facing = dir;
    }
  }

  private rollInput(p: PhysicsConstants, dt: number, dir: number): void {
    this._skidding = false;
    if (dir !== 0 && this._gsp * dir < 0) {
      this._gsp += accel(p.roll_deceleration) * dt * dir;
      if (this._gsp * dir >= 0) this._gsp = speed(p.turnaround_speed) * dir;
    }
    this._gsp = moveToward(this._gsp, 0, accel(p.roll_friction) * dt);
    if (this._gsp !== 0) this.facing = signf(this._gsp);
    if (Math.abs(this._gsp) < speed(p.unroll_speed)) {
      if (this.hasStandingHeadroom(p)) {
        this.setBall(false);
      } else {
        // Too low to stand up: keep rolling out (the classic force-roll). The
        // creep goes the held way, and turns back off a wall.
        if (dir !== 0) this.facing = dir;
        else if (this._wallBlocked) this.facing = -this.facing;
        this._gsp = speed(p.unroll_speed) * this.facing;
      }
    }
  }

  /** Moves along the ground in sub-steps no longer than the smallest sensor reach. */
  private moveOnGround(p: PhysicsConstants, dt: number): void {
    const steps = Math.max(1, Math.ceil((Math.abs(this._gsp) * dt) / this.maxStep(p)));
    for (let i = 0; i < steps; i++) {
      const a = degToRad(this.groundAngle);
      this._vel = new Vec2(Math.cos(a), -Math.sin(a)).mul(this._gsp);
      this.globalPosition = this.globalPosition.add(this._vel.mul(dt / steps));
      if (this._gsp !== 0) this.groundWallCheck(p);
      if (!this.groundFloorCheck()) {
        this.leaveGround();
        const remaining = steps - i - 1;
        if (remaining > 0) this.moveInAir(p, this._vel.mul((dt * remaining) / steps));
        return;
      }
    }
    const fa = degToRad(this.groundAngle);
    this._vel = new Vec2(Math.cos(fa), -Math.sin(fa)).mul(this._gsp);
  }

  private groundWallCheck(p: PhysicsConstants): void {
    if (this.groundAngle > 90 && this.groundAngle < 270) return;
    if (this._inValley) return;
    const side = signf(this._gsp);
    const dir = Player.modeRight(this.collisionMode).mul(side);
    const label = side > 0 ? 'F' : 'E';
    const mask = this.terrainMask(false);
    let origin = this.globalPosition;
    const flat = this.collisionMode === FLOOR && Player.angleFromFlat(this.groundAngle) < 1;
    if (flat) origin = origin.add(new Vec2(0, FLAT_WALL_SENSOR_DROP));
    let hit = this.sensors.cast(label, origin, dir, p.push_radius, mask);
    if (flat && !this._ball) {
      // A ceiling lower than the head on flat ground blocks like a wall. Roll to get in.
      const head = this.globalPosition.add(new Vec2(0, 1 - p.height_radius));
      const top = this.sensors.cast(label, head, dir, p.push_radius, mask);
      if (top !== null && (hit === null || top.distance < hit.distance)) hit = top;
    }
    if (hit === null) return;
    if (this.collisionMode === FLOOR && Player.angleFromFlat(hit.angle) <= WALKABLE_SLOPE_MAX) return;
    if (dir.y > 0.5 && this.isOppositeSteepSlope(hit.angle) && this.steepValleyBelow()) {
      this.collisionMode = FLOOR;
      return;
    }
    this.globalPosition = this.globalPosition.sub(dir.mul(p.push_radius - hit.distance));
    this._gsp = 0;
    this._vel = Vec2.ZERO;
    this._hitWall = true;
  }

  /** Floor sensors A/B: snap to the nearer hit or report that the ground is gone. */
  private groundFloorCheck(tolerance = -1): boolean {
    const r = this.getRadii();
    if ((this.collisionMode === RIGHT_WALL || this.collisionMode === LEFT_WALL) && Player.angleFromFlat(this.groundAngle) < 90 && this.steepValleyBelow()) {
      this.collisionMode = FLOOR;
      tolerance = Math.max(tolerance, VALLEY_PROBE_REACH);
    }
    const down = Player.modeDown(this.collisionMode);
    const hit = this.sensors.castPair(
      FLOOR_LABELS,
      this.globalPosition,
      Player.modeRight(this.collisionMode),
      down,
      r.x,
      r.y + SNAP_MAX,
      this.terrainMask(this.collisionMode === FLOOR),
    );
    if (hit === null) return false;
    const pair = this.sensors.lastPair;
    const atRest = Math.abs(this._gsp) <= speed(VALLEY_REST_SPEED);
    const valley = this.collisionMode === FLOOR && pair[0] !== null && pair[1] !== null && Player.isValley(pair[0].angle, pair[1].angle, !atRest);
    const gap = hit.distance - r.y;
    if (!valley && this.grounded && Math.abs(wrapf(hit.angle - this.groundAngle, -180, 180)) > SUSPICIOUS_ANGLE_STEP) {
      hit.angle = this.sensors.surfaceAngle(hit);
    }
    if (tolerance < 0) {
      const along = Math.abs(this.collisionMode === FLOOR || this.collisionMode === CEILING ? this._vel.x : this._vel.y);
      tolerance = Math.min(along / FPS + SNAP_BASE, SNAP_MAX);
    }
    if (gap > tolerance) return false;
    this.setSupport(hit.collider);
    this.globalPosition = this.globalPosition.add(down.mul(gap));
    if (valley && atRest) {
      const rest = this.valleyRestPosition(pair[0]!, pair[1]!);
      if (rest.isFinite() && rest.distanceTo(this.globalPosition) < r.y) this.globalPosition = rest;
    }
    this._inValley = valley;
    this.groundAngle = valley ? 0 : hit.angle;
    this.collisionMode = Player.modeForAngle(this.groundAngle);
    return true;
  }

  private valleyRestPosition(left: Hit, right: Hit): Vec2 {
    const r = this.getRadii();
    const dl = new Vec2(Math.cos(degToRad(left.angle)), -Math.sin(degToRad(left.angle)));
    const dr = new Vec2(Math.cos(degToRad(right.angle)), -Math.sin(degToRad(right.angle)));
    const denom = dl.cross(dr);
    if (Math.abs(denom) < 0.000001) return Vec2.INF;
    const vertex = left.position.add(dl.mul(right.position.sub(left.position).cross(dr) / denom));
    const tanLeft = Math.tan(degToRad(Player.angleFromFlat(left.angle)));
    const tanRight = Math.tan(degToRad(Player.angleFromFlat(right.angle)));
    const u = (r.x * (tanLeft - tanRight)) / (tanLeft + tanRight);
    return new Vec2(vertex.x + u, vertex.y - (r.x - u) * tanLeft - r.y);
  }

  private isOppositeSteepSlope(angle: number): boolean {
    if (this.collisionMode !== RIGHT_WALL && this.collisionMode !== LEFT_WALL) return false;
    const flat = Player.angleFromFlat(angle);
    return flat > 45 && flat < 90 && signf(Math.sin(degToRad(angle))) !== signf(Math.sin(degToRad(this.groundAngle)));
  }

  private steepValleyBelow(): boolean {
    const r = this.getRadii();
    this.sensors.castPair(VALLEY_LABELS, this.globalPosition, Vec2.RIGHT, Vec2.DOWN, r.x, VALLEY_PROBE_REACH, this.terrainMask(true));
    const pair = this.sensors.lastPair;
    return pair[0] !== null && pair[1] !== null && Player.isValley(pair[0].angle, pair[1].angle, true);
  }

  static isValley(leftAngle: number, rightAngle: number, steepOnly: boolean): boolean {
    const left = Player.angleFromFlat(leftAngle);
    const right = Player.angleFromFlat(rightAngle);
    if (left < 1 || right < 1 || left >= 90 || right >= 90) return false;
    if (leftAngle < 180 || rightAngle > 180) return false;
    return !steepOnly || (left > 45 && right > 45);
  }

  /** Keeps a standing-still player (spin dash) on the ground. */
  private stickToGround(): void {
    if (!this.groundFloorCheck(SNAP_MAX)) this.leaveGround();
    const a = degToRad(this.groundAngle);
    this._vel = new Vec2(Math.cos(a), -Math.sin(a)).mul(this._gsp);
  }

  private checkSlip(p: PhysicsConstants): void {
    if (this.controlLock > 0) {
      this.controlLock -= 1;
      return;
    }
    const steepness = Player.angleFromFlat(this.groundAngle);
    if (Math.abs(this._gsp) >= speed(p.slip_speed) || steepness <= p.slip_angle) return;
    this.controlLock = p.control_lock_frames;
    if (steepness > p.fall_angle) this.leaveGround();
  }

  private updateGroundState(): void {
    if (this._ball) this.changeState('roll');
    else if (this._skidding) {
      if (this._state !== 'skid') Audio.playSfx('skid');
      this.changeState('skid');
    } else if (this._gsp === 0) this.changeState('idle');
    else this.changeState('run');
  }

  // --- Air -------------------------------------------------------------------------

  private airStep(p: PhysicsConstants, dt: number): void {
    const dir = this._state === 'hurt' ? 0 : this.inputDir();

    // 0. Extra moves (drop dash, air dash, shield actions) on a fresh jump press.
    if (this._state !== 'hurt' && Input.isActionJustPressed('jump')) this.moves.airJumpPressed();

    // 1. Variable jump height (real jumps only).
    const release = speed(p.jump_release_speed);
    if (this._jumped && !Input.isActionPressed('jump') && this._vel.y < -release) this._vel = this._vel.withY(-release);

    // 2. Air acceleration, never reducing a speed above top speed.
    if (dir !== 0) {
      if (!this._airLocked) {
        const top = this.topSpeed(p);
        if (this._vel.x * dir < top) {
          let vx = this._vel.x + accel(p.air_acceleration) * this.accelMult() * dt * dir;
          if (vx * dir > top) vx = top * dir;
          this._vel = this._vel.withX(vx);
        }
      }
      this.facing = dir;
    }

    // 3. Air drag: the classic per-frame formula with truncating division.
    let ysp = this._vel.y / FPS;
    let xsp = this._vel.x / FPS;
    if (p.air_drag_enabled && this._state !== 'hurt' && ysp < 0 && ysp > -p.air_drag_max_up && Math.abs(xsp) >= p.air_drag_min_x) {
      xsp -= Math.trunc(xsp / 0.125) / 256;
      this._vel = this._vel.withX(xsp * FPS);
    }
    void ysp;

    // 4-5. Move with this frame's speed, then apply gravity (Guide order).
    const g = accel(this._state === 'hurt' ? p.hurt_gravity : p.gravity) * this.moves.gravityMult();
    const displacement = this._vel.mul(dt);
    ysp = Math.min(this._vel.y + g * dt, speed(p.max_fall_speed));
    this._vel = this._vel.withY(ysp);
    this.capVelocity(p);

    // 6. Ease the angle back to flat.
    if (this.groundAngle !== 0) {
      if (this.groundAngle < 180) this.groundAngle = Math.max(this.groundAngle - p.air_angle_ease, 0);
      else {
        this.groundAngle = this.groundAngle + p.air_angle_ease;
        if (this.groundAngle >= 360) this.groundAngle = 0;
      }
    }

    // 7. Sensors.
    this.moveInAir(p, displacement);
  }

  private moveInAir(p: PhysicsConstants, displacement: Vec2): void {
    const steps = Math.max(1, Math.ceil(displacement.length() / this.maxStep(p)));
    let step = displacement.div(steps);
    for (let i = 0; i < steps; i++) {
      this.globalPosition = this.globalPosition.add(step);
      const before = this._vel;
      this.airWallCheck(p);
      if (this._vel.y < 0) {
        this.airCeilingCheck(p);
      } else if (this.airFloorCheck(p)) {
        this.finishLandingFrame(step.mul(steps - i - 1));
        return;
      }
      if (this.grounded) return;
      if (before.x !== 0 && this._vel.x === 0) step = step.withX(0);
      if (before.y < 0 && this._vel.y >= 0) step = step.withY(0);
    }
  }

  private finishLandingFrame(remaining: Vec2): void {
    if (remaining.isZero()) return;
    const before = this.globalPosition;
    this.globalPosition = before.add(remaining);
    if (!this.groundFloorCheck(SNAP_MAX)) {
      this.globalPosition = before;
      this.groundFloorCheck(SNAP_MAX);
    }
  }

  private airWallCheck(p: PhysicsConstants): void {
    const mask = this.terrainMask(false);
    for (const side of WALL_SIDES) {
      const hit = this.sensors.cast(side < 0 ? 'E' : 'F', this.globalPosition, new Vec2(side, 0), p.push_radius, mask);
      if (hit === null) continue;
      this.globalPosition = this.globalPosition.withX(this.globalPosition.x - side * (p.push_radius - hit.distance));
      if (this._vel.x * side > 0) this._vel = this._vel.withX(0);
    }
  }

  private airCeilingCheck(p: PhysicsConstants): void {
    const r = this.getRadii();
    const hit = this.sensors.castPair(CEILING_LABELS, this.globalPosition, Vec2.RIGHT, Vec2.UP, r.x, r.y, this.terrainMask(false));
    if (hit === null) return;
    this.globalPosition = this.globalPosition.withY(this.globalPosition.y + r.y - hit.distance);
    const a = hit.angle;
    if ((a > 90 && a <= 135) || (a >= 225 && a < 270)) {
      // Steep ceiling: land on it, carrying the upward speed along it.
      if (this.attach(p, a, this._vel.y * -signf(Math.sin(degToRad(a))))) return;
    }
    this._vel = this._vel.withY(Math.max(this._vel.y, 0));
  }

  private airFloorCheck(p: PhysicsConstants): boolean {
    const r = this.getRadii();
    const hit = this.sensors.castPair(FLOOR_LABELS, this.globalPosition, Vec2.RIGHT, Vec2.DOWN, r.x, r.y + CONTACT_EPSILON, this.terrainMask(true));
    if (hit === null) return false;
    const depth = r.y - hit.distance;
    if (hit.topOnly && depth > this._vel.y / FPS + TOP_ONLY_GRACE) return false;
    const pair = this.sensors.lastPair;
    if (pair[0] !== null && pair[1] !== null && Player.isValley(pair[0].angle, pair[1].angle, true)) return this.land(p, 0);
    return this.land(p, hit.angle);
  }

  private land(p: PhysicsConstants, angle: number): boolean {
    const xsp = this._vel.x;
    const ysp = this._vel.y;
    const steepness = Player.angleFromFlat(angle);
    const downhill = -signf(Math.sin(degToRad(angle)));
    let spd = xsp;
    if (steepness > LANDING_FLAT_MAX && Math.abs(xsp) <= ysp) {
      spd = ysp * downhill * (steepness <= LANDING_SLOPE_MAX ? SLOPE_LANDING_FACTOR : 1);
    }
    const override = this.moves.landingSpeed(spd, angle);
    return this.attach(p, angle, override ?? spd);
  }

  /** Puts the player on the ground at `angle` with ground speed `spd` (px/s). */
  private attach(_p: PhysicsConstants, angle: number, spd: number): boolean {
    this._rideDown = Math.max(this._vel.y / FPS, 0);
    const wasBall = this._ball;
    const keepBall = this.moves.landsRolling();
    this.setBall(false);
    this.groundAngle = angle;
    this.collisionMode = Player.modeForAngle(angle);
    if (!this.groundFloorCheck(SNAP_MAX)) {
      this.collisionMode = FLOOR;
      this.setBall(wasBall);
      return false;
    }
    this.grounded = true;
    this._jumped = false;
    this._airLocked = false;
    this._gsp = spd;
    if (this._state === 'hurt') this._gsp = 0;
    if (keepBall && this._state !== 'hurt') this.setBall(true);
    const a = degToRad(this.groundAngle);
    this._vel = new Vec2(Math.cos(a), -Math.sin(a)).mul(this._gsp);
    this.moves.onLand();
    this.updateGroundState();
    return true;
  }

  /** @internal */
  leaveGround(): void {
    this.grounded = false;
    this._support = null;
    this._inValley = false;
    this.collisionMode = FLOOR;
    this.crouching = false;
    this.lookingUp = false;
    this._skidding = false;
  }

  private deadStep(p: PhysicsConstants, dt: number): void {
    const g = accel(p.gravity);
    this.globalPosition = this.globalPosition.add(this._vel.mul(dt));
    this._vel = this._vel.withY(Math.min(this._vel.y + g * dt, speed(p.max_fall_speed)));
    this._deathFrames += 1;
    if (this._deathFrames === p.died_delay_frames) this.died.emit();
  }

  // --- Moving terrain (docs/CONTRACTS.md) ---------------------------------------------

  private setSupport(body: CollisionObject2D | null): void {
    this._support = body;
    if (isMovingTerrain(body)) this._supportOrigin = body.serverOrigin();
  }

  /** The body under the floor sensors at the last floor check. */
  get support(): CollisionObject2D | null {
    return this._support;
  }

  private carry(p: PhysicsConstants): void {
    const support = this._support;
    if (!this.grounded || support === null || support.isFreed() || !support.isInsideTree()) return;
    const platform = isMovingTerrain(support);
    let move = Vec2.ZERO;
    if (platform) {
      const origin = support.serverOrigin();
      move = origin.sub(this._supportOrigin);
      this._supportOrigin = origin;
      if (move.length() > MAX_CARRY) move = Vec2.ZERO;
    }
    if (support.hasMeta('conveyor_speed')) {
      const a = degToRad(this.groundAngle);
      move = move.add(new Vec2(Math.cos(a), -Math.sin(a)).mul(Number(support.getMeta('conveyor_speed'))));
    }
    const down = Player.modeDown(this.collisionMode);
    const sink = platform ? move.dot(down) : 0;
    if (sink > Math.max(this._rideDown, 0) + p.gravity + SNAP_BASE) {
      this._vel = this._vel.add(down.mul(Math.max(this._rideDown, 0) * FPS));
      this.leaveGround();
      return;
    }
    this._rideDown = sink;
    if (!move.isZero()) this.carryBy(p, move);
  }

  private carryBy(p: PhysicsConstants, move: Vec2): void {
    this.globalPosition = this.globalPosition.add(move);
    const mask = this.terrainMask(false);
    const right = Player.modeRight(this.collisionMode);
    const side = move.dot(right);
    if (side !== 0) {
      const dir = right.mul(signf(side));
      const label = side > 0 ? 'F' : 'E';
      let hit = this.sensors.cast(label, this.globalPosition, dir, p.push_radius, mask);
      if (this.collisionMode === FLOOR && Player.angleFromFlat(this.groundAngle) < 1 && !this._ball) {
        const head = this.globalPosition.add(new Vec2(0, 1 - p.height_radius));
        const top = this.sensors.cast(label, head, dir, p.push_radius, mask);
        if (top !== null && (hit === null || top.distance < hit.distance)) hit = top;
      }
      if (hit !== null && hit.collider !== this._support) this.globalPosition = this.globalPosition.sub(dir.mul(p.push_radius - hit.distance));
    }
    const up = Player.modeDown(this.collisionMode).neg();
    if (move.dot(up) > 0) {
      const r = this.getRadii();
      const hit = this.sensors.castPair(CEILING_LABELS, this.globalPosition, right, up, r.x, r.y, mask);
      if (hit !== null && hit.collider !== this._support && hit.distance < r.y - CRUSH_TOLERANCE) this.kill();
    }
  }

  private resolveMovingTerrain(p: PhysicsConstants): void {
    const mask = this.terrainMask(false);
    if (this.sensors.movingBodyAt(this.globalPosition, mask)) {
      this.kill();
      return;
    }
    const r = this.getRadii();
    if (!this.resolveAxis(Player.modeRight(this.collisionMode), Math.max(r.x, p.push_radius), r.x, mask)) {
      this.resolveAxis(Player.modeDown(this.collisionMode), r.y, r.y, mask);
    }
  }

  private resolveAxis(dir: Vec2, keep: number, half: number, mask: number): boolean {
    const ahead = this.sensors.cast('M', this.globalPosition, dir, keep * 2, mask);
    const behind = this.sensors.cast('M', this.globalPosition, dir.neg(), keep * 2, mask);
    const movingAhead = ahead !== null && isMovingTerrain(ahead.collider);
    const movingBehind = behind !== null && isMovingTerrain(behind.collider);
    if (!movingAhead && !movingBehind) return false;
    const a = ahead !== null ? ahead.distance : Infinity;
    const b = behind !== null ? behind.distance : Infinity;
    if (a + b < 2 * half - CRUSH_TOLERANCE) {
      this.kill();
      return true;
    }
    if (movingAhead && a < keep) this.globalPosition = this.globalPosition.sub(dir.mul(clamp(keep - a, 0, Math.max(b - half, 0))));
    else if (movingBehind && b < keep) this.globalPosition = this.globalPosition.add(dir.mul(clamp(keep - b, 0, Math.max(a - half, 0))));
    return false;
  }

  // --- Helpers ---------------------------------------------------------------------

  /** Switches between the standing and the ball hitbox, keeping the feet in place. */
  setBall(on: boolean): void {
    if (on === this._ball) return;
    const p = Tuning.physics;
    const shift = p.height_radius - p.roll_height_radius;
    this.globalPosition = this.globalPosition.add(Player.modeDown(this.collisionMode).mul(on ? shift : -shift));
    this._ball = on;
  }

  terrainMask(includeTopOnly: boolean): number {
    return terrainMask(this.collisionPath, includeTopOnly);
  }

  private maxStep(p: PhysicsConstants): number {
    const step = Math.max(MIN_SUB_STEP, Math.min(p.push_radius, p.roll_height_radius) - SUB_STEP_MARGIN);
    return this._inValley ? step * 0.5 : step;
  }

  capVelocity(p: PhysicsConstants): void {
    const cap = speed(p.speed_cap);
    this._vel = this._vel.clamp(new Vec2(-cap, -cap), new Vec2(cap, cap));
  }

  private applyClampRect(p: PhysicsConstants): void {
    if (!this.clampRect.hasArea() || this._state === 'dead') return;
    const r = this.getRadii();
    const left = this.clampRect.x + r.x;
    const right = this.clampRect.right - r.x;
    const top = this.clampRect.y + r.y;
    const pos = this.globalPosition;
    if (pos.x < left) {
      this.globalPosition = pos.withX(left);
      this.stopHorizontal(-1);
      const mask = this.terrainMask(false);
      const wall = this.sensors.cast('F', this.globalPosition, Vec2.RIGHT, p.push_radius - 1, mask);
      if (wall !== null || this.sensors.pointInTerrain(this.globalPosition, mask)) {
        this.kill();
        return;
      }
    } else if (pos.x > right) {
      this.globalPosition = pos.withX(right);
      this.stopHorizontal(1);
    }
    if (this.globalPosition.y < top) {
      this.globalPosition = this.globalPosition.withY(top);
      if (!this.grounded) this._vel = this._vel.withY(Math.max(this._vel.y, 0));
    }
  }

  private stopHorizontal(side: number): void {
    if (this.grounded) {
      if (this._vel.x * side > 0) {
        this._gsp = 0;
        this._vel = Vec2.ZERO;
      }
    } else if (this._vel.x * side > 0) {
      this._vel = this._vel.withX(0);
    }
  }

  private updateHitbox(): void {
    const r = this.getRadii();
    const size = new Vec2(r.x * 2, Math.max(r.y - HITBOX_HEIGHT_TRIM, 1) * 2);
    const shape = this.hitbox.shapes[0];
    if (shape && shape.kind === 'rect' && !shape.size.equals(size)) {
      shape.size = size;
      this.hitbox.shapesChanged();
    }
  }

  /** @internal */
  changeState(next: PlayerState): void {
    if (next === this._state) return;
    const old = this._state;
    this._state = next;
    this.pose = '';
    this.stateChanged.emit(old, next);
  }

  // --- Hooks for the extra moves ---------------------------------------------------

  /** @internal Sets the ball flag and state together (drop dash, air dash). */
  _enterBall(state: PlayerState): void {
    this.setBall(true);
    this.changeState(state);
  }

  /** @internal Sets ground speed in px/frame and the state (peel-out release, drop dash). */
  _setGround(speedPf: number, state: PlayerState): void {
    this._gsp = speed(speedPf);
    this.changeState(state);
  }

  /** @internal */
  _setJumped(v: boolean): void {
    this._jumped = v;
  }
}

function Vector2Zero(): Vec2 {
  return Vec2.ZERO;
}
