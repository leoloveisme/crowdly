import { get, post, qs } from "./api";

// "I want to change this" + owner review: proposals, clones, translations,
// collaboration requests and comments (same endpoints as the desktop's
// crowdly_client.py and the platform's story page).

export interface Proposal {
  id: string;
  story_title_id: string;
  target_type: "paragraph" | "chapter_title" | "branch";
  target_chapter_id: string | null;
  target_path: string | null;
  proposed_text: string;
  author_user_id: string;
  author_email?: string;
  status: "undecided" | "approved" | "declined";
  created_at: string;
}
export interface CollabRequest {
  id: string;
  message: string;
  status: string;
  created_at: string;
  requester?: { id: string; name?: string; email?: string; username?: string };
}
export interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  chapter_id?: string | null;
  author_email?: string;
  email?: string;
  username?: string;
}
export interface Locale {
  code: string;
  english_name: string;
  native_name: string;
}

export const listProposals = (storyId: string, status = "undecided") => get<Proposal[]>(`/stories/${storyId}/proposals${qs({ status })}`);
export const createProposal = (storyId: string, p: { targetType: "paragraph" | "chapter_title"; targetChapterId: string; proposedText: string; targetPath?: string }) =>
  post<Proposal>(`/stories/${storyId}/proposals`, p);
export const approveProposal = (id: string) => post(`/proposals/${id}/approve`);
export const declineProposal = (id: string) => post(`/proposals/${id}/decline`);

export const cloneStory = (storyId: string, userId: string) => post<{ storyTitleId: string }>(`/stories/${storyId}/clone`, { userId });
export const createTranslation = (storyId: string, language: string, start: "copy" | "blank" = "copy") =>
  post<{ story_title_id: string }>(`/stories/${storyId}/translations`, { language, start });
export const listLocales = () => get<Locale[]>(`/locales`);

export const requestCollaboration = (storyId: string, message: string) => post<{ request: CollabRequest }>(`/stories/${storyId}/collaboration-requests`, { message });
export const myCollaborationRequest = (storyId: string) =>
  get<{ request: CollabRequest | null }>(`/stories/${storyId}/collaboration-requests/mine`).then((r) => r.request).catch(() => null);
export const listCollaborationRequests = (storyId: string) =>
  get<{ requests: CollabRequest[] }>(`/stories/${storyId}/collaboration-requests`).then((r) => r.requests).catch(() => [] as CollabRequest[]);
export const decideCollaboration = (id: string, approve: boolean) => post(`/collaboration-requests/${id}/${approve ? "approve" : "decline"}`);

export const listComments = (storyId: string) => get<Comment[]>(`/comments${qs({ storyTitleId: storyId })}`).catch(() => [] as Comment[]);
export const postComment = (userId: string, storyId: string, chapterId: string | null, body: string) =>
  post<Comment>(`/comments`, { userId, storyTitleId: storyId, chapterId: chapterId ?? undefined, body });

/** Paragraph-level suggestions from an edited copy, the way the desktop's suggestions.py builds them. */
export function diffSuggestions(chapterId: string, originalTitle: string, editedTitle: string, original: string[], edited: string[]) {
  const out: { targetType: "paragraph" | "chapter_title"; targetChapterId: string; proposedText: string; targetPath?: string }[] = [];
  if (editedTitle.trim() !== originalTitle.trim()) out.push({ targetType: "chapter_title", targetChapterId: chapterId, proposedText: editedTitle.trim() });
  const n = Math.max(original.length, edited.length);
  for (let i = 0; i < n; i++) {
    const a = (original[i] ?? "").trim();
    const b = (edited[i] ?? "").trim();
    if (a !== b) out.push({ targetType: "paragraph", targetChapterId: chapterId, proposedText: b, targetPath: String(i) });
  }
  return out;
}
