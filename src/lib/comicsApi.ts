import { API_BASE, ApiError } from "./apiBase";

// Comic routes are bare paths (/comics, /comic-pages/:id), same convention
// as gallery.js and the rest of the story routes — not under /api.
export interface ComicPage {
  page_id: string;
  comic_id: string;
  page_index: number;
  image_url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface ComicTitle {
  comic_id: string;
  title: string;
  creator_id: string | null;
  visibility: string;
  published: boolean;
  genre: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  reading_direction: "ltr" | "rtl";
  created_at: string;
  updated_at: string;
}

export interface ComicWithPages extends ComicTitle {
  pages: ComicPage[];
}

export interface ComicListItem {
  comic_id: string;
  title: string;
  cover_image_url: string | null;
  reading_direction: "ltr" | "rtl";
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  filmstrip_urls: string[];
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || "Request failed");
  }
  return data as T;
}

export function listNewestComics(limit = 50): Promise<ComicListItem[]> {
  return fetch(`${API_BASE}/comics/newest?limit=${limit}`, { credentials: "include" }).then((res) =>
    parseOrThrow<ComicListItem[]>(res),
  );
}

export function getComic(comicId: string): Promise<ComicWithPages> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}`, { credentials: "include" }).then((res) =>
    parseOrThrow<ComicWithPages>(res),
  );
}

export function createComic(input: {
  title: string;
  visibility?: string;
  genre?: string;
  tags?: string[];
  reading_direction?: "ltr" | "rtl";
}): Promise<ComicTitle> {
  return fetch(`${API_BASE}/comics`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((res) => parseOrThrow<ComicTitle>(res));
}

export function uploadComicPages(comicId: string, files: File[]): Promise<ComicPage[]> {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/pages`, {
    method: "POST",
    credentials: "include",
    body: form,
  }).then((res) => parseOrThrow<ComicPage[]>(res));
}

export function reorderComicPages(comicId: string, pageIds: string[]): Promise<ComicPage[]> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/pages/reorder`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageIds }),
  }).then((res) => parseOrThrow<ComicPage[]>(res));
}

export function deleteComicPage(pageId: string): Promise<void> {
  return fetch(`${API_BASE}/comic-pages/${encodeURIComponent(pageId)}`, {
    method: "DELETE",
    credentials: "include",
  }).then((res) => parseOrThrow<void>(res));
}
