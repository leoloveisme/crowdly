import { apiFetch } from "./apiBase";

// "Ask to collaborate" requests (backend/src/collaboration.js). Readers send
// them from the desktop app; the story's owner answers them here.

export interface CollaborationRequest {
  id: string;
  story_title_id: string;
  message: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  requester?: { id: string; email: string; displayName: string };
}

export const listCollaborationRequests = (storyTitleId: string) =>
  apiFetch<{ requests: CollaborationRequest[] }>(`/stories/${storyTitleId}/collaboration-requests`);

export const answerCollaborationRequest = (requestId: string, approve: boolean) =>
  apiFetch<{ status: string }>(`/collaboration-requests/${requestId}/${approve ? "approve" : "decline"}`, {
    method: "POST",
  });
