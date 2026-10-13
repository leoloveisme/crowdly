import { API_BASE, ApiError } from "@/lib/apiBase";
import { enqueue, isNetworkError } from "./offline";

// The one way the web app talks to the backend. Always sends the session
// cookie (the old app sent it on only a handful of calls, so most writes
// silently failed or fell back to a client-supplied userId).
//
// API_BASE is "" in dev (Vite proxies to :4000) and on crowdly.cloud/editor
// (same origin); the editor.crowdly.cloud build sets VITE_API_BASE_URL to
// the platform origin. Same-site, so the SameSite=lax session cookie still
// travels with these credentialed cross-origin requests.
export { API_BASE, ApiError };

type Init = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Queue this write in the offline outbox if the network is down (latest per key wins). */
  offlineKey?: string;
};

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const { body, headers, offlineKey, ...rest } = init;
  const isRaw = body instanceof FormData || body instanceof Blob || typeof body === "string";
  const finalInit: RequestInit = {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined && !isRaw ? { "Content-Type": "application/json" } : {}),
      ...(headers as Record<string, string>),
    },
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  };
  let res: Response;
  try {
    if (offlineKey && !navigator.onLine) throw new TypeError("offline");
    res = await fetch(`${API_BASE}${path}`, finalInit);
  } catch (err) {
    if (offlineKey && isNetworkError(err) && (finalInit.body === undefined || typeof finalInit.body === "string")) {
      await enqueue(offlineKey, path, { method: finalInit.method, headers: finalInit.headers, body: finalInit.body as string | undefined });
      return { queued: true } as T;
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* plain-text body */
  }
  if (!res.ok) {
    const msg = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : "";
    throw new ApiError(res.status, msg || `Request failed (${res.status})`);
  }
  return data as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: body ?? {} });
export const put = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const del = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });

export const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Absolute URL of the main Crowdly platform, for "open on the platform" links. */
export const PLATFORM_URL: string =
  import.meta.env.VITE_PLATFORM_URL ??
  (import.meta.env.PROD ? API_BASE || "" : `${window.location.protocol}//${window.location.hostname}:8080`);

export const platformLink = (path: string) => `${PLATFORM_URL}${path}`;

/** Resolves backend-relative upload URLs (/uploads/...) against the API origin. */
export const mediaUrl = (url: string | null | undefined) =>
  !url ? "" : /^(https?:|blob:|data:)/.test(url) ? url : `${API_BASE}${url}`;
