// Act difficulty D and the numeric targets from docs/LEVELS.md. D is 0 for
// the test zone and 1..8 from Zone 1 Act 1 to Zone 4 Act 2; a boss arena uses
// its own value. Enemies and bosses scale their speed, attack intervals and
// telegraphs with the multipliers below, read at their local progress
// through the act (harder towards the end of every act).

import { clamp, lerp } from '../runtime/math';
import { SceneRouter } from './scene_router';
import { ZoneRegistry } from './zone_registry';

export interface ActTargets {
  screens: number;
  par_seconds: number;
  enemies_per_screen: number;
  tiers: Record<number, number>;
  direction: number;
  checkpoints: number;
  tickets_per_screen: number;
}

export interface BossTuning {
  d: number;
  weak_window: number;
  attacks_per_cycle: number;
  telegraph: number;
  escalation: number;
  desperation: boolean;
  ticket_refills: number;
}

const MAX = 8;
const MIN_TELEGRAPH = 0.35;
const DEFAULT = 1;

const ZONE_ACTS: Record<string, number[]> = {
  test_zone: [0],
  z1_retro_rush_hills: [1, 2],
  z2_wizard_academy: [3, 4],
  z3_capital_mansion: [5, 6],
  z4_neon_rush_remix: [7, 8],
};

// par_seconds: 1.5 x the best deathless bot time (the faster of the QA pilot
// and the naive runner; the route pilot for Zone 4), rounded up to 5 s. Ranks
// and the time bonus are read against it (src/core/rank.ts).
const TARGETS: Record<number, ActTargets> = {
  0: { screens: 20, par_seconds: 45, enemies_per_screen: 0.2, tiers: { 1: 100 }, direction: 1, checkpoints: 2, tickets_per_screen: 6.0 },
  1: { screens: 45, par_seconds: 80, enemies_per_screen: 0.4, tiers: { 1: 100 }, direction: 1, checkpoints: 3, tickets_per_screen: 5.0 },
  2: { screens: 55, par_seconds: 115, enemies_per_screen: 0.6, tiers: { 1: 75, 2: 25 }, direction: 2, checkpoints: 6, tickets_per_screen: 4.5 },
  3: { screens: 65, par_seconds: 120, enemies_per_screen: 0.8, tiers: { 1: 45, 2: 40, 3: 15 }, direction: 3, checkpoints: 6, tickets_per_screen: 4.0 },
  4: { screens: 65, par_seconds: 175, enemies_per_screen: 1.0, tiers: { 1: 25, 2: 45, 3: 30 }, direction: 4, checkpoints: 7, tickets_per_screen: 4.0 },
  5: { screens: 65, par_seconds: 140, enemies_per_screen: 1.1, tiers: { 2: 50, 3: 40, 4: 10 }, direction: 4, checkpoints: 6, tickets_per_screen: 3.5 },
  6: { screens: 75, par_seconds: 190, enemies_per_screen: 1.2, tiers: { 2: 35, 3: 45, 4: 20 }, direction: 4, checkpoints: 7, tickets_per_screen: 3.5 },
  7: { screens: 75, par_seconds: 215, enemies_per_screen: 1.3, tiers: { 2: 30, 3: 40, 4: 30 }, direction: 5, checkpoints: 7, tickets_per_screen: 3.0 },
  8: { screens: 85, par_seconds: 270, enemies_per_screen: 1.4, tiers: { 3: 50, 4: 50 }, direction: 5, checkpoints: 9, tickets_per_screen: 3.0 },
};

const BOSSES: Record<string, BossTuning> = {
  z1_retro_rush_hills: { d: 2.5, weak_window: 2.0, attacks_per_cycle: 1, telegraph: 0.8, escalation: 1.15, desperation: false, ticket_refills: 3 },
  z2_wizard_academy: { d: 4.5, weak_window: 1.7, attacks_per_cycle: 2, telegraph: 0.7, escalation: 1.15, desperation: false, ticket_refills: 2 },
  z3_capital_mansion: { d: 8.0, weak_window: 1.1, attacks_per_cycle: 3, telegraph: 0.5, escalation: 1.25, desperation: true, ticket_refills: 1 },
  z4_neon_rush_remix: { d: 10.0, weak_window: 0.9, attacks_per_cycle: 4, telegraph: 0.45, escalation: 1.3, desperation: true, ticket_refills: 1 },
};

/**
 * Tickets that scatter (and can be picked up again) when Sproto is hit, by
 * zone: a hit costs more as the zones advance (docs/LEVELS.md, principle 6).
 * Zone 1 and anything unlisted keep the physics constant (32).
 */
const SCATTER_CAP: Record<string, number> = {
  z2_wizard_academy: 24,
  z3_capital_mansion: 16,
  z4_neon_rush_remix: 12,
};

const OPENING_END = 0.25;
const FINALE_START = 0.75;
const OPENING_BONUS = -0.5;
const FINALE_BONUS = 0.75;
const PRE_BOSS_BONUS = 1.5;

export const Difficulty = {
  MAX,
  MIN_TELEGRAPH,
  DEFAULT,
  ZONE_ACTS,
  TARGETS,
  BOSSES,
  OPENING_END,
  FINALE_START,
  SCATTER_CAP,
  SECTION_DENSITY: { opening: 0.7, middle: 1.0, finale: 1.4 },
  FINALE_TIER_BONUS: 1,

  forStage(zoneId: string, stage: number): number {
    const acts = ZONE_ACTS[zoneId] ?? [];
    if (acts.length === 0) return DEFAULT;
    if (stage > acts.length && BOSSES[zoneId]) return BOSSES[zoneId].d;
    return acts[clamp(stage - 1, 0, acts.length - 1)]!;
  },

  current(): number {
    return Difficulty.forStage(SceneRouter.zoneId, SceneRouter.stage);
  },

  boss(zoneId: string): BossTuning | null {
    return BOSSES[zoneId] ?? null;
  },

  isPreBossAct(zoneId: string, stage: number): boolean {
    const zone = ZoneRegistry.getZone(zoneId);
    return !!zone && zone.boss !== '' && stage === zone.acts.length;
  },

  ramp(progress: number, preBoss: boolean): number {
    const p = clamp(progress, 0, 1);
    if (p < OPENING_END) return lerp(OPENING_BONUS, 0, p / OPENING_END);
    if (p <= FINALE_START) return 0;
    const top = preBoss ? PRE_BOSS_BONUS : FINALE_BONUS;
    return lerp(0, top, (p - FINALE_START) / (1 - FINALE_START));
  },

  local(progress: number): number {
    const zoneId = SceneRouter.zoneId;
    const stage = SceneRouter.stage;
    return Math.max(0, Difficulty.forStage(zoneId, stage) + Difficulty.ramp(progress, Difficulty.isPreBossAct(zoneId, stage)));
  },

  /** The par (seconds) of an act, or null for a stage with none (boss arenas, unknown zones). */
  parFor(zoneId: string, stage: number): number | null {
    const acts = ZONE_ACTS[zoneId] ?? [];
    if (stage < 1 || stage > acts.length) return null;
    return (TARGETS[acts[stage - 1]!] ?? null)?.par_seconds ?? null;
  },

  targets(d: number): ActTargets {
    return TARGETS[clamp(Math.trunc(d), 0, MAX)] ?? TARGETS[DEFAULT]!;
  },

  /** The most tickets a hit scatters in `zoneId` (default: the current zone); Infinity where the physics constant rules. */
  scatterCap(zoneId: string = SceneRouter.zoneId): number {
    return SCATTER_CAP[zoneId] ?? Infinity;
  },

  /** Enemy movement speed: +6% per step above D1. */
  speedMult(d = -1): number {
    return 1 + 0.06 * steps(d);
  },

  /** Time between enemy attacks: -5% per step above D1, never below 40%. */
  intervalMult(d = -1): number {
    return Math.max(0.4, 1 - 0.05 * steps(d));
  },

  /** Telegraph seconds: -4% per step above D1, never below 0.35 s. */
  telegraph(seconds: number, d = -1): number {
    return Math.max(MIN_TELEGRAPH, seconds * (1 - 0.04 * steps(d)));
  },
};

function steps(d: number): number {
  return Math.max((d < 0 ? Difficulty.current() : d) - 1, 0);
}
