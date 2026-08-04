'use client';

/**
 * Offline fronta meraní (IndexedDB).
 *
 * Kuchyňa má notoricky slabú wifi. Bez fronty by výpadok znamenal stratené
 * meranie — a v teplotnom denníku chýbajúci riadok, ktorý sa už spätne
 * doplniť nedá (append-only).
 *
 * PIN sa do fronty ZÁMERNE neukladá. Zostáva len v pamäti bežiacej session,
 * takže odcudzený tablet neponúkne útočníkovi PIN-y personálu. Ak sa stránka
 * medzitým obnoví, frontu odošle až ďalšie zadanie PIN-u.
 */

const DB_NAME = 'haccp-kiosk';
const DB_VERSION = 1;
const STORE = 'queue';

export type QueuedMeasurement = {
  /** Klientske UUID — server ho použije na idempotenciu pri opakovanom odoslaní. */
  id: string;
  membershipId: string;
  deviceId: string;
  deviceName: string;
  valueC: number;
  note: string | null;
  /** Kedy sa meralo podľa tabletu. Server si drží vlastný, dôveryhodný čas. */
  capturedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** IndexedDB nemusí byť dostupná (privátny režim, staré WebView). */
export function queueSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function enqueue(item: QueuedMeasurement): Promise<void> {
  await withStore('readwrite', (s) => s.put(item));
}

export async function listQueue(): Promise<QueuedMeasurement[]> {
  const all = await withStore<QueuedMeasurement[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function dequeue(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id));
}

export async function queueSize(): Promise<number> {
  return withStore<number>('readonly', (s) => s.count());
}
