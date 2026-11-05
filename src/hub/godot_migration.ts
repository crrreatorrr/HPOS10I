// One-time import of saves written by the old Godot web build. Godot kept
// user:// in IndexedDB (database "/userfs", store "FILE_DATA", one record per
// file path holding its bytes). The new build reads the same three files once
// on the same origin: progress (cleared acts, best times), write keys (run ids,
// unacked Ticket earns that must still be sent with their original
// idempotency keys) and the local Relic slot choice. Anything already saved by
// the new build wins; the old database is left untouched.

import { SAVE_KEYS, Storage } from './storage';

const DB_NAME = '/userfs';
const STORE = 'FILE_DATA';
const FILES: [string, string][] = [
  ['/userfs/hpos10i/progress.json', SAVE_KEYS.progress],
  ['/userfs/hpos10i/write_keys.json', SAVE_KEYS.writeKeys],
  ['/userfs/hpos10i/relic_slots.json', SAVE_KEYS.relicSlots],
];
const TIMEOUT_MS = 1500;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME);
      let created = false;
      req.onupgradeneeded = () => {
        // The database did not exist: nothing to migrate. Abort the creation.
        created = true;
        req.transaction?.abort();
      };
      req.onsuccess = () => {
        const db = req.result;
        if (created || !db.objectStoreNames.contains(STORE)) {
          db.close();
          resolve(null);
        } else resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readFile(db: IDBDatabase, path: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const get = db.transaction(STORE, 'readonly').objectStore(STORE).get(path);
      get.onsuccess = () => {
        const rec = get.result as { contents?: ArrayLike<number> | ArrayBuffer } | undefined;
        if (!rec || !rec.contents) return resolve(null);
        const bytes = rec.contents instanceof ArrayBuffer ? new Uint8Array(rec.contents) : Uint8Array.from(rec.contents as ArrayLike<number>);
        resolve(new TextDecoder().decode(bytes));
      };
      get.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Copies the old saves in once. Resolves within TIMEOUT_MS whatever happens. */
export async function migrateGodotSave(): Promise<number> {
  if (Storage.store.getItem(SAVE_KEYS.migrated)) return 0;
  const work = (async () => {
    const db = await openDb();
    if (!db) return 0;
    let copied = 0;
    try {
      for (const [path, key] of FILES) {
        if (Storage.store.getItem(key)) continue;
        const text = await readFile(db, path);
        if (!text) continue;
        try {
          const parsed: unknown = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            Storage.writeJson(key, parsed);
            copied++;
          }
        } catch {
          /* not JSON: skip */
        }
      }
    } finally {
      db.close();
    }
    return copied;
  })();
  const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(-1), TIMEOUT_MS));
  const result = await Promise.race([work, timeout]);
  if (result >= 0) {
    try {
      Storage.store.setItem(SAVE_KEYS.migrated, new Date().toISOString());
    } catch {
      /* storage blocked */
    }
    if (result > 0) console.info(`[Save] imported ${result} file(s) from the previous build`);
  }
  return Math.max(0, result);
}
