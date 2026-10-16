import { idbAll, idbDel, idbSet } from "./idb";

// Offline outbox: writes made without a connection (chapter saves, Space
// file saves, screenplay edits) are kept in IndexedDB — one entry per
// target, so only the latest version is sent — and replayed in order when
// the browser is back online.

interface Entry {
  path: string;
  init: RequestInit & { body?: string };
  at: number;
}

let listeners: ((n: number) => void)[] = [];
let count = 0;
const emit = () => listeners.forEach((l) => l(count));

export function onOutboxChange(fn: (n: number) => void) {
  listeners.push(fn);
  fn(count);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export async function enqueue(key: string, path: string, init: Entry["init"]) {
  await idbSet("outbox", key, { path, init, at: Date.now() } satisfies Entry);
  count = (await idbAll("outbox")).length;
  emit();
}

let flushing = false;
export async function flushOutbox(base: string): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const entries = (await idbAll<Entry>("outbox")).sort((a, b) => a[1].at - b[1].at);
    for (const [key, e] of entries) {
      try {
        const res = await fetch(`${base}${e.path}`, { ...e.init, credentials: "include" });
        // 4xx won't get better by retrying (e.g. the chapter was deleted).
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          await idbDel("outbox", key);
          sent++;
        }
      } catch {
        break; // still offline
      }
    }
    count = (await idbAll("outbox")).length;
    emit();
  } finally {
    flushing = false;
  }
  return sent;
}

export const isNetworkError = (err: unknown) => err instanceof TypeError;
