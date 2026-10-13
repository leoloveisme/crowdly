import { API_BASE, api, get, patch, post, put, qs } from "./api";

// Discovery mode (desktop: ui/discovery/, library/): browse Crowdly, my
// library, shelves (manual + smart) and reading data. Backend:
// shelves.js, library.js.

export type ItemType = "story" | "screenplay" | "comic" | "library_item";
export interface ShelfItem {
  type: ItemType;
  id: string;
  /** Row id inside a manual shelf (for reordering). */
  entry_id?: string;
  title: string;
  subtitle?: string | null;
  author?: string;
  language?: string;
  format?: string;
  progress?: number;
  added_at?: string | null;
  last_read_at?: string | null;
  status?: { favorite?: boolean; living?: boolean; lived?: boolean };
  cover_url?: string | null;
}
export interface Shelf {
  id: string;
  name: string;
  description?: string | null;
  kind: "manual" | "smart";
  rules?: SmartRules | null;
  sort?: string;
  count?: number | null;
}
export interface SmartRule {
  field: string;
  op: string;
  value: string | number;
}
export interface SmartRules {
  match: "all" | "any";
  rules: SmartRule[];
}
export interface LibraryItem {
  id: string;
  kind: "imported_book" | "crowdly_story";
  story_title_id: string | null;
  title: string;
  author: string | null;
  language: string | null;
  format: "epub" | "pdf" | "audio" | "text";
  file_size: number | null;
  has_file: boolean;
  has_cover: boolean;
  rights_status: string;
  created_at: string;
  updated_at: string;
}
export interface Position {
  percent: number;
  locator: Record<string, unknown>;
  updated_at?: string;
}
export interface Highlight {
  id: string;
  color: string;
  note: string;
  quote: string;
  locator: Record<string, unknown>;
  deleted?: boolean;
  updated_at?: string;
}

export const RULE_FIELDS: Record<string, { label: string; ops: string[]; values?: string[]; type?: "text" | "days" }> = {
  source: { label: "Source", ops: ["is"], values: ["library", "crowdly"] },
  format: { label: "Format", ops: ["is"], values: ["epub", "pdf", "audio", "text", "story", "screenplay", "comic"] },
  language: { label: "Language", ops: ["is"], type: "text" },
  title: { label: "Title", ops: ["contains"], type: "text" },
  author: { label: "Author", ops: ["contains"], type: "text" },
  status: { label: "Status", ops: ["is"], values: ["favorite", "living", "lived"] },
  progress: { label: "Progress", ops: ["is"], values: ["unread", "reading", "finished"] },
  added_within_days: { label: "Added in the last … days", ops: ["lte"], type: "days" },
  read_within_days: { label: "Read in the last … days", ops: ["lte"], type: "days" },
};

export const discoverHome = () => get<{ rows: { key: string; items: ShelfItem[] }[] }>(`/discover/home`);
export const search = (q: string) =>
  get<{ results: { id: string; type: string; title: string; subtitle?: string | null; url: string }[] }>(`/search${qs({ q, limit: 30 })}`);

export const listShelves = () => get<{ system: { key: string; count: number | null }[]; custom: Shelf[] }>(`/shelves`);
export const shelfItems = (key: string) => get<{ shelf: Shelf | { key: string; kind: "system" }; items: ShelfItem[] }>(`/shelves/${encodeURIComponent(key)}/items`);
export const createShelf = (s: { name: string; description?: string; kind: "manual" | "smart"; rules?: SmartRules }) => post<{ shelf: Shelf }>(`/shelves`, s);
export const updateShelf = (id: string, s: Partial<{ name: string; description: string; rules: SmartRules; sort: string }>) => patch(`/shelves/${id}`, s);
export const deleteShelf = (id: string) => api(`/shelves/${id}`, { method: "DELETE" });
export const reorderShelves = (ids: string[]) => put(`/shelves/order`, { ids });
export const addToShelf = (shelfId: string, type: ItemType, id: string) => post(`/shelves/${shelfId}/items`, { type, id });
export const removeFromShelf = (shelfId: string, type: ItemType, id: string) => api(`/shelves/${shelfId}/items/${encodeURIComponent(id)}${qs({ type })}`, { method: "DELETE" });
export const reorderShelfItems = (shelfId: string, entryIds: string[]) => put(`/shelves/${shelfId}/items/order`, { ids: entryIds });
export const setStoryStatus = (contentType: "story" | "screenplay" | "comic", id: string, flags: { isFavorite?: boolean; isLiving?: boolean; isLived?: boolean }) =>
  put(`/me/story-status`, { contentType, [contentType === "story" ? "storyTitleId" : contentType === "screenplay" ? "screenplayId" : "comicId"]: id, ...flags });

export const listLibrary = () => get<{ items: LibraryItem[] }>(`/library/items`).then((r) => r.items);
export const libraryItem = (id: string) => listLibrary().then((items) => items.find((i) => i.id === id) ?? null);
export const addLibraryStory = (storyTitleId: string) => post<{ item: LibraryItem }>(`/library/items`, { kind: "crowdly_story", storyTitleId }).then((r) => r.item);
export const deleteLibraryItem = (id: string) => api(`/library/items/${id}`, { method: "DELETE" });
export const libraryFileUrl = (id: string) => `${API_BASE}/library/items/${id}/file`;
export const libraryCoverUrl = (id: string) => `${API_BASE}/library/items/${id}/cover`;

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const FORMAT_BY_EXT: Record<string, LibraryItem["format"]> = {
  epub: "epub",
  pdf: "pdf",
  txt: "text",
  md: "text",
  markdown: "text",
  mp3: "audio",
  m4a: "audio",
  m4b: "audio",
  ogg: "audio",
  opus: "audio",
  wav: "audio",
  flac: "audio",
  aac: "audio",
};
export const LIBRARY_ACCEPT = Object.keys(FORMAT_BY_EXT).map((e) => `.${e}`).join(",");

/** EPUBs with an encryption.xml carrying font-unrelated algorithms are DRM-locked (desktop: library/drm.py). */
async function isDrmEpub(buf: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const enc = zip.file("META-INF/encryption.xml");
  if (!enc) return false;
  const xml = await enc.async("string");
  const algos = [...xml.matchAll(/Algorithm="([^"]+)"/g)].map((m) => m[1]);
  // Font obfuscation (IDPF / Adobe) is not DRM.
  return algos.some((a) => !/obfuscation|font|xmlenc#aes|fonts/i.test(a)) || /adept|rights\.xml/i.test(xml) || !!zip.file("META-INF/rights.xml");
}

export async function importToLibrary(file: File, rightsStatus = "personal_copy") {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const format = FORMAT_BY_EXT[ext];
  if (!format) throw new Error("This file type isn't supported (EPUB, PDF, text, Markdown or audio).");
  const buf = await file.arrayBuffer();
  if (format === "epub" && (await isDrmEpub(buf))) throw new Error("This book is DRM-protected, so it can't be added to your library.");
  if (format === "pdf" && new TextDecoder("latin1").decode(buf.slice(0, Math.min(buf.byteLength, 4_000_000))).includes("/Encrypt")) {
    throw new Error("This PDF is encrypted (DRM), so it can't be added to your library.");
  }
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const { item } = await post<{ item: LibraryItem }>(`/library/items`, {
    kind: "imported_book",
    title,
    format,
    sha256: await sha256(buf),
    size: buf.byteLength,
    rightsStatus,
  });
  if (!item.has_file) await api(`/library/items/${item.id}/file`, { method: "PUT", body: new Blob([buf]), headers: { "Content-Type": "application/octet-stream" } });
  return item;
}

export const getPosition = (itemId: string) => get<{ position: Position | null }>(`/reading/positions/${itemId}`).then((r) => r.position);
export const savePosition = (itemId: string, percent: number, locator: Record<string, unknown>) =>
  put(`/reading/positions/${itemId}`, { percent, locator, updatedAt: new Date().toISOString() });
export const sendReadingSessions = (sessions: { id: string; libraryItemId: string; startedAt: string; endedAt: string; seconds: number }[]) =>
  post(`/reading/sessions`, { sessions });
export const syncHighlights = (libraryItemId: string, deviceId: string, since: number, changes: Highlight[]) =>
  post<{ highlights: Highlight[]; ack: number }>(`/reading/highlights/sync`, {
    libraryItemId,
    deviceId,
    since,
    changes: changes.map((c) => ({ ...c, updatedAt: c.updated_at ?? new Date().toISOString() })),
  });
