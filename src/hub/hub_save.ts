// Progress and idempotency keys (localStorage, one JSON value per former
// user:// file). Cleared acts and best times live in progress; write_keys
// holds idempotency keys only. Relic ownership and Ticket balances are
// server-side and are never written here.
//
// An earn key is the attempt's run id (one UUIDv7 per startLevel). It is
// saved before earnTickets. A failed save does not mint a replacement.
// Another tab may have written since this one loaded, so every write folds
// the stored copy in instead of replacing it, and an ack never comes undone.

import { mintUuidV7 } from '../core/uuid_v7';
import { SAVE_KEYS, Storage } from './storage';

type Json = Record<string, unknown>;

export interface EarnRecord {
  amount: number;
  acked: boolean;
}

function isObj(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export class HubSave {
  cleared = new Set<string>();
  bestTimes = new Map<string, number>();
  private keys: Json = {};
  private runId = '';
  private runZone = '';
  private runAct = 0;
  private runOnDisk = false;

  loadAll(): void {
    const progress = Storage.readJson(SAVE_KEYS.progress);
    this.cleared = new Set();
    this.bestTimes = new Map();
    if (Array.isArray(progress.cleared)) for (const item of progress.cleared) this.cleared.add(String(item));
    if (isObj(progress.best_times)) {
      for (const [id, v] of Object.entries(progress.best_times)) this.bestTimes.set(String(id), Number(v));
    }
    this.keys = Storage.readJson(SAVE_KEYS.writeKeys);
    this.runId = String(this.keys.run_id ?? '');
    this.runZone = String(this.keys.run_zone ?? '');
    this.runAct = Number(this.keys.run_act ?? 0);
    this.runOnDisk = this.runId !== '' && String(Storage.readJson(SAVE_KEYS.writeKeys).run_id ?? '') === this.runId;
  }

  isCleared(zone: string, act: number): boolean {
    return this.cleared.has(`${zone}:${act}`);
  }

  bestTime(zone: string, act: number): number | null {
    return this.bestTimes.get(`${zone}:${act}`) ?? null;
  }

  /** Records a cleared act and its best (lowest) time. Returns that best time. */
  recordClear(zone: string, act: number, timeSec: number): number {
    const id = `${zone}:${act}`;
    this.cleared.add(id);
    const prev = this.bestTimes.get(id);
    const best = prev === undefined ? timeSec : Math.min(prev, timeSec);
    this.bestTimes.set(id, best);
    this.writeProgress();
    return best;
  }

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

  private writeProgress(): void {
    const list = [...this.cleared].sort();
    Storage.writeJson(SAVE_KEYS.progress, { cleared: list, best_times: Object.fromEntries(this.bestTimes) });
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
    // change the amount the other tab already saved.
    if (localAcked && !diskAcked) merged[runId] = localRec;
  }
  return merged;
}

function mergeIdMap(diskValue: unknown, localValue: unknown): Json {
  const merged: Json = isObj(diskValue) ? structuredClone(diskValue) : {};
  if (isObj(localValue)) for (const [id, v] of Object.entries(localValue)) if (!(id in merged)) merged[id] = v;
  return merged;
}
