// Small feel effects drawn as simple pixel shapes: dust puffs and ticket
// sparkles. Purely visual: they never read input or touch physics.
// Anyone may call them: Effects.ticketSparkle(globalPosition, parent).

import { Color } from '../runtime/color';
import type { Gfx } from '../runtime/gfx';
import { Node, Node2D } from '../runtime/node';
import { tree } from '../runtime/tree';
import { Rect2, Vec2 } from '../runtime/vec2';

const DUST = new Color(0.94, 0.9, 0.82);
const DUST_SHADE = new Color(0.72, 0.66, 0.58);
const SPARKLE = new Color(1.0, 0.95, 0.55);
const SPARKLE_CORE = new Color(1, 1, 1);

class Puff extends Node2D {
  static readonly LIFE = 18;
  velocity = Vec2.ZERO;
  radius = 2;
  private age = 0;

  override physicsProcess(): void {
    this.age += 1;
    this.position = this.position.add(this.velocity);
    this.velocity = this.velocity.mul(0.9);
    if (this.age >= Puff.LIFE) this.queueFree();
  }

  override draw(g: Gfx): void {
    const t = this.age / Puff.LIFE;
    const r = this.radius * (1 + t * 1.5);
    const alpha = 1 - t;
    g.circle(new Vec2(0.5, 0.5), r, DUST_SHADE.withAlpha(alpha * 0.8));
    g.circle(new Vec2(-0.5, -0.5), r * 0.75, DUST.withAlpha(alpha));
  }
}

class Sparkle extends Node2D {
  static readonly LIFE = 20;
  private age = 0;

  override physicsProcess(): void {
    this.age += 1;
    if (this.age >= Sparkle.LIFE) this.queueFree();
  }

  override draw(g: Gfx): void {
    const t = this.age / Sparkle.LIFE;
    const arm = 6 * Math.sin(t * Math.PI);
    g.line(new Vec2(-arm, 0), new Vec2(arm, 0), SPARKLE);
    g.line(new Vec2(0, -arm), new Vec2(0, arm), SPARKLE);
    g.rect(-1, -1, 2, 2, SPARKLE_CORE);
    const reach = 3 + t * 10;
    for (let i = 0; i < 4; i++) {
      const dir = Vec2.fromAngle(Math.PI / 4 + (i * Math.PI) / 2);
      const p = dir.mul(reach).round().sub(new Vec2(0.5, 0.5));
      g.rectR(new Rect2(p.x, p.y, 1.5, 1.5), SPARKLE.withAlpha(1 - t));
    }
  }
}

export const Effects = {
  /** Master switch (tests compare trajectories with effects on and off). */
  enabled: true,

  /** A few dust puffs at `at` (world), drifting along `direction` (-1, 0 or 1). */
  dust(parent: Node | null, at: Vec2, direction = 0, count = 3, size = 1): void {
    if (!Effects.enabled) return;
    for (let i = 0; i < count; i++) {
      const puff = new Puff();
      const spread = i - (count - 1) / 2;
      puff.velocity = new Vec2(direction * (0.6 + 0.3 * i) + spread * 0.35, -0.25 - 0.1 * i);
      puff.radius = (1.5 + 0.5 * (i % 2)) * size;
      spawn(parent, puff, at.add(new Vec2(spread * 3, 0)));
    }
  },

  /** A burst of sparkles where a ticket was collected (world position). */
  ticketSparkle(at: Vec2, parent: Node | null = null): void {
    if (!Effects.enabled) return;
    spawn(parent, new Sparkle(), at);
  },

  /** Adds a world-space effect node (deferred, safe in physics callbacks). */
  spawn(parent: Node | null, node: Node2D, at: Vec2, z = 5): void {
    spawn(parent, node, at, z);
  },
};

function spawn(parent: Node | null, node: Node2D, at: Vec2, z = 5): void {
  const target = parent ?? tree.currentScene ?? tree.root;
  node.topLevel = true;
  node.position = at;
  node.zIndex = z;
  tree.callDeferred(() => {
    if (!target.isFreed()) {
      target.addChild(node);
      node.resetPhysicsInterpolation();
    }
  });
}
