import { API_BASE, api, get, patch, post, put, qs } from "./api";

// Space file tree + file contents (server.js items routes,
// creativeSpaceFiles.js content routes).

export interface SpaceItem {
  id: string;
  space_id: string;
  name: string;
  kind: "folder" | "file";
  relative_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  updated_at?: string;
  storage_path?: string | null;
  linked_type?: "chapter" | "scene" | "page" | null;
  linked_title?: string | null;
  linked_parent_title?: string | null;
  linked_parent_id?: string | null;
}
export interface SpaceContentItems {
  stories: { story_title_id: string; title: string }[];
  screenplays: { screenplay_id: string; title: string }[];
  comics?: { comic_id: string; title: string }[];
}

export const listItems = (spaceId: string, path: string, userId?: string) =>
  get<{ path: string; items: SpaceItem[]; breadcrumbs: { name: string; path: string }[] }>(`/creative-spaces/${spaceId}/items${qs({ path, userId })}`);
export const listContentItems = (spaceId: string, userId?: string) =>
  get<SpaceContentItems>(`/creative-spaces/${spaceId}/content-items${qs({ userId })}`).catch(() => ({ stories: [], screenplays: [] }) as SpaceContentItems);

export const createFolder = (spaceId: string, parentPath: string, name: string, userId: string) =>
  post<SpaceItem>(`/creative-spaces/${spaceId}/items/folder`, { parentPath, name, userId });
export const createFile = (spaceId: string, parentPath: string, name: string, userId: string, mimeType?: string, sizeBytes?: number) =>
  post<SpaceItem>(`/creative-spaces/${spaceId}/items/file`, { parentPath, name, userId, mimeType, sizeBytes });
export const renameItem = (itemId: string, newName: string, userId: string) => patch<SpaceItem>(`/creative-space-items/${itemId}`, { newName, userId });
export const moveItem = (itemId: string, newParentPath: string, userId: string) => patch<SpaceItem>(`/creative-space-items/${itemId}`, { newParentPath, userId });
export const deleteItem = (itemId: string, userId: string) => api(`/creative-space-items/${itemId}`, { method: "DELETE", body: { userId } });

export const contentUrl = (spaceId: string, itemId: string, userId?: string) => `${API_BASE}/creative-spaces/${spaceId}/items/${itemId}/content${qs({ userId })}`;

export async function readText(spaceId: string, itemId: string, userId?: string): Promise<string> {
  const res = await fetch(contentUrl(spaceId, itemId, userId), { credentials: "include" });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`Couldn't load the file (${res.status})`);
  return res.text();
}
export const writeText = (spaceId: string, itemId: string, content: string, userId: string) =>
  put(`/creative-spaces/${spaceId}/items/${itemId}/content`, { content, userId });
export function uploadContent(spaceId: string, itemId: string, file: Blob, userId: string, name = "file") {
  const form = new FormData();
  form.append("file", file, name);
  form.append("userId", userId);
  return api(`/creative-spaces/${spaceId}/items/${itemId}/content`, { method: "POST", body: form });
}

/** Creates (or overwrites) a file at parentPath/name with the given content. */
export async function saveFileToSpace(spaceId: string, parentPath: string, name: string, content: Blob | string, userId: string, mimeType: string) {
  const { items } = await listItems(spaceId, parentPath, userId);
  let item = items.find((i) => i.kind === "file" && i.name === name);
  const size = typeof content === "string" ? new Blob([content]).size : content.size;
  if (!item) item = await createFile(spaceId, parentPath, name, userId, mimeType, size);
  if (typeof content === "string") await writeText(spaceId, item.id, content, userId);
  else await uploadContent(spaceId, item.id, content, userId, name);
  return item;
}

export const updateSpace = (spaceId: string, p: { userId: string; name?: string; description?: string; visibility?: string; published?: boolean }) => patch(`/creative-spaces/${spaceId}`, p);

const TEXT_EXT = /\.(md|markdown|txt|story|screenplay|comic|master|fountain|fdx|json|html?|css|csv|ya?ml|xml)$/i;
export const isTextFile = (i: SpaceItem) => TEXT_EXT.test(i.name) || (i.mime_type ?? "").startsWith("text/");
export const isImageFile = (i: SpaceItem) => /\.(png|jpe?g|gif|webp|svg)$/i.test(i.name) || (i.mime_type ?? "").startsWith("image/");
export const isAudioFile = (i: SpaceItem) => /\.(mp3|m4a|m4b|ogg|opus|wav|flac|aac)$/i.test(i.name);
export const joinPath = (a: string, b: string) => (a ? `${a}/${b}` : b);
export const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");

export const getItem = (spaceId: string, itemId: string, userId?: string) =>
  get<SpaceItem & { can_write?: boolean; space_owner_id?: string }>(`/creative-spaces/${spaceId}/items/${itemId}${qs({ userId })}`);
