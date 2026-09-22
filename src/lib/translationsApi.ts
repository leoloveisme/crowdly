// Client for story translations (backend/src/translations.js).

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "";

export interface StoryVersion {
  story_title_id: string;
  title: string;
  language: string;
  published: boolean;
  is_original: boolean;
  is_official: boolean;
  source_story_title_id: string | null;
  creator_name: string | null;
  chapter_count: number;
  translated_count: number;
  stale_count: number;
  is_mine: boolean;
}

export interface StoryTranslations {
  group_id: string;
  can_translate: boolean;
  can_mark_official: boolean;
  versions: StoryVersion[];
}

export interface SourceChapter {
  source: {
    chapter_id: string;
    story_title_id: string;
    language: string;
    chapter_title: string;
    paragraphs: string[];
    updated_at: string;
  } | null;
  synced_at?: string;
  stale?: boolean;
}

export interface Locale {
  code: string;
  english_name: string;
  native_name: string;
  direction: "ltr" | "rtl";
}

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

export const fetchStoryTranslations = (storyTitleId: string) =>
  request<StoryTranslations>(`/stories/${storyTitleId}/translations`);

export const createStoryTranslation = (
  storyTitleId: string,
  language: string,
  start: "blank" | "copy" | "ai",
  connectionId?: string,
) =>
  request<{ story_title_id: string; ai_error?: string }>(`/stories/${storyTitleId}/translations`, {
    method: "POST",
    body: JSON.stringify({ language, start, connectionId }),
  });

export const setOfficialTranslation = (storyTitleId: string, official: boolean) =>
  request(`/stories/${storyTitleId}/official`, {
    method: "PATCH",
    body: JSON.stringify({ official }),
  });

export const fetchSourceChapter = (chapterId: string) => request<SourceChapter>(`/chapters/${chapterId}/source`);

export const markChapterSourceSynced = (chapterId: string) =>
  request(`/chapters/${chapterId}/source-synced`, { method: "PATCH" });

let localesCache: Promise<Locale[]> | null = null;
export const fetchLocales = () => {
  if (!localesCache) {
    localesCache = request<Locale[]>("/locales").catch((err) => {
      localesCache = null;
      throw err;
    });
  }
  return localesCache;
};
