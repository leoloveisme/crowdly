// Client for chapter <-> Space file bidirectional sync (backend/src/chapterSpaceSync.js).

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export interface ChapterSpaceLink {
  linked: boolean;
  itemId?: string;
  spaceId?: string;
  spaceName?: string;
  relativePath?: string;
  syncEnabled?: boolean;
  lastSyncedAt?: string | null;
  pendingConflict?: boolean;
}

export interface ItemChapterLink {
  chapterId: string | null;
  chapterTitle?: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  pendingConflict: boolean;
}

/** For the chapter/story editor side of the UI: is this chapter linked to a Space file? */
export const fetchChapterSpaceLink = (chapterId: string) =>
  request<ChapterSpaceLink>(`/chapters/${chapterId}/space-link`);

/** For the Creative Space file browser side of the UI: is this file linked to a chapter? */
export const fetchItemChapterLink = (spaceId: string, itemId: string) =>
  request<ItemChapterLink>(`/creative-spaces/${spaceId}/items/${itemId}/chapter-link`);

export const linkChapterToSpaceItem = (spaceId: string, itemId: string, chapterId: string) =>
  request(`/creative-spaces/${spaceId}/items/${itemId}/link-chapter`, {
    method: "POST",
    body: JSON.stringify({ chapterId }),
  });

export const unlinkChapterFromSpaceItem = (spaceId: string, itemId: string) =>
  request(`/creative-spaces/${spaceId}/items/${itemId}/link-chapter`, { method: "DELETE" });
