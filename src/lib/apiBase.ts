// Same-origin in development (Vite proxies to the backend); overridable in
// production via VITE_API_BASE_URL. Shared by every API module instead of
// each one re-deriving it.
export const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorMessage(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

// credentials: 'include' on every call — these endpoints authenticate via
// the httpOnly session cookie set at login, not a bearer token.
//
// Namespaced under /api: the friends/messaging/notifications resources
// (e.g. /friends) share a bare path with SPA pages of the same name (e.g.
// the /friends route in App.tsx) — without a prefix, the browser's own
// top-level navigation and the dev proxy can't tell "serve the app" from
// "hit the API" apart at that URL.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || "Request failed");
  }
  return data as T;
}
