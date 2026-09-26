import { apiFetch } from "./apiBase";
import type { UserSummary } from "./friendsApi";

export interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ConversationSummary {
  conversationId: string;
  with: UserSummary;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unread: boolean;
}

export function listConversations() {
  return apiFetch<{ conversations: ConversationSummary[] }>("/conversations");
}

export function getConversationUnreadCount() {
  return apiFetch<{ count: number }>("/conversations/unread-count");
}

export function openConversationWith(friendUserId: string) {
  return apiFetch<{ conversation: { id: string } }>(`/conversations/with/${friendUserId}`);
}

export function listMessages(conversationId: string) {
  return apiFetch<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
}

export function sendMessage(conversationId: string, body: string) {
  return apiFetch<{ message: Message }>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function markConversationRead(conversationId: string) {
  return apiFetch(`/conversations/${conversationId}/read`, { method: "POST" });
}
