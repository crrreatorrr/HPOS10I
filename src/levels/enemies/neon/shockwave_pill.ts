import type { Gfx } from '../../../runtime/gfx';
import { rectShape } from '../../../runtime/physics';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { Enemy } from '../enemy_base';
import { Pellet } from '../pellet';
import { PillArt } from '../pill_art';
import { drawRemixSprite, RemixArt } from './remix_art';

const CENTRE = new Vec2(0, -11);
const BODY = new Vec2(28, 22);

export class Shockwave extends Pellet {
  constructor() {
    super();
    this.name = 'Shockwave';
  }

  override physicsProcess(delta: number): void {
    if (this.age >= 48) this.pop();
    else super.physicsProcess(delta);
  }

  override draw(g: Gfx): void {
    if (!drawRemixSprite(g, RemixArt.wave, Math.floor(this.age / 4), Vec2.ZERO, new Vec2(13, 9), this.direction)) super.draw(g);
  }
}

/** Telegraphs a ground pulse, fires in both directions, then vents before rearming. */
export class ShockwavePill extends Enemy {
  override tier = 3;
  phase: 'idle' | 'warning' | 'recoil' = 'idle';
  private ticks = 0;

  constructor() {
    super('ShockwavePill');
    this.addShape(rectShape(BODY, CENTRE));
  }

  override enemyPhysics(): void {
    if (!this.grounded) {
      this.gravityStep();
      return;
    }
    if (this.ticks > 0 && --this.ticks > 0) return;
    if (this.phase === 'warning') {
      this.fire();
      this.phase = 'recoil';
      this.ticks = 16;
    } else if (this.phase === 'recoil') {
      this.phase = 'idle';
      this.ticks = this.intervalFrames(145);
    } else {
      const player = this.nearestPlayer(130);
      if (!player || !this.onScreen() || Math.abs(player.globalPosition.y - this.globalPosition.y) > 60) return;
      this.phase = 'warning';
      this.ticks = this.telegraphFrames(0.9);
      this.playTelegraph();
    }
  }

  private fire(): void {
    const parent = this.parent;
    if (!parent) return;
    for (const direction of [-1, 1]) {
      const x = direction * 17;
      const floorY = this.floorBelow(x);
      if (floorY === Infinity || this.wallAhead(direction, 20, Pellet.HEIGHT)) continue;
      const wave = new Shockwave();
      wave.direction = direction;
      wave.speed = this.moveSpeed(2.55);
      parent.addChild(wave);
      wave.globalPosition = new Vec2(this.globalPosition.x + x, floorY - Pellet.HEIGHT);
      wave.resetPhysicsInterpolation();
    }
  }

  cullRect(): Rect2 { return new Rect2(-34, -28, 68, 30); }

  override draw(g: Gfx): void {
    const frame = this.phase === 'warning' ? 1 + Math.floor(this.ticks / 6) % 2 : this.phase === 'recoil' ? 3 : 0;
    if (!drawRemixSprite(g, RemixArt.shockwavePill, frame, CENTRE, BODY)) {
      g.rectR(new Rect2(-14, -22, 28, 22), this.phase === 'warning' ? PillArt.FLASH : PillArt.SPIKE);
      g.rect(-10, -18, 20, 4, PillArt.OUTLINE);
    }
    if (this.phase === 'warning') {
      drawRemixSprite(g, RemixArt.warning, Math.floor(this.ticks / 4), new Vec2(0, -4), new Vec2(66, 8));
    }
  }
}
