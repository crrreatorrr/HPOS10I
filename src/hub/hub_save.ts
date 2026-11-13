// Progress and idempotency keys (localStorage, one JSON value per former
// user:// file). Relic ownership and Ticket balances are server-side and are
// never written here.
//
// Progress (cleared acts and boss arenas, stage acts + 1; best act times; best
// act ranks; won emeralds) lives in the hub SDK's progress store
// (src/hub/progress.ts): one copy per owner (this browser outside the hub, or
// each hub account, synced with its cloud save). It advances only through
// recordClear, recordStageClear and recordEmerald, each one store.update.
//
// write_keys holds idempotency keys and the current run id only. It stays per
// browser: it is not progress (an ack and a run id are not earned, and a run
// can be abandoned).
//
// An earn key is the attempt's run id (one UUIDv7 per startLevel). It is
// saved before earnTickets. A failed save does not mint a replacement.
// Another tab may have written since this one loaded, so every write folds
// the stored copy in instead of replacing it, and an ack never comes undone.

import type { ProgressCloud, ProgressOwner, ProgressStore, ProgressSync } from '@hub-sdk';
import { Emeralds } from '../core/emeralds';
import type { Rank } from '../core/rank';
import { mintUuidV7 } from '../core/uuid_v7';
import { createHposProgress, normalizeProgress, type Progress } from './progress';
import { SAVE_KEYS, Storage, type KeyValue } from './storage';

export { LEGACY_PROGRESS_VERSION, migrateProgress } from './progress';

type Json = Record<string, unknown>;

export interface EarnRecord {
  amount: number;
  acked: boolean;
}

function isObj(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Storage.store, read at each call, so the store follows Storage.use (tests). */
const liveStorage: KeyValue = {
  getItem: (k) => Storage.store.getItem(k),
  setItem: (k, v) => Storage.store.setItem(k, v),
  removeItem: (k) => Storage.store.removeItem(k),
};

/** What the game reads from the current progress, rebuilt when the store's copy changes. */
interface View {
  source: Progress;
  cleared: ReadonlySet<string>;
  bestTimes: ReadonlyMap<string, number>;
  bestRanks: ReadonlyMap<string, Rank>;
  emeralds: ReadonlySet<string>;
}

export class HubSave {
  private store: ProgressStore<Progress> = createHposProgress(liveStorage);
  private unsubscribe: () => void = () => {};
  private readonly listeners = new Set<() => void>();
  private view: View | null = null;
  private keys: Json = {};
  private runId = '';
  private runZone = '';
  private runAct = 0;
  private runOnDisk = false;

  constructor() {
    this.watch();
  }

  /**
   * Opens the device's progress (play outside a hub session) and the write keys
   * from storage. Call hold() for a hub visit that is starting and attach() once
   * its account is known.
   */
  loadAll(): void {
    this.unsubscribe();
    // A push still waiting for the cloud stops; its account keeps the "unsynced"
    // mark, so the next attach pushes it.
    if (this.store.owner().kind === 'account') this.store.release();
    this.store = createHposProgress(liveStorage);
    this.watch();
    this.keys = Storage.readJson(SAVE_KEYS.writeKeys);
    this.runId = String(this.keys.run_id ?? '');
    this.runZone = String(this.keys.run_zone ?? '');
    this.runAct = Number(this.keys.run_act ?? 0);
    this.runOnDisk = this.runId !== '' && String(Storage.readJson(SAVE_KEYS.writeKeys).run_id ?? '') === this.runId;
    this.emit();
  }

  // --- Progress ----------------------------------------------------------------------

  /** The current owner's progress. Read-only. */
  progress(): Progress {
    return this.store.get();
  }

  /** Cleared stages (`zone:act`), including ids this build does not know. */
  get cleared(): ReadonlySet<string> {
    return this.current().cleared;
  }

  get bestTimes(): ReadonlyMap<string, number> {
    return this.current().bestTimes;
  }

  get bestRanks(): ReadonlyMap<string, Rank> {
    return this.current().bestRanks;
  }

  /** Emeralds.key of every emerald won by the current owner (known emeralds only). */
  get emeralds(): ReadonlySet<string> {
    return this.current().emeralds;
  }

  /** True for a device save from before acts unlocked by progress (v0, v1): every act stays open. */
  get unlockAll(): boolean {
    return this.store.get().unlock_all;
  }

  isCleared(zone: string, act: number): boolean {
    return this.cleared.has(`${zone}:${act}`);
  }

  bestTime(zone: string, act: number): number | null {
    return this.bestTimes.get(`${zone}:${act}`) ?? null;
  }

  bestRank(zone: string, act: number): Rank | null {
    return this.bestRanks.get(`${zone}:${act}`) ?? null;
  }

  /** Records a cleared act, its best (lowest) time and, when given, its best rank. Returns that best time. */
  recordClear(zone: string, act: number, timeSec: number, rank: Rank | null = null): number {
    const id = `${zone}:${act}`;
    this.store.update((p) => ({
      ...p,
      cleared: [...p.cleared, id],
      best_times: { ...p.best_times, [id]: Math.min(p.best_times[id] ?? timeSec, timeSec) },
      best_ranks: rank ? { ...p.best_ranks, [id]: rank } : p.best_ranks,
    }));
    return this.bestTime(zone, act) ?? timeSec;
  }

  /** Records a cleared stage that keeps no time (a boss arena: stage acts + 1). */
  recordStageClear(zone: string, stage: number): void {
    const id = `${zone}:${stage}`;
    if (this.isCleared(zone, stage)) return;
    this.store.update((p) => ({ ...p, cleared: [...p.cleared, id] }));
  }

  /** Saves a won emerald (acts without one are ignored). */
  recordEmerald(zone: string, act: number): void {
    if (!Emeralds.isEmeraldAct(zone, act)) return;
    const key = Emeralds.key(zone, act);
    this.store.update((p) => ({ ...p, emeralds: [...p.emeralds, key] }));
  }

  /** Whose progress this is: the browser, a hub visit still starting, or a hub account. */
  owner(): ProgressOwner {
    return this.store.owner();
  }

  /** The account's cloud state (`local` for the device or a visit still starting). */
  sync(): ProgressSync {
    return this.store.sync();
  }

  /** False when the last progress write failed: progress lasts only for this visit. */
  persistent(): boolean {
    return this.store.persistent();
  }

  /** A hub visit is starting: progress is held in memory until attach() or release(). */
  hold(): void {
    this.store.hold();
  }

  /** Shows and saves `playerId`'s progress, synced with their cloud save. Held progress goes to them. */
  attach(cloud: ProgressCloud, playerId: string): Promise<void> {
    return this.store.attach(cloud, playerId);
  }

  /** Back to this browser's progress (no hub session). Held progress goes to the device. */
  release(): void {
    this.store.release();
  }

  /** Pushes unsynced account progress now. */
  flush(): Promise<void> {
    return this.store.flush();
  }

  /** True when a `storage` event for this key may change the progress shown. */
  watches(key: string | null): boolean {
    return this.store.watches(key) || (key === SAVE_KEYS.legacyProgress && this.store.owner().kind === 'device');
  }

  /** Re-reads storage, for progress another tab saved. */
  refresh(): void {
    this.store.refresh();
  }

  /** Called after every progress change (an update, a refresh, a new owner). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private watch(): void {
    this.view = null;
    this.unsubscribe = this.store.subscribe(() => this.emit());
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private current(): View {
    const source = this.store.get();
    if (this.view && this.view.source === source) return this.view;
    const p = normalizeProgress(source);
    const known = new Set(Emeralds.allKeys());
    this.view = {
      source,
      cleared: new Set(p.cleared),
      bestTimes: new Map(Object.entries(p.best_times)),
      bestRanks: new Map(Object.entries(p.best_ranks)),
      emeralds: new Set(p.emeralds.filter((k) => known.has(k))),
    };
    return this.view;
  }

  // --- Write keys --------------------------------------------------------------------

  /** A stored key per id in a bucket; a retry of the same id reuses it. */
  keyFor(bucket: string, id: string): string {
    const map = this.bucket(bucket);
    const known = map[id];
    if (typeof known === 'string' && known !== '') return known;
    const key = mintUuidV7();
    map[id] = key;
    this.keys[bucket] = map;
    this.writeKeys();
    return key;
  }

  /** One id per level attempt, saved before any earn. False: only in memory, don't send. */
  beginAttempt(zone: string, act: number): boolean {
    this.runId = mintUuidV7();
    this.runZone = zone;
    this.runAct = act;
    this.runOnDisk = false;
    return this.persistRun();
  }

  currentRunId(): string {
    return this.runId;
  }

  runMatches(zone: string, act: number): boolean {
    return this.runId !== '' && this.runZone === zone && this.runAct === act;
  }

  isRunOnDisk(): boolean {
    return this.runOnDisk;
  }

  persistRun(): boolean {
    if (this.runId === '') return false;
    this.keys.run_id = this.runId;
    this.keys.run_zone = this.runZone;
    this.keys.run_act = this.runAct;
    if (!this.writeKeys()) {
      this.runOnDisk = false;
      return false;
    }
    this.runOnDisk = String(Storage.readJson(SAVE_KEYS.writeKeys).run_id ?? '') === this.runId;
    return this.runOnDisk;
  }

  earnRecord(runId: string): EarnRecord | null {
    const rec = this.earnMap()[runId];
    if (!isObj(rec) || !('amount' in rec)) return null;
    return { amount: Number(rec.amount), acked: rec.acked === true };
  }

  /**
   * Saves {amount, acked: false} for this run id. An existing amount is kept,
   * so a second completion cannot change the body that belongs to the key.
   * False means it is not stored; do not send.
   */
  commitEarn(runId: string, amount: number): boolean {
    if (runId === '' || amount <= 0) return false;
    if (this.earnOnDisk(runId)) return true;
    const earns = this.earnMap();
    const existing = this.earnRecord(runId);
    earns[runId] = existing ? { amount: existing.amount, acked: existing.acked } : { amount, acked: false };
    this.keys.earn_by_run = earns;
    if (!this.writeKeys()) return false;
    return this.earnOnDisk(runId);
  }

  /**
   * Lowers an unacked earn's amount to `max` (only for earns the server refused
   * as over its per-event maximum, which it never stores). Returns the amount now saved.
   */
  capEarn(runId: string, max: number): number {
    const rec = this.earnRecord(runId);
    if (!rec) return 0;
    if (rec.acked || rec.amount <= max) return rec.amount;
    const earns = this.earnMap();
    earns[runId] = { amount: max, acked: false, capped: true };
    this.keys.earn_by_run = earns;
    this.writeKeys();
    return this.earnRecord(runId)?.amount ?? max;
  }

  ackEarn(runId: string): void {
    if (runId === '') return;
    const earns = this.earnMap();
    let rec: EarnRecord | null = this.earnRecord(runId);
    if (!rec) {
      const disk = Storage.readJson(SAVE_KEYS.writeKeys).earn_by_run;
      if (isObj(disk) && isObj(disk[runId]) && 'amount' in (disk[runId] as Json)) {
        const d = disk[runId] as Json;
        rec = { amount: Number(d.amount), acked: d.acked === true };
      }
    }
    if (!rec) return;
    earns[runId] = { amount: rec.amount, acked: true };
    this.keys.earn_by_run = earns;
    this.writeKeys();
  }

  /** Unacked earns that were actually stored: {runId, amount}. */
  unackedEarns(): { runId: string; amount: number }[] {
    const out: { runId: string; amount: number }[] = [];
    for (const [runId, rec] of Object.entries(this.earnMap())) {
      if (isObj(rec) && rec.acked !== true && this.earnOnDisk(runId)) {
        const amount = Number(rec.amount ?? 0);
        if (amount > 0) out.push({ runId, amount });
      }
    }
    return out;
  }

  /** Raw key file (tests, migration). */
  rawKeys(): Json {
    return this.keys;
  }

  private earnMap(): Json {
    const earns = this.keys.earn_by_run;
    if (!isObj(earns)) {
      const fresh: Json = {};
      this.keys.earn_by_run = fresh;
      return fresh;
    }
    return earns;
  }

  private earnOnDisk(runId: string): boolean {
    const earns = Storage.readJson(SAVE_KEYS.writeKeys).earn_by_run;
    if (!isObj(earns)) return false;
    const rec = earns[runId];
    if (!isObj(rec) || !('amount' in rec)) return false;
    const mem = this.earnRecord(runId);
    if (!mem) return true;
    return Number(rec.amount) === mem.amount;
  }

  private bucket(name: string): Json {
    const map = this.keys[name];
    return isObj(map) ? map : {};
  }

  private writeKeys(): boolean {
    const disk = Storage.readJson(SAVE_KEYS.writeKeys);
    if (Object.keys(disk).length > 0) this.keys = mergeKeys(disk, this.keys);
    return Storage.writeJson(SAVE_KEYS.writeKeys, this.keys);
  }
}

export function mergeKeys(disk: Json, local: Json): Json {
  const merged: Json = structuredClone(disk);
  for (const [key, value] of Object.entries(local)) {
    if (key === 'earn_by_run') merged[key] = mergeEarnMap(disk[key], value);
    else if (key === 'relic' || key === 'earn' || key === 'event') merged[key] = mergeIdMap(disk[key], value);
    else if (key === 'exchange_pending') merged[key] = disk[key] ?? value;
    else merged[key] = value;
  }
  return merged;
}

function mergeEarnMap(diskValue: unknown, localValue: unknown): Json {
  const merged: Json = isObj(diskValue) ? structuredClone(diskValue) : {};
  if (!isObj(localValue)) return merged;
  for (const [runId, localRec] of Object.entries(localValue)) {
    if (!(runId in merged)) {
      merged[runId] = localRec;
      continue;
    }
    const diskRec = merged[runId];
    const localAcked = isObj(localRec) && localRec.acked === true;
    const diskAcked = isObj(diskRec) && diskRec.acked === true;
    // An ack must stick. A stale unacked copy must not bring it back or
    // change the amount the other tab already saved, except a cap to the
    // server's maximum (capEarn), which only ever lowers an unacked amount.
    if (localAcked && !diskAcked) merged[runId] = localRec;
    else if (
      !localAcked &&
      !diskAcked &&
      isObj(localRec) &&
      isObj(diskRec) &&
      localRec.capped === true &&
      Number(localRec.amount) < Number(diskRec.amount)
    ) {
      merged[runId] = localRec;
    }
  }
  return merged;
}

function mergeIdMap(diskValue: unknown, localValue: unknown): Json {
  const merged: Json = isObj(diskValue) ? structuredClone(diskValue) : {};
  if (isObj(localValue)) for (const [id, v] of Object.entries(localValue)) if (!(id in merged)) merged[id] = v;
  return merged;
}
