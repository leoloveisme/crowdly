// Client for bring-your-own-AI (backend/src/ai/router.js).

import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "";

export type AiCapability = "translate" | "tts";
export type AiProviderId = "anthropic" | "openai" | "openai_compatible" | "elevenlabs";

export interface AiProvider {
  id: AiProviderId;
  label: string;
  capabilities: AiCapability[];
  defaults: Partial<Record<AiCapability, { model?: string; voice?: string }>>;
  needs_base_url: boolean;
}

export interface AiConnection {
  id: string;
  provider: AiProviderId;
  provider_label: string;
  label: string | null;
  key_hint: string | null;
  base_url: string | null;
  capabilities: AiCapability[];
  settings: Partial<Record<AiCapability, { model?: string; voice?: string }>>;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface AiConnectionsResponse {
  configured: boolean;
  providers: AiProvider[];
  connections: AiConnection[];
}

export interface AiJob {
  id: string;
  kind: "translate_chapter" | "tts_chapter";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  chapter_id: string | null;
  chapter_title: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  is_mine: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// --- Connections ---

export const listAiConnections = () => request<AiConnectionsResponse>("/users/me/ai-connections");

export const createAiConnection = (data: {
  provider: AiProviderId;
  label?: string;
  apiKey: string;
  baseUrl?: string;
  capabilities?: AiCapability[];
  settings?: AiConnection["settings"];
}) => request<AiConnection>("/users/me/ai-connections", json("POST", data));

export const updateAiConnection = (
  id: string,
  data: Partial<{ label: string; apiKey: string; baseUrl: string; capabilities: AiCapability[]; settings: AiConnection["settings"] }>,
) => request<AiConnection>(`/users/me/ai-connections/${id}`, json("PATCH", data));

export const deleteAiConnection = (id: string) => request<void>(`/users/me/ai-connections/${id}`, json("DELETE"));

export const testAiConnection = (id: string) => request<{ ok: true }>(`/users/me/ai-connections/${id}/test`, json("POST"));

// --- Jobs ---

export const aiTranslateChapter = (chapterId: string, connectionId: string) =>
  request<AiJob>(`/chapters/${chapterId}/ai/translate`, json("POST", { connectionId }));

export const aiTranslateStory = (storyTitleId: string, connectionId: string, overwrite = false) =>
  request<{ queued: number }>(`/stories/${storyTitleId}/ai/translate`, json("POST", { connectionId, overwrite }));

export const aiNarrateChapter = (
  chapterId: string,
  data: { connectionId: string; editionId?: string | null; voice?: string; label?: string },
) => request<AiJob>(`/chapters/${chapterId}/ai/narrate`, json("POST", data));

export const listStoryAiJobs = (storyTitleId: string) => request<AiJob[]>(`/stories/${storyTitleId}/ai-jobs`);

export const cancelAiJob = (jobId: string) => request(`/stories/ai-jobs/${jobId}/cancel`, json("POST"));

// --- Hooks ---

/** The signed-in user's AI connections (empty when signed out). */
export function useAiConnections(enabled: boolean) {
  const [data, setData] = useState<AiConnectionsResponse | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return setData(null);
    listAiConnections()
      .then(setData)
      .catch(() => setData(null));
  }, [enabled]);
  useEffect(reload, [reload]);
  return { data, connections: data?.connections ?? [], reload };
}

export const connectionsFor = (connections: AiConnection[], capability: AiCapability) =>
  connections.filter((c) => c.capabilities.includes(capability));

export const connectionName = (c: AiConnection) => c.label || c.provider_label;
