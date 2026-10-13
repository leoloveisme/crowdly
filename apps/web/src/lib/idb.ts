// Tiny promise wrapper over one IndexedDB database with a few key-value
// stores: the offline outbox, remembered local-folder handles and the
// local-folder sync baseline. (Automerge docs live in their own DB.)

const DB = "crowdly-web-app-data"; // "crowdly-web-app" is the Automerge document store (lib/live.ts)
const STORES = ["outbox", "folders", "baseline"] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => STORES.forEach((s) => req.result.objectStoreNames.contains(s) || req.result.createObjectStore(s));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (store: StoreName, key: string, value: unknown) => run(store, "readwrite", (s) => s.put(value, key));
export const idbDel = (store: StoreName, key: string) => run(store, "readwrite", (s) => s.delete(key));
export async function idbAll<T>(store: StoreName): Promise<[string, T][]> {
  const [keys, values] = await Promise.all([run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()), run<T[]>(store, "readonly", (s) => s.getAll())]);
  return keys.map((k, i) => [String(k), values[i]]);
}
