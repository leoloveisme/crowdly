import { idbAll, idbDel, idbGet, idbSet } from "./idb";
import { get, qs } from "./api";
import { createFile, createFolder, listItems, uploadContent, contentUrl } from "./spaces";

// "Open local folder" (Chrome / Edge File System Access API): work on a
// folder on this computer like the desktop app does with a local Space, and
// sync it with a Crowdly Space both ways.
//
// Sync rules (same spirit as the desktop's Google Drive engine):
//  - every path remembers the hash both sides agreed on last time (baseline);
//  - only one side changed → copy it over; both changed → keep both (the
//    Space's version is saved next to yours as "name (Crowdly copy).ext");
//  - nothing is ever deleted by sync;
//  - dot-files/folders and .gitignore'd paths never sync (as everywhere).

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = any;
type FileHandle = any;

export const localFoldersSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

export interface LocalFolder {
  id: string;
  name: string;
  handle: DirHandle;
  spaceId?: string | null;
  lastSyncedAt?: string | null;
}

export interface LocalEntry {
  path: string;
  name: string;
  kind: "file" | "folder";
  handle: FileHandle | DirHandle;
}

export async function pickFolder(): Promise<LocalFolder> {
  const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  const folder: LocalFolder = { id: crypto.randomUUID(), name: handle.name, handle };
  await idbSet("folders", folder.id, folder);
  return folder;
}
export const listFolders = async () => (await idbAll<LocalFolder>("folders")).map(([, f]) => f);
export const saveFolder = (f: LocalFolder) => idbSet("folders", f.id, f);
export const forgetFolder = (id: string) => idbDel("folders", id);

/** Browsers forget write permission between visits; ask again (needs a click). */
export async function ensurePermission(f: LocalFolder): Promise<boolean> {
  const opts = { mode: "readwrite" };
  if ((await f.handle.queryPermission?.(opts)) === "granted") return true;
  return (await f.handle.requestPermission?.(opts)) === "granted";
}

// ---- ignore rules -------------------------------------------------------------------
function globToRe(glob: string) {
  return glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/§/g, ".*");
}

export async function loadIgnore(root: DirHandle): Promise<(path: string, isDir: boolean) => boolean> {
  const rules: { re: RegExp; dirOnly: boolean }[] = [];
  try {
    const fh = await root.getFileHandle(".gitignore");
    const text = await (await fh.getFile()).text();
    for (let line of text.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      const dirOnly = line.endsWith("/");
      line = line.replace(/\/$/, "");
      const anchored = line.startsWith("/") || line.includes("/");
      const body = globToRe(line.replace(/^\//, ""));
      rules.push({ re: new RegExp(anchored ? `^${body}(/|$)` : `(^|/)${body}(/|$)`), dirOnly });
    }
  } catch {
    /* no .gitignore */
  }
  return (path, isDir) => path.split("/").some((seg) => seg.startsWith(".")) || rules.some((r) => (!r.dirOnly || isDir) && r.re.test(path));
}

export async function listTree(root: DirHandle): Promise<LocalEntry[]> {
  const ignored = await loadIgnore(root);
  const out: LocalEntry[] = [];
  async function walk(dir: DirHandle, prefix: string) {
    for await (const [name, h] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      const isDir = h.kind === "directory";
      if (ignored(path, isDir)) continue;
      out.push({ path, name, kind: isDir ? "folder" : "file", handle: h });
      if (isDir) await walk(h, path);
    }
  }
  await walk(root, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readLocalText(h: FileHandle) {
  return (await h.getFile()).text();
}

async function dirFor(root: DirHandle, path: string, create: boolean): Promise<DirHandle> {
  let dir = root;
  for (const part of path.split("/").slice(0, -1)) if (part) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

export async function writeLocal(root: DirHandle, path: string, data: Blob | string) {
  const dir = await dirFor(root, path, true);
  const fh = await dir.getFileHandle(path.split("/").pop()!, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface RemoteItem {
  id: string;
  relative_path: string;
  kind: "file" | "folder";
  hash: string | null;
  deleted: boolean;
  storage_path?: string | null;
}

export interface SyncReport {
  uploaded: string[];
  downloaded: string[];
  conflicts: string[];
  errors: string[];
}

export async function syncFolder(folder: LocalFolder, spaceId: string, userId: string, onProgress?: (msg: string) => void): Promise<SyncReport> {
  const report: SyncReport = { uploaded: [], downloaded: [], conflicts: [], errors: [] };
  const base = async (p: string) => (await idbGet<string>("baseline", `${folder.id}:${p}`)) ?? null;
  const setBase = (p: string, h: string) => idbSet("baseline", `${folder.id}:${p}`, h);

  onProgress?.("Reading the folder…");
  const entries = await listTree(folder.handle);
  const local = new Map<string, { handle: FileHandle; hash: string; blob: Blob }>();
  for (const e of entries.filter((x) => x.kind === "file")) {
    const file: File = await e.handle.getFile();
    local.set(e.path, { handle: e.handle, hash: await sha256(await file.arrayBuffer()), blob: file });
  }

  onProgress?.("Reading the Space…");
  const { items } = await get<{ items: RemoteItem[] }>(`/creative-spaces/${spaceId}/sync${qs({ userId })}`);
  const remote = new Map(items.filter((i) => !i.deleted && i.kind === "file").map((i) => [i.relative_path.replace(/^\/+/, ""), i]));
  const remoteFolders = new Set(items.filter((i) => !i.deleted && i.kind === "folder").map((i) => i.relative_path.replace(/^\/+/, "")));
  const ignored = await loadIgnore(folder.handle);

  const ensureRemoteFolders = async (path: string) => {
    const parts = path.split("/").slice(0, -1);
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join("/");
      if (remoteFolders.has(p)) continue;
      await createFolder(spaceId, parts.slice(0, i).join("/"), parts[i], userId).catch(() => {});
      remoteFolders.add(p);
    }
  };
  const upload = async (path: string, blob: Blob, existing?: RemoteItem) => {
    await ensureRemoteFolders(path);
    const parent = path.split("/").slice(0, -1).join("/");
    const name = path.split("/").pop()!;
    let id = existing?.id;
    if (!id) {
      const { items: siblings } = await listItems(spaceId, parent, userId);
      id = siblings.find((s) => s.kind === "file" && s.name === name)?.id ?? (await createFile(spaceId, parent, name, userId, blob.type || undefined, blob.size)).id;
    }
    await uploadContent(spaceId, id, blob, userId, name);
  };
  const download = async (item: RemoteItem) => {
    const r = await fetch(contentUrl(spaceId, item.id, userId), { credentials: "include" });
    if (!r.ok) throw new Error(`download failed (${r.status})`);
    return r.blob();
  };

  const paths = new Set([...local.keys(), ...remote.keys()]);
  for (const path of [...paths].sort()) {
    if (ignored(path, false)) continue;
    const L = local.get(path);
    const R = remote.get(path);
    const B = await base(path);
    const rHash = R?.hash ?? null;
    try {
      if (L && R && rHash && L.hash === rHash) {
        await setBase(path, L.hash);
      } else if (L && (!R || !rHash)) {
        // New here (or the Space has the name but no content yet) → send it.
        onProgress?.(`Uploading ${path}`);
        await upload(path, L.blob, R);
        await setBase(path, L.hash);
        report.uploaded.push(path);
      } else if (!L && R && rHash) {
        if (B) continue; // deleted here since the last sync — never delete remotely
        onProgress?.(`Downloading ${path}`);
        await writeLocal(folder.handle, path, await download(R));
        await setBase(path, rHash);
        report.downloaded.push(path);
      } else if (L && R && rHash) {
        if (B === rHash) {
          onProgress?.(`Uploading ${path}`);
          await upload(path, L.blob, R);
          await setBase(path, L.hash);
          report.uploaded.push(path);
        } else if (B === L.hash) {
          onProgress?.(`Downloading ${path}`);
          await writeLocal(folder.handle, path, await download(R));
          await setBase(path, rHash);
          report.downloaded.push(path);
        } else {
          // Both changed: keep the Space's version beside yours, then send yours.
          const dot = path.lastIndexOf(".");
          const copy = dot > path.lastIndexOf("/") ? `${path.slice(0, dot)} (Crowdly copy)${path.slice(dot)}` : `${path} (Crowdly copy)`;
          onProgress?.(`Keeping both versions of ${path}`);
          await writeLocal(folder.handle, copy, await download(R));
          await upload(path, L.blob, R);
          await setBase(path, L.hash);
          report.conflicts.push(path);
        }
      }
    } catch (err) {
      report.errors.push(`${path}: ${(err as Error).message}`);
    }
  }
  folder.spaceId = spaceId;
  folder.lastSyncedAt = new Date().toISOString();
  await saveFolder(folder).catch(() => {}); // remembering the folder is a convenience
  return report;
}
