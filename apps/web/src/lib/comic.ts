import { api, get, patch, post, put } from "./api";

export interface ComicIssue {
  issue_id: string;
  comic_id: string;
  issue_index: number;
  title: string;
  published?: boolean;
}
export interface ComicPage {
  page_id: string;
  comic_id: string;
  issue_id: string | null;
  page_index: number;
  image_url: string;
  alt_text: string | null;
  /** Speech bubbles / captions over the page ({ text, x, y, style }, percent positions). */
  overlays?: { text: string; x: number; y: number; style: "bubble" | "box" }[];
}
export interface Comic {
  comic_id: string;
  title: string;
  creator_id: string | null;
  reading_direction: "ltr" | "rtl";
  visibility?: string;
  published?: boolean;
  cover_image_url?: string | null;
  issues?: ComicIssue[];
  pages: ComicPage[];
}

export const getComic = (id: string) => get<Comic>(`/comics/${id}`);
export const getComicAccess = (id: string) => get<{ role: "owner" | "contributor" | null }>(`/comics/${id}/my-access`).catch(() => null);
export const updateComicSettings = (id: string, p: { title?: string; reading_direction?: "ltr" | "rtl"; visibility?: string; published?: boolean }) =>
  patch(`/comics/${id}/settings`, p);
export function uploadPages(comicId: string, files: File[], issueId?: string) {
  const form = new FormData();
  files.forEach((f) => form.append("images", f));
  if (issueId) form.append("issueId", issueId);
  return api<ComicPage[]>(`/comics/${comicId}/pages`, { method: "POST", body: form });
}
export const reorderPages = (comicId: string, pageIds: string[]) => put<ComicPage[]>(`/comics/${comicId}/pages/reorder`, { pageIds });
export const updatePage = (pageId: string, altText: string) => patch<ComicPage>(`/comic-pages/${pageId}`, { alt_text: altText });
export const deletePage = (pageId: string) => api(`/comic-pages/${pageId}`, { method: "DELETE" });
export const createIssue = (comicId: string, title: string, afterIssueId?: string) => post<ComicIssue>(`/comics/${comicId}/issues`, { title, afterIssueId });
export const renameIssue = (issueId: string, title: string) => patch<ComicIssue>(`/comic-issues/${issueId}`, { title });
export const publishIssue = (issueId: string, published: boolean) => patch(`/comic-issues/${issueId}/publish`, { published });
export const deleteIssue = (issueId: string) => api(`/comic-issues/${issueId}`, { method: "DELETE" });
