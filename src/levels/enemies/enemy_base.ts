// Base for every standard enemy (docs/LEVELS.md roster). The enemy node is
// its own hurtbox: an area on layer 6 (enemies) with mask 5 (player). On
// contact with a live player:
//   - player.isAttacking() (and the enemy is open to it): the enemy is hit;
//     by default destroyed: +100 score, enemy_pop, player.bounceOff() and a pop;
//   - otherwise player.hurt(globalPosition) (ignored while invincible).
// Contact is re-checked every tick while touching. Several enemies destroyed
// in one tick each score, but the player only bounces once.
//
// Difficulty: never hard-code a speed, interval or telegraph. Use
// moveSpeed(pxPerFrame), intervalFrames(frames) and telegraphFrames(seconds):
// they apply the multipliers at this enemy's local difficulty.
//
// Writing a behaviour: extend this class, set `tier`, move in
// enemyPhysics(), draw in draw(), and override as needed: isOpenTo(player),
// isHarmful(player), onHit(player), pop(). Helpers: gravityStep(),
// floorBelow(), wallAhead(), nearestPlayer(). The origin is the enemy's feet.

import { Audio } from '../../core/audio';
import { Difficulty } from '../../core/difficulty';
import { GameState } from '../../core/game_state';
import { Layers } from '../../core/layers';
import type { Player } from '../../player/player';
import { Signal } from '../../runtime/signal';
import { tree, VIEW_H, VIEW_W } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { LevelDifficulty } from '../common/level_difficulty';
import { LevelFx } from '../common/level_fx';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

export const TERRAIN_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;
export const WALL_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A;

export class Enemy extends PlayerArea implements Configurable {
  static readonly SCORE = 100;
  static readonly GRAVITY = 0.21875;
  static readonly MAX_FALL = 16.0;
  static readonly BOUNCE_META = 'enemy_bounce_frame';

  readonly destroyed = new Signal();
  /** Emitted with every attack telegraph (the sound plays at the same time). */
  readonly telegraphed = new Signal();

  /** Roster tier, 1-4 (docs/LEVELS.md). The level lint reads it. */
  tier = 1;
  alive = true;
  /** Vertical speed while airborne, px/frame (gravityStep()). */
  fallSpeed = 0;
  grounded = false;
  private localD = NaN;

  constructor(name?: string) {
    super(name);
    this.collisionLayer = Layers.ENEMIES;
    this.monitorable = true;
    this.addToGroup('enemies');
  }

  /** Subclasses call super.applyProps(p) and then read their own exports. */
  applyProps(p: Props): void {
    this.tier = p.int('tier', this.tier);
  }

  override physicsProcess(delta: number): void {
    if (!this.alive) return;
    this.enemyPhysics(delta);
    for (const player of this.playersInside()) {
      this.touch(player);
      if (!this.alive) return;
    }
  }

  /** Movement and behaviour, overridden by each enemy. */
  enemyPhysics(_delta: number): void {}

  // --- Contact ------------------------------------------------------------------

  touch(player: Player): void {
    if (!this.alive || !player || player.state === 'dead') return;
    if (player.isAttacking() && !this.isHarmful(player)) {
      if (this.isOpenTo(player)) this.onHit(player);
      else this.bounce(player);
    } else {
      player.hurt(this.globalPosition);
    }
  }

  /** False when this enemy can't be hurt by `player` right now (a shield in the way). */
  isOpenTo(_player: Player): boolean {
    return true;
  }

  /** True when touching hurts even an attacking player (spikes out). */
  isHarmful(player: Player): boolean {
    void player;
    return false;
  }

  /** An accepted hit. Default: destroyed. */
  onHit(player: Player): void {
    this.destroy(player);
  }

  /** Destroys the enemy; `by` (optional) bounces off it. */
  destroy(by: Player | null = null): void {
    if (!this.alive) return;
    this.alive = false;
    GameState.addScore(Enemy.SCORE);
    Audio.playSfx('enemy_pop');
    if (by) this.bounce(by);
    this.pop();
    this.monitoring = false;
    this.monitorable = false;
    this.destroyed.emit();
    this.hide();
    this.queueFree();
  }

  /** The defeat burst (subclasses draw their own pieces). */
  pop(): void {}

  /** player.bounceOff(), at most once per tick however many enemies he hits. */
  bounce(player: Player): void {
    const frame = tree.physicsFrames;
    if (player.getMeta<number>(Enemy.BOUNCE_META, -1) !== frame) {
      player.setMeta(Enemy.BOUNCE_META, frame);
      player.bounceOff(this.globalPosition.y);
    }
  }

  // --- Difficulty ---------------------------------------------------------------

  localDifficulty(): number {
    if (Number.isNaN(this.localD)) this.localD = LevelDifficulty.at(this);
    return this.localD;
  }

  moveSpeed(basePxPerFrame: number): number {
    return basePxPerFrame * Difficulty.speedMult(this.localDifficulty());
  }

  intervalFrames(baseFrames: number): number {
    return LevelDifficulty.intervalFrames(baseFrames, this.localDifficulty());
  }

  telegraphFrames(baseSeconds: number): number {
    return LevelDifficulty.telegraphFrames(baseSeconds, this.localDifficulty());
  }

  playTelegraph(): void {
    this.telegraphed.emit();
    LevelFx.playTelegraph();
  }

  /** True when `at` (default: this enemy) is inside the view grown by `margin`. No camera: always. */
  onScreen(margin = 0, at: Vec2 | null = null): boolean {
    const cam = tree.camera;
    if (!cam || !cam.isInsideTree()) return true;
    const tl = cam.viewTopLeft(1);
    return new Rect2(tl.x, tl.y, VIEW_W, VIEW_H).grow(margin).hasPoint(at ?? this.globalPosition);
  }

  levelRoot(): ReturnType<typeof LevelDifficulty.levelRoot> {
    return LevelDifficulty.levelRoot(this);
  }

  // --- Movement and terrain -----------------------------------------------------

  /** Falls under gravity until it lands on a floor (sets `grounded`). */
  gravityStep(): void {
    this.fallSpeed = Math.min(this.fallSpeed + Enemy.GRAVITY, Enemy.MAX_FALL);
    if (this.fallSpeed > 0) {
      const floorY = this.floorBelow(0, 2, this.fallSpeed + 2);
      if (floorY !== Infinity && floorY <= this.globalPosition.y + this.fallSpeed + 0.01) {
        this.globalPosition = this.globalPosition.withY(floorY);
        this.fallSpeed = 0;
        this.grounded = true;
        return;
      }
    }
    this.globalPosition = this.globalPosition.withY(this.globalPosition.y + this.fallSpeed);
    this.grounded = false;
  }

  /** The floor y under local x offset (searching `up` px above to `down` below the feet), or Infinity. */
  floorBelow(xOffset = 0, up = 8, down = 16): number {
    const from = this.globalPosition.add(new Vec2(xOffset, -up));
    const hit = this.ray(from, from.add(new Vec2(0, up + down)));
    return hit ? hit.position.y : Infinity;
  }

  /** True when there is a wall within `reach` px in direction dir (-1/1), `height` px above the feet. */
  wallAhead(dir: number, reach: number, height = 8): boolean {
    const from = this.globalPosition.add(new Vec2(0, -height));
    return this.ray(from, from.add(new Vec2(dir * reach, 0)), WALL_MASK) !== null;
  }

  /** The closest live player within `reach` px, or null. */
  nearestPlayer(reach = Infinity): Player | null {
    let best: Player | null = null;
    let bestD = reach;
    for (const p of tree.getNodesInGroup<Player>('player')) {
      if (p.state === 'dead') continue;
      const d = this.globalPosition.distanceTo(p.globalPosition);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  ray(from: Vec2, to: Vec2, mask: number = TERRAIN_MASK): { position: Vec2; normal: Vec2 } | null {
    return tree.physics.intersectRay(from, to, mask);
  }
}
