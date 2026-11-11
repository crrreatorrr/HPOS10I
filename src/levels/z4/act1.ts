// Neon Rush Remix, Act 1 ('level:z4_neon_rush_remix/act1'), built in code.
//
// D7 (docs/LEVELS.md): about 75 screens, 1.3 enemies per screen (T2 30 % /
// T3 40 % / T4 30 %), R5 (several routes with very different risk and a
// forced reverse run), 6 checkpoints, about 3 tickets per screen. New idea:
// Zone 1's ideas remixed at speed, reverse runs (right to left) and
// vanishing neon platforms.
//   Opening (teach): loops, a booster, an up spring, bumpers, a first roll
//     tube and vanishing platforms first over solid ground (a miss only
//     drops you to the floor), then over a short pit with nothing near.
//     T2 and T3 enemies only.
//   Middle (test): the three-deck run (low ground, a mid deck and a high
//     deck bridged by vanishing platforms: the fast route), the reverse run
//     (a zigzag hall: a spring throws you onto a floor that runs LEFT with a
//     booster, then up again to the right), the spring gate, a quarter pipe,
//     roll tubes under sniper posts, vanishing runs over pits. All tiers.
//   Finale (twist): a checkpoint, then vanishing platforms over pits with
//     divers above, bumpers, roll tubes and a loop at speed, 1.4x the
//     enemies with more T4 (snipers and droppers), the goal.
// Fairness: every vanishing platform blinks before it goes (>= 0.35 s) and
// each row ripples so a runner following it finds every one solid (checked
// by route_check); a miss on the opening's teaching run lands on the floor;
// no enemy within a screen of a checkpoint, a spring landing or a loop
// exit; a run-up before every climb; no steep hill after a checkpoint.

import { Vec2 } from '../../runtime/vec2';
import type { LevelData } from '../common/level_loader';
import { KEYS, type EnemyKind, type LevelBuilder } from '../builder/level_builder';
import { z4Builder } from './zone';

export function buildAct1(): LevelBuilder {
  const b = z4Builder('NeonRushRemixAct1', -720);
  const left = { facing: -1 };
  /** A short guarded flat: one enemy 136 px in (flyers `up` px over the floor). */
  const G = (kind: EnemyKind, up = 0, props: Record<string, unknown> = {}): void => b.guard(kind, 200, 96, up, props, 1);
  /** A guarded flat with a second enemy over it (a flyer `up2` px up, 96 px further). */
  const P = (kind: EnemyKind, air: EnemyKind, up2: number, props: Record<string, unknown> = {}): void => {
    b.guard(kind, 256, 104, 0, props, 2);
    b.enemy(air, new Vec2(b.x - 80, b.ground - up2));
  };
  /** A low hill with an enemy past its foot. */
  const H = (kind: EnemyKind, rise = 32, up = 0, props: Record<string, unknown> = {}): void =>
    b.hill(rise, 64, { enemy: kind, props, runAfter: 64, enemyUp: up });

  // --- Opening: teach -------------------------------------------------------------
  b.start(384);
  H('chaser');
  b.loop(true, 320); // Zone 1's loop, in neon
  b.flat(320, 64, 192);
  b.vanishingRun(4, { overPit: false, up: 56, onFrames: 180, offFrames: 90, ripple: 30 }); // teach: the floor below
  b.flat(224);
  b.fluidPit(96, 'lava'); // first well: a short, marked jump with clear banks
  b.flat(192);
  G('floater', 44);
  b.bumperRow(320, 3); // bumpers hover over the run line: only a jump meets them
  H('pellet', 32, 0, left);
  G('chaser');
  H('spike', 48);
  G('armored');
  b.flat(336, 64, 192);
  b.checkpoint(); // 1
  b.upSpring(128, 320);
  b.flat(256, 96, 160);
  b.rollTunnel(320); // teach the roll tube: nothing inside
  G('chaser');
  G('armored');
  b.vanishingRun(3, { onFrames: 180, offFrames: 60, ripple: 24 }); // first over a pit, nothing near
  H('spike');
  G('pellet', 0, left);
  b.descent(128);
  G('floater', 44);
  H('armored');
  G('diver', 150);
  G('chaser');
  H('spike');
  G('pellet', 0, left);
  G('armored');
  b.flat(336, 64, 192);
  b.checkpoint(); // 2

  // --- Middle: test ----------------------------------------------------------------
  b.loop(true, 384);
  b.flat(320, 64, 192);
  P('spike', 'diver', 150);
  G('chaser');
  b.rollTunnel(320);
  b.enemy('sniper', new Vec2(b.x - 48, b.ground - 64)); // on the terrace top: roll under it
  G('armored');
  b.flat(256, 64, 192);
  // The three-deck run: low (enemies), mid (pickups, floaters, droppers below it), high (the fast way).
  const d1 = b.decks(3072, { highGaps: 1, midGaps: 1 });
  b.enemy('chaser', new Vec2(d1.x0 + 480, d1.low), { patrol_distance: 64 });
  b.enemy('dropper', new Vec2(d1.x0 + 760, d1.mid + 30));
  b.enemy('armored', new Vec2(d1.x0 + 960, d1.low), { patrol_distance: 64 });
  b.enemy('floater', new Vec2(d1.x0 + 1100, d1.mid - 40));
  b.enemy('sniper', new Vec2(d1.x0 + 1300, d1.high));
  b.enemy('spike', new Vec2(d1.x0 + 1500, d1.low), { patrol_distance: 48 });
  b.enemy('diver', new Vec2(d1.x0 + 1700, d1.high - 130));
  b.setPiece(KEYS.CEILING_RAM, new Vec2(d1.x0 + 1184, d1.mid + 12), {
    width: 48, height: 20, travel: 48, wake_radius: 160, telegraph_seconds: 1,
  }); // under the middle deck; the two upper paths bypass it. It starts its rest and warning only when the player comes near.
  b.enemy('dropper', new Vec2(d1.x0 + 1800, d1.mid + 30));
  b.enemy('pellet', new Vec2(d1.x0 + 2100, d1.low), left);
  b.enemy('floater', new Vec2(d1.x0 + 2300, d1.mid - 40));
  b.enemy('sniper', new Vec2(d1.x0 + 2400, d1.high));
  b.enemy('chaser', new Vec2(d1.x0 + 2600, d1.low), { patrol_distance: 48 });
  b.enemy('spike', new Vec2(d1.x0 + 2850, d1.low), { patrol_distance: 32 });
  b.enemy('floater', new Vec2(d1.x0 + 1450, d1.mid - 40));
  b.enemy('dropper', new Vec2(d1.x0 + 2500, d1.mid + 30));
  b.setPiece(KEYS.BUMPER, new Vec2(d1.x0 + 700, d1.high - 72));
  b.setPiece(KEYS.BUMPER, new Vec2(d1.x0 + 2000, d1.high - 72));
  b.flat(336, 64, 192);
  b.checkpoint(); // 3
  // The reverse run: a zigzag hall up two floors, the first one running LEFT.
  const z = b.zigzag(2, 2048);
  const rev = z[1]!;
  b.enemy('chaser', new Vec2(rev.x0 + 200, rev.y), { patrol_distance: 48 });
  b.enemy('pellet', new Vec2(rev.x0 + 520, rev.y), { facing: 1 });
  b.enemy('dropper', new Vec2(z[0]!.x0 + 640, rev.y + 16 + 40));
  b.enemy('armored', new Vec2(z[0]!.x0 + 520, z[0]!.y), { patrol_distance: 48 });
  b.setPiece(KEYS.BUMPER, new Vec2(rev.x0 + 360, rev.y - 72));
  b.enemy('floater', new Vec2(z[2]!.x1 - 300, z[2]!.y - 44));
  b.enemy('spike', new Vec2(z[2]!.x1 - 120, z[2]!.y), { patrol_distance: 32 });
  b.enemy('diver', new Vec2(z[2]!.x1 - 520, z[2]!.y - 150));
  b.enemy('dropper', new Vec2(z[0]!.x0 + 1300, rev.y + 16 + 40));
  G('sniper');
  b.vanishingRun(4, { onFrames: 150, offFrames: 90, ripple: 24 });
  P('chaser', 'floater', 44);
  H('diver', 32, 150);
  P('armored', 'diver', 150);
  b.descent(96);
  b.springGate();
  H('dropper', 48, 140);
  G('sniper');
  b.flat(336, 64, 192);
  b.checkpoint(); // 4
  b.flat(336, 64, 192);
  G('diver', 150);
  G('pellet', 0, left);
  b.quarterPipe(64, 320); // onto the upper level
  b.flat(448, 64, 160);
  P('sniper', 'diver', 150);
  H('chaser', 48);
  b.rollTunnel(384);
  b.enemy('dropper', new Vec2(b.x + 128, b.ground - 140));
  G('armored');
  b.vanishingRun(5, { onFrames: 150, offFrames: 90, ripple: 22, gap: 56 });
  G('spike');
  const d2 = b.decks(2048, { highGaps: 1, midGaps: 1 });
  b.enemy('armored', new Vec2(d2.x0 + 420, d2.low), { patrol_distance: 64 });
  b.enemy('dropper', new Vec2(d2.x0 + 620, d2.mid + 30));
  b.enemy('sniper', new Vec2(d2.x0 + 900, d2.high));
  b.enemy('pellet', new Vec2(d2.x0 + 1050, d2.low), left);
  b.enemy('floater', new Vec2(d2.x0 + 1200, d2.mid - 40));
  b.enemy('spike', new Vec2(d2.x0 + 1380, d2.low), { patrol_distance: 32 });
  b.enemy('diver', new Vec2(d2.x0 + 1000, d2.high - 130));
  b.enemy('chaser', new Vec2(d2.x0 + 1750, d2.low), { patrol_distance: 32 });
  G('diver', 150);
  b.descent(64);
  b.flat(336, 64, 192);
  b.checkpoint(); // 5: the finale starts

  // --- Finale: twist ---------------------------------------------------------------
  b.flat(336, 64, 192);
  G('chaser');
  b.vanishingRun(4, { onFrames: 140, offFrames: 90, ripple: 24 });
  b.enemy('diver', new Vec2(b.x + 128, b.ground - 150));
  G('sniper');
  H('armored', 48);
  G('dropper', 140);
  b.bumperRow(320, 2);
  P('spike', 'diver', 150);
  b.rollTunnel(320);
  b.enemy('sniper', new Vec2(b.x - 48, b.ground - 64));
  G('diver', 150);
  P('pellet', 'dropper', 140, left);
  G('dropper', 140);
  P('armored', 'diver', 150);
  G('sniper');
  b.flat(336, 64, 192);
  b.checkpoint(); // 6
  b.flat(336, 64, 192);
  G('sniper');
  G('dropper', 140);
  b.vanishingRun(5, { onFrames: 140, offFrames: 90, ripple: 22, gap: 56 });
  b.enemy('diver', new Vec2(b.x + 128, b.ground - 150));
  P('armored', 'diver', 150);
  G('diver', 150);
  H('spike');
  P('sniper', 'dropper', 140);
  G('floater', 44);
  G('dropper', 140);
  H('chaser', 48);
  P('sniper', 'diver', 150);
  G('armored');
  P('spike', 'dropper', 140);
  G('dropper', 140);
  G('sniper');
  b.goal(320, 384);
  return b;
}

export function act1Data(): LevelData {
  return buildAct1().build();
}
