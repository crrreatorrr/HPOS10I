// A hub visit's init answers after the first scene: until it does, Ranked and
// the Relics are unknown. Item boxes and the extra moves fail closed meanwhile,
// and a stage start waits (capped) so they are decided on the settled state.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubSdk } from '@hub-sdk';
import { GameState } from '../../src/core/game_state';
import { SceneRouter } from '../../src/core/scene_router';
import { Settings } from '../../src/core/settings';
import { HubClient } from '../../src/hub/hub_client';
import { RelicLoadout } from '../../src/hub/relic_loadout';
import { memoryStore, Storage } from '../../src/hub/storage';
import { boxesEnabled } from '../../src/levels/objects/item_box';

/** An SDK whose init stays open until the test answers it. */
function pendingSdk(): { sdk: HubSdk; answer: (payload: Record<string, unknown>) => Promise<void> } {
  let resolveInit: (v: unknown) => void = () => {};
  const never = () => new Promise<never>(() => {});
  const sdk = {
    init: () => new Promise((r) => (resolveInit = r)),
    redeemTicket: never,
    reportEvent: never,
    submitScore: never,
    earnTickets: never,
    exchange: never,
    spendTickets: never,
    sellItem: never,
    getTicketBalance: never,
    exit: () => {},
    getSession: () => null,
  } as unknown as HubSdk;
  return {
    sdk,
    answer: async (payload) => {
      resolveInit(payload);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

const ZONE = 'z1_retro_rush_hills';
let done: Promise<void> = Promise.resolve();
void done;

beforeEach(() => {
  Storage.use(memoryStore());
  HubClient.shutdown();
  RelicLoadout.reset();
  GameState.resetGame();
  SceneRouter.zoneId = '';
  SceneRouter.stage = 1;
  // One scene change per frame: the tree does not tick here, so forget the last test's claim.
  (SceneRouter as unknown as { changeFrame: number }).changeFrame = -1;
  Settings.data.itemBoxes = true;
});

afterEach(() => {
  SceneRouter.beforeStage = null;
  HubClient.shutdown();
  GameState.resetGame();
});

describe('a pending hub visit', () => {
  it('spawns no item boxes and allows no extras until init answers', async () => {
    const { sdk, answer } = pendingSdk();
    done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    expect(HubClient.reach).toBe('pending');
    expect(HubClient.visitPending).toBe(true);
    expect(RelicLoadout.resolve().extras_allowed).toBe(false);
    expect(boxesEnabled()).toBe(false);
    await answer({ ranked: false, relics: [] });
    expect(HubClient.reach).toBe('ready');
    expect(boxesEnabled()).toBe(true);
  });

  it('stays closed when the visit turns out Ranked', async () => {
    const { sdk, answer } = pendingSdk();
    done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    expect(boxesEnabled()).toBe(false);
    await answer({ ranked: true, relics: ['genesis_shard'] });
    expect(boxesEnabled()).toBe(false);
    expect(RelicLoadout.resolve().extra_life).toBe(false);
  });

  it('does not close anything for a page load that is not a hub visit', async () => {
    const { sdk, answer } = pendingSdk();
    done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: false });
    expect(HubClient.reach).toBe('pending');
    expect(HubClient.visitPending).toBe(false);
    expect(HubClient.whenSettled()).toBeNull();
    expect(boxesEnabled()).toBe(true);
    await answer({});
  });

  it('holds a stage start until init answers, then gives Golden Sproto its life', async () => {
    const { sdk, answer } = pendingSdk();
    done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    SceneRouter.beforeStage = () => HubClient.whenSettled(5000);
    const lives = GameState.lives;
    SceneRouter.startZone(ZONE, 1);
    await Promise.resolve();
    expect(GameState.zoneId).toBe('');
    await answer({ ranked: false, relics: ['genesis_shard'] });
    await new Promise((r) => setTimeout(r, 0));
    expect(GameState.zoneId).toBe(ZONE);
    expect(GameState.lives).toBe(lives + 1);
  });

  it('starts the stage anyway after the cap, and grants the life once init answers', async () => {
    const { sdk, answer } = pendingSdk();
    done = HubClient.init({ sdk, hubUrl: '/hub/', visitStarting: true });
    SceneRouter.beforeStage = () => HubClient.whenSettled(20);
    const lives = GameState.lives;
    SceneRouter.startZone(ZONE, 1);
    await new Promise((r) => setTimeout(r, 60));
    expect(GameState.zoneId).toBe(ZONE);
    expect(GameState.lives).toBe(lives);
    expect(boxesEnabled()).toBe(false);
    await answer({ ranked: false, relics: ['genesis_shard'] });
    expect(GameState.lives).toBe(lives + 1);
    // Once per act: a second settle does not add another.
    GameState.grantGoldenLife();
    expect(GameState.lives).toBe(lives + 1);
  });
});
