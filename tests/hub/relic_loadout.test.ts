// The Breakwater Coin owns the Nobu skin just as Cone's Tip does (port of the
// Godot build's cases in test_relic_loadout.gd).

import { beforeEach, describe, expect, it } from 'vitest';
import { HubClient } from '../../src/hub/hub_client';
import { ITEM_NOBU, RelicLoadout, SPEED_MULT } from '../../src/hub/relic_loadout';
import { memoryStore, Storage } from '../../src/hub/storage';

function setHub(relics: string[], ranked: boolean, loadout: Record<string, unknown> = {}): void {
  HubClient.reach = 'ready';
  HubClient.relics = relics;
  HubClient.ranked = ranked;
  HubClient.serverLoadout = loadout;
  HubClient.revision++;
  RelicLoadout.reset();
}

beforeEach(() => {
  Storage.use(memoryStore());
});

describe('Breakwater Coin', () => {
  it('owns the Nobu skin', () => {
    setHub(['breakwater_coin'], false);
    const state = RelicLoadout.resolve();
    expect(state.owned).toEqual(['breakwater_coin']);
    expect(state.body).toBe(ITEM_NOBU);
    expect(state.skin).toBe('nobu');
    expect(state.body_choices).toEqual([ITEM_NOBU, '']);
    expect(state.speed_mult).toBe(SPEED_MULT);
    expect(state.extra_life).toBe(false);
    expect(state.spindash_charge).toBe(0);
    expect(state.cape).toBe(false);
  });

  it('keeps the look but not the effect in Ranked', () => {
    setHub(['breakwater_coin'], true);
    const state = RelicLoadout.resolve();
    expect(state.skin).toBe('nobu');
    expect(state.speed_mult).toBe(1);
  });

  it('gives one skin and one boost when owned with Cone\'s Tip', () => {
    setHub(['cones_tip', 'breakwater_coin'], false);
    const state = RelicLoadout.resolve();
    expect(state.owned).toEqual(['cones_tip', 'breakwater_coin']);
    expect(state.body_choices).toEqual([ITEM_NOBU, '']);
    expect(state.speed_mult).toBe(SPEED_MULT);
  });

  it('honours a server loadout naming the Nobu skin', () => {
    setHub(['genesis_shard', 'breakwater_coin'], false, { slots: { body: ITEM_NOBU, back: null } });
    const state = RelicLoadout.resolve();
    expect(state.body).toBe(ITEM_NOBU);
    expect(state.speed_mult).toBe(SPEED_MULT);
    expect(state.extra_life).toBe(false);
  });

  it('gives nothing without the Coin or Cone\'s Tip, or offline', () => {
    setHub(['genesis_shard', 'tinubu_crown', 'tidebreaker_belt'], false);
    expect(RelicLoadout.resolve().body_choices).not.toContain(ITEM_NOBU);
    setHub(['breakwater_coin'], false);
    HubClient.reach = 'offline';
    HubClient.revision++;
    RelicLoadout.reset();
    const state = RelicLoadout.resolve();
    expect(state.owned).toEqual([]);
    expect(state.speed_mult).toBe(1);
  });
});
