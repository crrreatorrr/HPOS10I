// The hub chrome (src/ui/hub_chrome.ts): the hub Ticket balance shows '--'
// with no hub session and the server balance with one (a mocked SDK), it is
// display only, and RETURN TO HUB asks only mid-run. Node has no DOM, so a
// tiny stand-in document records what the chrome builds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubSdk, HubSessionInfo, TicketBalanceResult } from '@hub-sdk';
import { SceneRouter } from '../../src/core/scene_router';
import { Scenes } from '../../src/core/scenes';
import { GAME_ID, HubClient } from '../../src/hub/hub_client';
import { memoryStore, Storage } from '../../src/hub/storage';
import { Input } from '../../src/runtime/input';
import { Node } from '../../src/runtime/node';
import { tree, VIEW_W } from '../../src/runtime/tree';
import { Display } from '../../src/ui/display';
import { CHROME_ID, chromeInset, exitNeedsConfirm, HubChrome, RETURN_LABEL, requestHubExit, type ExitAsker } from '../../src/ui/hub_chrome';
import { PauseMenu } from '../../src/ui/pause/pause_menu';
import { registerUiScenes } from '../../src/ui/setup';
import { PAUSE_CENTER, PAUSE_HIT_RADIUS } from '../../src/ui/touch_controls/touch_controls';
import { ZoneSelect } from '../../src/ui/zone_select/zone_select';

const PLAY_SCENE = 'test:hub_chrome_play';

// --- A stand-in DOM -----------------------------------------------------------------

type Listener = (e: { key?: string; preventDefault(): void; stopPropagation(): void }) => void;

class FakeElement {
  id = '';
  className = '';
  type = '';
  textContent: string | null = '';
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners: Record<string, Listener[]> = {};
  focused = 0;

  constructor(readonly tag: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }

  /** Fires `type`; returns whether a listener called preventDefault / stopPropagation. */
  fire(type: string, key?: string): { prevented: boolean; stopped: boolean } {
    const out = { prevented: false, stopped: false };
    for (const fn of this.listeners[type] ?? []) {
      fn({ key, preventDefault: () => (out.prevented = true), stopPropagation: () => (out.stopped = true) });
    }
    return out;
  }

  /** All text below this element, like innerText. */
  text(): string {
    return (this.textContent ?? '') + this.children.map((c) => c.text()).join('');
  }

  focus(): void {
    this.focused++;
  }
}

function fakeDom(canvasRect = { top: 0, right: VIEW_W * 2, width: VIEW_W * 2 }) {
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const doc = {
    head,
    body,
    documentElement: { clientWidth: canvasRect.right },
    createElement: (tag: string) => new FakeElement(tag),
  };
  const canvas = Object.assign(new FakeElement('canvas'), { getBoundingClientRect: () => canvasRect });
  return { doc, canvas, head, body };
}

function makeChrome(asker: ExitAsker = { confirmExitToHub: () => undefined }) {
  const dom = fakeDom();
  const chrome = new HubChrome(dom.doc as unknown as Document, dom.canvas as unknown as HTMLCanvasElement, asker);
  return { ...dom, chrome, root: chrome.root as unknown as FakeElement, button: chrome.button as unknown as FakeElement };
}

// --- A hub SDK double -----------------------------------------------------------------

class BalanceSdk {
  sessionOn = true;
  balanceCalls = 0;
  private answers: ((v: TicketBalanceResult) => void)[] = [];
  readonly spends: unknown[] = [];

  init = () => Promise.resolve({ effects: {}, ticketsCapLeft: 40 });
  getSession = (): HubSessionInfo | null =>
    this.sessionOn ? { token: 'token', playerId: 'player', game: GAME_ID, ranked: false, expiresAt: Date.now() + 3_600_000 } : null;
  getTicketBalance = () => {
    this.balanceCalls++;
    return new Promise<TicketBalanceResult>((resolve) => this.answers.push(resolve));
  };
  spendTickets = (...args: unknown[]) => {
    this.spends.push(args);
    return Promise.reject(new Error('not used'));
  };
  exchange = (...args: unknown[]) => {
    this.spends.push(args);
    return Promise.reject(new Error('not used'));
  };
  earnTickets = () => new Promise(() => undefined);
  exit = () => undefined;

  async answer(balance: number, index = 0): Promise<void> {
    this.answers[index]!({ balance, sessionCapLeft: 0, dailyCapLeft: 0, serverTime: 0 });
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}

async function connect(sdk: BalanceSdk): Promise<void> {
  await HubClient.init({ sdk: sdk as unknown as HubSdk, hubUrl: '/hub/' });
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  Storage.use(memoryStore());
  globalThis.sessionStorage?.clear?.();
  HubClient.shutdown();
  registerUiScenes();
  Scenes.register(PLAY_SCENE, () => new Node('Play'));
  Input.releaseAll();
  tree.paused = false;
  Display.reset(false);
  SceneRouter.changeTo('title');
  tree.advance(2);
});

afterEach(() => {
  HubClient.shutdown();
  tree.paused = false;
  vi.restoreAllMocks();
});

// --- Tests ----------------------------------------------------------------------------

describe('hub Ticket counter', () => {
  it('shows -- with no hub session (standalone)', async () => {
    const { root, chrome } = makeChrome();
    expect(chrome.value.textContent).toBe('--');
    expect(root.dataset.session).toBe('off');
    const sdk = new BalanceSdk();
    sdk.sessionOn = false;
    await connect(sdk);
    // No session: the standalone SDK's 0 is not a balance, so it is never asked.
    expect(sdk.balanceCalls).toBe(0);
    expect(HubClient.ticketText()).toBe('--');
    expect(chrome.value.textContent).toBe('--');
    expect(root.dataset.session).toBe('off');
  });

  it('shows the server balance from getTicketBalance once there is a session', async () => {
    const { root, chrome } = makeChrome();
    const sdk = new BalanceSdk();
    await connect(sdk);
    expect(sdk.balanceCalls).toBe(1);
    expect(chrome.value.textContent).toBe('--'); // not known yet
    await sdk.answer(137);
    expect(HubClient.ticketText()).toBe('137');
    expect(chrome.value.textContent).toBe('137');
    expect(root.dataset.session).toBe('on');
    expect(root.text()).toContain('HUB TICKETS');
    // Display only: nothing was spent or exchanged.
    expect(sdk.spends).toEqual([]);
    // Back to standalone: '--' again.
    HubClient.shutdown();
    expect(chrome.value.textContent).toBe('--');
  });

  it('a balance read that answers after a newer value is dropped', async () => {
    const sdk = new BalanceSdk();
    await connect(sdk);
    const late = HubClient.refreshBalance(); // a second read
    await sdk.answer(50, 1); // the newer read answers first
    await sdk.answer(10, 0); // the stale boot read answers last
    await late;
    expect(HubClient.ticketText()).toBe('50');
  });

  it('the chrome has no buy or exchange control: only the counter and RETURN TO HUB', () => {
    const { root, body, head } = makeChrome();
    expect(root.id).toBe(CHROME_ID);
    expect(body.children).toContain(root);
    expect(head.children.length).toBe(1); // its <style>
    const buttons = root.children.filter((c) => c.tag === 'button');
    expect(buttons.map((b) => b.textContent)).toEqual([RETURN_LABEL]);
    expect(root.text()).not.toMatch(/EXCHANGE|BUY|SPEND|VERSE/);
  });
});

describe('RETURN TO HUB', () => {
  it('from a menu goes straight to the hub, with no question', () => {
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    const asker = { confirmExitToHub: vi.fn() };
    for (const scene of ['title', 'zone_select', 'game_over', 'ending']) {
      SceneRouter.changeTo(scene);
      tree.advance(2);
      expect(exitNeedsConfirm()).toBe(false);
      expect(requestHubExit(asker)).toBe('left');
    }
    expect(exit).toHaveBeenCalledTimes(4);
    expect(asker.confirmExitToHub).not.toHaveBeenCalled();
  });

  it('mid-run asks first and does not leave', () => {
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    const asker = { confirmExitToHub: vi.fn() };
    const { button, canvas } = makeChrome(asker);
    SceneRouter.openScene(PLAY_SCENE);
    tree.advance(2);
    expect(exitNeedsConfirm()).toBe(true);
    button.fire('click');
    expect(asker.confirmExitToHub).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(canvas.focused).toBe(1); // focus goes back to the game
  });

  it('mid-run with the real pause menu: the button opens EXIT TO HUB? and pauses', () => {
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    const pm = new PauseMenu();
    tree.addAutoload(pm);
    const { button } = makeChrome(pm);
    SceneRouter.openScene(PLAY_SCENE);
    tree.advance(2);
    button.fire('click');
    expect(pm.isOpen()).toBe(true);
    expect(pm.page).toBe('confirm');
    expect(tree.paused).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    pm.free();
  });

  it('a click never takes focus, and Enter on the button does not reach the game', () => {
    const { button } = makeChrome();
    expect(button.fire('pointerdown').prevented).toBe(true);
    expect(button.fire('mousedown').prevented).toBe(true);
    expect(button.fire('keydown', 'Enter').stopped).toBe(true);
    expect(button.fire('keydown', 'ArrowLeft').stopped).toBe(false);
  });

  it('the zone select HUB button leaves at once', () => {
    const exit = vi.spyOn(HubClient, 'exitToHub').mockImplementation(() => undefined);
    const zs = tree.changeSceneNow(() => new ZoneSelect()) as ZoneSelect;
    tree.advance(20);
    const hub = zs.menu.items[zs.hubIndex]!;
    expect(hub.label).toBe('HUB');
    expect(zs.grid[zs.grid.length - 1]).toEqual([zs.backIndex, zs.hubIndex]);
    hub.onSelect!();
    hub.onSelect!();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe('placement', () => {
  it('follows the canvas and clears the touch pause button', () => {
    expect(chromeInset(false)).toBe(4);
    expect(VIEW_W - chromeInset(true)).toBeLessThan(PAUSE_CENTER.x - PAUSE_HIT_RADIUS);
    const { root, chrome } = makeChrome();
    expect(root.style.top).toBe('8px'); // 4 game px at 2x
    expect(root.style.right).toBe('8px');
    Display.setTouch(true);
    chrome.place();
    expect(root.style.right).toBe(`${chromeInset(true) * 2}px`);
  });
});
