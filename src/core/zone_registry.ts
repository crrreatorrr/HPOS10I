// Zones, their acts, boss arenas and per-zone settings. Stage ids name
// scenes in the scene registry (src/core/scenes.ts); a stage that has not
// been built yet is simply missing there.

import type { MusicName } from './audio';

export interface Zone {
  id: string;
  name: string;
  /** Scene ids of the acts, in order. */
  acts: string[];
  /** Scene id of the boss arena ('' = none). */
  boss: string;
  accessory: '' | 'wizard_hat' | 'sunglasses';
  music: MusicName;
}

export const TEST_ZONE: Zone = {
  id: 'test_zone',
  name: 'Test Zone',
  acts: ['level:test_zone'],
  boss: '',
  accessory: '',
  music: 'z1',
};

export const ZONES: readonly Zone[] = [
  {
    id: 'z1_retro_rush_hills',
    name: 'Retro Rush Hills',
    acts: ['level:z1_retro_rush_hills/act1', 'level:z1_retro_rush_hills/act2'],
    boss: 'boss:rug_pull',
    accessory: '',
    music: 'z1',
  },
  {
    id: 'z2_wizard_academy',
    name: 'Wizard Academy',
    acts: ['level:z2_wizard_academy/act1', 'level:z2_wizard_academy/act2'],
    boss: 'boss:library_demon',
    accessory: 'wizard_hat',
    music: 'z2',
  },
  {
    id: 'z3_capital_mansion',
    name: 'Capital Mansion',
    acts: ['level:z3_capital_mansion/act1', 'level:z3_capital_mansion/act2'],
    boss: 'boss:broccoli_head',
    accessory: 'sunglasses',
    music: 'z3',
  },
  {
    id: 'z4_neon_rush_remix',
    name: 'Neon Rush Remix',
    acts: ['level:z4_neon_rush_remix/act1', 'level:z4_neon_rush_remix/act2'],
    boss: 'boss:the_executive',
    accessory: '',
    music: 'z4',
  },
];

/**
 * Zones players can pick. The rest are reachable from the dev menu and
 * ?zone= while they are tuned; the zone select hides them. A zone is
 * released after QA passes it.
 */
export const RELEASED: readonly string[] = ['z1_retro_rush_hills', 'z2_wizard_academy'];

export const ZoneRegistry = {
  allZones(includeTest = false): Zone[] {
    return includeTest ? [TEST_ZONE, ...ZONES] : [...ZONES];
  },

  isReleased(id: string): boolean {
    return id === TEST_ZONE.id || RELEASED.includes(id);
  },

  getZone(id: string): Zone | null {
    if (id === TEST_ZONE.id) return TEST_ZONE;
    return ZONES.find((z) => z.id === id) ?? null;
  },

  /** Stage ids in play order: acts first, then the boss (stage acts + 1). 1-based. */
  stagePath(id: string, stage: number): string {
    const zone = ZoneRegistry.getZone(id);
    if (!zone) return '';
    if (stage >= 1 && stage <= zone.acts.length) return zone.acts[stage - 1]!;
    if (stage === zone.acts.length + 1) return zone.boss;
    return '';
  },

  nextZoneId(id: string): string {
    const i = ZONES.findIndex((z) => z.id === id);
    return i >= 0 && i + 1 < ZONES.length ? ZONES[i + 1]!.id : '';
  },
};
