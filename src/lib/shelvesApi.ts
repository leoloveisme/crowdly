import { apiFetch } from "./apiBase";

// Shelves (backend/src/shelves.js), shared with the desktop app's Discovery
// mode. System shelves are computed; custom shelves are manual or smart.

export type SystemShelfKey = "favorites" | "living" | "lived" | "newest" | "most_active" | "most_popular";
export type ShelfSort = "manual" | "title" | "added" | "progress" | "last_read";
export type ShelfItemType = "library_item" | "story" | "screenplay";

export interface ShelfRule {
  field: string;
  op: string;
  value: string | number;
}

export interface ShelfRules {
  match: "all" | "any";
  rules: ShelfRule[];
}

export interface Shelf {
  id: string;
  name: string;
  description: string;
  kind: "manual" | "smart";
  rules: ShelfRules | null;
  sort: ShelfSort;
  position: number;
  count: number | null;
}

export interface ShelfItem {
  type: ShelfItemType;
  id: string;
  title: string;
  subtitle: string | null;
  author?: string;
  language?: string;
  format: string;
  progress: number;
  added_at: string | null;
  last_read_at: string | null;
  entry_id?: string;
}

export interface ItemStatus {
  favorite: boolean;
  living: boolean;
  lived: boolean;
}

// field -> [operator, allowed values | "text" | "days"] - mirrors RULE_FIELDS
// in backend/src/shelves.js and the desktop's smart_shelf_dialog.py.
export const RULE_FIELDS: Record<string, [string, readonly string[] | "text" | "days"]> = {
  source: ["is", ["library", "crowdly"]],
  format: ["is", ["epub", "pdf", "audio", "text", "story", "screenplay"]],
  language: ["is", "text"],
  title: ["contains", "text"],
  author: ["contains", "text"],
  status: ["is", ["favorite", "living", "lived"]],
  progress: ["is", ["unread", "reading", "finished"]],
  added_within_days: ["lte", "days"],
  read_within_days: ["lte", "days"],
};

export const listShelves = () =>
  apiFetch<{ system: { key: SystemShelfKey; count: number | null }[]; custom: Shelf[] }>("/shelves");

export const shelfItems = (key: string) =>
  apiFetch<{ items: ShelfItem[] }>(`/shelves/${encodeURIComponent(key)}/items`);

export const createShelf = (body: { name: string; kind?: "manual" | "smart"; rules?: ShelfRules; sort?: ShelfSort }) =>
  apiFetch<{ shelf: Shelf }>("/shelves", { method: "POST", body: JSON.stringify(body) });

export const updateShelf = (id: string, body: Partial<Pick<Shelf, "name" | "sort">> & { rules?: ShelfRules }) =>
  apiFetch<{ shelf: Shelf }>(`/shelves/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteShelf = (id: string) => apiFetch<void>(`/shelves/${id}`, { method: "DELETE" });

export const reorderShelves = (ids: string[]) =>
  apiFetch<void>("/shelves/order", { method: "PUT", body: JSON.stringify({ ids }) });

export const addToShelf = (shelfId: string, type: ShelfItemType, id: string) =>
  apiFetch<{ entry_id: string }>(`/shelves/${shelfId}/items`, { method: "POST", body: JSON.stringify({ type, id }) });

export const removeFromShelf = (shelfId: string, itemId: string, type?: ShelfItemType) =>
  apiFetch<void>(`/shelves/${shelfId}/items/${itemId}${type ? `?type=${type}` : ""}`, { method: "DELETE" });

export const reorderShelfItems = (shelfId: string, ids: string[]) =>
  apiFetch<void>(`/shelves/${shelfId}/items/order`, { method: "PUT", body: JSON.stringify({ ids }) });

export const shelfMembership = (type: ShelfItemType, id: string) =>
  apiFetch<{ shelves: { id: string; name: string; contains: boolean }[]; status: ItemStatus }>(
    `/shelves/membership?type=${type}&id=${encodeURIComponent(id)}`,
  );

export const setStoryStatus = (
  contentType: "story" | "screenplay",
  id: string,
  flags: Partial<{ isFavorite: boolean; isLiving: boolean; isLived: boolean }>,
) =>
  apiFetch<ItemStatus>("/me/story-status", {
    method: "PUT",
    body: JSON.stringify({
      contentType,
      [contentType === "story" ? "storyTitleId" : "screenplayId"]: id,
      ...flags,
    }),
  });
