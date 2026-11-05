// Client-side duplication tests for the hub earn flow (port of
// tests/hub/test_hub_duplication.gd against src/hub/hub_client.ts and
// src/hub/hub_save.ts). The SDK is a double that records every call and
// leaves its promise open until the test answers it, so a case can lose a
// response, fail the transport or return a chosen payload. The local outbox
// is the unacked rows of the write-keys save (Storage, in memory here).
//
// The Ticket -> Verse exchange was removed on purpose (the server refuses
// exchanges for this game), so its cases are gone. New here: every act clear
// reports hpos10i.level_complete with its own key, and only Zone 1 Act 1
// posts to the act-time board.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubSdk, HubSessionInfo } from '@hub-sdk';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { MAIN_SCENE, Scenes } from '../../src/core/scenes';
import { ZoneRegistry } from '../../src/core/zone_registry';
import { BOARD_ACT_TIME, EARN_REASON, EVENT_LEVEL_COMPLETE, GAME_ID, HubClient } from '../../src/hub/hub_client';
import { HubSave } from '../../src/hub/hub_save';
import { memoryStore, SAVE_KEYS, Storage, type KeyValue } from '../../src/hub/storage';
import { Node } from '../../src/runtime/node';
import { tree } from '../../src/runtime/tree';
import { Checks } from '../helpers/check';

const ZONE_A = 'z1_retro_rush_hills';
const ZONE_B = 'z2_wizard_academy';

type Call = { method: string; args: unknown[]; resolve: (v: unknown) => void; reject: (e: unknown) => void };

/** Stand-in for the hub SDK: every call is recorded and stays open until the test replies. */
class FakeSdk implements HubSdk {
  readonly calls: Call[] = [];
  /** getSession() answer: a re-init resends pending earns only with a session. */
  sessionOn = true;

  private pend<T>(method: string, args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => this.calls.push({ method, args, resolve: resolve as (v: unknown) => void, reject }));
  }

  redeemTicket: HubSdk['redeemTicket'] = (input) => this.pend('redeemTicket', [input]);
  init: HubSdk['init'] = (gameId) => this.pend('init', [gameId]);
  reportEvent: HubSdk['reportEvent'] = (eventId, data, key) => this.pend('reportEvent', [eventId, data, key]);
  submitScore: HubSdk['submitScore'] = (boardId, value, meta) => this.pend('submitScore', [boardId, value, meta]);
  earnTickets: HubSdk['earnTickets'] = (amount, reason, key) => this.pend('earnTickets', [amount, reason, key]);
  exchange: HubSdk['exchange'] = (tickets, key) => this.pend('exchange', [tickets, key]);
  spendTickets: HubSdk['spendTickets'] = (shopId, itemId, packs, key) => this.pend('spendTickets', [shopId, itemId, packs, key]);
  sellItem: HubSdk['sellItem'] = (shopId, itemId, packs, key) => this.pend('sellItem', [shopId, itemId, packs, key]);
  getTicketBalance: HubSdk['getTicketBalance'] = () => this.pend('getTicketBalance', []);
  exit(): void {}
  getSession(): HubSessionInfo | null {
    return this.sessionOn ? { token: 'token', playerId: 'player', game: GAME_ID, ranked: false, expiresAt: Date.now() + 3_600_000 } : null;
  }

  of(method: string): Call[] {
    return this.calls.filter((k) => k.method === method);
  }

  earns(): { call: Call; amount: number; reason: string; key: string }[] {
    return this.of('earnTickets').map((call) => ({ call, amount: Number(call.args[0]), reason: String(call.args[1]), key: String(call.args[2]) }));
  }

  ledger(): string {
    return this.calls.map((k) => `${k.method}${JSON.stringify(k.args)}`).join(', ');
  }
}

/** Lets settled promises run their handlers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function reply(call: Call, ok: boolean, payload: Record<string, unknown>): Promise<void> {
  if (ok) call.resolve(structuredClone(payload));
  else call.reject(Object.assign(new Error(String(payload.message ?? payload.code)), payload));
  await settle();
}

/** Starts the client on a new SDK double and answers its init. */
async function boot(sessionOn = true): Promise<FakeSdk> {
  HubClient.shutdown();
  const sdk = new FakeSdk();
  sdk.sessionOn = sessionOn;
  const done = HubClient.init({ sdk, hubUrl: '/hub/' });
  const init = sdk.of('init')[0]!;
  init.resolve({ effects: {}, ticketsCapLeft: 40 });
  await done;
  await settle();
  return sdk;
}

/** Re-runs init on the same SDK (the next init of this session). */
async function reinit(sdk: FakeSdk): Promise<void> {
  const done = HubClient.init({ sdk, hubUrl: '/hub/' });
  const inits = sdk.of('init');
  inits[inits.length - 1]!.resolve({ effects: {}, ticketsCapLeft: 40 });
  await done;
  await settle();
}

/** A fresh attempt of `zone` act `act` that clears with `tickets`. Returns its earn key. */
function playAttempt(zone: string, act: number, tickets: number, router = true): string {
  if (router) {
    SceneRouter.zoneId = zone;
    SceneRouter.stage = act;
  }
  GameState.startLevel(zone, act);
  const key = HubClient.save.currentRunId();
  if (tickets > 0) {
    GameState.addTickets(tickets);
    GameState.completeLevel();
  }
  return key;
}

function keysData(): Record<string, unknown> {
  return Storage.readJson(SAVE_KEYS.writeKeys);
}

function earnRow(runId: string): Record<string, unknown> {
  const map = keysData().earn_by_run as Record<string, Record<string, unknown>> | undefined;
  return map?.[runId] ?? {};
}

function pendingEarnKeys(): string[] {
  const save = new HubSave();
  save.loadAll();
  return save
    .unackedEarns()
    .map((r) => r.runId)
    .sort();
}

/** A store whose write-keys value can't be written (a blocked save). */
function blockedKeysStore(): KeyValue {
  const inner = memoryStore();
  return {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      if (k === SAVE_KEYS.writeKeys) throw new Error('quota');
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
  };
}

beforeEach(() => {
  Storage.use(memoryStore());
  HubClient.shutdown();
  SceneRouter.freeScene = '';
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
  GameState.resetGame();
});

afterEach(() => {
  HubClient.shutdown();
  SceneRouter.freeScene = '';
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
  GameState.resetGame();
});

describe('hub earns', () => {
  it('case 1: a rejection acks, credits nothing and is not resent', async () => {
    const c = new Checks();
    // idempotency_mismatch, a session cap, and a daily cap. Any *_cap is terminal.
    for (const code of ['idempotency_mismatch', 'session_ticket_cap', 'daily_cap']) {
      Storage.use(memoryStore());
      GameState.resetGame();
      const sdk = await boot();
      const key = playAttempt(ZONE_B, 1, 7);
      const sent = sdk.earns();
      c.eq(sent.length, 1, `${code}: earnTickets sent once before the error (${sdk.ledger()})`);
      if (sent.length === 0) continue;
      c.eq(sent[0]!.key, key, `${code}: sent the attempt key`);
      c.eq(sent[0]!.amount, 7, `${code}: sent the attempt amount`);
      c.eq(sent[0]!.reason, EARN_REASON, `${code}: earn reason`);
      await reply(sent[0]!.call, false, { code, message: code });
      c.eq(HubClient.ticketBalance, 0, `${code}: nothing credited`);
      c.true(!HubClient.balanceKnown, `${code}: balance was not applied`);
      c.eq(pendingEarnKeys().join(), '', `${code}: dropped from pending`);
      c.true(earnRow(key).acked === true, `${code}: pending row is acked in the save`);
      c.eq(Number(earnRow(key).amount), 7, `${code}: acked row keeps the amount`);
      const again = await boot();
      c.eq(again.earns().length, 0, `${code}: re-init resent ${again.ledger()}`);
      c.eq(HubClient.ticketBalance, 0, `${code}: re-init credited nothing`);
      c.true(!HubClient.balanceKnown, `${code}: re-init did not apply a balance`);
    }
    c.done();
  });

  it('case 2: a transport failure resends the same key and credits once', async () => {
    const c = new Checks();
    for (const mode of ['rpc_failed', 'lost']) {
      Storage.use(memoryStore());
      GameState.resetGame();
      const sdk = await boot();
      const key = playAttempt(ZONE_B, 1, 9);
      const first = sdk.earns();
      c.eq(first.length, 1, `${mode}: first send (${sdk.ledger()})`);
      if (first.length === 0) continue;
      c.eq(first[0]!.key, key, `${mode}: first key`);
      c.eq(first[0]!.amount, 9, `${mode}: first amount`);
      // A lost response never settles.
      if (mode === 'rpc_failed') await reply(first[0]!.call, false, { code: 'rpc_failed', message: 'HTTP 503' });
      c.eq(HubClient.ticketBalance, 0, `${mode}: no credit before a success`);
      c.true(!HubClient.balanceKnown, `${mode}: balance unknown before a success`);
      c.eq(pendingEarnKeys().join(), key, `${mode}: earn stays pending`);
      const again = await boot();
      const resent = again.earns();
      c.eq(resent.length, 1, `${mode}: resent on the next init (${again.ledger()})`);
      if (resent.length === 0) continue;
      c.eq(resent[0]!.key, key, `${mode}: resent the same key`);
      c.eq(resent[0]!.amount, 9, `${mode}: resent the same amount`);
      await reply(resent[0]!.call, true, { balance: 9, capped: false });
      c.eq(HubClient.ticketBalance, 9, `${mode}: credited the attempt once`);
      c.true(HubClient.balanceKnown, `${mode}: balance applied once`);
      c.eq(pendingEarnKeys().join(), '', `${mode}: success clears pending`);
      const sendsAfterSuccess = again.earns().length;
      await reinit(again);
      c.eq(again.earns().length, sendsAfterSuccess, `${mode}: the following init on this session does not resend`);
      const later = await boot();
      c.eq(later.earns().length, 0, `${mode}: a later init does not resend (${later.ledger()})`);
      c.true(!HubClient.balanceKnown, `${mode}: the later init does not credit again`);
    }
    c.done();
  });

  it('unacked earns are resent only after a successful init with a session', async () => {
    const c = new Checks();
    const sdk = await boot();
    const key = playAttempt(ZONE_A, 2, 6);
    c.eq(sdk.earns().length, 1, 'sent on the clear');
    // Lost. The next init fails: nothing is resent.
    HubClient.shutdown();
    const failing = new FakeSdk();
    const done = HubClient.init({ sdk: failing, hubUrl: '/hub/' });
    failing.of('init')[0]!.reject(Object.assign(new Error('down'), { code: 'rpc_failed' }));
    await done;
    await settle();
    c.eq(HubClient.reach, 'offline', 'a failed init plays offline');
    c.eq(failing.earns().length, 0, 'a failed init resends nothing');
    // A successful init without a session: still nothing (a no-op answer must not ack).
    const standalone = await boot(false);
    c.eq(standalone.earns().length, 0, `no session: nothing resent (${standalone.ledger()})`);
    c.eq(pendingEarnKeys().join(), key, 'still pending');
    // With a session: resent once, with the same key and amount.
    const live = await boot(true);
    const resent = live.earns();
    c.eq(resent.length, 1, `resent after the next successful init (${live.ledger()})`);
    c.eq(resent[0]?.key, key, 'same key');
    c.eq(resent[0]?.amount, 6, 'same amount');
    c.done();
  });

  it('case 3: both write orders keep both earn keys and credit once', async () => {
    const c = new Checks();
    for (const aFirst of [true, false]) {
      const order = aFirst ? 'A then B' : 'B then A';
      Storage.use(memoryStore());
      GameState.resetGame();
      // Both tabs load the save before either earn is committed.
      const tabA = new HubSave();
      const tabB = new HubSave();
      tabA.loadAll();
      tabB.loadAll();
      c.true(tabA.beginAttempt(ZONE_A, 1), 'tab A beginAttempt');
      c.true(tabB.beginAttempt(ZONE_B, 1), 'tab B beginAttempt');
      const idA = tabA.currentRunId();
      const idB = tabB.currentRunId();
      if (aFirst) {
        c.true(tabA.commitEarn(idA, 11), 'tab A commitEarn');
        c.true(tabB.commitEarn(idB, 19), 'tab B commitEarn');
      } else {
        c.true(tabB.commitEarn(idB, 19), 'tab B commitEarn');
        c.true(tabA.commitEarn(idA, 11), 'tab A commitEarn');
      }
      c.eq(Number(earnRow(idA).amount), 11, `${order}: tab A's earn key kept with its amount`);
      c.eq(Number(earnRow(idB).amount), 19, `${order}: tab B's earn key kept with its amount`);
      const sdk = await boot();
      const sent = sdk.earns();
      const byKey = new Map<string, number>();
      for (const row of sent) byKey.set(row.key, (byKey.get(row.key) ?? 0) + 1);
      c.eq(byKey.get(idA) ?? 0, 1, `${order}: key A sent once (${sdk.ledger()})`);
      c.eq(byKey.get(idB) ?? 0, 1, `${order}: key B sent once`);
      c.eq(sent.length, 2, `${order}: one send per attempt`);
      const credited = new Map<string, number>();
      let serverBalance = 0;
      for (const row of sent) {
        if (!credited.has(row.key)) {
          credited.set(row.key, row.amount);
          serverBalance += row.amount;
        }
        await reply(row.call, true, { balance: serverBalance, capped: false });
      }
      c.eq(credited.get(idA), 11, `${order}: attempt A credited once`);
      c.eq(credited.get(idB), 19, `${order}: attempt B credited once`);
      c.eq(HubClient.ticketBalance, 30, `${order}: client balance is the two credits, not a double charge`);
      c.eq(pendingEarnKeys().join(), '', `${order}: both earns acked`);
      const sendsAfter = sdk.earns().length;
      await reinit(sdk);
      c.eq(sdk.earns().length, sendsAfter, `${order}: the next init does not resend either key`);
    }
    c.done();
  });

  it('case 3: an earn ack sticks across a stale second tab', async () => {
    const c = new Checks();
    // Both tabs have seen the unacked row. One acks; the other then saves from
    // its old copy. That write must not clear the ack or change the amount.
    const tabA = new HubSave();
    const tabB = new HubSave();
    tabA.loadAll();
    tabB.loadAll();
    c.true(tabA.beginAttempt(ZONE_A, 1), 'tab A attempt');
    const earnId = tabA.currentRunId();
    c.true(tabA.commitEarn(earnId, 15), 'tab A earn');
    tabB.loadAll();
    tabA.ackEarn(earnId);
    c.true(earnRow(earnId).acked === true, 'the ack reached the save before the stale write');
    // B last read the earn before the ack.
    c.true(tabB.beginAttempt(ZONE_B, 2), 'stale tab attempt');
    const staleId = tabB.currentRunId();
    c.true(tabB.commitEarn(staleId, 8), 'stale tab earn');
    c.true(earnRow(earnId).acked === true, 'the stale write cleared an earn ack');
    c.eq(Number(earnRow(earnId).amount), 15, 'the stale write changed the acked earn amount');
    c.eq(Number(earnRow(staleId).amount), 8, "the stale tab's own earn key was kept");
    // B acks nothing and rewrites its run again from the old copy: still acked.
    c.true(tabB.persistRun(), 'stale tab rewrote the save');
    c.true(earnRow(earnId).acked === true, 'a stale persistRun cleared the ack');
    // A stale ack of the other key from B also keeps A's ack.
    tabB.ackEarn(staleId);
    c.true(earnRow(earnId).acked === true && earnRow(staleId).acked === true, 'both acks stick');
    const reopened = new HubSave();
    reopened.loadAll();
    c.eq(reopened.unackedEarns().length, 0, 'nothing left to send');
    const sdk = await boot();
    c.eq(sdk.earns().length, 0, `an acked earn was sent again (${sdk.ledger()})`);
    c.done();
  });

  it('case 3: the open earn of a stale tab is credited once and the acked one never resent', async () => {
    const c = new Checks();
    const tabA = new HubSave();
    const tabB = new HubSave();
    tabA.loadAll();
    tabB.loadAll();
    tabA.beginAttempt(ZONE_A, 1);
    const earnId = tabA.currentRunId();
    tabA.commitEarn(earnId, 15);
    tabB.loadAll();
    tabA.ackEarn(earnId);
    tabB.beginAttempt(ZONE_B, 2);
    const staleId = tabB.currentRunId();
    tabB.commitEarn(staleId, 8);
    const sdk = await boot();
    const sent = sdk.earns();
    c.eq(sent.filter((r) => r.key === earnId).length, 0, `acked earn was sent again (${sdk.ledger()})`);
    c.eq(sent.filter((r) => r.key === staleId).length, 1, 'the open earn sent once');
    for (const row of sent) if (row.key === staleId) await reply(row.call, true, { balance: row.amount, capped: false });
    c.eq(HubClient.ticketBalance, 8, 'client balance matches that one credit');
    c.done();
  });

  it('case 4: one earn key across restart and respawn', async () => {
    const c = new Checks();
    for (const id of [MAIN_SCENE, ...ZoneRegistry.getZone('test_zone')!.acts]) Scenes.register(id, () => new Node(`Dummy:${id}`));
    const sdk = await boot();
    SceneRouter.startZone('test_zone', 1);
    tree.physicsStep();
    tree.physicsStep();
    const key = HubClient.save.currentRunId();
    c.true(key !== '', 'startZone did not mint an earn key');
    c.eq(sdk.earns().length, 0, 'starting an attempt must not send earnTickets');
    GameState.addTickets(4);
    GameState.restartFromCheckpoint();
    c.eq(HubClient.save.currentRunId(), key, 'restartFromCheckpoint minted a new earn key');
    c.eq(GameState.tickets, 0, 'restart clears the act tickets but not the earn key');
    tree.physicsStep();
    const lives = GameState.lives;
    SceneRouter.respawn();
    tree.physicsStep();
    tree.physicsStep();
    c.eq(GameState.lives, lives - 1, 'respawn did not run');
    c.eq(HubClient.save.currentRunId(), key, 'respawn minted a new earn key');
    c.eq(sdk.earns().length, 0, `respawn sent an earn (${sdk.ledger()})`);
    GameState.addTickets(4);
    GameState.completeLevel();
    const sent = sdk.earns();
    c.eq(sent.length, 1, `one earn for the attempt (${sdk.ledger()})`);
    c.eq(sent[0]?.key, key, 'the earn used the attempt key');
    c.eq(sent[0]?.amount, 4, 'the earn amount is the tickets banked for that attempt');
    // Die, come back, clear again with a different pile. Still the same key.
    tree.physicsStep();
    SceneRouter.respawn();
    tree.physicsStep();
    tree.physicsStep();
    c.eq(HubClient.save.currentRunId(), key, 'respawn after a clear minted a new earn key');
    GameState.addTickets(9);
    GameState.completeLevel();
    const again = sdk.earns();
    c.eq(again.length, 2, `the second clear retries the same pending earn (${sdk.ledger()})`);
    c.eq(again[1]?.key, key, 'the second clear used a new key');
    c.eq(again[1]?.amount, 4, 'the second clear changed the amount');
    c.done();
  });

  it('case 4: commitEarn keeps the first amount', async () => {
    const c = new Checks();
    const sdk = await boot();
    const key = playAttempt(ZONE_B, 1, 5);
    const first = sdk.earns();
    c.eq(first.length, 1, 'first clear sends one earn');
    c.eq(first[0]?.key, key, 'first key');
    c.eq(first[0]?.amount, 5, 'first amount');
    GameState.restartFromCheckpoint();
    GameState.addTickets(12);
    GameState.completeLevel();
    const second = sdk.earns();
    c.eq(second.length, 2, `second clear retries the pending earn (${sdk.ledger()})`);
    c.eq(second[1]?.key, key, 'second clear kept the key');
    c.eq(second[1]?.amount, 5, 'commitEarn replaced the first amount with 12');
    c.eq(Number(earnRow(key).amount), 5, 'the save kept the first amount');
    c.done();
  });

  it('case 4: a failed persist sends nothing', async () => {
    const c = new Checks();
    Storage.use(blockedKeysStore());
    const sdk = await boot();
    GameState.startLevel(ZONE_B, 1);
    const key = HubClient.save.currentRunId();
    c.true(key !== '', 'the attempt id is minted in memory before the save');
    c.true(!HubClient.save.isRunOnDisk(), 'a blocked save must not count as persisted');
    GameState.addTickets(3);
    GameState.completeLevel();
    c.eq(sdk.earns().length, 0, `failed persist sent earnTickets (${sdk.ledger()})`);
    c.eq(HubClient.save.currentRunId(), key, 'failed persist minted a replacement earn key');
    c.done();
  });
});

describe('hub reports', () => {
  it('every act clear reports level_complete with its own idempotency key', async () => {
    const c = new Checks();
    const sdk = await boot();
    // Two clears of the same act with the same time, then two other acts.
    playAttempt(ZONE_A, 1, 0);
    GameState.completeLevel();
    playAttempt(ZONE_A, 1, 0);
    GameState.completeLevel();
    playAttempt(ZONE_A, 2, 3);
    playAttempt(ZONE_B, 1, 4);
    const events = sdk.of('reportEvent');
    c.eq(events.length, 4, `one report per act clear (${sdk.ledger()})`);
    for (const e of events) c.eq(e.args[0], EVENT_LEVEL_COMPLETE, 'event id');
    const data = events.map((e) => e.args[1] as { zone: string; act: number });
    c.eq(data.map((d) => `${d.zone}:${d.act}`).join(), `${ZONE_A}:1,${ZONE_A}:1,${ZONE_A}:2,${ZONE_B}:1`, 'zone and act of each clear');
    const keys = events.map((e) => String(e.args[2]));
    c.eq(new Set(keys).size, 4, `each clear has its own key (${keys.join(', ')})`);
    for (const k of keys) c.true(/^[0-9a-f-]{36}$/.test(k), `a UUID key (${k})`);
    c.done();
  });

  it('a boss arena clear banks tickets but is not an act', async () => {
    const c = new Checks();
    const sdk = await boot();
    const zone = ZoneRegistry.getZone(ZONE_A)!;
    playAttempt(ZONE_A, zone.acts.length + 1, 5);
    c.eq(sdk.of('reportEvent').length, 0, 'no level_complete for the boss arena');
    c.eq(sdk.of('submitScore').length, 0, 'no act time for the boss arena');
    c.eq(sdk.earns().length, 1, 'its tickets are banked');
    c.done();
  });

  it('only Zone 1 Act 1 submits the act-time score', async () => {
    const c = new Checks();
    const sdk = await boot();
    playAttempt(ZONE_A, 1, 0);
    GameState.levelTime = 61.25;
    GameState.completeLevel();
    playAttempt(ZONE_A, 2, 2);
    playAttempt(ZONE_B, 1, 2);
    playAttempt(ZONE_B, 2, 2);
    playAttempt('test_zone', 1, 2);
    const scores = sdk.of('submitScore');
    c.eq(scores.length, 1, `one score, for Zone 1 Act 1 (${sdk.ledger()})`);
    c.eq(scores[0]?.args[0], BOARD_ACT_TIME, 'board');
    c.eq(scores[0]?.args[1], 61.25, 'the act time in seconds (the best so far)');
    c.eq(JSON.stringify(scores[0]?.args[2]), JSON.stringify({ zone: ZONE_A, act: 1 }), 'meta');
    // A slower clear posts the best time again.
    playAttempt(ZONE_A, 1, 0);
    GameState.levelTime = 70;
    GameState.completeLevel();
    c.eq(sdk.of('submitScore')[1]?.args[1], 61.25, 'the best time, not the slower one');
    c.done();
  });

  it('clears in a sandbox report nothing', async () => {
    const sdk = await boot();
    SceneRouter.freeScene = 'playground:physics';
    GameState.startLevel('', 1);
    GameState.addTickets(5);
    GameState.completeLevel();
    playAttempt(ZONE_A, 1, 5);
    // The boot's balance read is not a report.
    expect(sdk.calls.filter((k) => k.method !== 'init' && k.method !== 'getTicketBalance')).toEqual([]);
  });

  it('offline: no SDK, nothing sent, and the earn waits for the next session', async () => {
    const c = new Checks();
    await HubClient.init({ sdk: null, hubUrl: '/hub/' });
    c.eq(HubClient.reach, 'offline', 'offline without an SDK');
    const key = playAttempt(ZONE_A, 1, 4);
    c.eq(pendingEarnKeys().join(), key, 'kept as a pending earn');
    const sdk = await boot();
    c.eq(sdk.earns()[0]?.key, key, 'sent after the first successful init');
    c.done();
  });
});
