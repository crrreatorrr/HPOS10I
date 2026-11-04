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

    clearAct('z1_retro_rush_hills', 1, 37, 95.5);
    await flush();
    expect(HubClient.balanceKnown).toBe(true);
    expect(HubClient.ticketBalance).toBe(37);
    expect(HubClient.save.unackedEarns()).toEqual([]);

    // The same attempt reported again (a retry) does not pay twice.
    GameState.completeLevel();
    await flush();
    expect(HubClient.ticketBalance).toBe(37);

    // A new attempt pays again.
    clearAct('z1_retro_rush_hills', 2, 10, 120);
    await flush();
    expect(HubClient.ticketBalance).toBe(47);

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
    clearAct('z2_wizard_academy', 1, 21, 140);
    await flush();
    const pending = HubClient.save.unackedEarns();
    expect(pending.length).toBe(1);
    // Next visit through the portal: the saved earn goes out with its original run id.
    HubClient.shutdown();
    await HubClient.init({ sdk: makeSdk(hash, local, session), hubUrl: '/hub/' });
    await flush();
    expect(HubClient.ticketBalance).toBe(21);
    expect(HubClient.save.unackedEarns()).toEqual([]);
  });
});
