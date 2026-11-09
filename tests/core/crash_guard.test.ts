// Crash guard (src/runtime/crash_guard.ts) and the main loop (SceneTree.start):
// one throw never stops the game forever, a throw inside a physics tick stops
// further ticks that frame, CRASH_HALT_FRAMES failing frames in a row halt the
// game and show the panel, a single bad frame recovers, and the console is not
// spammed. requestAnimationFrame is a stand-in that the test pumps by hand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRASH_HALT_FRAMES,
  CRASH_LOG_LIMIT,
  CrashGuard,
  isBenignError,
  isBenignRejection,
  type CrashEventTarget,
  type CrashInfo,
} from '../../src/runtime/crash_guard';
import { Node } from '../../src/runtime/node';
import { PHYSICS_DT, SceneTree } from '../../src/runtime/tree';
import { CRASH_PANEL_ID, CrashPanel } from '../../src/runtime/crash_panel';

// --- A hand-pumped requestAnimationFrame and a do-nothing canvas -----------------------

let queued: FrameRequestCallback[] = [];
let now = 0;

function pump(frames: number, ticksPerFrame = 1): void {
  for (let i = 0; i < frames; i++) {
    const calls = queued;
    queued = [];
    // A hair over the tick length, like a real 60 Hz display (float error never drops a tick).
    now += ticksPerFrame * PHYSICS_DT * 1000 + 0.05;
    for (const fn of calls) fn(now);
  }
}

function fakeCanvas(): HTMLCanvasElement {
  const ctx: unknown = new Proxy(
    {},
    {
      get: (_t, key) => (key === 'canvas' ? { width: 424, height: 240 } : () => undefined),
      set: () => true,
    },
  );
  return { getContext: () => ctx } as unknown as HTMLCanvasElement;
}

class Thrower extends Node {
  calls = 0;
  constructor(private readonly failOn: (call: number) => boolean) {
    super('Thrower');
  }
  override physicsProcess(): void {
    this.calls++;
    if (this.failOn(this.calls)) throw new Error('boom from a node');
  }
}

function startTree(failOn: (call: number) => boolean) {
  const log = vi.fn();
  const guard = new CrashGuard(CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, log, null);
  const tree = new SceneTree(guard);
  const node = new Thrower(failOn);
  tree.root.addChild(node);
  const halts: CrashInfo[] = [];
  guard.onHalt((info) => halts.push(info));
  tree.start(fakeCanvas());
  pump(1); // first frame: one tick (lastTime < 0)
  return { tree, guard, node, log, halts };
}

beforeEach(() => {
  queued = [];
  now = 1000;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    queued.push(fn);
    return queued.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main loop survives exceptions', () => {
  it('keeps scheduling frames after a node throws', () => {
    const { tree, node } = startTree((call) => call === 2);
    pump(5);
    expect(queued.length).toBe(1);
    expect(node.calls).toBeGreaterThan(3);
    expect(tree.crash.total).toBe(1);
    expect(tree.crash.halted).toBe(false);
    tree.stop();
  });

  it('stops further physics ticks in the frame that threw', () => {
    const { tree, node } = startTree((call) => call >= 2);
    const before = node.calls;
    pump(1, 4); // the frame wants 4 ticks; the first one throws
    expect(node.calls - before).toBe(1);
    tree.stop();
  });

  it('halts after CRASH_HALT_FRAMES failing frames, once, and stops stepping', () => {
    const { tree, node, halts } = startTree((call) => call >= 2);
    pump(CRASH_HALT_FRAMES);
    expect(tree.crash.halted).toBe(true);
    expect(halts.length).toBe(1);
    const at = node.calls;
    pump(60);
    expect(node.calls).toBe(at); // simulation paused
    expect(queued.length).toBe(1); // but the loop is still alive
    expect(halts.length).toBe(1);
    tree.stop();
  });

  it('still halts on a 120 Hz screen, where every other frame runs no physics tick', () => {
    const { tree } = startTree((call) => call >= 2);
    for (let i = 0; i < 4 * CRASH_HALT_FRAMES; i++) pump(1, 0.5);
    expect(tree.crash.halted).toBe(true);
    tree.stop();
  });

  it('does not spam the console when every frame throws', () => {
    const { tree, log } = startTree((call) => call >= 2);
    // Even without halting (resume each time), 600 failing frames log only a handful of lines.
    for (let i = 0; i < 600; i++) {
      pump(1);
      if (tree.crash.halted) tree.crash.resume();
    }
    expect(tree.crash.total).toBeGreaterThan(500);
    // Every line the guard writes (errors, the halt line, the "further errors" note) fits the cap.
    expect(log.mock.calls.length).toBeLessThanOrEqual(CRASH_LOG_LIMIT);
    tree.stop();
  });

  it('logs the first error once with the error object (its stack)', () => {
    const { tree, log } = startTree((call) => call === 2);
    pump(3);
    const first = log.mock.calls[0]!;
    expect(first[1]).toBeInstanceOf(Error);
    expect((first[1] as Error).stack).toContain('boom from a node');
    expect(log).toHaveBeenCalledTimes(1);
    tree.stop();
  });

  it('a throw from process() or render is caught too', () => {
    const log = vi.fn();
    const guard = new CrashGuard(CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, log, null);
    const tree = new SceneTree(guard);
    class BadProcess extends Node {
      override process(): void {
        throw new Error('process boom');
      }
    }
    tree.root.addChild(new BadProcess('bad'));
    tree.start(fakeCanvas());
    pump(5);
    expect(queued.length).toBe(1);
    expect(guard.halted).toBe(true);
    tree.stop();
  });
});

describe('CrashGuard', () => {
  it('a good frame resets the streak', () => {
    const g = new CrashGuard(3, 5, () => undefined);
    g.frameFailed(new Error('a'));
    g.frameFailed(new Error('a'));
    g.frameOk();
    g.frameFailed(new Error('a'));
    expect(g.halted).toBe(false);
    expect(g.total).toBe(3);
  });

  it('onCrash sees every error; a throwing listener does not break the guard', () => {
    const g = new CrashGuard(3, 5, () => undefined);
    const seen: string[] = [];
    g.onCrash(() => {
      throw new Error('bad listener');
    });
    const off = g.onCrash((info) => seen.push(`${info.source}:${info.message}`));
    g.report(new Error('x'), 'frame');
    off();
    g.report(new Error('y'), 'frame');
    expect(seen).toEqual(['frame:Error: x']);
  });

  it('a boot failure halts at once', () => {
    const g = new CrashGuard(3, 5, () => undefined);
    let halted = 0;
    g.onHalt(() => halted++);
    g.report(new Error('chunk failed'), 'boot');
    expect(g.halted).toBe(true);
    expect(halted).toBe(1);
  });

  it('window error and unhandledrejection are counted, never preventDefault-ed', () => {
    const log = vi.fn();
    const g = new CrashGuard(3, 5, log, null);
    const { fire, listeners, prevented } = fakeWindow(g);
    fire('error', { error: new Error('handler threw'), message: 'handler threw' });
    fire('unhandledrejection', { reason: new Error('rejected') });
    fire('error', { error: new Error('handler threw'), message: 'handler threw' });
    expect(g.total).toBe(3);
    // The browser keeps logging them itself (past our log cap, too).
    expect(prevented).toEqual([]);
    g.uninstallGlobal();
    expect(listeners.error!.length).toBe(0);
    expect(listeners.unhandledrejection!.length).toBe(0);
  });

  it('global errors alone never halt the game (async preload, a hidden tab)', () => {
    const g = new CrashGuard(3, 5, () => undefined, null);
    const { fire } = fakeWindow(g);
    for (let i = 0; i < 10; i++) fire('unhandledrejection', { reason: new Error(`fetch ${i}`) });
    expect(g.total).toBe(10);
    expect(g.halted).toBe(false);
    // One failing frame after them is a streak of one, not eleven.
    g.frameFailed(new Error('frame'));
    expect(g.halted).toBe(false);
  });

  it('global errors can tip the halt once the streak has a failing frame', () => {
    const g = new CrashGuard(3, 5, () => undefined, null);
    const { fire } = fakeWindow(g);
    g.frameFailed(new Error('frame'));
    fire('error', { error: new Error('a'), message: 'a' });
    expect(g.halted).toBe(false);
    fire('error', { error: new Error('b'), message: 'b' });
    expect(g.halted).toBe(true);
  });

  it('resetStreak (boot done, tab visible again) clears the streak but not a halt', () => {
    const g = new CrashGuard(3, 5, () => undefined, null);
    g.frameFailed(new Error('a'));
    g.frameFailed(new Error('a'));
    g.resetStreak();
    g.frameFailed(new Error('a'));
    expect(g.halted).toBe(false);
    g.frameFailed(new Error('a'));
    g.frameFailed(new Error('a'));
    expect(g.halted).toBe(true);
    g.resetStreak();
    expect(g.halted).toBe(true);
  });

  it('ignores browser noise and other origins', () => {
    const g = new CrashGuard(3, 5, () => undefined, null);
    const { fire } = fakeWindow(g, 'https://game.example');
    fire('error', { message: 'ResizeObserver loop completed with undelivered notifications.', error: null });
    fire('error', { message: 'ResizeObserver loop limit exceeded', error: null });
    fire('error', { message: 'Script error.', error: null, filename: '' });
    fire('error', { message: 'Uncaught Error: ext', error: new Error('ext'), filename: 'chrome-extension://abc/content.js' });
    fire('error', { message: 'Uncaught Error: ad', error: new Error('ad'), filename: 'https://ads.example/x.js' });
    fire('unhandledrejection', { reason: Object.assign(new Error('The play() request was interrupted'), { name: 'AbortError' }) });
    fire('unhandledrejection', { reason: { name: 'NotAllowedError', message: 'play() failed because the user did not interact' } });
    expect(g.total).toBe(0);
    // Our own scripts (and errors with no file, e.g. eval) still count.
    fire('error', { message: 'Uncaught Error: ours', error: new Error('ours'), filename: 'https://game.example/assets/index.js' });
    fire('error', { message: 'Uncaught Error: nofile', error: new Error('nofile'), filename: '' });
    expect(g.total).toBe(2);
  });

  it('isBenignError / isBenignRejection', () => {
    const origin = 'https://game.example';
    expect(isBenignError({ message: 'Script error.' }, origin)).toBe(true);
    expect(isBenignError({ message: 'Script error.', error: new Error('x') }, origin)).toBe(false);
    expect(isBenignError({ message: 'x', error: new Error('x'), filename: 'https://game.example/a.js' }, origin)).toBe(false);
    expect(isBenignError({ message: 'x', error: new Error('x'), filename: 'https://cdn.example/a.js' }, origin)).toBe(true);
    expect(isBenignError({ message: 'x', error: new Error('x'), filename: '/a.js' }, origin)).toBe(false);
    expect(isBenignRejection(Object.assign(new Error('a'), { name: 'AbortError' }))).toBe(true);
    expect(isBenignRejection(new Error('a'))).toBe(false);
    expect(isBenignRejection(undefined)).toBe(false);
  });

  it('hands each new frame error to reportError once, without counting it twice', () => {
    const surfaced: unknown[] = [];
    let fire!: ReturnType<typeof fakeWindow>['fire'];
    // Like the browser's reportError: it dispatches a window "error" event for the same object.
    const g = new CrashGuard(10, 5, () => undefined, (err) => {
      surfaced.push(err);
      fire('error', { error: err, message: (err as Error).message });
    });
    fire = fakeWindow(g).fire;
    const throwAt = (msg: string) => {
      try {
        throw new Error(msg);
      } catch (err) {
        return err;
      }
    };
    const a1 = throwAt('a');
    g.frameFailed(a1);
    g.frameFailed(a1); // the same object again
    g.frameFailed(throwAt('b'));
    expect(surfaced).toEqual([a1, expect.objectContaining({ message: 'b' })]);
    expect(g.total).toBe(3); // three frame failures, no extra count from the re-dispatched events
    // Global errors are not re-surfaced.
    fire('error', { error: new Error('c'), message: 'c' });
    expect(surfaced.length).toBe(2);
  });

  it('the main loop surfaces its error so page-error checks still see it', () => {
    const surfaced: unknown[] = [];
    const guard = new CrashGuard(CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, () => undefined, (err) => surfaced.push(err));
    const tree = new SceneTree(guard);
    tree.root.addChild(new Thrower((call) => call === 2));
    tree.start(fakeCanvas());
    pump(4);
    expect(surfaced.length).toBe(1);
    expect((surfaced[0] as Error).message).toBe('boom from a node');
    tree.stop();
  });

  it('dedupes by message and stack, not message alone', () => {
    const log = vi.fn();
    const g = new CrashGuard(100, 5, log, null);
    const e1 = new Error('same');
    e1.stack = 'Error: same\n    at a (game.js:1:1)';
    const e2 = new Error('same');
    e2.stack = 'Error: same\n    at b (game.js:9:9)';
    const e3 = new Error('same');
    e3.stack = e1.stack;
    g.frameFailed(e1);
    g.frameFailed(e2);
    g.frameFailed(e3);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('keeps the "further errors" note and the halt line inside the log cap', () => {
    const log = vi.fn();
    const g = new CrashGuard(3, 5, log, null);
    for (let i = 0; i < 20; i++) g.frameFailed(new Error(`distinct ${i}`));
    expect(log.mock.calls.length).toBe(5);
    expect(String(log.mock.calls[4]![0])).toContain('further errors are counted but not logged');
    expect(log.mock.calls.some((c) => String(c[0]).includes('halted'))).toBe(true);
    expect(g.suppressed).toBeGreaterThan(0);
  });

  it('describes non-Error rejection reasons usefully', () => {
    const g = new CrashGuard(3, 5, () => undefined, null);
    const seen: string[] = [];
    g.onCrash((info) => seen.push(info.message));
    const img = { tagName: 'IMG', src: 'https://game.example/a.png' };
    g.report({ type: 'error', isTrusted: true, target: img }, 'unhandledrejection');
    g.report({ name: 'NetworkError', message: 'offline' }, 'unhandledrejection');
    g.report({ code: 7 }, 'unhandledrejection');
    g.report(undefined, 'unhandledrejection');
    expect(seen[0]).toBe('Event "error" on <img src="https://game.example/a.png">');
    expect(seen[1]).toBe('NetworkError: offline');
    expect(seen[2]).toBe('{"code":7}');
    expect(seen[3]).toBe('undefined');
  });
});

/** A stand-in window: install the guard, then fire events at its listeners. */
function fakeWindow(g: CrashGuard, origin = 'https://game.example') {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const prevented: string[] = [];
  const target: CrashEventTarget = {
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type, fn) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
  };
  g.installGlobal(target, origin);
  const fire = (type: 'error' | 'unhandledrejection', extra: object) => {
    const ev = { type, preventDefault: () => prevented.push(type), ...extra } as unknown as Event;
    for (const fn of (listeners[type] ?? []).slice()) fn(ev);
  };
  return { fire, listeners, prevented };
}

// --- The panel, on a stand-in DOM ------------------------------------------------------

class FakeElement {
  id = '';
  className = '';
  type = '';
  textContent: string | null = '';
  hidden = false;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly listeners: Record<string, (() => void)[]> = {};
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  focus(): void {}
  text(): string {
    return (this.textContent ?? '') + this.children.map((c) => c.text()).join('');
  }
  find(tag: string): FakeElement | undefined {
    for (const c of this.children) {
      if (c.tag === tag) return c;
      const deep = c.find(tag);
      if (deep) return deep;
    }
    return undefined;
  }
}

describe('CrashPanel', () => {
  it('shows "Something broke" with a Reload button that reloads, only once', () => {
    const head = new FakeElement('head');
    const body = new FakeElement('body');
    const doc = { head, body, createElement: (tag: string) => new FakeElement(tag) };
    const reload = vi.fn();
    const panel = new CrashPanel(doc as unknown as Document, reload);
    expect(body.children.length).toBe(0);
    panel.show('reload');
    panel.show('reload');
    expect(body.children.length).toBe(1);
    const root = body.children[0]!;
    expect(root.id).toBe(CRASH_PANEL_ID);
    expect(root.text()).toContain('Something broke');
    const button = root.find('button')!;
    expect(button.textContent).toBe('RELOAD');
    button.listeners.click![0]!();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says RETRY for a boot failure', () => {
    const doc = { head: new FakeElement('head'), body: new FakeElement('body'), createElement: (tag: string) => new FakeElement(tag) };
    const panel = new CrashPanel(doc as unknown as Document, () => undefined);
    panel.show('retry');
    expect(doc.body.children[0]!.find('button')!.textContent).toBe('RETRY');
  });
});
