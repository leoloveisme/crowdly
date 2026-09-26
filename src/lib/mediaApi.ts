// Client for editions (backend/src/editions.js) and chapter media
// (backend/src/chapterMedia.js).

const API_BASE = import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditionSummary {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published";
  created_by: string | null;
  creator_name: string | null;
  snapshot_at: string;
  created_at: string;
  branch_count: number;
  narration_count: number;
  is_mine: boolean;
}

export interface EditionChapter {
  position: number;
  chapter_id: string | null;
  chapter_title: string;
  selections: Record<string, string>;
  snapshot_paragraphs: string[];
}

export interface Edition {
  id: string;
  story_title_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published";
  is_auto_snapshot: boolean;
  snapshot_at: string;
  created_by: string | null;
  can_manage: boolean;
  chapters: EditionChapter[];
}

/** { [chapterId]: { [paragraphIndex]: branchId } } — branch ids are opaque strings (uuid in existing DBs). */
export type EditionSelections = Record<string, Record<string, string>>;

export type MediaKind = "audio" | "visual" | "video";
export type MediaStatus = "pending" | "approved" | "rejected";

export interface FrameOverlay {
  text: string;
  x: number; // 0-100, percent of image width
  y: number; // 0-100, percent of image height
  style: "bubble" | "box";
}

export interface MediaFrame {
  id: string;
  media_id: string;
  frame_index: number;
  image_url: string;
  caption: string | null;
  overlays: FrameOverlay[];
  anchor_start: number | null;
  anchor_end: number | null;
}

export interface AudioTiming {
  paragraph: number;
  start: number;
}

export interface ChapterMedia {
  id: string;
  story_title_id: string;
  chapter_id: string;
  edition_id: string | null;
  edition_name: string | null;
  edition_is_auto_snapshot: boolean | null;
  edition_snapshot_at: string | null;
  kind: MediaKind;
  source: "upload" | "embed" | "ai";
  label: string | null;
  url: string | null;
  mime: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  timings: AudioTiming[] | null;
  status: MediaStatus;
  is_primary: boolean;
  created_by: string | null;
  creator_name: string | null;
  created_at: string;
  frames?: MediaFrame[];
  is_mine: boolean;
}

export interface ChapterMediaList {
  can_moderate: boolean;
  can_narrate: boolean;
  /** Object storage is configured: large files upload straight to it, and video files are allowed. */
  direct_upload?: boolean;
  max_video_bytes?: number;
  media: ChapterMedia[];
}

export type MediaSummary = Record<string, { audio: number; visual: number; video: number }>;

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

/** POST multipart with upload progress (fetch can't report upload progress). */
function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        // non-JSON error page (e.g. a proxy's "413 Request Entity Too Large")
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (xhr.status === 413) reject(new Error("File is too large for the server"));
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

export const listEditions = (storyTitleId: string) => request<EditionSummary[]>(`/stories/${storyTitleId}/editions`);

export const getEdition = (editionId: string) => request<Edition>(`/stories/editions/${editionId}`);

export const createEdition = (
  storyTitleId: string,
  data: { name: string; description?: string; status: "draft" | "published"; selections: EditionSelections },
) => request<Edition>(`/stories/${storyTitleId}/editions`, json("POST", data));

export const updateEdition = (
  editionId: string,
  data: Partial<{ name: string; description: string; status: "draft" | "published"; selections: EditionSelections }>,
) => request<Edition>(`/stories/editions/${editionId}`, json("PATCH", data));

export const deleteEdition = (editionId: string) => request<void>(`/stories/editions/${editionId}`, json("DELETE"));

export interface ParagraphBranch {
  id: string;
  chapter_id: string;
  parent_paragraph_index: number;
  branch_text: string;
  user_id: string | null;
  created_at: string;
}

export const listStoryBranches = (storyTitleId: string) =>
  request<ParagraphBranch[]>(`/stories/${storyTitleId}/branches`);

// ---------------------------------------------------------------------------
// Chapter media
// ---------------------------------------------------------------------------

export const listChapterMedia = (chapterId: string) => request<ChapterMediaList>(`/chapters/${chapterId}/media`);

export const getMediaSummary = (storyTitleId: string) =>
  request<MediaSummary>(`/stories/${storyTitleId}/media-summary`);

/** Freeze the current story text as a hidden edition for an audiobook. */
export const createNarrationSnapshot = (storyTitleId: string) =>
  request<{ id: string }>(`/stories/${storyTitleId}/narration-snapshot`, json("POST"));

/** MIME type without parameters ("audio/webm;codecs=opus" → "audio/webm"). */
export const baseMime = (type: string) => type.split(";")[0].trim().toLowerCase();

/** PUT a file straight to object storage with a presigned URL (no cookies). */
function putToBucket(url: string, headers: Record<string, string>, file: Blob, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload to storage failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error while uploading to storage"));
    xhr.send(file);
  });
}

/** Presigned direct upload: ask for a URL, PUT the file, return the storage key. */
async function directUpload(
  chapterId: string,
  purpose: "audio" | "video",
  file: File,
  onProgress?: (fraction: number) => void,
) {
  const contentType = baseMime(file.type);
  const target = await request<{ storageKey: string; url: string; headers: Record<string, string> }>(
    `/chapters/${chapterId}/media/upload-url`,
    json("POST", { purpose, contentType, size: file.size }),
  );
  await putToBucket(target.url, target.headers, file, onProgress);
  return target.storageKey;
}

export async function uploadNarration(
  chapterId: string,
  file: File,
  opts: { label?: string; editionId?: string | null; durationSeconds?: number | null; direct?: boolean },
  onProgress?: (fraction: number) => void,
) {
  if (opts.direct) {
    const storageKey = await directUpload(chapterId, "audio", file, onProgress);
    return request<ChapterMedia>(
      `/chapters/${chapterId}/media/audio`,
      json("POST", {
        storageKey,
        label: opts.label,
        editionId: opts.editionId,
        durationSeconds: opts.durationSeconds ?? undefined,
      }),
    );
  }
  const form = new FormData();
  form.append("file", file);
  if (opts.label) form.append("label", opts.label);
  if (opts.editionId) form.append("editionId", opts.editionId);
  if (opts.durationSeconds) form.append("durationSeconds", String(opts.durationSeconds));
  return uploadWithProgress<ChapterMedia>(`/chapters/${chapterId}/media/audio`, form, onProgress);
}

/** Upload your own video file (requires object storage — list.direct_upload). */
export async function uploadVideoFile(
  chapterId: string,
  file: File,
  label: string | undefined,
  onProgress?: (fraction: number) => void,
) {
  const storageKey = await directUpload(chapterId, "video", file, onProgress);
  return request<ChapterMedia>(`/chapters/${chapterId}/media/video-file`, json("POST", { storageKey, label }));
}

export const addVideoEmbed = (chapterId: string, url: string, label?: string) =>
  request<ChapterMedia>(`/chapters/${chapterId}/media/embed`, json("POST", { url, label }));

export function createPresentation(
  chapterId: string,
  images: File[],
  label?: string,
  onProgress?: (fraction: number) => void,
) {
  const form = new FormData();
  images.forEach((f) => form.append("images", f));
  if (label) form.append("label", label);
  return uploadWithProgress<ChapterMedia>(`/chapters/${chapterId}/media/visual`, form, onProgress);
}

export function addFrames(mediaId: string, images: File[], onProgress?: (fraction: number) => void) {
  const form = new FormData();
  images.forEach((f) => form.append("images", f));
  return uploadWithProgress<MediaFrame[]>(`/chapters/media/${mediaId}/frames`, form, onProgress);
}

export const updateFrame = (
  mediaId: string,
  frameId: string,
  data: Partial<{ caption: string | null; overlays: FrameOverlay[]; anchorStart: number | null; anchorEnd: number | null }>,
) => request<MediaFrame>(`/chapters/media/${mediaId}/frames/${frameId}`, json("PATCH", data));

export const reorderFrames = (mediaId: string, frameIds: string[]) =>
  request(`/chapters/media/${mediaId}/frames/order`, json("PATCH", { frameIds }));

export const deleteFrame = (mediaId: string, frameId: string) =>
  request<void>(`/chapters/media/${mediaId}/frames/${frameId}`, json("DELETE"));

export const updateMedia = (
  mediaId: string,
  data: Partial<{ label: string | null; timings: AudioTiming[] | null; status: MediaStatus; isPrimary: boolean }>,
) => request<ChapterMedia>(`/chapters/media/${mediaId}`, json("PATCH", data));

export const deleteMedia = (mediaId: string) => request<void>(`/chapters/media/${mediaId}`, json("DELETE"));

/**
 * Read an audio file's duration in the browser (best effort). Browsers may
 * defer media loading (e.g. in a background tab), so give up after a short
 * timeout rather than hold the upload hostage — duration is optional.
 */
export function readAudioDuration(file: File, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

/** Pick the narration to play by default: primary first, then oldest approved. */
export const defaultNarration = (media: ChapterMedia[]) =>
  media.filter((m) => m.kind === "audio" && m.status === "approved").sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] ??
  null;
