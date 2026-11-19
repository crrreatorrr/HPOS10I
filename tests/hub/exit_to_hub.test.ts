// Exit to Hub waits (briefly) for the cloud save, then navigates exactly once.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubSdk } from '@hub-sdk';
import { EXIT_FLUSH_MS, GAME_ID, HubClient } from '../../src/hub/hub_client';
import { memoryStore, Storage } from '../../src/hub/storage';
import { tree } from '../../src/runtime/tree';

const assign = vi.fn();
const g = globalThis as unknown as { window?: unknown };

function sdkWith(session: boolean, exit = vi.fn()): HubSdk {
  return {
    init: async () => ({}),
    getSession: () => (session ? { token: 't', playerId: 'p', game: GAME_ID, ranked: false, expiresAt: Date.now() + 60_000 } : null),
    exit,
  } as unknown as HubSdk;
}

beforeEach(() => {
  Storage.use(memoryStore());
  HubClient.shutdown();
  assign.mockReset();
  g.window = { location: { assign } };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  HubClient.shutdown();
  tree.suspended = false;
  delete g.window;
});

describe('Exit to Hub', () => {
  it('with a live session: flushes the save first, then lets the SDK navigate, once', async () => {
    const order: string[] = [];
    const exit = vi.fn(() => order.push('exit'));
    await HubClient.init({ sdk: sdkWith(true, exit), hubUrl: '/hub/', visitStarting: false });
    vi.spyOn(HubClient.save, 'flush').mockImplementation(async () => {
      order.push('flush');
    });
    await HubClient.exitToHub();
    expect(order).toEqual(['flush', 'exit']);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('without a session: navigates itself, once', async () => {
    const exit = vi.fn();
    await HubClient.init({ sdk: sdkWith(false, exit), hubUrl: '/hub/', visitStarting: false });
    await HubClient.exitToHub();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(`/hub/#from=${GAME_ID}`);
  });

  it('does not wait forever on a stuck save', async () => {
    await HubClient.init({ sdk: sdkWith(false), hubUrl: '/hub/', visitStarting: false });
    vi.spyOn(HubClient.save, 'flush').mockImplementation(() => new Promise<void>(() => {}));
    vi.useFakeTimers();
    const done = HubClient.exitToHub();
    await vi.advanceTimersByTimeAsync(EXIT_FLUSH_MS - 1);
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await done;
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('a second press while leaving joins the first: one navigation, and the game stands still', async () => {
    const exit = vi.fn();
    await HubClient.init({ sdk: sdkWith(true, exit), hubUrl: '/hub/', visitStarting: false });
    let finish: () => void = () => {};
    vi.spyOn(HubClient.save, 'flush').mockImplementation(() => new Promise<void>((r) => (finish = r)));
    const first = HubClient.exitToHub();
    expect(tree.suspended).toBe(true);
    const second = HubClient.exitToHub();
    expect(second).toBe(first);
    finish();
    await Promise.all([first, second]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('gives the game back when the navigation never happens', async () => {
    await HubClient.init({ sdk: sdkWith(false), hubUrl: '/hub/', visitStarting: false });
    vi.useFakeTimers();
    await HubClient.exitToHub();
    expect(tree.suspended).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tree.suspended).toBe(false);
    await HubClient.exitToHub();
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain navigation when the SDK exit throws', async () => {
    await HubClient.init({ sdk: sdkWith(true, vi.fn(() => { throw new Error('boom'); })), hubUrl: '/hub/', visitStarting: false });
    await HubClient.exitToHub();
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
