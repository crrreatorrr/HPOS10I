// Clears queued hub writes that can never be delivered, before the SDK starts.
//
// The SDK keeps every write in its IndexedDB outbox ("hub-outbox", store
// "writes") until the server answers, and replays the queue inside init().
// SDK 0.6.0 also keeps a write the server refused for good, and its replay
// then fails every later init(), so the game would launch offline (no Relics,
// no Tickets) on every visit. Older HPOS10I builds sent each act's whole ticket
// count, which the hub refuses above 20 per level_end, so players can have such
// a row queued. This removes this game's tickets.earn rows that are over the
// per-act maximum, or whose earn the game's own save already settled; the game
// resends any unpaid earn itself, capped, with its original key.

import { EARN_MAX_PER_ACT, GAME_ID } from './hub_client';
import type { HubSave } from './hub_save';

const DB = 'hub-outbox';
const STORE = 'writes';
const TIMEOUT_MS = 1500;

interface QueuedWrite {
  key: string;
  rpc: string;
  gameId?: string;
  body?: { amount?: unknown };
}

/** True when a queued write must go: this game's earn that can never succeed. */
export function isUndeliverable(row: QueuedWrite, save: HubSave | null): boolean {
  if (row.rpc !== 'tickets.earn' || (row.gameId !== undefined && row.gameId !== GAME_ID)) return false;
  const amount = Number(row.body?.amount ?? 0);
  if (amount > EARN_MAX_PER_ACT) return true;
  const rec = save?.earnRecord(row.key);
  return !!rec && rec.acked;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB);
      let created = false;
      req.onupgradeneeded = () => {
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

/** Removes undeliverable earns from the SDK outbox. Resolves within TIMEOUT_MS. Returns how many went. */
export async function repairOutbox(save: HubSave): Promise<number> {
  const work = (async () => {
    const db = await open();
    if (!db) return 0;
    try {
      return await new Promise<number>((resolve) => {
        let removed = 0;
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const all = store.getAll();
        all.onsuccess = () => {
          for (const row of all.result as QueuedWrite[]) {
            if (isUndeliverable(row, save)) {
              store.delete(row.key);
              removed++;
            }
          }
        };
        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => resolve(removed);
        tx.onabort = () => resolve(removed);
      });
    } finally {
      db.close();
    }
  })();
  const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(0), TIMEOUT_MS));
  const removed = await Promise.race([work, timeout]);
  if (removed > 0) console.info(`[Hub] cleared ${removed} undeliverable queued write(s)`);
  return removed;
}
