// End to end against the vendored hub SDK itself (its in-memory mock server):
// a portal ticket in #t= is redeemed and stripped, an act clear banks its
// tickets once with the attempt's run id, a retry never pays twice, the
// Zone 1 Act 1 clear grants the HPOS10I Core Relic, and a Ranked session's
// time reaches the board.
import { beforeEach, describe, expect, it } from 'vitest';
import { createHubSdk, memoryKeyValue, mintMockTicket } from '@hub-sdk';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { HubClient } from '../../src/hub/hub_client';
import { memoryStore, Storage } from '../../src/hub/storage';

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function makeSdk(hash: { value: string }, local = memoryKeyValue(), session = memoryKeyValue()) {
  return createHubSdk({
    useMock: true,
    local,
    session,
    readHash: () => hash.value,
    writeHash: (h: string) => {
      hash.value = h;
    },
    assign: () => undefined,
  });
}

function clearAct(zone: string, act: number, tickets: number, seconds: number): void {
  SceneRouter.zoneId = zone;
  SceneRouter.stage = act;
  SceneRouter.freeScene = '';
  GameState.startLevel(zone, act);
  GameState.addTickets(tickets);
  GameState.levelTime = seconds;
  GameState.attemptTime = seconds;
  GameState.completeLevel();
}

describe('hub client against the SDK mock server', () => {
  beforeEach(() => {
    Storage.use(memoryStore());
    HubClient.shutdown();
  });

  it('redeems the portal ticket, banks an act clear once and grants the Relic', async () => {
    const token = await mintMockTicket({ game: 'hpos10i', playerId: 'player-1', ranked: true });
    const hash = { value: `#t=${token}` };
    const local = memoryKeyValue();
    const session = memoryKeyValue();
    await HubClient.init({ sdk: makeSdk(hash, local, session), hubUrl: '/hub/' });
    expect(HubClient.reach).toBe('ready');
    expect(HubClient.inSession).toBe(true);
    expect(HubClient.ranked).toBe(true);
    expect(hash.value).not.toContain('t=');

    clearAct('z1_retro_rush_hills', 1, 17, 95.5);
    await flush();
    expect(HubClient.balanceKnown).toBe(true);
    expect(HubClient.ticketBalance).toBe(17);
    expect(HubClient.save.unackedEarns()).toEqual([]);

    // The same attempt reported again (a retry) does not pay twice.
    GameState.completeLevel();
    await flush();
    expect(HubClient.ticketBalance).toBe(17);

    // A new attempt pays again.
    clearAct('z1_retro_rush_hills', 2, 10, 120);
    await flush();
    expect(HubClient.ticketBalance).toBe(27);

    // Reload the tab: the saved session is reused and the Relic from the Zone 1 Act 1 clear is owned.
    HubClient.shutdown();
    await HubClient.init({ sdk: makeSdk(hash, local, session), hubUrl: '/hub/' });
    expect(HubClient.inSession).toBe(true);
    expect(HubClient.relics).toContain('hpos10i_core');
  });

  it('plays standalone with no ticket and no session', async () => {
    const hash = { value: '' };
    await HubClient.init({ sdk: makeSdk(hash), hubUrl: '/hub/' });
    expect(HubClient.inSession).toBe(false);
    clearAct('z1_retro_rush_hills', 1, 5, 60);
    await flush();
    expect(HubClient.balanceKnown).toBe(false);
    // The earn stays saved (unacked) for the next session, with its key.
    expect(HubClient.save.unackedEarns().length).toBe(1);
  });

  it('resends an earn saved before a lost answer, with the same key, after the next init', async () => {
    const token = await mintMockTicket({ game: 'hpos10i', playerId: 'player-2', ranked: false });
    const hash = { value: `#t=${token}` };
    const local = memoryKeyValue();
    const session = memoryKeyValue();
    // First visit: no session yet (no ticket), so the clear is saved but not paid.
    await HubClient.init({ sdk: makeSdk({ value: '' }, local, memoryKeyValue()), hubUrl: '/hub/' });
    clearAct('z2_wizard_academy', 1, 19, 140);
    await flush();
    const pending = HubClient.save.unackedEarns();
    expect(pending.length).toBe(1);
    // Next visit through the portal: the saved earn goes out with its original run id.
    HubClient.shutdown();
    await HubClient.init({ sdk: makeSdk(hash, local, session), hubUrl: '/hub/' });
    await flush();
    expect(HubClient.ticketBalance).toBe(19);
    expect(HubClient.save.unackedEarns()).toEqual([]);
  });
});

describe('the per-act earn maximum', () => {
  beforeEach(() => {
    Storage.use(memoryStore());
    HubClient.shutdown();
  });

  it('banks at most 20 Tickets per act clear (the hub refuses more)', async () => {
    const token = await mintMockTicket({ game: 'hpos10i', playerId: 'player-cap', ranked: false });
    await HubClient.init({ sdk: makeSdk({ value: `#t=${token}` }), hubUrl: '/hub/' });
    clearAct('z1_retro_rush_hills', 1, 137, 90);
    await flush();
    expect(HubClient.ticketBalance).toBe(20);
    expect(HubClient.save.unackedEarns()).toEqual([]);
  });

  it('resends an over-cap earn saved by an older build as 20, with the same key', async () => {
    // An older build saved a 137-Ticket earn that the server refused.
    const first = await mintMockTicket({ game: 'hpos10i', playerId: 'player-old', ranked: false });
    await HubClient.init({ sdk: makeSdk({ value: '' }), hubUrl: '/hub/' });
    SceneRouter.zoneId = 'z1_retro_rush_hills';
    SceneRouter.stage = 1;
    SceneRouter.freeScene = '';
    GameState.startLevel('z1_retro_rush_hills', 1);
    const runId = HubClient.save.currentRunId();
    expect(HubClient.save.commitEarn(runId, 137)).toBe(true);
    HubClient.shutdown();
    await HubClient.init({ sdk: makeSdk({ value: `#t=${first}` }), hubUrl: '/hub/' });
    await flush();
    expect(HubClient.ticketBalance).toBe(20);
    expect(HubClient.save.earnRecord(runId)).toEqual({ amount: 20, acked: true });
  });

  it('a refused over-cap earn is retried capped, and final errors are dropped', async () => {
    const calls: { amount: number; key: string }[] = [];
    const sdk = {
      init: async () => ({ ranked: false, relics: [], effects: {}, ticketsCapLeft: 1000 }),
      getSession: () => ({ token: 't', playerId: 'p', game: 'hpos10i', ranked: false, expiresAt: 0 }),
      reportEvent: async () => ({}),
      submitScore: async () => undefined,
      earnTickets: async (amount: number, _reason: string, key: string) => {
        calls.push({ amount, key });
        if (amount > 20) throw Object.assign(new Error('amount_over_rule'), { code: 'amount_over_rule' });
        if (calls.length > 2) throw Object.assign(new Error('unknown_reason'), { code: 'unknown_reason' });
        return { balance: amount, capped: false };
      },
      exit: () => undefined,
    } as unknown as import('@hub-sdk').HubSdk;
    await HubClient.init({ sdk, hubUrl: '/hub/' });
    SceneRouter.zoneId = 'z1_retro_rush_hills';
    SceneRouter.stage = 1;
    SceneRouter.freeScene = '';
    GameState.startLevel('z1_retro_rush_hills', 1);
    const runId = HubClient.save.currentRunId();
    HubClient.save.commitEarn(runId, 50);
    HubClient.shutdown();
    await HubClient.init({ sdk, hubUrl: '/hub/' });
    await flush();
    expect(calls.map((c) => c.amount)).toEqual([20]);
    expect(calls[0]!.key).toBe(runId);
    expect(HubClient.ticketBalance).toBe(20);
  });
});

describe('outbox repair', () => {
  it('marks over-cap and already-settled earns undeliverable, nothing else', async () => {
    const { isUndeliverable } = await import('../../src/hub/outbox_repair');
    Storage.use(memoryStore());
    const save = HubClient.save;
    save.loadAll();
    expect(isUndeliverable({ key: 'a', rpc: 'tickets.earn', gameId: 'hpos10i', body: { amount: 137 } }, save)).toBe(true);
    expect(isUndeliverable({ key: 'b', rpc: 'tickets.earn', gameId: 'hpos10i', body: { amount: 12 } }, save)).toBe(false);
    expect(isUndeliverable({ key: 'c', rpc: 'session.event', gameId: 'hpos10i', body: {} }, save)).toBe(false);
    expect(isUndeliverable({ key: 'd', rpc: 'tickets.earn', gameId: 'nobu', body: { amount: 500 } }, save)).toBe(false);
    save.commitEarn('e', 12);
    save.ackEarn('e');
    expect(isUndeliverable({ key: 'e', rpc: 'tickets.earn', gameId: 'hpos10i', body: { amount: 12 } }, save)).toBe(true);
  });
});
