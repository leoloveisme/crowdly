import { API_BASE, ApiError } from "./apiBase";

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
