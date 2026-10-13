import { API_BASE, ApiError } from "./apiBase";
import type { StoryTranslations } from "./translationsApi";

// Story-page controls for screenplays and comics (backend/src/workRoutes.js):
// settings, people, access rules, clone, delete and collaboration requests.
// Bare paths (/screenplays/:id/..., /comics/:id/...) like the rest of the
// screenplay and comic routes — not under /api.

export type WorkKind = "screenplay" | "comic";
export type WorkPolicy = "anyone" | "restricted" | "none";
export type WorkRuleType = "view" | "clone" | "export" | "translate" | "narrate";

const BASE: Record<WorkKind, string> = { screenplay: "/screenplays", comic: "/comics" };

export const workPath = (kind: WorkKind, id: string) => `${BASE[kind]}/${encodeURIComponent(id)}`;

/** The page a work is read on (/screenplay/:id, /comic/:id). */
export const workPagePath = (kind: WorkKind, id: string) => `/${kind}/${id}`;

export async function workRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error || "Request failed");
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface WorkAccess {
  role: "owner" | "contributor" | null;
  /** On the team (creator or explicit access row), not just "public work". */
  explicit: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  can_clone: boolean;
  can_export: boolean;
  can_translate: boolean;
  can_narrate: boolean;
}

/** Settings shared by stories, screenplays and comics. */
export interface WorkSettings {
  title?: string;
  visibility?: string | null;
  published?: boolean | null;
  completion_status?: string | null;
  clone_policy?: string | null;
  export_policy?: string | null;
  translation_policy?: string | null;
  narration_policy?: string | null;
  language?: string | null;
  cover_image_url?: string | null;
  description?: string | null;
  genre?: string | null;
  tags?: string[] | null;
  format_type?: string | null;
  reading_direction?: "ltr" | "rtl";
}

export interface WorkPerson {
  user_id: string;
  role: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}

export interface WorkAccessRule {
  id: string;
  rule_type: WorkRuleType;
  grantee_user_id: string | null;
  grantee_group_id: string | null;
  user_email?: string | null;
  group_name?: string | null;
}

export interface WorkCollaborationRequest {
  id: string;
  message: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  requester?: { id: string; email: string; displayName: string };
}

export const personName = (p: Pick<WorkPerson, "first_name" | "last_name" | "nickname" | "email">) =>
  p.nickname || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

export const getWorkAccess = (kind: WorkKind, id: string) =>
  workRequest<WorkAccess>(`${workPath(kind, id)}/my-access`);

export const updateWorkSettings = <T = WorkSettings>(kind: WorkKind, id: string, patch: WorkSettings) =>
  workRequest<T>(`${workPath(kind, id)}/settings`, json("PATCH", patch));

export const deleteWork = (kind: WorkKind, id: string) => workRequest<void>(workPath(kind, id), json("DELETE"));

export const cloneWork = (kind: WorkKind, id: string) =>
  workRequest<{ id: string }>(`${workPath(kind, id)}/clone`, json("POST", {}));

export const listWorkContributors = (kind: WorkKind, id: string) =>
  workRequest<WorkPerson[]>(`${workPath(kind, id)}/contributors`);

export const grantWorkAccess = (kind: WorkKind, id: string, who: { userId?: string; email?: string }) =>
  workRequest<{ userId: string }>(`${workPath(kind, id)}/contributors`, json("POST", who));

export const revokeWorkAccess = (kind: WorkKind, id: string, userId: string) =>
  workRequest<void>(`${workPath(kind, id)}/contributors/${userId}`, json("DELETE"));

export const listWorkCollaborators = (kind: WorkKind, id: string) =>
  workRequest<WorkPerson[]>(`${workPath(kind, id)}/collaborators`);

export const addWorkCredit = (kind: WorkKind, id: string, role: "author" | "coauthor", userId: string) =>
  workRequest<WorkPerson>(`${workPath(kind, id)}/${role === "author" ? "authors" : "coauthors"}`, json("POST", { userId }));

export const removeWorkCredit = (kind: WorkKind, id: string, role: "author" | "coauthor", userId: string) =>
  workRequest<void>(`${workPath(kind, id)}/${role === "author" ? "authors" : "coauthors"}/${userId}`, json("DELETE"));

export const transferWorkOwnership = (kind: WorkKind, id: string, newOwnerId: string) =>
  workRequest<unknown>(`${workPath(kind, id)}/transfer-ownership`, json("POST", { newOwnerId }));

export const listWorkCollaborationRequests = (kind: WorkKind, id: string) =>
  workRequest<{ requests: WorkCollaborationRequest[] }>(`${workPath(kind, id)}/collaboration-requests`);

export const requestWorkCollaboration = (kind: WorkKind, id: string, message: string) =>
  workRequest<{ request: WorkCollaborationRequest }>(
    `${workPath(kind, id)}/collaboration-requests`,
    json("POST", { message }),
  );

export const myWorkCollaborationRequest = (kind: WorkKind, id: string) =>
  workRequest<{ request: WorkCollaborationRequest | null }>(`${workPath(kind, id)}/collaboration-requests/mine`);

export interface UserSearchResult {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}

export const searchUsers = (q: string) =>
  workRequest<{ users: UserSearchResult[] }>(`/users/search?q=${encodeURIComponent(q)}&pageSize=8`).then(
    (data) => data.users ?? [],
  );

// Favorite / living / lived (user_story_status).
export async function setWorkStatus(
  kind: WorkKind,
  id: string,
  flags: { isFavorite?: boolean; isLiving?: boolean; isLived?: boolean },
) {
  return workRequest<unknown>(
    "/api/me/story-status",
    json("PUT", { contentType: kind, [kind === "comic" ? "comicId" : "screenplayId"]: id, ...flags }),
  );
}

// --- Proposals ("suggest changes") -------------------------------------------

export type WorkProposalTarget =
  | "screenplay_title"
  | "scene"
  | "block"
  | "block_branch"
  | "comic_title"
  | "issue"
  | "page_layer";

export interface WorkProposal {
  id: string;
  target_type: WorkProposalTarget;
  target_scene_id: string | null;
  target_block_id: string | null;
  target_branch_id: string | null;
  target_issue_id: string | null;
  target_page_id: string | null;
  proposed_text: string;
  status: "undecided" | "approved" | "declined";
  author_user_id: string;
  author_email: string | null;
  created_at: string;
  decided_at: string | null;
  /** Scene slugline / issue title the target lives in. */
  part_title: string | null;
  part_id: string | null;
  /** The target's current text (overlays JSON for page layers). */
  current_text: string | null;
  words: number;
}

export const createWorkProposal = (
  kind: WorkKind,
  id: string,
  proposal: {
    targetType: WorkProposalTarget;
    proposedText: string;
    targetSceneId?: string;
    targetBlockId?: string;
    targetBranchId?: string;
    targetIssueId?: string;
    targetPageId?: string;
  },
) => workRequest<WorkProposal>(`${workPath(kind, id)}/proposals`, json("POST", proposal));

export const listWorkProposals = (kind: WorkKind, id: string, status?: WorkProposal["status"]) =>
  workRequest<WorkProposal[]>(`${workPath(kind, id)}/proposals${status ? `?status=${status}` : ""}`);

/** Same approve/decline routes as story proposals. */
export const decideProposal = (proposalId: string, approve: boolean) =>
  workRequest<void>(`/proposals/${proposalId}/${approve ? "approve" : "decline"}`, json("POST", {}));

// --- Editions -----------------------------------------------------------------

export interface WorkEditionSummary {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published";
  created_by: string | null;
  creator_name: string | null;
  branch_count: number;
  is_mine: boolean;
  created_at: string;
}

/** One frozen part: a scene (blocks) or an issue (pages). */
export interface WorkEditionPart<S> {
  position: number;
  part_id: string | null;
  title: string;
  selections: Record<string, string>;
  snapshot: S[];
}

export interface WorkEdition<S> extends WorkEditionSummary {
  can_manage: boolean;
  parts: WorkEditionPart<S>[];
}

const editionPath = (kind: WorkKind, editionId: string) =>
  `/${kind === "comic" ? "comic" : "screenplay"}-editions/${editionId}`;

export const listWorkEditions = (kind: WorkKind, id: string) =>
  workRequest<WorkEditionSummary[]>(`${workPath(kind, id)}/editions`);

export const getWorkEdition = <S>(kind: WorkKind, editionId: string) =>
  workRequest<WorkEdition<S>>(editionPath(kind, editionId));

/** selections: { partId: { blockId|pageId: branchId } } */
export const createWorkEdition = (
  kind: WorkKind,
  id: string,
  data: { name: string; status: "draft" | "published"; selections: Record<string, Record<string, string>> },
) => workRequest<WorkEditionSummary>(`${workPath(kind, id)}/editions`, json("POST", data));

export const updateWorkEdition = (
  kind: WorkKind,
  editionId: string,
  data: Partial<{ name: string; status: "draft" | "published"; selections: Record<string, Record<string, string>> }>,
) => workRequest<WorkEditionSummary>(editionPath(kind, editionId), json("PATCH", data));

export const deleteWorkEdition = (kind: WorkKind, editionId: string) =>
  workRequest<void>(editionPath(kind, editionId), json("DELETE"));

// --- Translations ---------------------------------------------------------------

export const fetchWorkTranslations = (kind: WorkKind, id: string) =>
  workRequest<StoryTranslations>(`${workPath(kind, id)}/translations`);

export const createWorkTranslation = (
  kind: WorkKind,
  id: string,
  data: { language: string; start: "blank" | "copy" | "ai"; connectionId?: string },
) => workRequest<{ id: string; ai_error?: string }>(`${workPath(kind, id)}/translations`, json("POST", data));

export const setWorkOfficialTranslation = (kind: WorkKind, id: string, official: boolean) =>
  workRequest<unknown>(`${workPath(kind, id)}/official`, json("PATCH", { official }));

// --- Media (audio / video of a scene or issue) ----------------------------------

export type WorkPart = { kind: "scene" | "issue"; id: string };

export interface WorkMediaItem {
  id: string;
  kind: "audio" | "video";
  source: "upload" | "embed" | "ai";
  label: string | null;
  url: string;
  mime: string | null;
  status: "pending" | "approved" | "rejected";
  is_primary: boolean;
  creator_name: string | null;
  is_mine: boolean;
  created_at: string;
}

const partPath = (part: WorkPart) => `/${part.kind === "scene" ? "screenplay-scenes" : "comic-issues"}/${part.id}`;

export const listPartMedia = (part: WorkPart) =>
  workRequest<{ items: WorkMediaItem[]; can_moderate: boolean; can_narrate: boolean }>(`${partPath(part)}/media`);

export const uploadPartMedia = (part: WorkPart, type: "audio" | "video", file: File, label?: string) => {
  const form = new FormData();
  if (label) form.append("label", label);
  form.append("file", file);
  return workRequest<WorkMediaItem>(`${partPath(part)}/media/${type === "audio" ? "audio" : "video-file"}`, {
    method: "POST",
    body: form,
  });
};

export const embedPartVideo = (part: WorkPart, url: string, label?: string) =>
  workRequest<WorkMediaItem>(`${partPath(part)}/media/embed`, json("POST", { url, label }));

export const updateWorkMedia = (mediaId: string, patch: { status?: string; isPrimary?: boolean; label?: string | null }) =>
  workRequest<WorkMediaItem>(`/work-media/${mediaId}`, json("PATCH", patch));

export const deleteWorkMedia = (mediaId: string) => workRequest<void>(`/work-media/${mediaId}`, json("DELETE"));

export const fetchWorkMediaSummary = (kind: WorkKind, id: string) =>
  workRequest<Record<string, { audio?: number; video?: number }>>(`${workPath(kind, id)}/media-summary`);

// --- AI -------------------------------------------------------------------------

export const aiNarratePart = (part: WorkPart, data: { connectionId: string; voice?: string; label?: string }) =>
  workRequest<unknown>(`${partPath(part)}/ai/narrate`, json("POST", data));

export const aiVideoPart = (part: WorkPart, data: { connectionId: string; prompt: string; seconds: number; label?: string }) =>
  workRequest<unknown>(`${partPath(part)}/ai/video`, json("POST", data));

export const aiTranslatePart = (part: WorkPart, connectionId: string) =>
  workRequest<unknown>(`${partPath(part)}/ai/translate`, json("POST", { connectionId }));

export interface WorkAiJob {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  part_id: string | null;
  progress: number | null;
  is_mine: boolean;
  created_at: string;
}

export const listWorkAiJobs = (kind: WorkKind, id: string) => workRequest<WorkAiJob[]>(`${workPath(kind, id)}/ai-jobs`);

/** Same cancel route as story jobs (it only checks the job is yours and queued). */
export const cancelWorkAiJob = (jobId: string) => workRequest<unknown>(`/stories/ai-jobs/${jobId}/cancel`, json("POST", {}));
