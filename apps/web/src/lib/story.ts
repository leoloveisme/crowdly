import { api, get, patch, post, qs } from "./api";

// Story, chapter and paragraph-branch endpoints (backend/src/server.js).

export interface StoryTitle {
  story_title_id: string;
  title: string;
  creator_id: string | null;
  initiator_id?: string | null;
  description?: string | null;
  genre?: string | null;
  tags?: string[] | null;
  visibility?: string;
  published?: boolean;
  language?: string | null;
  cover_image_url?: string | null;
  creative_space_id?: string | null;
  completion_status?: string | null;
}

export interface Chapter {
  chapter_id: string;
  story_title_id: string;
  chapter_title: string;
  paragraphs: string[];
  chapter_index: number | null;
  published?: boolean;
  created_at?: string;
}

export interface Branch {
  id: string;
  chapter_id: string;
  parent_paragraph_index: number;
  parent_paragraph_text?: string;
  branch_text: string;
  branch_name?: string | null;
  user_id: string;
  language?: string | null;
  created_at?: string;
  chapter_title?: string;
}

export type StoryRole = "owner" | "contributor" | null;
export interface MyAccess {
  role: StoryRole;
  explicit?: boolean;
}

export const getStory = (id: string, userId?: string) => get<StoryTitle>(`/story-titles/${id}${qs({ userId })}`);
export const getChapters = (id: string, userId?: string) => get<Chapter[]>(`/chapters${qs({ storyTitleId: id, userId })}`);
export const getMyAccess = (id: string) => get<MyAccess>(`/story-titles/${id}/my-access`).catch(() => ({ role: null }) as MyAccess);

export const saveChapter = (chapterId: string, chapterTitle: string, paragraphs: string[]) =>
  api<Chapter>(`/chapters/${chapterId}`, { method: "PATCH", body: { chapterTitle: chapterTitle || "Untitled chapter", paragraphs }, offlineKey: `chapter:${chapterId}` });
export const createChapter = (storyTitleId: string, chapterTitle: string, paragraphs: string[], chapterIndex?: number) =>
  post<Chapter>(`/chapters`, { storyTitleId, chapterTitle, paragraphs, chapterIndex });
export const deleteChapter = (chapterId: string) => api(`/chapters/${chapterId}`, { method: "DELETE" });
export const reorderChapters = (storyTitleId: string, chapterIds: string[]) => patch(`/stories/${storyTitleId}/chapters/reorder`, { chapterIds });
export const publishChapter = (chapterId: string, published: boolean) => patch(`/chapters/${chapterId}/publish`, { published });

export const renameStory = (id: string, title: string, userId: string) => patch(`/story-titles/${id}`, { title, userId });
export const updateStorySettings = (id: string, settings: Partial<StoryTitle> & { userId?: string }) => patch(`/story-titles/${id}/settings`, settings);

export const listBranches = (storyTitleId: string) => get<Branch[]>(`/stories/${storyTitleId}/branches`);
export const createBranch = (b: { chapterId: string; parentParagraphIndex: number; parentParagraphText: string; branchText: string; branchName?: string }) =>
  post<Branch>(`/paragraph-branches`, b);
export const updateBranch = (id: string, b: { branchText?: string; branchName?: string }) => patch<Branch>(`/paragraph-branches/${id}`, b);
export const deleteBranch = (id: string) => api(`/paragraph-branches/${id}`, { method: "DELETE" });

// --- CRDT document helpers (revision history + live editing) ---------------
export type CrdtDocType = "chapter" | "scene" | "story_title" | "screenplay_title";
export const ensureCrdtDoc = (body: { docType: CrdtDocType; chapterId?: string; sceneId?: string; storyTitleId?: string; screenplayId?: string }) =>
  post<{ docKey: string }>(`/crdt/docs/ensure`, body).then((r) => r.docKey);
export const applyCrdtContent = (docKey: string, value: Record<string, unknown>) =>
  post(`/crdt/docs/${docKey}/apply-content`, { value, source: "web-app" });

