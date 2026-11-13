// Progress per owner, kept and synced by the hub SDK's progress store
// (createProgressStore, SDK 0.8.0).
//
// One copy per owner: this browser outside a hub session ("device"), a hub
// visit whose account is not known yet ("pending", memory only), or a hub
// account (`<key>@<playerId>` in this browser plus the account's cloud save,
// so it follows the account to any device). Progress never moves from the
// device into an account, and one account never sees another's.
//
// Progress only advances, so every copy (other tabs, other devices, the
// cloud) is combined with mergeProgress: cleared stages and won emeralds are
// unions, a best time is the lower one, a best rank the better one, and
// unlock_all is kept once any copy has it. That merge gives the same result
// in any order, so no copy overwrites another.
//
// Not progress, and not in the store (they can go back, or are per device):
// write_keys.json (earn idempotency and the current run id), relic_slots.json,
// settings.json and controls.json.
//
// Older saves (the v0..v2 `hpos10i/progress.json`, which the Godot import
// also fills) are read into the device copy only (readLegacy) and never
// written again.

import { createProgressStore, type KeyValue, type ProgressModel, type ProgressStore } from '@hub-sdk';
import { betterRank, isRank, type Rank } from '../core/rank';
import { SAVE_KEYS } from './storage';

/** The progress format this build writes under SAVE_KEYS.progress and to the cloud. */
export const STORE_VERSION = 3;

export interface Progress {
  v: typeof STORE_VERSION;
  /** Cleared stages, `zone:act` (boss arenas are stage acts + 1). Sorted. */
  cleared: string[];
  /** Best (lowest) attempt time in seconds per act. */
  best_times: Record<string, number>;
  /** Best rank per act. */
  best_ranks: Record<string, Rank>;
  /** Emeralds.key of every emerald won. Sorted. */
  emeralds: string[];
  /** Every act open: only a save from before progress-based unlocking (legacy v0/v1, device only). */
  unlock_all: boolean;
}

type Json = Record<string, unknown>;

/**
 * A stage id: a zone id and a stage number. Ids this build does not know are
 * kept (a newer build may have written them) but never shown.
 */
const STAGE_ID = /^[a-z0-9_]{1,48}:[1-9][0-9]?$/;
/** Longest time kept, in seconds (a day). Anything longer is junk. */
const MAX_TIME_SEC = 86_400;

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isStageId = (v: unknown): v is string => typeof v === 'string' && STAGE_ID.test(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_TIME_SEC;

function sortedKeys<V>(map: Map<string, V>): Record<string, V> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isStageId))].sort() : [];
}

export function emptyProgress(): Progress {
  return { v: STORE_VERSION, cleared: [], best_times: {}, best_ranks: {}, emeralds: [], unlock_all: false };
}

/** Any stored or cloud value as valid progress. Never throws; junk entries are dropped. */
export function normalizeProgress(raw: unknown): Progress {
  if (!isObj(raw)) return emptyProgress();
  const times = new Map<string, number>();
  if (isObj(raw.best_times)) for (const [id, t] of Object.entries(raw.best_times)) if (isStageId(id) && isTime(t)) times.set(id, t);
  const ranks = new Map<string, Rank>();
  if (isObj(raw.best_ranks)) for (const [id, r] of Object.entries(raw.best_ranks)) if (isStageId(id) && isRank(r)) ranks.set(id, r);
  return {
    v: STORE_VERSION,
    cleared: ids(raw.cleared),
    best_times: sortedKeys(times),
    best_ranks: sortedKeys(ranks),
    emeralds: ids(raw.emeralds),
    unlock_all: raw.unlock_all === true,
  };
}

/** Keeps everything either copy earned. Commutative, associative and idempotent. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const times = new Map(Object.entries(a.best_times));
  for (const [id, t] of Object.entries(b.best_times)) {
    const mine = times.get(id);
    if (mine === undefined || t < mine) times.set(id, t);
  }
  const ranks = new Map(Object.entries(a.best_ranks));
  for (const [id, r] of Object.entries(b.best_ranks)) if (betterRank(r, ranks.get(id) ?? null)) ranks.set(id, r);
  return {
    v: STORE_VERSION,
    cleared: [...new Set([...a.cleared, ...b.cleared])].sort(),
    best_times: sortedKeys(times),
    best_ranks: sortedKeys(ranks),
    emeralds: [...new Set([...a.emeralds, ...b.emeralds])].sort(),
    unlock_all: a.unlock_all || b.unlock_all,
  };
}

export const PROGRESS_MODEL: ProgressModel<Progress> = {
  empty: emptyProgress,
  normalize: normalizeProgress,
  // normalize first: the store passes stored copies through normalize, but a
  // hand-built value in an update may not be sorted or clean.
  merge: (a, b) => mergeProgress(normalizeProgress(a), normalizeProgress(b)),
};

// --- Saves from before the store (`hpos10i/progress.json`) -------------------------------
//
// The old blob was versioned ({v: LEGACY_PROGRESS_VERSION, ...}); migrateProgress()
// brings an older one up step by step (no `v` = v0, before emeralds were saved; v1
// had no ranks). A blob from a newer version is read for what this build knows.

/** The last version of the old progress blob. */
export const LEGACY_PROGRESS_VERSION = 2;

/** One step per old version: PROGRESS_MIGRATIONS[n] turns a vn blob into v(n + 1). */
const PROGRESS_MIGRATIONS: Record<number, (old: Json) => Json> = {
  // v0 (no `v`): cleared and best_times only. v1 adds the won emeralds (none yet).
  0: (old) => ({ ...old, v: 1, emeralds: [] }),
  // v2 adds the best rank per act (none yet: old best times came from the
  // rewinding clock and earn no rank until the act is cleared again).
  // unlock_all: every act could be picked before v2, so a save from then keeps
  // every act open (progress-based unlocking is for saves that start on v2).
  1: (old) => ({ ...old, v: 2, best_ranks: {}, unlock_all: true }),
};

function progressVersion(blob: Json): number {
  const v = blob.v;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Brings an old progress blob up to LEGACY_PROGRESS_VERSION (a newer one is returned as it is). */
export function migrateProgress(blob: Json): Json {
  let out = blob;
  for (let v = progressVersion(out); v < LEGACY_PROGRESS_VERSION; v = progressVersion(out)) {
    const step = PROGRESS_MIGRATIONS[v];
    if (!step) break;
    const next = step(out);
    if (progressVersion(next) <= v) break;
    out = next;
  }
  return out;
}

/**
 * The progress saved by builds before the store (`hpos10i/progress.json`, v0..v2,
 * including what the Godot import copied in). Read for the device copy only.
 * No file is a new player; any older file is migrated, so a v0 or v1 save
 * keeps every act open (unlock_all).
 */
export function readLegacyProgress(storage: KeyValue): Progress | null {
  let parsed: unknown;
  try {
    const raw = storage.getItem(SAVE_KEYS.legacyProgress);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(parsed) || Object.keys(parsed).length === 0) return null;
  return normalizeProgress(migrateProgress(parsed));
}

/** The game's progress store over `storage` (Storage.store, read through at each call). */
export function createHposProgress(storage: KeyValue, onError?: (error: unknown) => void): ProgressStore<Progress> {
  return createProgressStore<Progress>({
    key: SAVE_KEYS.progress,
    model: PROGRESS_MODEL,
    storage,
    readLegacy: (s) => readLegacyProgress(s),
    onError: onError ?? ((error) => console.warn('[Save] progress could not sync with the hub', error)),
  });
}
