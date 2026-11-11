import { drawPropSprite, PropSprite } from './prop_sprite';
// A pad on the floor that shoots Sproto along in its facing direction:
// player.pushGround(facing * speed, LOCK_FRAMES), at SPEED px/frame or the
// speed he already had in that direction, whichever is higher. Plays
// `booster`. It only acts on a grounded player (jumping over it does
// nothing; landing on it counts). Running into it from the wrong side turns
// him around at SPEED. Fires once per visit: he has to leave the pad before
// it can fire again. The origin is the middle of the pad, on the floor.
// Layer 7 (objects), mask 5 (player).

import { Audio } from '../../core/audio';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { rectShape } from '../../runtime/physics';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

const OUTLINE = new Color(0.1, 0.1, 0.16);
const PLATE = new Color(0.24, 0.27, 0.38);
const PLATE_LIGHT = new Color(0.4, 0.44, 0.58);
const ARROW = new Color(1.0, 0.86, 0.18);
const ARROW_DIM = new Color(0.62, 0.48, 0.1);
const CULL = new Rect2(-18, -14, 36, 16);

export class SpeedBooster extends PlayerArea implements Configurable {
  static readonly SPEED = 12.0;
  static readonly LOCK_FRAMES = 16;
  static readonly WIDTH = 32.0;

  private _facing = 1;
  /** Players boosted and still on the pad. */
  private boosted = new Set<Player>();

  constructor(name = 'SpeedBooster') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(rectShape(new Vec2(32, 12), new Vec2(0, -6)));
    this.playerExited.connect((player) => this.boosted.delete(player));
  }

  /** 1 boosts right, -1 left. */
  get facing(): number {
    return this._facing;
  }

  set facing(v: number) {
    this._facing = v < 0 ? -1 : 1;
  }

  applyProps(p: Props): void {
    this.facing = p.int('facing', this.facing);
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
  }

  override physicsProcess(): void {
    for (const player of this.playersInside()) {
      if (this.boosted.has(player) || !player.grounded || player.state === 'dead') continue;
      this.boosted.add(player);
      this.boost(player);
    }
  }

  boost(player: Player): void {
    const speed = Math.max(SpeedBooster.SPEED, player.groundSpeed * this._facing);
    player.pushGround(this._facing * speed, SpeedBooster.LOCK_FRAMES);
    Audio.playSfx('booster');
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const width = SpeedBooster.WIDTH;
    const half = width / 2;
    const f = this._facing;
    const frame = Math.trunc(tree.physicsFrames / 6) % 3;
    g.setTransform(new Vec2(0, -5), 0, new Vec2(f, 1));
    const loaded = drawPropSprite(g, PropSprite.boosterStart + frame, Vec2.ZERO);
    g.resetTransform();
    if (loaded) return;
    g.rect(-half, -6, width, 6, OUTLINE);
    g.rect(-half + 1, -5, width - 2, 4, PLATE);
    g.rect(-half + 1, -5, width - 2, 1, PLATE_LIGHT);
    // Three chevrons; the lit one runs in the boost direction.
    const lit = Math.trunc(tree.physicsFrames / 6) % 3;
    for (let i = 0; i < 3; i++) {
      const x = (-8.0 + i * 8.0) * f;
      const color = (f > 0 ? i : 2 - i) === lit ? ARROW : ARROW_DIM;
      const tip = new Vec2(x + 3.0 * f, -3.5);
      g.line(new Vec2(x - 2.0 * f, -6.5), tip, color, 2);
      g.line(tip, new Vec2(x - 2.0 * f, -0.5), color, 2);
    }
  }
}
