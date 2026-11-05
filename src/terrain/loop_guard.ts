// Keeps a loop from trapping Sproto (BUG-02-01). TerrainLoop places it at the
// loop's bottom centre and sizes it to the ring and its feet. The lower
// quarters (and the feet outside them) are on opposite paths, so one side is
// always solid; when he turns back without crossing a switcher, the guard
// opens the way he is going:
//   - inside the ring, once he has turned back there: moving right sets path
//     B, moving left path A, only once all of him is past the bottom centre;
//   - on a foot's outside, on the ground, moving towards the loop: the other
//     path, so the foot and the quarter above it let him through.
// Only in the lower half. Normal laps never change path here.

import { Layers } from '../core/layers';
import { Tuning } from '../core/tuning';
import { LEFT_WALL, PATH_A, PATH_B, Player, RIGHT_WALL } from '../player/player';
import { Area2D, rectShape } from '../runtime/physics';
import { Vec2 } from '../runtime/vec2';
import type { Configurable, Props } from '../levels/common/props';

const FOOT_REACH = 20.0;
const SIDE_GAP = 1.0;
const MIN_SPEED = 0.01;

interface Track {
  dir: number;
  open: boolean;
}

export class LoopGuard extends Area2D implements Configurable {
  radius = 112;
  outerRadius = 128;
  footWidth = 48;
  private tracked = new Map<Player, Track>();

  constructor(name = 'Guard') {
    super(name);
    this.collisionLayer = 0;
    this.collisionMask = Layers.PLAYER;
    this.monitorable = false;
    this.addShape(rectShape(Vec2.ONE));
    this.updateShape();
    this.areaEntered.connect((a) => {
      const p = Player.fromArea(a);
      if (p) this.tracked.set(p, { dir: 0, open: false });
    });
    this.areaExited.connect((a) => {
      const p = Player.fromArea(a);
      if (p) this.tracked.delete(p);
    });
  }

  applyProps(p: Props): void {
    this.radius = Math.max(p.num('radius', this.radius), 1);
    this.outerRadius = Math.max(p.num('outer_radius', this.outerRadius), 1);
    this.footWidth = Math.max(p.num('foot_width', this.footWidth), 0);
    this.updateShape();
  }

  configure(radius: number, outer: number, foot: number): void {
    this.radius = Math.max(radius, 1);
    this.outerRadius = Math.max(outer, 1);
    this.footWidth = Math.max(foot, 0);
    this.updateShape();
  }

  isOpenFor(player: Player): boolean {
    return this.tracked.get(player)?.open ?? false;
  }

  override physicsProcess(): void {
    for (const [p, state] of [...this.tracked]) {
      if (p.isFreed()) this.tracked.delete(p);
      else this.check(p, state);
    }
  }

  private check(player: Player, state: Track): void {
    const local = this.toLocal(player.globalPosition);
    const inRing = Math.abs(local.x) < this.radius && local.y > -2 * this.radius;
    if (!inRing) {
      state.dir = 0;
      state.open = false;
    }
    if (local.y < -this.radius || player.state === 'dead') return;
    if (!player.grounded) {
      const vx = player.velocity.x;
      if (inRing && state.open && Math.abs(vx) >= MIN_SPEED) this.openWay(player, local, vx > 0 ? 1 : -1);
      return;
    }
    const speed = player.groundSpeed;
    if (Math.abs(speed) < MIN_SPEED) return;
    const direction = speed > 0 ? 1 : -1;
    if (inRing) {
      if (state.dir === 0) state.dir = direction;
      else if (direction !== state.dir) state.open = true;
      if (state.open) this.openWay(player, local, direction);
    } else if (Math.abs(local.x) >= this.outerRadius && Math.abs(local.x) <= this.outerRadius + this.footWidth + FOOT_REACH) {
      const side = local.x > 0 ? 1 : -1;
      const footPath = side > 0 ? PATH_A : PATH_B;
      if (direction === -side && player.collisionPath === footPath) player.setCollisionPath(side > 0 ? PATH_B : PATH_A);
    }
  }

  private openWay(player: Player, local: Vec2, direction: number): void {
    if (local.x * direction < LoopGuard.halfWidth(player) + SIDE_GAP) return;
    const path = direction > 0 ? PATH_B : PATH_A;
    if (player.collisionPath !== path) player.setCollisionPath(path);
  }

  static halfWidth(player: Player): number {
    const r = player.getRadii();
    if (player.grounded && (player.collisionMode === RIGHT_WALL || player.collisionMode === LEFT_WALL)) return r.y;
    return Math.max(r.x, Tuning.physics.push_radius);
  }

  private updateShape(): void {
    const reach = this.outerRadius + this.footWidth + FOOT_REACH;
    const shape = this.shapes[0];
    if (shape && shape.kind === 'rect') {
      shape.size = new Vec2(reach * 2, this.outerRadius * 2);
      shape.offset = new Vec2(0, -this.outerRadius);
      this.shapesChanged();
    }
  }
}
