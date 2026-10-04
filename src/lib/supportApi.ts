import { API_BASE, ApiError, apiFetch } from "./apiBase";

// Support requests ("Ask for help") and bug reports ("Report a bug") —
// backend/src/support.js, tables in backend/migrations/0022_support_requests.sql.

export type SupportKind = "request" | "bug";
export type SupportCategory = "account" | "stories" | "desktop_app" | "spaces_sync" | "other";
export type SupportStatus =
  | "new"
  | "triaged"
  | "confirmed"
  | "in_progress"
  | "fixed"
  | "released"
  | "resolved"
  | "wont_fix"
  | "duplicate"
  | "closed";
export type BugArea = "web_platform" | "desktop_app" | "web_editor" | "other";
export type BugSeverity = "blocker" | "annoying" | "cosmetic";
export type BugFrequency = "always" | "sometimes" | "once";

export interface SupportAttachment {
  id: string;
  original_name: string;
  mime: string;
  size: number;
}

export interface BugDetails {
  area?: BugArea;
  expected?: string;
  actual?: string;
  severity?: BugSeverity;
  frequency?: BugFrequency;
  consoleErrors?: string[];
  tech?: Record<string, string>;
}

export interface SupportRequest {
  id: string;
  kind: SupportKind;
  user_id: string | null;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  details: BugDetails;
  status: SupportStatus;
  duplicate_of: string | null;
  source: "web" | "desktop";
  handled_by: string | null;
  created_at: string;
  updated_at: string;
  attachments: SupportAttachment[];
}

export const REQUEST_STATUSES: SupportStatus[] = ["new", "in_progress", "resolved", "closed"];
export const BUG_STATUSES: SupportStatus[] = [
  "new", "triaged", "confirmed", "in_progress", "fixed", "released", "wont_fix", "duplicate",
];
export const CATEGORIES: SupportCategory[] = ["account", "stories", "desktop_app", "spaces_sync", "other"];
export const BUG_AREAS: BugArea[] = ["web_platform", "desktop_app", "web_editor", "other"];
export const BUG_SEVERITIES: BugSeverity[] = ["blocker", "annoying", "cosmetic"];
export const BUG_FREQUENCIES: BugFrequency[] = ["always", "sometimes", "once"];

export interface SupportSubmission {
  kind: SupportKind;
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
  details?: BugDetails;
  captchaId?: string | null;
  captchaAnswer?: string;
  attachments?: File[];
}

// Multipart (not apiFetch's JSON) so bug reports can carry screenshots.
export async function submitSupportRequest(submission: SupportSubmission): Promise<{ ok: true; id: string }> {
  const form = new FormData();
  form.append("kind", submission.kind);
  form.append("name", submission.name);
  form.append("email", submission.email);
  form.append("category", submission.category);
  form.append("subject", submission.subject);
  form.append("message", submission.message);
  form.append("source", "web");
  if (submission.details) form.append("details", JSON.stringify(submission.details));
  if (submission.captchaId) form.append("captchaId", submission.captchaId);
  if (submission.captchaAnswer) form.append("captchaAnswer", submission.captchaAnswer);
  for (const file of submission.attachments ?? []) form.append("attachments", file);

  const res = await fetch(`${API_BASE}/api/support-requests`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error || "Could not submit right now. Please try again.");
  return data;
}

export function getMySupportRequests() {
  return apiFetch<{ requests: SupportRequest[] }>("/support-requests/mine");
}

export interface SupportFilters {
  kind: SupportKind;
  status?: SupportStatus | "";
  severity?: BugSeverity | "";
  area?: BugArea | "";
}

export function getSupportRequests(filters: SupportFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return apiFetch<{ requests: SupportRequest[] }>(`/support-requests?${params.toString()}`);
}

export function updateSupportRequestStatus(id: string, status: SupportStatus, duplicateOf?: string) {
  return apiFetch<{ request: SupportRequest }>(`/support-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, duplicate_of: duplicateOf ?? null }),
  });
}

export function attachmentUrl(requestId: string, attachmentId: string) {
  return `${API_BASE}/api/support-requests/${requestId}/attachments/${attachmentId}`;
}
