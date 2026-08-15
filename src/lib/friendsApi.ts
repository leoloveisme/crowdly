import { apiFetch } from "./apiBase";

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface FriendRequest {
  requestId: string;
  createdAt: string;
  from?: UserSummary;
  to?: UserSummary;
}

export interface Friend extends UserSummary {
  friendsSince: string;
}

export function sendFriendRequest(addresseeId: string) {
  return apiFetch<{ friendRequest: { id: string }; autoAccepted?: boolean }>("/friends/requests", {
    method: "POST",
    body: JSON.stringify({ addresseeId }),
  });
}

export type FriendStatus = "self" | "none" | "pending_outgoing" | "pending_incoming" | "friends";

export function getFriendStatus(userId: string) {
  return apiFetch<{ status: FriendStatus; requestId?: string }>(
    `/friends/status/${encodeURIComponent(userId)}`,
  );
}

export function listFriendRequests() {
  return apiFetch<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>("/friends/requests");
}

export function acceptFriendRequest(requestId: string) {
  return apiFetch(`/friends/requests/${requestId}/accept`, { method: "POST" });
}

export function declineFriendRequest(requestId: string) {
  return apiFetch(`/friends/requests/${requestId}/decline`, { method: "POST" });
}

export function cancelFriendRequest(requestId: string) {
  return apiFetch(`/friends/requests/${requestId}`, { method: "DELETE" });
}

export function unfriend(userId: string) {
  return apiFetch(`/friends/${userId}`, { method: "DELETE" });
}

export function listFriends() {
  return apiFetch<{ friends: Friend[] }>("/friends");
}
