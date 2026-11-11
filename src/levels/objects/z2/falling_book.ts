import { drawPropSprite, PropSprite } from '../prop_sprite';
// A falling book (Wizard Academy hazard): a heavy book floating under a high
// shelf. When Sproto passes beneath it (within `triggerWidth` and
// `triggerDepth` below) it shakes, rustles its pages and plays the telegraph
// sound for Difficulty.telegraph(telegraphSeconds, local), never under
// 0.35 s, then drops. Falling, it hurts him on contact unless he is jumping
// or rolling (then it bursts harmlessly). It bursts on landing.
// Fair spawns: it only drops when Sproto moves in under it, never because he
// (re)spawned there: a player already underneath when it appears must leave
// and come back, and it ignores everyone for its first `armFrames`.
// Not an enemy: no score. Layer 8 (hazards), mask 5 (player).
// The origin is the middle of the book.

import { Layers } from '../../../core/layers';
import type { Player } from '../../../player/player';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { Signal } from '../../../runtime/signal';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { LevelDifficulty } from '../../common/level_difficulty';
import { LevelFx } from '../../common/level_fx';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';

export enum BookState {
  HANGING,
  SHAKING,
  FALLING,
}

const SIZE = new Vec2(20.0, 14.0);
const GRAVITY = 0.21875;
const MAX_FALL = 8.0;
const TERRAIN_MASK = Layers.TERRAIN_SOLID | Layers.TERRAIN_PATH_A | Layers.TERRAIN_TOP_ONLY;
const COVER = new Color(0.42, 0.24, 0.66);
const COVER_LIGHT = new Color(0.6, 0.38, 0.86);
const PAGES = new Color(0.98, 0.93, 0.8);
const GOLD = new Color(0.98, 0.8, 0.3);
const OUTLINE = new Color(0.14, 0.1, 0.2);
const CULL = new Rect2(-13, -14, 26, 24);

export class FallingBook extends PlayerArea implements Configurable {
  static readonly SIZE = SIZE;
  readonly telegraphed = new Signal();
  readonly landed = new Signal();

  triggerWidth = 48.0;
  triggerDepth = 320.0;
  telegraphSeconds = 0.5;
  /** Frames after it appears during which it can't be triggered. */
  armFrames = 60;

  state = BookState.HANGING;
  fallSpeed = 0;
  private age = 0;
  private timer = 0;
  private wasUnder = true;
  private done = false;
  private d = NaN;

  constructor(name = 'FallingBook') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_HAZARDS;
    this.monitorable = true;
    this.addShape(rectShape(SIZE));
  }

  applyProps(p: Props): void {
    this.triggerWidth = p.num('trigger_width', this.triggerWidth);
    this.triggerDepth = p.num('trigger_depth', this.triggerDepth);
    this.telegraphSeconds = p.num('telegraph_seconds', this.telegraphSeconds);
    this.armFrames = p.int('arm_frames', this.armFrames);
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_HAZARDS;
    this.monitorable = true;
    this.wasUnder = this.playerUnder();
  }

  override physicsProcess(): void {
    if (this.done) return;
    this.age += 1;
    switch (this.state) {
      case BookState.HANGING: {
        const under = this.playerUnder();
        if (under && !this.wasUnder && this.age > this.armFrames) {
          this.state = BookState.SHAKING;
          this.timer = 0;
          this.telegraphed.emit();
          LevelFx.playTelegraph();
        }
        this.wasUnder = under;
        break;
      }
      case BookState.SHAKING:
        this.timer += 1;
        if (this.timer >= this.warning()) this.state = BookState.FALLING;
        break;
      case BookState.FALLING: {
        for (const player of this.playersInside()) {
          if (player.state === 'dead') continue;
          if (!player.isAttacking()) player.hurt(this.globalPosition);
          this.burst();
          return;
        }
        this.fallSpeed = Math.min(this.fallSpeed + GRAVITY, MAX_FALL);
        const floorY = this.floorBelow(this.fallSpeed + SIZE.y / 2 + 1);
        const at = this.globalPosition;
        if (floorY !== Infinity && floorY - SIZE.y / 2 <= at.y + this.fallSpeed) {
          this.globalPosition = at.withY(floorY - SIZE.y / 2);
          this.landed.emit();
          this.burst();
          return;
        }
        this.globalPosition = at.withY(at.y + this.fallSpeed);
        break;
      }
    }
  }

  /** True when a live player is within the trigger zone below. */
  private playerUnder(): boolean {
    for (const player of tree.getNodesInGroup<Player>('player')) {
      if (player.state === 'dead') continue;
      const d = player.globalPosition.sub(this.globalPosition);
      if (Math.abs(d.x) <= this.triggerWidth / 2 && d.y > 0 && d.y <= this.triggerDepth) return true;
    }
    return false;
  }

  isTelegraphing(): boolean {
    return this.state === BookState.SHAKING;
  }

  isFalling(): boolean {
    return this.state === BookState.FALLING;
  }

  localDifficulty(): number {
    if (Number.isNaN(this.d)) this.d = LevelDifficulty.at(this);
    return this.d;
  }

  warning(): number {
    return LevelDifficulty.telegraphFrames(this.telegraphSeconds, this.localDifficulty());
  }

  /** Bursts into loose pages and disappears. */
  burst(): void {
    if (this.done) return;
    this.done = true;
    const at = this.globalPosition;
    LevelFx.debris(this.parent, new Rect2(at.x - SIZE.x / 2, at.y - SIZE.y / 2, SIZE.x, SIZE.y), PAGES, COVER, 6);
    this.monitoring = false;
    this.monitorable = false;
    this.hide();
    this.queueFree();
  }

  private floorBelow(reach: number): number {
    const from = this.globalPosition;
    const hit = tree.physics.intersectRay(from, from.add(new Vec2(0, reach)), TERRAIN_MASK);
    return hit ? hit.position.y : Infinity;
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const shaking = this.state === BookState.SHAKING;
    const shakeX = shaking ? (this.timer % 2) * 2 - 1 : 0;
    const r = new Rect2(-SIZE.x / 2 + shakeX, -SIZE.y / 2, SIZE.x, SIZE.y);
    if (drawPropSprite(g, PropSprite.book, new Vec2(shakeX, 0))) {
      if (shaking && Math.trunc(this.timer / 3) % 2 === 0) {
        drawPropSprite(g, PropSprite.paper, new Vec2(6 + shakeX, -8), new Vec2(0.35, 0.35));
      }
      return;
    }
    g.rectR(r.grow(1), OUTLINE);
    g.rectR(r, COVER);
    g.rect(r.x, r.y, SIZE.x, 2, COVER_LIGHT);
    // Page edges on the open side, and a gold clasp.
    g.rect(r.x + SIZE.x - 4, r.y + 2, 3, SIZE.y - 4, PAGES);
    g.rect(r.x + 3, r.y + SIZE.y / 2 - 1, 4, 2, GOLD);
    if (shaking && Math.trunc(this.timer / 3) % 2 === 0) {
      // Pages flutter out of the top.
      g.line(new Vec2(r.x + 6, r.y - 1), new Vec2(r.x + 9, r.y - 5), PAGES, 1);
      g.line(new Vec2(r.x + 12, r.y - 1), new Vec2(r.x + 15, r.y - 4), PAGES, 1);
    }
  }
}
