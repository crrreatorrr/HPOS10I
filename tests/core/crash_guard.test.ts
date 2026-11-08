// Crash guard (src/runtime/crash_guard.ts) and the main loop (SceneTree.start):
// one throw never stops the game forever, a throw inside a physics tick stops
// further ticks that frame, CRASH_HALT_FRAMES failing frames in a row halt the
// game and show the panel, a single bad frame recovers, and the console is not
// spammed. requestAnimationFrame is a stand-in that the test pumps by hand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, CrashGuard, type CrashEventTarget, type CrashInfo } from '../../src/runtime/crash_guard';
import { Node } from '../../src/runtime/node';
import { PHYSICS_DT, SceneTree } from '../../src/runtime/tree';
import { CRASH_PANEL_ID, CrashPanel } from '../../src/ui/crash_panel';

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
  const guard = new CrashGuard(CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, log);
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
    expect(log.mock.calls.length).toBeLessThanOrEqual(CRASH_LOG_LIMIT + 2 + 600 / CRASH_HALT_FRAMES);
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
    const guard = new CrashGuard(CRASH_HALT_FRAMES, CRASH_LOG_LIMIT, log);
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

  it('window error and unhandledrejection feed the same counter', () => {
    const log = vi.fn();
    const g = new CrashGuard(3, 5, log);
    const listeners: Record<string, ((e: Event) => void)[]> = {};
    const target: CrashEventTarget = {
      addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
      removeEventListener: (type, fn) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
    };
    g.installGlobal(target);
    const prevented: string[] = [];
    const ev = (type: string, extra: object) => ({ type, preventDefault: () => prevented.push(type), ...extra }) as unknown as Event;
    listeners.error![0]!(ev('error', { error: new Error('handler threw'), message: 'handler threw' }));
    listeners.unhandledrejection![0]!(ev('unhandledrejection', { reason: new Error('rejected') }));
    listeners.error![0]!(ev('error', { error: new Error('handler threw'), message: 'handler threw' }));
    expect(g.total).toBe(3);
    expect(g.halted).toBe(true);
    expect(prevented).toEqual(['error', 'unhandledrejection', 'error']);
    // Logged once each (two distinct errors) plus the halt line, not three times.
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[Crash] error') || String(c[0]).startsWith('[Crash] unhandled')).length).toBe(2);
    g.uninstallGlobal();
    expect(listeners.error!.length).toBe(0);
    expect(listeners.unhandledrejection!.length).toBe(0);
  });
});

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
