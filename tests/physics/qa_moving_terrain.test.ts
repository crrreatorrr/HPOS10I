// QA guards for moving terrain (port of tests/qa/test_moving_terrain.gd,
// docs/CONTRACTS.md "Moving terrain"; checklist 01-physics section M). QA
// builds its own platforms to the contract: moved in physicsProcess before the
// player, exposing platformDelta().

import { afterEach, describe, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import { MovingBody } from '../../src/levels/common/moving_body';
import type { Player } from '../../src/player/player';
import { Input, type Action } from '../../src/runtime/input';
import { Rng } from '../../src/runtime/math';
import type { Node2D } from '../../src/runtime/node';
import { rectShape } from '../../src/runtime/physics';
import { Rect2, Vec2 } from '../../src/runtime/vec2';
import { checked } from '../helpers/check';
import { qa } from '../helpers/qa';
import { centreInTerrain, feetY, press, release, releaseAll, step } from '../helpers/world';

/** Moves `velocity` px per tick; reverses every `reverseTicks` (0 = never), stops after `stopAfter` ticks (0 = never). */
class Mover extends MovingBody {
  tick = 0;

  constructor(
    readonly size: Vec2,
    public velocity: Vec2,
    readonly reverseTicks = 0,
    readonly stopAfter = 0,
  ) {
    super('Mover');
    this.addShape(rectShape(size));
  }

  override physicsProcess(): void {
    this.tick += 1;
    if (this.stopAfter > 0 && this.tick > this.stopAfter) this.velocity = Vec2.ZERO;
    else if (this.reverseTicks > 0 && this.tick % this.reverseTicks === 0) this.velocity = this.velocity.neg();
    this.moveTo(this.targetPosition().add(this.velocity));
  }

  top(): number {
    return this.globalPosition.y - this.size.y / 2;
  }
}

afterEach(() => {
  GameState.tickets = 0;
  releaseAll();
});

/** A moving platform: `rect` in world space (its top edge is the walkable surface). Added before the player, so it moves first. */
function platform(w: Node2D, rect: Rect2, velocity: Vec2, reverseTicks = 0, stopAfter = 0): Mover {
  const body = new Mover(rect.size, velocity, reverseTicks, stopAfter);
  body.position = rect.center;
  w.addChild(body);
  return body;
}

const dead = (p: Player) => p.state === 'dead';

/**
 * Rides a platform that starts moving once Sproto stands on it. Measured at
 * the end of each tick (what is drawn): his offset from the platform must not
 * change, and his feet stay on its top.
 */
function ride(velocity: Vec2, reverseTicks: number, ticks: number): { dx: number; feet: number; airborne: number; gsp: number; inside: boolean } {
  const w = qa.world();
  const plat = platform(w, new Rect2(-120, 0, 240, 16), Vec2.ZERO, reverseTicks);
  const p = qa.spawn(w, Vec2.ZERO);
  step(5);
  plat.velocity = velocity;
  plat.tick = 0;
  step(2);
  const rel0 = p.globalPosition.sub(plat.globalPosition);
  let dx = 0;
  let feet = 0;
  let airborne = 0;
  let gsp = 0;
  for (let i = 0; i < ticks; i++) {
    step(1);
    dx = Math.max(dx, p.globalPosition.sub(plat.globalPosition).sub(rel0).length());
    feet = Math.max(feet, Math.abs(feetY(p) - plat.top()));
    if (!p.grounded) airborne += 1;
    gsp = Math.max(gsp, Math.abs(p.groundSpeed));
  }
  return { dx, feet, airborne, gsp, inside: centreInTerrain(p) };
}

describe('QA moving terrain', () => {
  it(
    'M1: ride horizontal with reversals',
    checked((c) => {
      const r = ride(new Vec2(2, 0), 60, 240);
      c.true(r.dx <= 0.01, `carried exactly with the platform, also at reversals (drift ${r.dx})`);
      c.eq(r.airborne, 0, 'stays grounded through reversals');
      c.true(r.gsp <= 0.01, "the platform's speed is not added to ground speed");
    }),
  );

  it(
    'M2: ride vertical',
    checked((c) => {
      for (const v of [new Vec2(0, -2), new Vec2(0, 2), new Vec2(0, -3)]) {
        const r = ride(v, 60, 180);
        c.true(r.feet <= 0.5, `feet on the surface riding ${v} (${r.feet})`);
        c.eq(r.airborne, 0, `grounded riding ${v}`);
        c.true(!r.inside, `never inside the platform riding ${v}`);
      }
    }),
  );

  it(
    'M3: ride diagonal',
    checked((c) => {
      const r = ride(new Vec2(2, -1), 50, 200);
      c.true(r.dx <= 0.01 && r.feet <= 0.5 && r.airborne === 0, `carried on both axes (drift ${r.dx}, feet ${r.feet}, airborne ${r.airborne})`);
    }),
  );

  it(
    'M4: platform dropping faster than gravity',
    checked((c) => {
      for (const speed of [8, 12]) {
        const w = qa.world();
        qa.floorAt(w, -2000, 2000, 400);
        const plat = platform(w, new Rect2(-120, 0, 240, 16), new Vec2(0, speed), 0, 20);
        const p = qa.spawn(w, Vec2.ZERO);
        let below = false;
        let nan = false;
        let groundedAt = -1;
        for (let i = 0; i < 80; i++) {
          step(1);
          if (feetY(p) > plat.top() + 1 && Math.abs(p.globalPosition.x) < 110) below = true;
          if (Number.isNaN(p.globalPosition.x) || Number.isNaN(p.globalPosition.y)) nan = true;
          if (i > 20 && groundedAt < 0 && p.grounded) groundedAt = i - 20;
        }
        c.true(!below && !nan, `never below the dropping surface (${speed} px/f)`);
        c.true(groundedAt >= 0 && groundedAt <= 30, `lands within 30 ticks of the stop (${speed} px/f, ${groundedAt})`);
      }
    }),
  );

  it(
    'M5: jumping off keeps its own speed',
    checked((c) => {
      const w = qa.world();
      platform(w, new Rect2(-400, 0, 800, 16), new Vec2(2, 0));
      const p = qa.spawn(w, Vec2.ZERO);
      step(20);
      press('jump');
      step(6);
      release('jump');
      let vx = 0;
      for (let i = 0; i < 10; i++) {
        step(1);
        if (!p.grounded) vx = p.velocity.x;
      }
      c.true(Math.abs(vx) <= 0.05, `the platform's speed is not added on jumping off (got ${vx})`);
    }),
  );

  it(
    'M7: conveyors both ways',
    checked((c) => {
      for (const speed of [2, -2]) {
        const w = qa.world();
        const belt = qa.rect(w, new Rect2(-600, 0, 1200, 300));
        belt.setMeta('conveyor_speed', speed);
        const p = qa.spawn(w, Vec2.ZERO);
        const x0 = p.globalPosition.x;
        let maxGsp = 0;
        for (let i = 0; i < 60; i++) {
          step(1);
          maxGsp = Math.max(maxGsp, Math.abs(p.groundSpeed));
        }
        c.near(p.globalPosition.x - x0, speed * 60, 2 * Math.abs(speed) + 0.5, `standing on a ${speed} px/f conveyor`);
        c.true(maxGsp <= 0.01, 'conveyor speed is not ground speed');
      }
    }),
  );

  it(
    'M8: crush from above kills at the right gap',
    checked((c) => {
      const w = qa.world();
      qa.floorAt(w);
      // The platform's bottom starts 60 px above the floor and closes at 1 px/f.
      const plat = platform(w, new Rect2(-100, -60 - 40, 200, 40), new Vec2(0, 1));
      const p = qa.spawn(w, Vec2.ZERO);
      let gapAtDeath = -1;
      for (let i = 0; i < 70; i++) {
        step(1);
        const gap = -(plat.top() + 40); // floor is y = 0
        if (dead(p)) {
          gapAtDeath = gap;
          break;
        }
      }
      c.true(gapAtDeath > 0, 'crushed');
      c.true(gapAtDeath < 38 && gapAtDeath > 34, `dies as the gap gets smaller than his hitbox, not earlier (${gapAtDeath})`);
    }),
  );

  it(
    'M9: no false kill when a platform stops above the head',
    checked((c) => {
      const w = qa.world();
      qa.floorAt(w);
      // Closes from 60 px to 39 px (1 px above a 38 px standing hitbox), then stops.
      platform(w, new Rect2(-100, -60 - 40, 200, 40), new Vec2(0, 1), 0, 21);
      const p = qa.spawn(w, Vec2.ZERO);
      step(90);
      c.true(!dead(p), 'a platform stopping 1 px above his head never kills');
      c.true(!centreInTerrain(p), 'and never pushes him into the floor');
    }),
  );

  it(
    'M8/M9: side crush and side push',
    checked((c) => {
      // Into a wall: dies when the gap is narrower than his body.
      let w = qa.world();
      qa.floorAt(w);
      qa.rect(w, new Rect2(40, -200, 100, 200));
      platform(w, new Rect2(-140, -100, 60, 100), new Vec2(1.5, 0));
      let p = qa.spawn(w, Vec2.ZERO);
      let died = false;
      for (let i = 0; i < 120; i++) {
        step(1);
        if (dead(p)) {
          died = true;
          break;
        }
      }
      c.true(died, 'a side pusher pressing him into a wall kills');
      // Into open space: pushed or carried, never killed.
      w = qa.world();
      qa.floorAt(w);
      platform(w, new Rect2(-140, -100, 60, 100), new Vec2(1.5, 0));
      p = qa.spawn(w, Vec2.ZERO);
      step(120);
      c.true(!dead(p), 'a side pusher with open space ahead never kills');
      c.true(!centreInTerrain(p), 'and never ends up inside it');
    }),
  );

  it(
    'M12: platform fuzz',
    checked((c) => {
      for (const seed of [1, 2, 3]) {
        const rng = new Rng(seed);
        const w = qa.world();
        qa.floorAt(w, -3000, 3000, 0);
        platform(w, new Rect2(-600, -80, 160, 16), new Vec2(2, 0), 90);
        platform(w, new Rect2(-300, -60, 120, 16), new Vec2(0, -2), 50);
        platform(w, new Rect2(-100, -120, 120, 16), new Vec2(2, -1), 60);
        platform(w, new Rect2(150, -100, 120, 16), new Vec2(0, 9), 12);
        const belt = qa.rect(w, new Rect2(350, -10, 300, 10));
        belt.setMeta('conveyor_speed', -2);
        const crusher = platform(w, new Rect2(800, -120, 120, 60), new Vec2(0, 1.5), 50);
        const p = qa.spawn(w, new Vec2(-800, 0));
        const actions: Action[] = ['move_left', 'move_right', 'move_down', 'jump'];
        let bad = '';
        for (let i = 0; i < 1500; i++) {
          if (i % 6 === 0) {
            for (const a of actions) {
              if (rng.randf() < 0.3) {
                if (Input.isActionHeldNow(a)) release(a);
                else press(a);
              }
            }
          }
          step(1);
          const pos = p.globalPosition;
          if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) {
            bad = `NaN at tick ${i}`;
            break;
          }
          if (dead(p)) {
            if (Math.abs(pos.x - crusher.globalPosition.x) > 120) bad = `died outside the crusher at ${pos}, tick ${i}`;
            break;
          }
          if (centreInTerrain(p)) {
            bad = `inside terrain at ${pos}, tick ${i}`;
            break;
          }
        }
        releaseAll();
        c.eq(bad, '', `platform fuzz seed ${seed}`);
      }
    }),
  );
});
