import { API_BASE, ApiError } from "./apiBase";

// Gallery routes are bare paths (/stories/:id/gallery, /gallery-images/:id),
// not under /api — they sit alongside the rest of the story routes
// (/story-titles, /chapters, ...), unlike friends/messaging/notifications.
export type GalleryImageKind = "cover_variant" | "inline_illustration" | "fan_art" | "gallery";
export type GalleryImageStatus = "pending" | "approved" | "rejected";

export interface GalleryImage {
  id: string;
  story_title_id: string;
  uploaded_by: string | null;
  image_url: string;
  chapter_id: string | null;
  anchor_index: number | null;
  caption: string | null;
  tags: string[] | null;
  kind: GalleryImageKind;
  status: GalleryImageStatus;
  position: number | null;
  created_at: string;
  updated_at: string;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || "Request failed");
  }
  return data as T;
}

export function listGalleryImages(storyTitleId: string): Promise<GalleryImage[]> {
  return fetch(`${API_BASE}/stories/${encodeURIComponent(storyTitleId)}/gallery`, {
    credentials: "include",
  }).then((res) => parseOrThrow<GalleryImage[]>(res));
}

export function uploadGalleryImages(
  storyTitleId: string,
  files: File[],
  options?: { kind?: GalleryImageKind; chapterId?: string; anchorIndex?: number; caption?: string; tags?: string[] },
): Promise<GalleryImage[]> {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  if (options?.kind) form.append("kind", options.kind);
  if (options?.chapterId) form.append("chapter_id", options.chapterId);
  if (options?.anchorIndex !== undefined) form.append("anchor_index", String(options.anchorIndex));
  if (options?.caption) form.append("caption", options.caption);
  if (options?.tags?.length) form.append("tags", options.tags.join(","));

  // No Content-Type header — the browser sets multipart/form-data with the
  // correct boundary itself when the body is a FormData instance.
  return fetch(`${API_BASE}/stories/${encodeURIComponent(storyTitleId)}/gallery`, {
    method: "POST",
    credentials: "include",
    body: form,
  }).then((res) => parseOrThrow<GalleryImage[]>(res));
}

export function updateGalleryImage(
  id: string,
  patch: Partial<Pick<GalleryImage, "caption" | "tags" | "position" | "status">>,
): Promise<GalleryImage> {
  return fetch(`${API_BASE}/gallery-images/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((res) => parseOrThrow<GalleryImage>(res));
}

export function deleteGalleryImage(id: string): Promise<void> {
  return fetch(`${API_BASE}/gallery-images/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  }).then((res) => parseOrThrow<void>(res));
}
