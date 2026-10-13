import { API_BASE, ApiError } from "./apiBase";
import type { FrameOverlay } from "./mediaApi";

// Comic routes are bare paths (/comics, /comic-pages/:id), same convention
// as gallery.js and the rest of the story routes — not under /api.
export interface ComicPage {
  page_id: string;
  comic_id: string;
  issue_id: string | null;
  page_index: number;
  image_url: string;
  alt_text: string | null;
  /** Speech bubbles / captions drawn over the page. */
  overlays?: FrameOverlay[];
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
  description?: string | null;
  completion_status?: string | null;
  clone_policy?: string | null;
  export_policy?: string | null;
  translation_policy?: string | null;
  narration_policy?: string | null;
  language?: string | null;
  translation_group_id?: string | null;
  source_comic_id?: string | null;
  is_official_translation?: boolean;
  created_at: string;
  updated_at: string;
}

/** An issue (episode): groups pages the way a chapter groups a story's text. */
export interface ComicIssue {
  issue_id: string;
  comic_id: string;
  issue_index: number;
  title: string;
  published: boolean;
}

export interface ComicWithPages extends ComicTitle {
  issues: ComicIssue[];
  pages: ComicPage[];
  can_clone?: boolean;
  can_export?: boolean;
  can_translate?: boolean;
  can_narrate?: boolean;
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

export function uploadComicPages(comicId: string, files: File[], issueId?: string | null): Promise<ComicPage[]> {
  const form = new FormData();
  // Text fields first, so they're parsed before the files.
  if (issueId) form.append("issueId", issueId);
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

export function updateComicPage(
  pageId: string,
  patch: { alt_text?: string | null; overlays?: FrameOverlay[] },
): Promise<ComicPage> {
  return fetch(`${API_BASE}/comic-pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((res) => parseOrThrow<ComicPage>(res));
}

const jsonInit = (method: string, data?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});

export function createComicIssue(comicId: string, title: string, afterIssueId?: string | null): Promise<ComicIssue> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/issues`, jsonInit("POST", { title, afterIssueId })).then(
    (res) => parseOrThrow<ComicIssue>(res),
  );
}

export function renameComicIssue(issueId: string, title: string): Promise<ComicIssue> {
  return fetch(`${API_BASE}/comic-issues/${issueId}`, jsonInit("PATCH", { title })).then((res) =>
    parseOrThrow<ComicIssue>(res),
  );
}

export function setComicIssuePublished(issueId: string, published: boolean): Promise<ComicIssue> {
  return fetch(`${API_BASE}/comic-issues/${issueId}/publish`, jsonInit("PATCH", { published })).then((res) =>
    parseOrThrow<ComicIssue>(res),
  );
}

export function deleteComicIssue(issueId: string): Promise<void> {
  return fetch(`${API_BASE}/comic-issues/${issueId}`, jsonInit("DELETE")).then((res) => parseOrThrow<void>(res));
}

export function reorderComicIssues(comicId: string, issueIds: string[]): Promise<void> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/issues/reorder`, jsonInit("PUT", { issueIds })).then(
    (res) => parseOrThrow<void>(res),
  );
}

/** An alternative version of one page (another image, its own text layers). */
export interface ComicPageBranch {
  id: string;
  page_id: string;
  comic_id: string;
  issue_id: string | null;
  image_url: string;
  overlays: FrameOverlay[];
  name: string | null;
  language: string;
  user_id: string | null;
  author_email: string | null;
  created_at: string;
}

export function listComicPageBranches(comicId: string): Promise<ComicPageBranch[]> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/branches`, { credentials: "include" }).then((res) =>
    parseOrThrow<ComicPageBranch[]>(res),
  );
}

export function createComicPageBranch(pageId: string, file: File, name?: string): Promise<ComicPageBranch> {
  const form = new FormData();
  if (name) form.append("name", name);
  form.append("image", file);
  return fetch(`${API_BASE}/comic-pages/${pageId}/branches`, { method: "POST", credentials: "include", body: form }).then(
    (res) => parseOrThrow<ComicPageBranch>(res),
  );
}

export function updateComicPageBranch(
  branchId: string,
  patch: { name?: string | null; overlays?: FrameOverlay[] },
): Promise<ComicPageBranch> {
  return fetch(`${API_BASE}/comic-page-branches/${branchId}`, jsonInit("PATCH", patch)).then((res) =>
    parseOrThrow<ComicPageBranch>(res),
  );
}

export function deleteComicPageBranch(branchId: string): Promise<void> {
  return fetch(`${API_BASE}/comic-page-branches/${branchId}`, jsonInit("DELETE")).then((res) => parseOrThrow<void>(res));
}

export interface ComicRevision {
  id: string;
  event: string;
  detail: Record<string, unknown>;
  issue_title: string | null;
  page_index: number | null;
  author_email: string | null;
  created_at: string;
}

export function listComicRevisions(comicId: string): Promise<ComicRevision[]> {
  return fetch(`${API_BASE}/comics/${encodeURIComponent(comicId)}/revisions`, { credentials: "include" }).then((res) =>
    parseOrThrow<ComicRevision[]>(res),
  );
}
