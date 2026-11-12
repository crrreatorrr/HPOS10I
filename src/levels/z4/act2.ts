// Neon Rush Remix, Act 2 ('level:z4_neon_rush_remix/act2'), built in code.
// The act before the zone's boss (The Executive): its goal sign is the
// arena gate.
//
// D8 (docs/LEVELS.md): about 85 screens, 1.4 enemies per screen (T3 50 % /
// T4 50 %), R5, 9 checkpoints, about 3 tickets per screen. New idea: a
// spiral ascent to the rooftop - everything combined, crossfire, timed
// platforms over pits.
//   Opening (teach): timed platforms and crumbling ledges first hovering
//     over solid ground (a miss lands on the floor), a loop, bumpers, an up
//     spring, a roll tube; then timed platforms over short pits with nothing
//     near. T3 enemies only.
//   Middle (test): crossfire (snipers on terraces at both ends of a run,
//     roll under them), the spiral ascent (a zigzag tower up four floors,
//     two of them running LEFT), the three-deck run with vanishing gaps,
//     shuttling timed platforms, crumble runs over pits, a quarter pipe and
//     up springs climbing towards the roof. T3 and T4.
//   Finale (the boss approach gauntlet): opens with a checkpoint; every
//     mechanic of the zone at its highest density - timed, crumbling and
//     vanishing platforms over the void, a last two-floor zigzag up to the
//     rooftop, roll tubes under sniper posts, bumpers, a loop - with mostly
//     T4. It ends with a calm corridor holding a few tickets and a
//     checkpoint right outside the arena gate, so a failed boss attempt never
//     replays the gauntlet.
// Fairness: timed platforms count down visibly and blink (>= 0.35 s) before
// they switch off; crumbling ledges shake for 30 frames first; vanishing
// rows ripple so a runner following them finds each one solid (checked by
// route_check); pits high up end in a void zone, so a fall is quick; no
// enemy within a screen of a checkpoint, a spring landing or a loop exit; a
// run-up before every climb; no steep hill after a checkpoint.

import { Vec2 } from '../../runtime/vec2';
import type { LevelData } from '../common/level_loader';
import { KEYS, type EnemyKind, type LevelBuilder } from '../builder/level_builder';
import { z4Builder } from './zone';

export function buildAct2(): LevelBuilder {
  const b = z4Builder('NeonRushRemixAct2', -1200);
  /** A short guarded flat: one enemy 96 px in (flyers `up` px over the floor). */
  const G = (kind: EnemyKind, up = 0, props: Record<string, unknown> = {}): void => b.guard(kind, 200, 96, up, props, 1);
  /** A guarded flat with a second enemy over it (`up2` px up, 80 px from its end). */
  const P = (kind: EnemyKind, air: EnemyKind, up2: number, props: Record<string, unknown> = {}): void => {
    b.guard(kind, 256, 104, 0, props, 2);
    b.enemy(air, new Vec2(b.x - 80, b.ground - up2));
  };
  /** A low hill with an enemy past its foot. */
  const H = (kind: EnemyKind, rise = 32, up = 0, props: Record<string, unknown> = {}): void =>
    b.hill(rise, 64, { enemy: kind, props, runAfter: 64, enemyUp: up });
  /** A roll tube under a 64 px terrace with a sniper on its far end (roll under its line of fire). */
  const post = (length = 320): void => {
    b.rollTunnel(length);
    b.enemy('sniper', new Vec2(b.x - 48, b.ground - 64));
  };
  /** Flat run-in and a checkpoint (no enemy within a screen before it). */
  const CP = (): void => {
    b.flat(352, 160, 256);
    b.checkpoint();
  };
  /** The flat after a checkpoint (no enemy within a screen after it). */
  const AFTER = (): void => b.flat(336, 160, 256);
  /**
   * A second route over the guarded flats built by `section`: a jump-through
   * deck 80 px up (one jump from the floor) with a ticket every 96 px. It
   * passes over the ground pills and under the droppers, and ends with the
   * floor beneath it.
   */
  const OVER = (section: () => void): void => {
    const x0 = b.x;
    section();
    b.slab(x0 + 48, b.x - 48, b.ground - 80);
    for (let x = x0 + 96; x <= b.x - 96; x += 96) b.ticketAt(new Vec2(x, b.ground - 80 - 16));
  };

  // --- Opening: teach -------------------------------------------------------------
  b.start(384);
  H('armored');
  b.loop(true, 320);
  b.flat(320, 64, 192);
  b.timedPits(2, { overGround: 56 }); // teach: the countdown, with the floor below
  G('spike');
  b.crumbleRun(3, { overGround: 48 }); // teach: the shake, with the floor below
  G('diver', 150);
  H('spike');
  P('armored', 'diver', 150);
  G('spike');
  H('armored');
  P('spike', 'diver', 150);
  G('diver', 150);
  G('armored');
  CP(); // 1
  b.upSpring(128, 320);
  b.flat(256, 96, 160);
  b.rollTunnel(320);
  G('armored');
  b.timedPits(2, { pit: 192 }); // first over pits, nothing near
  H('spike');
  G('diver', 150);
  P('armored', 'diver', 150);
  G('spike');
  H('armored');
  P('spike', 'diver', 150);
  G('armored');

  // --- Middle: test ----------------------------------------------------------------
  b.loop(true, 384);
  b.flat(512, 64, 192); // a long run-out at loop speed before the void
  b.vanishingRun(4, { onFrames: 150, offFrames: 90, ripple: 24 });
  P('armored', 'diver', 150);
  CP(); // 2
  AFTER();
  // Crossfire: a run between two sniper posts.
  post();
  P('spike', 'dropper', 140);
  post();
  b.quarterPipe(64, 320);
  b.flat(448, 64, 160);
  G('sniper');
  b.crumbleRun(4);
  P('spike', 'diver', 150);
  OVER(() => P('armored', 'dropper', 140));
  b.flat(320, 64, 192);
  // The spiral ascent: a zigzag tower up four floors (1 and 3 run left).
  const z = b.zigzag(4, 1792);
  b.enemy('armored', new Vec2(z[0]!.x0 + 420, z[0]!.y), { patrol_distance: 48 });
  b.enemy('dropper', new Vec2(z[0]!.x0 + 820, z[1]!.y + 16 + 40));
  b.enemy('spike', new Vec2(z[1]!.x0 + 260, z[1]!.y), { patrol_distance: 32 });
  b.enemy('sniper', new Vec2(z[1]!.x0 + 620, z[1]!.y));
  b.enemy('dropper', new Vec2(z[1]!.x0 + 600, z[2]!.y + 16 + 40));
  b.setPiece(KEYS.BUMPER, new Vec2(z[1]!.x0 + 440, z[1]!.y - 72));
  b.enemy('armored', new Vec2(z[2]!.x0 + 780, z[2]!.y), { patrol_distance: 48 });
  b.enemy('diver', new Vec2(z[2]!.x0 + 1100, z[2]!.y - 150));
  b.enemy('sniper', new Vec2(z[3]!.x0 + 240, z[3]!.y));
  b.enemy('dropper', new Vec2(z[3]!.x0 + 700, z[4]!.y + 16 + 40));
  b.setPiece(KEYS.BUMPER, new Vec2(z[3]!.x0 + 480, z[3]!.y - 72));
  b.enemy('sniper', new Vec2(z[4]!.x1 - 160, z[4]!.y));
  b.enemy('diver', new Vec2(z[4]!.x1 - 520, z[4]!.y - 150));
  b.enemy('armored', new Vec2(z[2]!.x0 + 1250, z[2]!.y), { patrol_distance: 32 });
  b.enemy('dropper', new Vec2(z[2]!.x0 + 1100, z[3]!.y + 16 + 40));
  CP(); // 3: on top of the tower
  // The three-deck run over the tower roof.
  const d = b.decks(3072, { highGaps: 1, midGaps: 1 });
  b.enemy('armored', new Vec2(d.x0 + 480, d.low), { patrol_distance: 64 });
  b.enemy('dropper', new Vec2(d.x0 + 760, d.mid + 30));
  b.enemy('spike', new Vec2(d.x0 + 980, d.low), { patrol_distance: 48 });
  b.enemy('dropper', new Vec2(d.x0 + 1100, d.high + 12 + 30));
  b.enemy('sniper', new Vec2(d.x0 + 1300, d.high));
  b.enemy('armored', new Vec2(d.x0 + 1520, d.low), { patrol_distance: 48 });
  b.setPiece(KEYS.LAVA_VENT, new Vec2(d.x0 + 1200, d.low), { height: 44, first_delay: 38 });
  b.enemy('burrower', new Vec2(d.x0 + 2320, d.low), { height: 44, first_delay: 70 });
  b.enemy('diver', new Vec2(d.x0 + 1720, d.high - 130));
  b.enemy('dropper', new Vec2(d.x0 + 1840, d.mid + 30));
  b.enemy('spike', new Vec2(d.x0 + 2100, d.low), { patrol_distance: 48 });
  b.enemy('sniper', new Vec2(d.x0 + 2400, d.high));
  b.enemy('armored', new Vec2(d.x0 + 2600, d.low), { patrol_distance: 48 });
  b.enemy('sniper', new Vec2(d.x0 + 2200, d.mid));
  b.enemy('dropper', new Vec2(d.x0 + 2850, d.mid + 30));
  b.setPiece(KEYS.BUMPER, new Vec2(d.x0 + 700, d.high - 72));
  b.setPiece(KEYS.BUMPER, new Vec2(d.x0 + 2000, d.high - 72));
  b.flat(240);
  b.fluidPit(112, 'poison');
  CP(); // 4: past the well, half way between the tower and the next climb
  AFTER();
  G('dropper', 140);
  b.timedPits(3, { pit: 256, shuttle: 1 });
  P('armored', 'sniper', 0);
  G('diver', 150);
  b.upSpring(128);
  b.flat(448, 96, 160);
  P('spike', 'dropper', 140);
  b.vanishingRun(5, { onFrames: 150, offFrames: 90, ripple: 22, gap: 56 });
  b.enemy('diver', new Vec2(b.x - 360, b.ground - 160));
  CP(); // 5
  AFTER();
  H('armored');
  P('sniper', 'diver', 150);
  b.crumbleRun(4);
  P('spike', 'sniper', 0);
  b.bumperRow(320, 2);
  OVER(() => {
    G('dropper', 140);
    P('armored', 'dropper', 140);
    G('sniper');
    P('spike', 'dropper', 140);
  });
  post();
  b.timedPits(2, { pit: 224 });
  CP(); // 6: past the timed pits, half way to the finale
  AFTER();
  P('armored', 'diver', 150);
  P('spike', 'sniper', 0);
  G('dropper', 140);
  b.flat(192, 64, 192);
  b.loop(true, 384);
  b.flat(512, 64, 192); // a long run-out at loop speed before the void
  b.vanishingRun(4, { onFrames: 150, offFrames: 90, ripple: 24 });
  CP(); // 7: the finale starts - the boss approach gauntlet

  // --- Finale: the boss approach gauntlet ------------------------------------------
  AFTER();
  P('sniper', 'diver', 150);
  P('dropper', 'diver', 150);
  b.timedPits(2, { pit: 256, shuttle: 1 });
  b.enemy('diver', new Vec2(b.x - 300, b.ground - 160));
  P('armored', 'sniper', 0);
  b.crumbleRun(4);
  b.enemy('diver', new Vec2(b.x - 200, b.ground - 160));
  P('dropper', 'sniper', 0);
  P('spike', 'dropper', 140);
  b.flat(256);
  // The last climb: a two-floor zigzag onto the rooftop.
  const r = b.zigzag(2, 1536);
  b.enemy('dropper', new Vec2(r[0]!.x0 + 700, r[1]!.y + 16 + 40));
  b.enemy('sniper', new Vec2(r[1]!.x0 + 260, r[1]!.y));
  b.enemy('diver', new Vec2(r[1]!.x0 + 600, r[1]!.y + 16 + 24)); // over floor 0, under floor 1
  b.enemy('spike', new Vec2(r[2]!.x1 - 300, r[2]!.y), { patrol_distance: 32 });
  b.enemy('sniper', new Vec2(r[2]!.x1 - 120, r[2]!.y));
  b.enemy('armored', new Vec2(r[0]!.x0 + 420, r[0]!.y), { patrol_distance: 48 });
  b.enemy('dropper', new Vec2(r[1]!.x0 + 400, r[2]!.y + 16 + 40));
  CP(); // 8: halfway through the gauntlet, on the rooftop
  AFTER();
  b.vanishingRun(5, { onFrames: 140, offFrames: 90, ripple: 22, gap: 56 });
  P('sniper', 'dropper', 140);
  post();
  P('spike', 'sniper', 0);
  b.bumperRow(320, 2);
  b.enemy('dropper', new Vec2(b.x - 160, b.ground - 140));
  P('spike', 'sniper', 0);
  P('dropper', 'diver', 150);
  OVER(() => {
    P('sniper', 'dropper', 140);
    P('armored', 'dropper', 140);
  });
  P('sniper', 'diver', 150);
  OVER(() => {
    P('dropper', 'sniper', 0);
    P('spike', 'sniper', 0);
  });
  P('dropper', 'diver', 150);
  OVER(() => P('sniper', 'dropper', 140));
  // The calm corridor and the checkpoint right outside the arena gate.
  b.corridor(720, 4);
  b.checkpoint(); // 9
  b.goal(192, 384);
  return b;
}

export function act2Data(): LevelData {
  return buildAct2().build();
}
