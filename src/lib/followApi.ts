import { apiFetch } from "./apiBase";

export function getFollowStatus(userId: string) {
  return apiFetch<{ following: boolean }>(`/follows/status/${encodeURIComponent(userId)}`);
}

export function followUser(userId: string) {
  return apiFetch<{ following: boolean }>(`/follows/${encodeURIComponent(userId)}`, {
    method: "POST",
  });
}

export function unfollowUser(userId: string) {
  return apiFetch(`/follows/${encodeURIComponent(userId)}`, { method: "DELETE" });
}
