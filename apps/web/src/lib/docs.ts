import { api, get, post, qs, patch } from "./api";

// Listing and creating the user's works (stories, screenplays, comics) and
// Spaces — shared by Creation home, the New/Open menus and the Spaces menu.

export interface StorySummary {
  story_title_id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  visibility?: string;
  published?: boolean;
  cover_image_url?: string | null;
  creator_id?: string;
  roles?: string[];
}
export interface ScreenplaySummary {
  screenplay_id: string;
  title: string;
  created_at?: string;
  visibility?: string;
  published?: boolean;
}
export interface ComicSummary {
  comic_id: string;
  title: string;
  cover_image_url?: string | null;
  created_at?: string;
}
export interface Space {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  visibility?: string;
  published?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const listMyStories = (userId: string) => get<StorySummary[]>(`/users/${userId}/stories`);
export const listMyScreenplays = (userId: string) => get<ScreenplaySummary[]>(`/users/${userId}/screenplays`);
export const listMyComics = (userId: string) => get<ComicSummary[]>(`/users/${userId}/comics`).catch(() => []);
export const listSpaces = (userId: string) => get<Space[]>(`/creative-spaces${qs({ userId })}`);
export const listSharedSpaces = () => get<Space[]>(`/creative-spaces/shared-with-me`).catch(() => [] as Space[]);
export const getSpace = (id: string) => get<Space>(`/creative-spaces/${id}`);
export const createSpace = (userId: string, name: string, description?: string) =>
  post<Space>(`/creative-spaces`, { userId, name, description });
export const ensureDefaultSpace = (userId: string) => post<Space>(`/creative-spaces/ensure-default`, { userId });
export const deleteSpace = (id: string, userId: string) => api(`/creative-spaces/${id}`, { method: "DELETE", body: { userId } });
export const renameSpace = (id: string, userId: string, name: string) => patch(`/creative-spaces/${id}`, { userId, name });
export const cloneSpace = (id: string, userId: string) => post<Space>(`/creative-spaces/${id}/clone`, { userId });

export async function createStory(userId: string, title: string, opts: { spaceId?: string | null; chapterTitle?: string; paragraphs?: string[] } = {}) {
  return post<{ storyTitleId: string; chapterId: string }>(`/stories/template`, {
    title: title || "Untitled story",
    chapterTitle: opts.chapterTitle || "Chapter 1",
    paragraphs: opts.paragraphs?.length ? opts.paragraphs : [""],
    userId,
    creativeSpaceId: opts.spaceId || undefined,
  });
}

type IdBag = Record<string, string | number | undefined>;

export async function createScreenplay(title: string) {
  const r = await post<IdBag>(`/screenplays/template`, { title: title || "Untitled screenplay" });
  return { screenplayId: String(r.screenplayId ?? r.screenplay_id ?? r.id) };
}

export async function createComic(title: string) {
  const r = await post<IdBag>(`/comics`, { title: title || "Untitled comic" });
  return { comicId: String(r.comic_id ?? r.comicId ?? r.id) };
}

/** Accepts an id or any Crowdly URL (/story/:id, /screenplay/:id, /comic/:id, editor URLs too). */
export function parseWorkRef(input: string): { kind: "story" | "screenplay" | "comic" | null; id: string } | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/(story|screenplay|comic)\/([0-9a-fA-F-]{8,})/);
  if (m) return { kind: m[1] as "story" | "screenplay" | "comic", id: m[2] };
  if (/^[0-9a-fA-F-]{8,}$/.test(s)) return { kind: null, id: s };
  return null;
}

/** For a bare id, probe which kind of work it is. */
export async function resolveWorkKind(id: string): Promise<"story" | "screenplay" | "comic" | null> {
  for (const [kind, path] of [
    ["story", `/story-titles/${id}`],
    ["screenplay", `/screenplays/${id}`],
    ["comic", `/comics/${id}`],
  ] as const) {
    try {
      await get(path);
      return kind;
    } catch {
      /* try the next kind */
    }
  }
  return null;
}
