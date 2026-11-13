// Progress per hub account (hub SDK 0.8.0 createProgressStore, src/hub/progress.ts).
// Progress belongs to the account that earned it and loads on any device; play
// outside a hub session, and every save from before the store, stays with the
// browser and never moves into an account.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAVE_MAX_BYTES, type HubSdk, type HubSessionInfo, type ProgressCloud, type SaveResult } from '@hub-sdk';
import { Emeralds } from '../../src/core/emeralds';
import { GameState } from '../../src/core/game_state';
import { RANKS, type Rank } from '../../src/core/rank';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { GAME_ID, HubClient } from '../../src/hub/hub_client';
import { HubSave } from '../../src/hub/hub_save';
import { emptyProgress, mergeProgress, normalizeProgress, type Progress } from '../../src/hub/progress';
import { memoryStore, SAVE_KEYS, Storage, type KeyValue } from '../../src/hub/storage';

const ZONE_A = 'z1_retro_rush_hills';
const ZONE_B = 'z2_wizard_academy';
const accountKey = (playerId: string) => `${SAVE_KEYS.progress}@${playerId}`;

/** Cloud saves on a fake hub, one per player. */
function fakeHub() {
  const saves = new Map<string, SaveResult>();
  let writes = 0;
  return {
    saves,
    writes: () => writes,
    as: (player: string): ProgressCloud => ({
      loadSave: async () => saves.get(player) ?? { data: null, updatedAt: 0 },
      writeSave: async (data) => {
        writes++;
        const saved = { data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>, updatedAt: Date.now() };
        saves.set(player, saved);
        return saved;
      },
    }),
  };
}

/** A browser: its own localStorage, opened as one tab's save. */
function device(store: KeyValue = memoryStore()): { store: KeyValue; save: HubSave } {
  Storage.use(store);
  const save = new HubSave();
  save.loadAll();
  return { store, save };
}

function stored(store: KeyValue, key: string): Record<string, unknown> | null {
  const raw = store.getItem(key);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => {
  Storage.use(memoryStore());
});

describe('progress per hub account', () => {
  it('a new account on a used browser starts empty', async () => {
    const hub = fakeHub();
    const { store, save } = device();
    save.recordClear(ZONE_A, 1, 40, 'A');
    save.recordEmerald(ZONE_A, 1);
    await save.attach(hub.as('alice'), 'alice');
    save.recordClear(ZONE_B, 1, 70, 'B');
    await save.flush();

    // A second account on the same browser sees neither the device's nor alice's progress.
    await save.attach(hub.as('bob'), 'bob');
    expect(save.owner()).toEqual({ kind: 'account', playerId: 'bob' });
    expect(save.cleared.size).toBe(0);
    expect(save.emeralds.size).toBe(0);
    expect(save.bestTime(ZONE_A, 1)).toBeNull();
    expect(save.unlockAll).toBe(false);
    expect(hub.saves.get('bob')).toBeUndefined(); // nothing earned: nothing written

    // Each account's copy is its own key; the device copy is untouched by both.
    expect(stored(store, accountKey('alice'))).toMatchObject({ cleared: [`${ZONE_B}:1`] });
    expect(stored(store, SAVE_KEYS.progress)).toMatchObject({ cleared: [`${ZONE_A}:1`], emeralds: [Emeralds.key(ZONE_A, 1)] });
    save.release();
    expect([...save.cleared]).toEqual([`${ZONE_A}:1`]);
  });

  it('device progress never reaches an account or its cloud save', async () => {
    const hub = fakeHub();
    const { store, save } = device();
    save.recordClear(ZONE_A, 1, 40, 'S');
    save.recordClear(ZONE_A, 2, 50, 'A');
    save.recordEmerald(ZONE_A, 2);
    await save.attach(hub.as('alice'), 'alice');
    expect(save.cleared.size).toBe(0);
    save.recordClear(ZONE_B, 2, 90);
    await save.flush();
    const cloud = hub.saves.get('alice')?.data as unknown as Progress;
    expect(cloud.cleared).toEqual([`${ZONE_B}:2`]);
    expect(cloud.emeralds).toEqual([]);
    expect(Object.keys(cloud.best_times)).toEqual([`${ZONE_B}:2`]);
    expect(stored(store, accountKey('alice'))).toEqual(cloud);
    // And the account's progress never comes back to the device.
    save.release();
    expect(save.isCleared(ZONE_B, 2)).toBe(false);
  });

  it('a second device loads the account from its cloud save', async () => {
    const hub = fakeHub();
    const laptop = device();
    await laptop.save.attach(hub.as('alice'), 'alice');
    laptop.save.recordClear(ZONE_A, 1, 41.5, 'A');
    laptop.save.recordEmerald(ZONE_A, 1);
    await laptop.save.flush();
    expect(laptop.save.sync()).toBe('synced');

    // A phone that has never seen alice, with its own play outside the hub.
    const phone = device();
    phone.save.recordClear(ZONE_B, 1, 20);
    await phone.save.attach(hub.as('alice'), 'alice');
    expect(phone.save.isCleared(ZONE_A, 1)).toBe(true);
    expect(phone.save.isCleared(ZONE_B, 1)).toBe(false);
    expect(phone.save.bestTime(ZONE_A, 1)).toBe(41.5);
    expect(phone.save.bestRank(ZONE_A, 1)).toBe('A');
    expect([...phone.save.emeralds]).toEqual([Emeralds.key(ZONE_A, 1)]);

    // Both devices advance; the cloud keeps the union, the lower time and the better rank.
    phone.save.recordClear(ZONE_A, 1, 39, 'B');
    phone.save.recordClear(ZONE_A, 2, 60, 'C');
    await phone.save.flush();
    Storage.use(laptop.store);
    laptop.save.recordClear(ZONE_A, 1, 45, 'S');
    await laptop.save.flush();
    expect(hub.saves.get('alice')?.data).toMatchObject({
      cleared: [`${ZONE_A}:1`, `${ZONE_A}:2`],
      best_times: { [`${ZONE_A}:1`]: 39, [`${ZONE_A}:2`]: 60 },
      best_ranks: { [`${ZONE_A}:1`]: 'S', [`${ZONE_A}:2`]: 'C' },
    });
  });

  it('wins while the hub visit starts go to the account, not the device', async () => {
    const hub = fakeHub();
    const { store, save } = device();
    save.hold();
    expect(save.owner().kind).toBe('pending');
    save.recordClear(ZONE_A, 1, 33, 'S');
    save.recordEmerald(ZONE_A, 1);
    expect(stored(store, SAVE_KEYS.progress)).toBeNull(); // held in memory only
    await save.attach(hub.as('alice'), 'alice');
    expect(save.isCleared(ZONE_A, 1)).toBe(true);
    expect(hub.saves.get('alice')?.data).toMatchObject({ cleared: [`${ZONE_A}:1`], emeralds: [Emeralds.key(ZONE_A, 1)] });
    expect(stored(store, SAVE_KEYS.progress)).toBeNull();

    // A visit that turns out standalone gives its wins to the device instead.
    const other = device();
    other.save.hold();
    other.save.recordClear(ZONE_B, 1, 50);
    other.save.release();
    expect(stored(other.store, SAVE_KEYS.progress)).toMatchObject({ cleared: [`${ZONE_B}:1`] });
  });

  it('legacy saves (v0..v2 progress.json and the Godot import) stay on the device', async () => {
    const hub = fakeHub();
    const store = memoryStore();
    const old = { v: 1, cleared: [`${ZONE_A}:1`, `${ZONE_A}:2`], best_times: { [`${ZONE_A}:1`]: 42 }, emeralds: [Emeralds.key(ZONE_A, 1)] };
    store.setItem(SAVE_KEYS.legacyProgress, JSON.stringify(old));
    const { save } = device(store);
    expect(save.owner().kind).toBe('device');
    expect(save.isCleared(ZONE_A, 2)).toBe(true);
    expect(save.unlockAll).toBe(true);
    expect(save.emeralds.has(Emeralds.key(ZONE_A, 1))).toBe(true);

    await save.attach(hub.as('alice'), 'alice');
    expect(save.cleared.size).toBe(0);
    expect(save.unlockAll).toBe(false);
    save.recordClear(ZONE_B, 1, 80);
    await save.flush();
    expect(hub.saves.get('alice')?.data).toMatchObject({ cleared: [`${ZONE_B}:1`], emeralds: [], unlock_all: false });
    // The old file itself is never rewritten.
    expect(stored(store, SAVE_KEYS.legacyProgress)).toEqual(old);
  });

  it('the largest possible save fits in the cloud save with room to spare', () => {
    const big: Progress = emptyProgress();
    for (const zone of ZoneRegistry.allZones(true)) {
      for (let stage = 1; stage <= zone.acts.length + 1; stage++) {
        const id = `${zone.id}:${stage}`;
        big.cleared.push(id);
        big.best_times[id] = 86_399.999;
        big.best_ranks[id] = 'S';
      }
    }
    big.emeralds.push(...Emeralds.allKeys());
    big.unlock_all = true;
    const full = normalizeProgress(big);
    expect(full.cleared.length).toBe(big.cleared.length);
    const bytes = new TextEncoder().encode(JSON.stringify(full)).length;
    // Today's game is well under a tenth of the limit; four times as many stages would still fit.
    expect(bytes * 4).toBeLessThan(SAVE_MAX_BYTES);
  });

  it('merge keeps everything and gives the same result in any order', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const ids = [`${ZONE_A}:1`, `${ZONE_A}:2`, `${ZONE_A}:3`, `${ZONE_B}:1`, `${ZONE_B}:2`];
    const random = (): Progress => {
      const p = emptyProgress();
      for (const id of ids) {
        if (rand(2)) p.cleared.push(id);
        if (rand(2)) p.best_times[id] = rand(100);
        if (rand(2)) p.best_ranks[id] = RANKS[rand(RANKS.length)] as Rank;
        if (rand(3) === 0) p.emeralds.push(id);
      }
      p.unlock_all = rand(4) === 0;
      return normalizeProgress(p);
    };
    for (let i = 0; i < 200; i++) {
      const a = random();
      const b = random();
      const c = random();
      expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
      expect(mergeProgress(mergeProgress(a, b), c)).toEqual(mergeProgress(a, mergeProgress(b, c)));
      expect(mergeProgress(a, a)).toEqual(a);
      const m = mergeProgress(a, b);
      for (const id of a.cleared) expect(m.cleared).toContain(id);
      for (const [id, t] of Object.entries(a.best_times)) expect(m.best_times[id]).toBeLessThanOrEqual(t);
      for (const [id, r] of Object.entries(a.best_ranks)) expect(RANKS.indexOf(m.best_ranks[id]!)).toBeLessThanOrEqual(RANKS.indexOf(r));
      expect(m.unlock_all).toBe(a.unlock_all || b.unlock_all);
    }
  });

  it('normalize drops junk, keeps ids from newer builds and never throws', () => {
    for (const junk of [null, 7, 'x', [], { cleared: 'a' }, { best_times: [1] }, { best_ranks: null }]) {
      expect(normalizeProgress(junk)).toEqual(emptyProgress());
    }
    expect(
      normalizeProgress({
        cleared: [`${ZONE_A}:1`, 'z9_future_zone:2', 'nope', 3, `${ZONE_A}:1`],
        best_times: { [`${ZONE_A}:1`]: 12.5, [`${ZONE_A}:2`]: -1, [`${ZONE_A}:3`]: 'x', bad: 4 },
        best_ranks: { [`${ZONE_A}:1`]: 'S', [`${ZONE_A}:2`]: 'Z' },
        emeralds: ['z9_future_zone:1', 'junk'],
        unlock_all: 'yes',
      }),
    ).toEqual({
      v: 3,
      cleared: [`${ZONE_A}:1`, 'z9_future_zone:2'],
      best_times: { [`${ZONE_A}:1`]: 12.5 },
      best_ranks: { [`${ZONE_A}:1`]: 'S' },
      emeralds: ['z9_future_zone:1'],
      unlock_all: false,
    });
  });
});

// --- HubClient: who owns the visit's progress ------------------------------------------

/** An SDK double whose init waits for the test, with a cloud save and a session switch. */
function clientSdk(hub: ReturnType<typeof fakeHub>, playerId: string, sessionOn: boolean) {
  let answer: (v: unknown) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const cloud = hub.as(playerId);
  const sdk = {
    init: () =>
      new Promise((resolve, reject) => {
        answer = resolve;
        fail = reject;
      }),
    getSession: (): HubSessionInfo | null =>
      sessionOn ? { token: 't', playerId, game: GAME_ID, ranked: false, expiresAt: Date.now() + 3_600_000 } : null,
    getTicketBalance: async () => ({ balance: 0 }),
    earnTickets: () => new Promise(() => {}),
    reportEvent: () => new Promise(() => {}),
    submitScore: () => new Promise(() => {}),
    exit: () => {},
    loadSave: cloud.loadSave,
    writeSave: cloud.writeSave,
  };
  return {
    sdk: sdk as unknown as HubSdk,
    resolve: async (payload: Record<string, unknown>) => {
      answer(payload);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    reject: async (err: unknown) => {
      fail(err);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

describe('HubClient and progress owners', () => {
  afterEach(() => {
    HubClient.shutdown();
    GameState.clearEmeralds();
  });

  it('holds a starting visit, then gives it to the live session\'s account (playerId from init)', async () => {
    const hub = fakeHub();
    const store = memoryStore();
    Storage.use(store);
    store.setItem(SAVE_KEYS.progress, JSON.stringify({ ...emptyProgress(), emeralds: [Emeralds.key(ZONE_B, 1)] }));
    const { sdk, resolve } = clientSdk(hub, 'alice', true);
    const done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    expect(HubClient.save.owner().kind).toBe('pending');
    // The device's emerald is not shown while the visit's account is unknown.
    expect(GameState.emeraldCount()).toBe(0);
    HubClient.save.recordEmerald(ZONE_A, 1);
    expect(GameState.hasEmerald(ZONE_A, 1)).toBe(true);
    await resolve({ playerId: 'alice', relics: [], effects: {} });
    await done;
    expect(HubClient.playerId).toBe('alice');
    expect(HubClient.save.owner()).toEqual({ kind: 'account', playerId: 'alice' });
    await HubClient.save.flush();
    expect(hub.saves.get('alice')?.data).toMatchObject({ emeralds: [Emeralds.key(ZONE_A, 1)] });
    expect(stored(store, SAVE_KEYS.progress)).toMatchObject({ emeralds: [Emeralds.key(ZONE_B, 1)] });
    expect([...GameState.emeralds]).toEqual([Emeralds.key(ZONE_A, 1)]);
  });

  it('a standalone answer (a profile but no live session) gives the held progress to the device', async () => {
    const hub = fakeHub();
    const store = memoryStore();
    Storage.use(store);
    const { sdk, resolve } = clientSdk(hub, 'local-guest', false);
    const done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    HubClient.save.recordClear(ZONE_A, 1, 30);
    await resolve({ playerId: 'local-guest', relics: [], effects: {} });
    await done;
    expect(HubClient.playerId).toBeNull();
    expect(HubClient.save.owner().kind).toBe('device');
    expect(stored(store, SAVE_KEYS.progress)).toMatchObject({ cleared: [`${ZONE_A}:1`] });
    expect(store.getItem(accountKey('local-guest'))).toBeNull();
    expect(hub.writes()).toBe(0);
  });

  it('a failed init gives the held progress to the device', async () => {
    const store = memoryStore();
    Storage.use(store);
    const { sdk, reject } = clientSdk(fakeHub(), 'alice', true);
    const done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    HubClient.save.recordClear(ZONE_A, 1, 30);
    await reject(new Error('offline'));
    await done;
    expect(HubClient.save.owner().kind).toBe('device');
    expect(stored(store, SAVE_KEYS.progress)).toMatchObject({ cleared: [`${ZONE_A}:1`] });
  });

  it('a new account after another on the same browser shows only its own emeralds and clears', async () => {
    const hub = fakeHub();
    Storage.use(memoryStore());
    const first = clientSdk(hub, 'alice', true);
    const one = HubClient.init({ sdk: first.sdk, hubUrl: '/hub/', visitStarting: true });
    await first.resolve({ playerId: 'alice', relics: [], effects: {} });
    await one;
    HubClient.save.recordClear(ZONE_A, 1, 30);
    HubClient.save.recordEmerald(ZONE_A, 1);
    expect(GameState.emeraldCount()).toBe(1);
    // A reload as another hub account.
    HubClient.shutdown();
    const second = clientSdk(hub, 'bob', true);
    const two = HubClient.init({ sdk: second.sdk, hubUrl: '/hub/', visitStarting: true });
    await second.resolve({ playerId: 'bob', relics: [], effects: {} });
    await two;
    expect(HubClient.isCleared(ZONE_A, 1)).toBe(false);
    expect(GameState.emeraldCount()).toBe(0);
  });
});
