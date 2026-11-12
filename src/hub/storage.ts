// Synchronous key-value storage for saves: localStorage in the browser, a
// Map in tests and when storage is blocked (private windows). Every write
// is one setItem, so a crash never leaves half a file.

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStore(): KeyValue & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

function browserStore(): KeyValue | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__hpos10i_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

let active: KeyValue = browserStore() ?? memoryStore();

export const Storage = {
  get store(): KeyValue {
    return active;
  },
  /** Swaps the backing store (tests). */
  use(store: KeyValue): void {
    active = store;
  },
  readJson(key: string): Record<string, unknown> {
    try {
      const raw = active.getItem(key);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  },
  writeJson(key: string, data: unknown): boolean {
    try {
      active.setItem(key, JSON.stringify(data));
      return active.getItem(key) !== null;
    } catch {
      return false;
    }
  },
};

/** Save keys (one per former user:// file). */
export const SAVE_KEYS = {
  progress: 'hpos10i/progress.json',
  writeKeys: 'hpos10i/write_keys.json',
  relicSlots: 'hpos10i/relic_slots.json',
  settings: 'hpos10i/settings.json',
  /** Remapped keys and pad buttons, stick deadzone (src/core/controls.ts). */
  controls: 'hpos10i/controls.json',
  migrated: 'hpos10i/migrated_from_godot',
} as const;
