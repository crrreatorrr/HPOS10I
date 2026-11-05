// Sets the player's collision path (A or B) when the player's centre crosses
// this switcher's vertical centre line. Each crossing direction has its own
// target path. Optionally only switches grounded players (loop tops).

import { Layers } from '../core/layers';
import { Player } from '../player/player';
import { Area2D, rectShape } from '../runtime/physics';
import { Vec2 } from '../runtime/vec2';
import type { Configurable, Props } from '../levels/common/props';

export enum SwitchPath {
  KEEP = -1,
  A = 0,
  B = 1,
}

export class PathSwitcher extends Area2D implements Configurable {
  size = new Vec2(16, 128);
  pathMovingRight = SwitchPath.A;
  pathMovingLeft = SwitchPath.B;
  groundedOnly = false;
  private sides = new Map<Player, number>();

  constructor(name = 'PathSwitcher') {
    super(name);
    this.collisionLayer = 0;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = false;
    this.addShape(rectShape(this.size));
    this.areaEntered.connect((a) => {
      const p = Player.fromArea(a);
      if (p) this.sides.set(p, this.sideOf(p));
    });
    this.areaExited.connect((a) => {
      const p = Player.fromArea(a);
      if (p) {
        this.check(p);
        this.sides.delete(p);
      }
    });
  }

  applyProps(p: Props): void {
    this.setSize(p.vec('size', this.size));
    this.pathMovingRight = p.int('path_moving_right', this.pathMovingRight);
    this.pathMovingLeft = p.int('path_moving_left', this.pathMovingLeft);
    this.groundedOnly = p.bool('grounded_only', this.groundedOnly);
  }

  setSize(size: Vec2): void {
    this.size = new Vec2(Math.max(size.x, 1), Math.max(size.y, 1));
    const shape = this.shapes[0];
    if (shape && shape.kind === 'rect') {
      shape.size = this.size;
      this.shapesChanged();
    }
  }

  override physicsProcess(): void {
    for (const p of [...this.sides.keys()]) {
      if (p.isFreed()) this.sides.delete(p);
      else this.check(p);
    }
  }

  private sideOf(player: Player): number {
    return this.toLocal(player.globalPosition).x >= 0 ? 1 : -1;
  }

  private check(player: Player): void {
    const side = this.sideOf(player);
    const last = this.sides.get(player) ?? side;
    this.sides.set(player, side);
    if (side === last || (this.groundedOnly && !player.grounded)) return;
    const target = side > 0 ? this.pathMovingRight : this.pathMovingLeft;
    if (target !== SwitchPath.KEEP) player.setCollisionPath(target);
  }
}
