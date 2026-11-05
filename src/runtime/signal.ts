// Typed signals, like GDScript's: connect, disconnect, one-shot, emit.
// Listeners connected with an owner node are dropped when that node frees,
// so nothing calls back into a dead scene.

type Listener<A extends unknown[]> = {
  fn: (...args: A) => void;
  once: boolean;
  owner: { isFreed(): boolean } | null;
};

export class Signal<A extends unknown[] = []> {
  private listeners: Listener<A>[] = [];

  connect(fn: (...args: A) => void, opts: { once?: boolean; owner?: { isFreed(): boolean } } = {}): void {
    if (this.isConnected(fn)) return;
    this.listeners.push({ fn, once: opts.once ?? false, owner: opts.owner ?? null });
  }

  /** Connects for one emission only. */
  once(fn: (...args: A) => void, owner?: { isFreed(): boolean }): void {
    this.connect(fn, { once: true, owner });
  }

  disconnect(fn: (...args: A) => void): void {
    this.listeners = this.listeners.filter((l) => l.fn !== fn);
  }

  isConnected(fn: (...args: A) => void): boolean {
    return this.listeners.some((l) => l.fn === fn);
  }

  disconnectAll(): void {
    this.listeners = [];
  }

  get count(): number {
    return this.listeners.length;
  }

  emit(...args: A): void {
    if (this.listeners.length === 0) return;
    const current = this.listeners.slice();
    let pruned = false;
    for (const l of current) {
      if (l.owner && l.owner.isFreed()) {
        pruned = true;
        continue;
      }
      if (l.once) {
        pruned = true;
        l.once = false;
        l.owner = { isFreed: () => true };
      }
      l.fn(...args);
    }
    if (pruned) {
      this.listeners = this.listeners.filter((l) => !(l.owner && l.owner.isFreed()));
    }
  }
}
