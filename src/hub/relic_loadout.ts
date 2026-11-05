// One read of Relic ownership for HPOS10I. resolve() is the only function
// that reads owned Relics: it uses the hub init result stored on HubClient
// (relics, ranked, and a server loadout when init has one). Offline that is
// empty: nothing is owned and the session is unranked. The body and back
// slots are a local choice until a server loadout arrives. This never writes
// Tickets, Relics, beaten flags or leaderboards, and never grants a Relic.

import { HubClient } from './hub_client';
import { SAVE_KEYS, Storage } from './storage';

export const RELIC_GENESIS = 'genesis_shard';
export const RELIC_CONES = 'cones_tip';
export const RELIC_CROWN = 'tinubu_crown';
/** Sproto Fighter's Relic (the hub's fifth game). */
export const RELIC_BELT = 'tidebreaker_belt';
/**
 * Sproto Arcade's Relic (the hub's sixth game). Owner rule: in every other
 * game it gives the same award as Cone's Tip, so here it owns the Nobu skin
 * too. Owning both still gives one Nobu skin and one speed boost.
 */
export const RELIC_COIN = 'breakwater_coin';
export const ITEM_GOLDEN = 'hpos_skin_golden_sproto';
export const ITEM_NOBU = 'hpos_skin_nobu';
export const ITEM_TIDEBREAKER = 'hpos_skin_tidebreaker';
export const ITEM_CAPE = 'hpos_cape_duelist';
export const SPEED_MULT = 1.05;
/**
 * Tidebreaker's spin-dash charge per jump press (the hub item matrix part
 * `spindash_charge`, { charge_per_press: 3 }). Max charge and release speed
 * are unchanged: a full dash in 3 presses instead of 4, never faster.
 */
export const SPINDASH_CHARGE_PER_PRESS = 3.0;

const KNOWN = [RELIC_GENESIS, RELIC_CONES, RELIC_CROWN, RELIC_BELT, RELIC_COIN];

export type SkinId = '' | 'golden' | 'nobu' | 'tidebreaker';

export interface Loadout {
  owned: string[];
  ranked: boolean;
  body: string;
  back: string;
  body_choices: string[];
  skin: SkinId;
  cape: boolean;
  extra_life: boolean;
  speed_mult: number;
  /** Charge per press while Tidebreaker is worn unranked, else 0 (base rate). */
  spindash_charge: number;
  time_focus: boolean;
  /** Item boxes and the extra moves are off in Ranked, like Relic effects. */
  extras_allowed: boolean;
}

interface Slots {
  body_set: boolean;
  back_set: boolean;
  body: string;
  back: string;
}

class RelicLoadoutImpl {
  private slots: Slots | null = null;
  private cache: Loadout | null = null;
  private cacheStamp = -1;

  resolve(): Loadout {
    // Cheap: called every tick by the player. Recomputed when the hub state changes.
    if (this.cache && this.cacheStamp === HubClient.revision) return this.cache;
    let owned: string[] = [];
    let ranked = false;
    let serverSlots: Record<string, unknown> = {};
    if (HubClient.reach === 'ready') {
      owned = knownRelics(HubClient.relics);
      ranked = HubClient.ranked === true;
      serverSlots = HubClient.serverLoadout;
    }
    const choice = Object.keys(serverSlots).length > 0 ? slotsFrom(serverSlots) : this.localSlots();
    const skins = ownedSkins(owned);
    const body = pickBody(skins, choice);
    const back = pickBack(owned, choice);
    const gameplay = !ranked;
    const choices = skins.slice();
    if (choices.length > 0) choices.push('');
    const out: Loadout = {
      owned,
      ranked,
      body,
      back,
      body_choices: choices,
      skin: skinId(body),
      cape: back === ITEM_CAPE,
      extra_life: gameplay && body === ITEM_GOLDEN,
      speed_mult: gameplay && body === ITEM_NOBU ? SPEED_MULT : 1.0,
      spindash_charge: gameplay && body === ITEM_TIDEBREAKER ? SPINDASH_CHARGE_PER_PRESS : 0.0,
      time_focus: gameplay && back === ITEM_CAPE,
      extras_allowed: gameplay,
    };
    this.cache = out;
    this.cacheStamp = HubClient.revision;
    return out;
  }

  /** Cycles the body slot through owned skins and none. False when there is nothing to switch. */
  cycleBody(step: number): boolean {
    if (Object.keys(HubClient.serverLoadout).length > 0) return false;
    const state = this.resolve();
    const choices = state.body_choices;
    if (choices.length < 2) return false;
    let index = choices.indexOf(state.body);
    if (index < 0) index = 0;
    const next = choices[(((index + step) % choices.length) + choices.length) % choices.length]!;
    const slots = { ...this.localSlots(), body: next, body_set: true };
    this.slots = slots;
    Storage.writeJson(SAVE_KEYS.relicSlots, { v: 1, ...slots });
    this.cache = null;
    return true;
  }

  /** Drops cached state (tests). */
  reset(): void {
    this.slots = null;
    this.cache = null;
  }

  private localSlots(): Slots {
    if (!this.slots) {
      const parsed = Storage.readJson(SAVE_KEYS.relicSlots);
      this.slots = {
        body_set: parsed.body_set === true,
        back_set: parsed.back_set === true,
        body: String(parsed.body ?? ''),
        back: String(parsed.back ?? ''),
      };
    }
    return this.slots;
  }
}

function knownRelics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = String(item);
    if (KNOWN.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function ownedSkins(owned: string[]): string[] {
  const skins: string[] = [];
  if (owned.includes(RELIC_GENESIS)) skins.push(ITEM_GOLDEN);
  if (owned.includes(RELIC_CONES) || owned.includes(RELIC_COIN)) skins.push(ITEM_NOBU);
  if (owned.includes(RELIC_BELT)) skins.push(ITEM_TIDEBREAKER);
  return skins;
}

function pickBody(skins: string[], choice: Slots): string {
  if (choice.body_set) {
    if (choice.body === '' || skins.includes(choice.body)) return choice.body;
  }
  return skins[0] ?? '';
}

function pickBack(owned: string[], choice: Slots): string {
  const owns = owned.includes(RELIC_CROWN);
  if (choice.back_set) return choice.back === ITEM_CAPE && owns ? ITEM_CAPE : '';
  return owns ? ITEM_CAPE : '';
}

function skinId(body: string): SkinId {
  switch (body) {
    case ITEM_GOLDEN:
      return 'golden';
    case ITEM_NOBU:
      return 'nobu';
    case ITEM_TIDEBREAKER:
      return 'tidebreaker';
  }
  return '';
}

function slotsFrom(server: Record<string, unknown>): Slots {
  const raw = server.slots ?? server;
  if (!raw || typeof raw !== 'object') return { body_set: true, back_set: true, body: '', back: '' };
  const slots = raw as Record<string, unknown>;
  const item = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return { body_set: true, back_set: true, body: item(slots.body), back: item(slots.back) };
}

export const RelicLoadout = new RelicLoadoutImpl();
