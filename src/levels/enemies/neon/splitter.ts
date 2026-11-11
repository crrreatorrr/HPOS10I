import type { Player } from '../../../player/player';
import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { Enemy } from '../enemy_base';
import { PillArt } from '../pill_art';
import { drawRemixSprite, RemixArt } from './remix_art';

const BODY = new Vec2(32, 24);
const CENTRE = new Vec2(0, -BODY.y / 2);
const MINI = new Vec2(16, 14);
const MINI_CENTRE = new Vec2(0, -MINI.y / 2);
const BREAK_FRAMES = 24;

/** A vulnerable capsule that bursts into two hoppers after a visible crack. */
export class Splitter extends Enemy {
  override tier = 4;
  private crack = -1;

  constructor() {
    super('Splitter');
    this.addShape(rectShape(BODY, CENTRE));
  }

  override onHit(player: Player): void {
    this.crack = 0;
    this.monitoring = false;
    this.monitorable = false;
    this.bounce(player);
  }

  override touch(player: Player): void {
    if (this.crack < 0) super.touch(player);
  }

  override enemyPhysics(): void {
    if (!this.grounded) this.gravityStep();
    if (this.crack < 0 || ++this.crack < BREAK_FRAMES) return;
    const parent = this.parent;
    if (parent) {
      for (const side of [-1, 1]) {
        const mini = new SplitterMini(side);
        const gap = this.wallAhead(side, 16, 8) || this.floorBelow(side * 11) === Infinity ? 0 : side * 8;
        mini.position = this.position.add(new Vec2(gap, 0));
        parent.addChild(mini);
      }
    }
    this.destroy();
  }

  cullRect(): Rect2 { return new Rect2(-23, -36, 46, 39); }

  override draw(g: Gfx): void {
    const frame = this.crack < 0 ? Math.floor(tree.physicsFrames / 12) % 2 : this.crack < BREAK_FRAMES / 2 ? 2 : 3;
    if (!drawRemixSprite(g, RemixArt.splitter, frame, CENTRE, BODY)) {
      g.rectR(new Rect2(-16, -24, 32, 24), this.crack < 0 ? PillArt.MINT : PillArt.FLASH);
      g.rect(-2, -23, 4, 22, PillArt.OUTLINE);
    }
    if (this.crack >= BREAK_FRAMES / 2) {
      drawRemixSprite(g, RemixArt.splitBurst, Math.floor((this.crack - BREAK_FRAMES / 2) / 3), CENTRE, new Vec2(44, 38));
    }
  }
}

/** Minis share the player's usual attack rules but can't hurt on the first hop. */
export class SplitterMini extends Enemy {
  private landingDelay = 0;
  private grace = true;

  constructor(private direction: number) {
    super('SplitterMini');
    this.addShape(rectShape(MINI, MINI_CENTRE));
    this.fallSpeed = -2.7;
  }

  override touch(player: Player): void {
    if (!this.grace || player.isAttacking()) super.touch(player);
  }

  override enemyPhysics(): void {
    if (this.grounded) {
      if (++this.landingDelay < this.intervalFrames(30)) return;
      this.grounded = false;
      this.fallSpeed = -this.moveSpeed(2.4);
      this.landingDelay = 0;
    }
    const step = this.moveSpeed(1.3);
    const blocked = (dir: number): boolean => this.wallAhead(dir, step + 8, 7) ||
      this.floorBelow(dir * (step + 7), 18, 64) === Infinity;
    if (blocked(this.direction)) this.direction *= -1;
    if (!blocked(this.direction)) this.globalPosition = this.globalPosition.withX(this.globalPosition.x + this.direction * step);
    this.gravityStep();
    if (this.grounded) this.grace = false;
  }

  cullRect(): Rect2 { return new Rect2(-10, -16, 20, 18); }

  override draw(g: Gfx): void {
    const frame = this.grounded ? (this.landingDelay < 6 ? 3 : 0) : this.fallSpeed < 0 ? 1 : 2;
    if (drawRemixSprite(g, RemixArt.mini, frame, MINI_CENTRE, MINI, this.direction)) return;
    g.rectR(new Rect2(-8, -14, 16, 14), PillArt.MINT);
  }
}
