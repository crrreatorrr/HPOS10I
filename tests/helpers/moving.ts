// Moving terrain for the physics tests (the playground's demo platform and
// conveyor in the Godot version): a MovingBody driven frame by frame by an
// `offsetAt` script, a conveyor, and a sampler that records Sproto's offset
// from a body at the end of every tick.

import { Layers } from '../../src/core/layers';
import { MovingBody } from '../../src/levels/common/moving_body';
import type { Player } from '../../src/player/player';
import { Node, type Node2D } from '../../src/runtime/node';
import { rectShape, StaticBody2D } from '../../src/runtime/physics';
import { Vec2 } from '../../src/runtime/vec2';

export type Motion = (frame: number) => Vec2;

/** A platform whose top surface is at its origin, moved by `offsetAt(frame)` from its start. */
export class TestPlatform extends MovingBody {
  offsetAt: Motion = () => Vec2.ZERO;
  /** Physics ticks since it started (tests may reset it to 0). */
  frame = 0;
  private start = Vec2.ZERO;

  constructor(readonly size = new Vec2(64, 12)) {
    super('TestPlatform');
    this.addBox(size, new Vec2(-size.x / 2, 0));
  }

  override ready(): void {
    super.ready();
    this.start = this.position;
  }

  override physicsProcess(): void {
    this.frame += 1;
    this.moveTo(this.start.add(this.offsetAt(this.frame)));
  }
}

/** Solid terrain carrying `conveyor_speed` (px/frame, + = right). The origin is the top-left corner. */
export class TestConveyor extends StaticBody2D {
  constructor(size: Vec2, speed: number) {
    super('TestConveyor');
    this.collisionLayer = Layers.TERRAIN_SOLID;
    this.collisionMask = 0;
    this.setMeta('conveyor_speed', speed);
    this.addShape(rectShape(size, size.div(2)));
  }
}

/** Moves `velocity` px per frame from frame `start` to frame `stop`. */
export function linear(velocity: Vec2, start = 0, stop = 100000): Motion {
  return (frame) => velocity.mul(Math.min(Math.max(frame, start), stop) - start);
}

/** Shuttles `velocity` px per frame, turning instantly every `half` frames. */
export function shuttle(velocity: Vec2, half: number): Motion {
  return (frame) => {
    const t = frame % (2 * half);
    return velocity.mul(t <= half ? t : 2 * half - t);
  };
}

export function addPlatform(world: Node2D, at: Vec2, motion: Motion, size = new Vec2(96, 12)): TestPlatform {
  const body = new TestPlatform(size);
  body.position = at;
  body.offsetAt = motion;
  world.addChild(body);
  return body;
}

/**
 * Records Sproto's offset from a body at the end of every physics tick, once
 * both have moved and the world has stepped: what the renderer draws (a
 * deferred call, queued after theirs as it is added last).
 */
export class Sampler extends Node {
  readonly offsets: Vec2[] = [];
  airborne = 0;

  constructor(
    readonly player: Player,
    readonly body: Node2D,
  ) {
    super('Sampler');
  }

  override physicsProcess(): void {
    this.tree.callDeferred(() => {
      this.offsets.push(this.player.globalPosition.sub(this.body.globalPosition));
      if (!this.player.grounded) this.airborne += 1;
    });
  }

  /** Largest change of the offset since the first sample. */
  drift(): number {
    let worst = 0;
    for (const o of this.offsets) worst = Math.max(worst, o.sub(this.offsets[0]!).length());
    return worst;
  }
}

export function addSampler(world: Node2D, player: Player, body: Node2D): Sampler {
  const s = new Sampler(player, body);
  world.addChild(s);
  return s;
}
