// Client for chapter/scene/page <-> Space file bidirectional sync
// (backend/src/chapterSpaceSync.js, screenplaySpaceSync.js, comicPageSpaceSync.js).

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

export type ContentEntityType = "chapter" | "scene" | "page";

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

export interface ItemContentLink {
  entityType: ContentEntityType | null;
  entityId: string | null;
  title: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  pendingConflict: boolean;
}

/** For the chapter editor side of the UI: is this chapter linked to a Space file? */
export const fetchChapterSpaceLink = (chapterId: string) =>
  request<ChapterSpaceLink>(`/chapters/${chapterId}/space-link`);

/** For the screenplay scene editor side of the UI: is this scene linked to a Space file? */
export const fetchSceneSpaceLink = (sceneId: string) =>
  request<ChapterSpaceLink>(`/screenplay-scenes/${sceneId}/space-link`);

/** For the Creative Space file browser side of the UI: is this file linked to a chapter/scene/page? */
export const fetchItemContentLink = (spaceId: string, itemId: string) =>
  request<ItemContentLink>(`/creative-spaces/${spaceId}/items/${itemId}/content-link`);

export const linkContentToSpaceItem = (spaceId: string, itemId: string, entityType: ContentEntityType, entityId: string) =>
  request(`/creative-spaces/${spaceId}/items/${itemId}/content-link`, {
    method: "POST",
    body: JSON.stringify({ entityType, entityId }),
  });

export const unlinkContentFromSpaceItem = (spaceId: string, itemId: string) =>
  request(`/creative-spaces/${spaceId}/items/${itemId}/content-link`, { method: "DELETE" });
