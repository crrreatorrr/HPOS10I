// Power-ups from item boxes and the optional extra moves.
//
// Power-ups (from item boxes): a shield that absorbs one hit, speed shoes
// (double top speed and acceleration for 20 s) and invincibility (20 s, touch
// destroys enemies, hazards can't hurt; pits still do).
//
// Extra moves (Options, on by default; never in Ranked, like Relic effects):
//   - Drop dash: jump, then press and hold jump again in the air; landing
//     while still holding it launches a roll (speed 8, up to 12).
//   - Charge run: hold up while standing, tap jump, keep holding up for about
//     half a second, release up to burst off at speed 12. Releasing early
//     cancels.
//   - Shield bounce: with a shield, press jump in the air to slam down; the
//     landing bounces you back up.
//   - Jump assist: a jump pressed up to COYOTE_FRAMES after running or rolling
//     off a ledge still jumps (late jump), and a jump pressed up to
//     JUMP_BUFFER_FRAMES before landing jumps on the first grounded frame
//     (early jump). On one air press the shield bounce comes first, then a
//     drop dash that was held long enough, then the buffered jump.
// With extra moves off and no power-ups, every hook below is a no-op, so the
// classic physics (docs/PHYSICS.md) are untouched.

import { Audio } from '../core/audio';
import { GameState } from '../core/game_state';
import { Settings } from '../core/settings';
import { RelicLoadout } from '../hub/relic_loadout';
import { Input } from '../runtime/input';
import { signf } from '../runtime/math';
import { Vec2 } from '../runtime/vec2';
import type { Player } from './player';

export type PowerUp = 'shield' | 'speed_shoes' | 'invincibility';

export const POWER_UP_FRAMES = 20 * 60;
const DROPDASH_CHARGE_FRAMES = 20;
const DROPDASH_SPEED = 8;
const DROPDASH_MAX = 12;
const PEELOUT_CHARGE_FRAMES = 30;
const PEELOUT_SPEED = 12;
const SHIELD_BOUNCE_DOWN = 8;
const SHIELD_BOUNCE_UP = 7.5;
/** Frames after the floor is lost in which a jump press still jumps. */
export const COYOTE_FRAMES = 5;
/** Frames before landing in which a jump press is kept for the landing. */
export const JUMP_BUFFER_FRAMES = 6;

export class Moves {
  /** Tests switch the extra moves off to compare against the classic model. */
  static extraMovesOverride: boolean | null = null;

  shield = false;
  speedShoesFrames = 0;
  invincibilityFrames = 0;
  private dropCharge = -1;
  private peelCharge = 0;
  private shieldBouncing = false;
  private airPressUsed = false;
  private coyote = 0;
  private buffer = 0;
  private bufferedJump = false;

  constructor(private readonly player: Player) {}

  /** True when the extra moves may be used (option on, not Ranked). */
  static extrasOn(): boolean {
    if (Moves.extraMovesOverride !== null) return Moves.extraMovesOverride;
    return Settings.data.extraMoves && RelicLoadout.resolve().extras_allowed;
  }

  extrasEnabled(): boolean {
    return Moves.extrasOn();
  }

  // --- Power-ups ----------------------------------------------------------------

  give(kind: PowerUp): void {
    switch (kind) {
      case 'shield':
        this.shield = true;
        Audio.playSfx('shield');
        break;
      case 'speed_shoes':
        this.speedShoesFrames = POWER_UP_FRAMES;
        Audio.playSfx('power_up');
        break;
      case 'invincibility':
        this.invincibilityFrames = POWER_UP_FRAMES;
        Audio.playSfx('power_up');
        break;
    }
  }

  invincible(): boolean {
    return this.invincibilityFrames > 0;
  }

  /** A hit taken with a shield: the shield goes, no tickets are lost. */
  absorbHit(): boolean {
    if (!this.shield) return false;
    this.shield = false;
    this.shieldBouncing = false;
    return true;
  }

  topSpeedMult(): number {
    return this.speedShoesFrames > 0 ? 2 : 1;
  }

  accelMult(): number {
    return this.speedShoesFrames > 0 ? 2 : 1;
  }

  gravityMult(): number {
    return 1;
  }

  clearAll(): void {
    this.shield = false;
    this.speedShoesFrames = 0;
    this.invincibilityFrames = 0;
    this.dropCharge = -1;
    this.peelCharge = 0;
    this.shieldBouncing = false;
    this.coyote = 0;
    this.buffer = 0;
    this.bufferedJump = false;
  }

  tick(): void {
    if (this.speedShoesFrames > 0) this.speedShoesFrames--;
    if (this.invincibilityFrames > 0) this.invincibilityFrames--;
    const p = this.player;
    if (p.grounded) this.coyote = 0;
    else if (this.coyote > 0) this.coyote--;
    if (this.buffer > 0) this.buffer--;
    // Drop dash charge builds while jump stays held after the second press.
    if (this.dropCharge >= 0) {
      if (!Input.isActionPressed('jump') || p.grounded) {
        if (!p.grounded) this.dropCharge = -1;
      } else if (this.dropCharge < DROPDASH_CHARGE_FRAMES) {
        this.dropCharge++;
        if (this.dropCharge === DROPDASH_CHARGE_FRAMES) Audio.playSfx('spindash_charge');
      }
    }
  }

  // --- Air ----------------------------------------------------------------------

  onJump(): void {
    this.coyote = 0;
    this.buffer = 0;
    this.bufferedJump = false;
    this.airPressUsed = false;
    this.dropCharge = -1;
    this.shieldBouncing = false;
  }

  onBounce(): void {
    // Bouncing off an enemy allows another drop dash.
    this.airPressUsed = false;
  }

  // --- Jump assist ----------------------------------------------------------------

  /** The ground step lost the floor (ran or rolled off a ledge): a late jump is allowed for a few frames. */
  onFloorLost(): void {
    this.coyote = this.extrasEnabled() ? COYOTE_FRAMES + 1 : 0;
  }

  /** True (once) when a fresh air press may still jump off the ledge just left. */
  takeCoyoteJump(): boolean {
    if (this.coyote <= 0 || !this.extrasEnabled()) return false;
    this.coyote = 0;
    return true;
  }

  /** True (once) on the first grounded tick after a jump press that came just before landing. */
  takeBufferedJump(): boolean {
    const take = this.bufferedJump;
    this.bufferedJump = false;
    return take;
  }

  /** A fresh jump press while airborne (not hurt). */
  airJumpPressed(): void {
    const p = this.player;
    if (!this.extrasEnabled()) return;
    // Every air press is remembered for the landing; a shield bounce uses it up.
    this.buffer = JUMP_BUFFER_FRAMES + 1;
    if (this.airPressUsed) return;
    if (p.state !== 'jump' && p.state !== 'spring' && p.state !== 'roll') return;
    this.airPressUsed = true;
    if (this.shield && p.state === 'jump') {
      // Shield bounce: slam straight down.
      this.buffer = 0;
      this.shieldBouncing = true;
      p.velocity = new Vec2(0, SHIELD_BOUNCE_DOWN);
      p._airLocked = true;
      Audio.playSfx('spring');
      return;
    }
    if (p.state === 'jump' || p.state === 'spring') this.dropCharge = 0;
  }

  /** Overrides the landing ground speed (px/s) for a drop dash; null keeps the classic value. */
  landingSpeed(classic: number, angle: number): number | null {
    const p = this.player;
    if (this.shieldBouncing) return null;
    if (this.dropCharge < DROPDASH_CHARGE_FRAMES || !Input.isActionPressed('jump')) {
      this.dropCharge = -1;
      return null;
    }
    this.dropCharge = -1;
    const facing = p.facing;
    const gsp = classic / 60;
    let out: number;
    if (signf(gsp) === facing || gsp === 0) {
      out = gsp / 4 + DROPDASH_SPEED * facing;
    } else if (angle === 0) {
      out = DROPDASH_SPEED * facing;
    } else {
      out = gsp / 2 + DROPDASH_SPEED * facing;
    }
    out = Math.max(-DROPDASH_MAX, Math.min(DROPDASH_MAX, out));
    this.pendingRoll = true;
    this.buffer = 0;
    Audio.playSfx('spindash_release');
    return out * 60;
  }

  private pendingRoll = false;

  landsRolling(): boolean {
    return this.pendingRoll;
  }

  onLand(): void {
    const p = this.player;
    GameState.resetChain();
    this.pendingRoll = false;
    this.airPressUsed = false;
    this.coyote = 0;
    // An early jump: pressed just before this landing, with no drop dash or shield bounce taking it.
    this.bufferedJump = this.buffer > 0 && !this.shieldBouncing && p.state !== 'hurt' && this.extrasEnabled();
    this.buffer = 0;
    if (this.shieldBouncing) {
      this.shieldBouncing = false;
      // Bounce back up along the floor normal.
      p.leaveGround();
      p.setBall(true);
      p.changeState('jump');
      p._setJumped(false);
      p.velocity = new Vec2(p.velocity.x, -SHIELD_BOUNCE_UP);
    }
  }

  // --- Charge run ---------------------------------------------------------------

  canPeelOut(): boolean {
    return this.extrasEnabled();
  }

  startPeelOut(): void {
    this.peelCharge = 0;
    this.player.lookingUp = false;
    this.player.changeState('peelout');
    Audio.playSfx('spindash_charge');
  }

  /** One grounded tick of the charge run. True when it consumed the tick. */
  peelOutStep(upHeld: boolean, _jumpPressed: boolean): boolean {
    const p = this.player;
    if (upHeld) {
      if (this.peelCharge < PEELOUT_CHARGE_FRAMES) this.peelCharge++;
      return true;
    }
    if (this.peelCharge >= PEELOUT_CHARGE_FRAMES) {
      p._setGround(PEELOUT_SPEED * p.facing, 'run');
      Audio.playSfx('spindash_release');
    } else {
      p._setGround(0, 'idle');
    }
    this.peelCharge = 0;
    return true;
  }

  peelOutCharge(): number {
    return this.peelCharge / PEELOUT_CHARGE_FRAMES;
  }
}
