import { apiFetch } from "./apiBase";

export interface AppNotification {
  id: string;
  type: "friend_request" | "friend_accept" | "follow";
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
}

export function listNotifications() {
  return apiFetch<{ notifications: AppNotification[]; hasMore: boolean }>("/notifications");
}

export function getUnreadNotificationCount() {
  return apiFetch<{ count: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: string) {
  return apiFetch(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch("/notifications/read-all", { method: "POST" });
}
