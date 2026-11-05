// Set pieces (src/levels/objects/setpieces): bumper, crumble ledge, roll
// tube, vanishing and timed platforms, the void zone and their registry keys.

import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/core/game_state';
import type { Player } from '../../src/player/player';
import type { Node2D } from '../../src/runtime/node';
import { Vec2 } from '../../src/runtime/vec2';
import { LevelTypes } from '../../src/levels/common/level_loader';
import { Props } from '../../src/levels/common/props';
import { Bumper } from '../../src/levels/objects/setpieces/bumper';
import { CrumbleLedge, CrumblePhase } from '../../src/levels/objects/setpieces/crumble_ledge';
import { RollTube } from '../../src/levels/objects/setpieces/roll_tube';
import { NATURAL_STYLE, NEON_STYLE, styleFor } from '../../src/levels/objects/setpieces/style';
import { TimedPhase, TimedPlatform } from '../../src/levels/objects/setpieces/timed_platform';
import { VanishingPlatform, VanishPhase } from '../../src/levels/objects/setpieces/vanishing_platform';
import { VoidZone } from '../../src/levels/objects/setpieces/void_zone';
import { registerSetPieces, SETPIECE } from '../../src/levels/registry_setpieces';
import { Gfx } from '../../src/runtime/gfx';
import { addFloor, newWorld, press, release, settle, spawnPlayer, step } from '../helpers/world';

type Placeable = Node2D & { applyProps?(p: Props): void };

let world: Node2D;

function place<T extends Placeable>(node: T, at: Vec2, props: Record<string, unknown> = {}): T {
  node.applyProps?.(Props.of(props));
  node.position = at;
  world.addChild(node);
  return node;
}

/** A world with a floor at y = 0 (or none) and Sproto with his feet at `feet`. */
function setup(feet: Vec2, floor = true): Player {
  world = newWorld();
  if (floor) addFloor(world);
  const player = spawnPlayer(world, feet);
  return player;
}

beforeEach(() => {
  GameState.resetGame();
});

describe('registry', () => {
  it('registers every set piece under hpos://setpieces/', () => {
    registerSetPieces();
    for (const key of Object.values(SETPIECE)) {
      expect(key.startsWith('hpos://setpieces/')).toBe(true);
      expect(LevelTypes.has(key)).toBe(true);
    }
  });

  it('neon in Zone 4, natural elsewhere', () => {
    expect(styleFor('z4_neon_rush_remix')).toBe(NEON_STYLE);
    expect(styleFor('z1_retro_rush_hills')).toBe(NATURAL_STYLE);
    expect(styleFor('')).toBe(NATURAL_STYLE);
  });
});

describe('bumper', () => {
  it('bounces Sproto away from its centre at 7 px/frame and scores 10', () => {
    const player = setup(Vec2.ZERO);
    const bumper = place(new Bumper(), new Vec2(60, -19), { art_zone: 'z4_neon_rush_remix' });
    settle(player, Vec2.ZERO);
    player.groundSpeed = 3;
    press('move_right');
    let launched: Vec2 | null = null;
    player.stateChanged.connect((_o, next) => {
      if (next === 'spring' && !launched) launched = player.velocity;
    });
    for (let i = 0; i < 60 && !launched; i++) step(1);
    release('move_right');
    expect(launched).not.toBeNull();
    const v = launched! as Vec2;
    expect(v.length()).toBeCloseTo(Bumper.SPEED, 1);
    expect(v.x).toBeLessThan(0); // he came from the left: sent back left
    expect(player.isAttacking()).toBe(false);
    expect(GameState.score).toBe(Bumper.SCORE);
    expect(bumper.squash()).toBeGreaterThan(0);
  });

  it('sends him straight up from below, down from above', () => {
    setup(Vec2.ZERO);
    const bumper = place(new Bumper(), new Vec2(0, -100));
    step(1);
    expect(bumper.bounceVelocity(new Vec2(0, -60)).y).toBeCloseTo(7, 5);
    expect(bumper.bounceVelocity(new Vec2(0, -140)).y).toBeCloseTo(-7, 5);
    expect(bumper.bounceVelocity(new Vec2(0, -100))).toEqual(new Vec2(0, -7));
  });

  it('scores at most 10 times, then keeps bouncing', () => {
    const player = setup(Vec2.ZERO);
    const bumper = place(new Bumper(), new Vec2(200, -100));
    settle(player, Vec2.ZERO);
    for (let i = 0; i < 14; i++) bumper.bounce(player);
    expect(bumper.bounces).toBe(14);
    expect(bumper.scored).toBe(Bumper.MAX_SCORED);
    expect(GameState.score).toBe(Bumper.SCORE * Bumper.MAX_SCORED);
  });

  it('ignores a dead player', () => {
    const player = setup(Vec2.ZERO);
    settle(player, Vec2.ZERO);
    player.kill();
    place(new Bumper(), player.globalPosition);
    step(3);
    expect(GameState.score).toBe(0);
  });
});

describe('crumble ledge', () => {
  it('shakes for 30 frames after a landing, falls, and comes back after 5 s away', () => {
    const player = setup(new Vec2(32, -200));
    const ledge = place(new CrumbleLedge(), new Vec2(0, -200), { size: new Vec2(64, 16) });
    settle(player, new Vec2(32, -200));
    expect(player.grounded).toBe(true);
    expect(player.support).toBe(ledge);
    const home = ledge.position;
    // It starts shaking on the landing tick and holds still while it does.
    let shakeTicks = 0;
    while (ledge.phase === CrumblePhase.SHAKING || ledge.phase === CrumblePhase.IDLE) {
      step(1);
      if (ledge.phase === CrumblePhase.SHAKING) {
        shakeTicks += 1;
        expect(ledge.position).toEqual(home);
      }
      if (shakeTicks > 200) break;
    }
    expect(shakeTicks).toBeGreaterThanOrEqual(CrumbleLedge.SHAKE_FRAMES - 4);
    expect(shakeTicks).toBeLessThanOrEqual(CrumbleLedge.SHAKE_FRAMES);
    expect(ledge.phase).toBe(CrumblePhase.FALLING);
    const y0 = player.globalPosition.y;
    step(20);
    expect(ledge.position.y).toBeGreaterThan(home.y + 10);
    expect(player.globalPosition.y).toBeGreaterThan(y0 + 10); // carried or falling with it
    // Off screen (no camera: 480 px down), then away for 5 s.
    for (let i = 0; i < 200 && ledge.phase === CrumblePhase.FALLING; i++) step(1);
    expect(ledge.phase).toBe(CrumblePhase.AWAY);
    expect(ledge.isSolid).toBe(false);
    step(CrumbleLedge.RETURN_FRAMES - 2);
    expect(ledge.phase).toBe(CrumblePhase.AWAY);
    step(3);
    expect(ledge.phase).toBe(CrumblePhase.IDLE);
    expect(ledge.position).toEqual(home);
    expect(ledge.isSolid).toBe(true);
  });

  it('a jump-through ledge: jumping up through it does not trigger it', () => {
    const player = setup(new Vec2(32, 0));
    const ledge = place(new CrumbleLedge(), new Vec2(0, -60), { size: new Vec2(64, 16) });
    settle(player, new Vec2(32, 0));
    press('jump');
    step(12);
    release('jump');
    step(2);
    expect(ledge.phase).toBe(CrumblePhase.IDLE);
  });
});

describe('roll tube', () => {
  it('curls him into a roll at 6 px/frame or more inside', () => {
    const player = setup(Vec2.ZERO);
    const tube = place(new RollTube(), new Vec2(80, 0), { length: 256, height: 40 });
    settle(player, Vec2.ZERO);
    player.groundSpeed = 2;
    press('move_right');
    for (let i = 0; i < 120 && player.globalPosition.x < 100; i++) step(1);
    release('move_right');
    let inside = 0;
    for (let i = 0; i < 60 && player.globalPosition.x < 80 + 256 - 8; i++) {
      step(1);
      if (player.globalPosition.x > 92) {
        inside += 1;
        expect(player.isBall).toBe(true);
        expect(player.state).toBe('roll');
        expect(player.groundSpeed).toBeGreaterThanOrEqual(RollTube.MIN_SPEED - 0.001);
      }
    }
    expect(inside).toBeGreaterThan(5);
    expect(tube.wayFor(player)).toBe(1);
  });

  it('keeps the way he entered, or forces its own direction', () => {
    const player = setup(new Vec2(400, 0));
    place(new RollTube(), new Vec2(100, 0), { length: 200 });
    settle(player, new Vec2(400, 0));
    player.groundSpeed = -4;
    for (let i = 0; i < 50; i++) step(1);
    expect(player.isBall).toBe(true);
    expect(player.groundSpeed).toBeLessThanOrEqual(-RollTube.MIN_SPEED + 0.001);

    const p2 = setup(new Vec2(150, 0));
    place(new RollTube(), new Vec2(100, 0), { length: 200, direction: -1 });
    settle(p2, new Vec2(150, 0));
    p2.groundSpeed = 2;
    step(2);
    expect(p2.groundSpeed).toBeLessThanOrEqual(-RollTube.MIN_SPEED + 0.001);
  });

  it('leaves a hurt player alone', () => {
    const player = setup(new Vec2(150, 0));
    place(new RollTube(), new Vec2(100, 0), { length: 200 });
    settle(player, new Vec2(150, 0));
    GameState.addTickets(5);
    player.hurt(new Vec2(100, -19));
    step(1);
    expect(player.state).toBe('hurt');
  });
});

describe('vanishing platform', () => {
  it('blinks (telegraph) before it vanishes, he falls, and it comes back on its timer', () => {
    const player = setup(new Vec2(48, -200));
    const plat = place(new VanishingPlatform(), new Vec2(0, -200), { size: new Vec2(96, 12), on_frames: 120, off_frames: 60 });
    settle(player, new Vec2(48, -200));
    expect(player.support).toBe(plat);
    expect(plat.blinkFrames).toBeGreaterThanOrEqual(21); // >= 0.35 s
    let blinkTicks = 0;
    let goneAt = -1;
    for (let i = 0; i < 200; i++) {
      step(1);
      if (plat.phase === VanishPhase.BLINK) {
        blinkTicks += 1;
        expect(plat.isSolid).toBe(true);
      }
      if (plat.phase === VanishPhase.GONE) {
        goneAt = i;
        break;
      }
    }
    expect(blinkTicks).toBeGreaterThanOrEqual(plat.blinkFrames - 5);
    expect(goneAt).toBeGreaterThan(0);
    expect(plat.isSolid).toBe(false);
    const y = player.globalPosition.y;
    step(10);
    expect(player.grounded).toBe(false);
    expect(player.globalPosition.y).toBeGreaterThan(y);
    for (let i = 0; i < 120 && !plat.isSolid; i++) step(1);
    expect(plat.isSolid).toBe(true);
    expect(plat.phase).toBe(VanishPhase.SOLID);
  });

  it('never comes back inside a player', () => {
    const player = setup(new Vec2(48, -194), false);
    const plat = place(new VanishingPlatform(), new Vec2(0, -200), { size: new Vec2(96, 12), on_frames: 30, off_frames: 30, offset: 30 });
    step(2);
    expect(plat.isSolid).toBe(false);
    player.freeze(true);
    player.globalPosition = new Vec2(48, -200);
    for (let i = 0; i < 40; i++) step(1);
    expect(plat.isSolid).toBe(false); // due back, but he is in its space
    expect(plat.phase).toBe(VanishPhase.APPEARING);
    player.globalPosition = new Vec2(48, -400);
    step(2);
    expect(plat.isSolid).toBe(true);
  });

  it('offsets ripple a row', () => {
    setup(Vec2.ZERO);
    const a = place(new VanishingPlatform(), new Vec2(0, -100), { on_frames: 60, off_frames: 60, offset: 0 });
    const b = place(new VanishingPlatform(), new Vec2(120, -100), { on_frames: 60, off_frames: 60, offset: 60 });
    step(2);
    expect(a.phaseAt(10)).toBe(VanishPhase.SOLID);
    expect(b.phaseAt(10)).toBe(VanishPhase.GONE);
  });
});

describe('timed platform', () => {
  it('counts down after a landing, telegraphs, switches off and comes back', () => {
    const player = setup(new Vec2(48, -200));
    const plat = place(new TimedPlatform(), new Vec2(0, -200), { size: new Vec2(96, 12), countdown_frames: 60, off_frames: 90 });
    expect(plat.phase).toBe(TimedPhase.READY);
    settle(player, new Vec2(48, -200));
    step(1);
    expect(plat.phase).toBe(TimedPhase.COUNTING);
    expect(plat.warnFrames).toBeGreaterThanOrEqual(21);
    for (let i = 0; i < 70 && plat.phase === TimedPhase.COUNTING; i++) step(1);
    expect(plat.phase).toBe(TimedPhase.OFF);
    step(10);
    expect(player.grounded).toBe(false);
    for (let i = 0; i < 100 && plat.phase === TimedPhase.OFF; i++) step(1);
    expect(plat.phase).toBe(TimedPhase.READY);
    expect(plat.isSolid).toBe(true);
  });

  it('shuttles along its travel, carrying him', () => {
    const player = setup(new Vec2(48, -200));
    const plat = place(new TimedPlatform(), new Vec2(0, -200), {
      size: new Vec2(96, 12),
      travel: new Vec2(160, 0),
      period_frames: 240,
      countdown_frames: 600,
    });
    settle(player, new Vec2(48, -200));
    const x0 = player.globalPosition.x;
    step(120);
    expect(plat.position.x).toBeGreaterThan(150);
    expect(player.globalPosition.x - x0).toBeGreaterThan(140);
    expect(player.grounded).toBe(true);
  });
});

describe('drawing', () => {
  /** A Canvas2D stand-in that accepts every call and counts them. */
  function stubGfx(): { g: Gfx; calls: () => number } {
    let n = 0;
    const fn = (): void => {
      n += 1;
    };
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : fn),
      set: (t, k, v) => {
        t[k as string] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { g: new Gfx(ctx), calls: () => n };
  }

  it('every set piece draws in both styles and every phase without throwing', () => {
    for (const zone of ['z4_neon_rush_remix', 'z1_retro_rush_hills']) {
      const player = setup(new Vec2(48, -200));
      const { g, calls } = stubGfx();
      const pieces = [
        place(new Bumper(), new Vec2(300, -100), { art_zone: zone }),
        place(new CrumbleLedge(), new Vec2(0, -200), { art_zone: zone, size: new Vec2(96, 16) }),
        place(new RollTube(), new Vec2(400, 0), { art_zone: zone, length: 200 }),
        place(new VanishingPlatform(), new Vec2(600, -100), { art_zone: zone, on_frames: 40, off_frames: 40 }),
        place(new TimedPlatform(), new Vec2(800, -100), { art_zone: zone, countdown_frames: 40, off_frames: 40 }),
        place(new VoidZone(), new Vec2(900, 100), { art_zone: zone }),
      ];
      settle(player, new Vec2(48, -200));
      (pieces[0] as Bumper).bounce(player);
      for (let i = 0; i < 160; i++) {
        step(1);
        for (const p of pieces) p.draw(g);
      }
      expect(calls()).toBeGreaterThan(1000);
    }
  });
});

describe('void zone', () => {
  it('kills a falling player', () => {
    const player = setup(new Vec2(0, -100), false);
    place(new VoidZone(), new Vec2(-64, 0), { size: new Vec2(128, 64) });
    step(60);
    expect(player.state).toBe('dead');
  });
});
