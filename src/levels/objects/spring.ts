// Springs (spring_up.tscn, spring_diagonal.tscn, spring_side.tscn). The node
// origin is the middle of the spring's base, on the surface it stands on.
// Touching the spring from any side triggers it:
//   UP        player.launch(Vec2(x speed kept, -power))
//   DIAGONAL  player.launch(Vec2(facing * power, -power)): 45 degrees
//   SIDE      player.pushGround(facing * power, SIDE_LOCK_FRAMES)
// power: yellow 10 px/frame, red 16. Launches set the speed (they never add
// to it), so standing on a spring can't stack speed. A dead player is
// ignored; a hurt one is launched and leaves the hurt state (the spring
// state replaces it). Plays `spring` and a short compress-and-extend
// animation. Layer 7 (objects), mask 5 (player).

import { Audio } from '../../core/audio';
import type { Player } from '../../player/player';
import { Color } from '../../runtime/color';
import type { Gfx } from '../../runtime/gfx';
import { tree } from '../../runtime/tree';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { PlayerArea } from '../common/player_area';
import type { Configurable, Props } from '../common/props';

export enum SpringKind {
  UP,
  DIAGONAL,
  SIDE,
}

export enum SpringStrength {
  YELLOW,
  RED,
}

const POWER: Record<SpringStrength, number> = { [SpringStrength.YELLOW]: 10.0, [SpringStrength.RED]: 16.0 };
const SIDE_LOCK_FRAMES = 16;
/** Frames before the same spring can fire again for a player still touching it. */
const COOLDOWN_FRAMES = 8;
const ANIM_FRAMES = 14;
const WIDTH = 28.0;
const HEIGHT = 16.0;

const OUTLINE = new Color(0.12, 0.1, 0.16);
const METAL = new Color(0.62, 0.64, 0.72);
const METAL_DARK = new Color(0.36, 0.37, 0.45);
const YELLOW = new Color(1.0, 0.84, 0.16);
const YELLOW_DARK = new Color(0.8, 0.58, 0.06);
const RED = new Color(0.93, 0.2, 0.2);
const RED_DARK = new Color(0.62, 0.08, 0.12);
const HIGHLIGHT = new Color(1, 1, 1, 0.7);
const CULL = new Rect2(-32, -48, 64, 56);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

export class LevelSpring extends PlayerArea implements Configurable {
  static readonly SIDE_LOCK_FRAMES = SIDE_LOCK_FRAMES;
  static readonly COOLDOWN_FRAMES = COOLDOWN_FRAMES;

  private _kind = SpringKind.UP;
  strength = SpringStrength.YELLOW;
  private _facing = 1;
  private anim = ANIM_FRAMES;
  private lastFire = new Map<Player, number>();
  /** The scene's "Shape" child: 28x20 at (0, -10), resized per kind. */
  private readonly shape: RectShape = { kind: 'rect', size: new Vec2(28, 20), offset: new Vec2(0, -10) };

  /** `kind` is the variant scene's default (spring_up 0, spring_diagonal 1, spring_side 2). */
  constructor(kind: SpringKind = SpringKind.UP, name = 'Spring') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(this.shape);
    this.kind = kind;
  }

  get kind(): SpringKind {
    return this._kind;
  }

  set kind(v: SpringKind) {
    this._kind = v;
    this.updateShape();
  }

  /** DIAGONAL and SIDE: 1 launches right, -1 left. */
  get facing(): number {
    return this._facing;
  }

  set facing(v: number) {
    this._facing = v < 0 ? -1 : 1;
    this.updateShape();
  }

  applyProps(p: Props): void {
    this.kind = p.int('kind', this.kind) as SpringKind;
    this.strength = p.int('strength', this.strength) as SpringStrength;
    this.facing = p.int('facing', this.facing);
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.updateShape();
  }

  power(): number {
    return POWER[this.strength] ?? POWER[SpringStrength.YELLOW];
  }

  /** The launch velocity (px/frame) this spring gives `player`. */
  launchVelocity(player: Player): Vec2 {
    switch (this._kind) {
      case SpringKind.DIAGONAL:
        return new Vec2(this._facing * this.power(), -this.power());
      case SpringKind.SIDE:
        return new Vec2(this._facing * this.power(), 0);
      default:
        return new Vec2(player.velocity.x, -this.power());
    }
  }

  override physicsProcess(): void {
    if (this.anim < ANIM_FRAMES) this.anim += 1;
    const frame = tree.physicsFrames;
    for (const player of this.playersInside()) {
      if (player.state === 'dead') continue;
      if (frame - (this.lastFire.get(player) ?? -1000) < COOLDOWN_FRAMES) continue;
      this.lastFire.set(player, frame);
      this.fire(player);
    }
  }

  /** Fires the spring at `player`. */
  fire(player: Player): void {
    if (player.state === 'dead') return;
    if (this._kind === SpringKind.SIDE) player.pushGround(this._facing * this.power(), SIDE_LOCK_FRAMES);
    else player.launch(this.launchVelocity(player));
    Audio.playSfx('spring');
    this.anim = 0;
  }

  private updateShape(): void {
    switch (this._kind) {
      case SpringKind.UP:
        this.shape.size = new Vec2(WIDTH, HEIGHT + 4.0);
        this.shape.offset = new Vec2(0, -(HEIGHT + 4.0) / 2);
        break;
      case SpringKind.DIAGONAL:
        this.shape.size = new Vec2(WIDTH, WIDTH);
        this.shape.offset = new Vec2(0, -WIDTH / 2);
        break;
      case SpringKind.SIDE:
        this.shape.size = new Vec2(HEIGHT + 4.0, WIDTH);
        this.shape.offset = new Vec2(0, -WIDTH / 2);
        break;
    }
    this.shapesChanged();
  }

  /** 0 = rest, < 0 squashed, > 0 stretched (the pop after firing). */
  private extension(): number {
    if (this.anim >= ANIM_FRAMES) return 0;
    if (this.anim < 3) return -0.4;
    return Math.sin((Math.PI * (this.anim - 3)) / (ANIM_FRAMES - 3)) * 0.8;
  }

  cullRect(): Rect2 {
    return CULL;
  }

  override draw(g: Gfx): void {
    const yellow = this.strength === SpringStrength.YELLOW;
    const body = yellow ? YELLOW : RED;
    const dark = yellow ? YELLOW_DARK : RED_DARK;
    const f = this._facing;
    if (this._kind === SpringKind.DIAGONAL) {
      // A 45-degree wedge, high on the side away from `facing`; its slope
      // faces the launch direction and the spring stands on it.
      const base = [new Vec2(-13 * f, 0), new Vec2(5 * f, 0), new Vec2(-13 * f, -18)];
      g.polygon(base, METAL_DARK);
      g.polyline(base, OUTLINE, 1, true);
    }
    // The upright spring (top plate towards -y), rotated so its top plate
    // faces the launch direction.
    if (this._kind === SpringKind.DIAGONAL) g.setTransform(new Vec2(-4.0 * f, -9.0), f * Math.PI * 0.25);
    else if (this._kind === SpringKind.SIDE) g.setTransform(new Vec2(-6.0 * f, -WIDTH / 2), f * Math.PI * 0.5);
    this.drawSpring(g, body, dark);
    g.resetTransform();
  }

  /** An upright spring: base plate, coil and top plate. */
  private drawSpring(g: Gfx, body: Color, dark: Color): void {
    const coil = 8.0 * (1.0 + this.extension());
    g.rect(-12, -4, 24, 4, OUTLINE);
    g.rect(-11, -3, 22, 2, METAL_DARK);
    for (let k = 0; k < 3; k++) {
      const y0 = -4.0 - (coil * k) / 3;
      const y1 = -4.0 - (coil * (k + 1)) / 3;
      g.line(new Vec2(-8, y0), new Vec2(8, (y0 + y1) / 2), METAL, 2);
      g.line(new Vec2(8, (y0 + y1) / 2), new Vec2(-8, y1), METAL_DARK, 2);
    }
    const top = -4.0 - coil;
    g.rect(-14, top - 6, 28, 6, OUTLINE);
    g.rect(-13, top - 5, 26, 4, body);
    g.rect(-13, top - 2, 26, 1, dark);
    g.rect(-11, top - 5, 8, 1, HIGHLIGHT);
  }
}
