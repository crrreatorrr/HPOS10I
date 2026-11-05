// Each spring is drawn facing the way it launches (port of
// tests/levels/test_spring_art.gd; the director saw diagonal springs drawn
// the wrong way). The drawn "up" of the spring is read from the transform its
// draw() sets on a recording Gfx and compared with its launch direction.

import { describe, expect, it } from 'vitest';
import { LevelSpring, SpringKind } from '../../src/levels/objects/spring';
import { Player } from '../../src/player/player';
import type { Gfx } from '../../src/runtime/gfx';
import { Vec2 } from '../../src/runtime/vec2';

/** A Gfx that draws nothing and remembers the rotation of the last setTransform(). */
function recordingGfx(): { g: Gfx; rotation: () => number } {
  let rotation = 0;
  const g = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'setTransform') return (_pos: Vec2, rot = 0) => (rotation = rot);
        if (prop === 'resetTransform') return () => undefined;
        return () => undefined;
      },
    },
  ) as Gfx;
  return { g, rotation: () => rotation };
}

describe('spring art', () => {
  const player = new Player();
  for (const [kind, label] of [
    [SpringKind.UP, 'up'],
    [SpringKind.DIAGONAL, 'diagonal'],
    [SpringKind.SIDE, 'side'],
  ] as const) {
    for (const facing of [1, -1]) {
      it(`a ${label} spring facing ${facing} points where it launches`, () => {
        const spring = new LevelSpring(kind);
        spring.facing = facing;
        const { g, rotation } = recordingGfx();
        spring.draw(g);
        const r = rotation();
        const drawn = new Vec2(0, -1).rotated(r).normalized();
        const launch = kind === SpringKind.UP ? new Vec2(0, -1) : spring.launchVelocity(player).normalized();
        expect(drawn.dot(launch), `drawn ${drawn}, launches ${launch}`).toBeGreaterThan(0.99);
      });
    }
  }
});
