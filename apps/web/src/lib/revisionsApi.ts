// Client for the backend's real-time CRDT revisioning endpoints
// (backend/src/crdt/repo.js + the /crdt/docs/* routes in server.js).
// This app had no revisioning of any kind before this file — see
// RevisionsPanel.tsx for the UI that consumes it.

export interface RevisionEntry {
  revisionNumber: number;
  heads: string[];
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  changeCount: number;
  snapshot: Record<string, unknown>;
}

export type CrdtDocType = "chapter" | "scene" | "story_title" | "screenplay_title";

function apiBase(): string {
  return (
    (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ??
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : "http://localhost:4000")
  );
}

export async function ensureCrdtDoc(body: {
  docType: CrdtDocType;
  chapterId?: string;
  sceneId?: string;
  storyTitleId?: string;
  screenplayId?: string;
}): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/crdt/docs/ensure`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.docKey ?? null;
  } catch {
    return null;
  }
}

export async function fetchRevisionHistory(docKey: string): Promise<RevisionEntry[] | null> {
  try {
    const res = await fetch(`${apiBase()}/crdt/docs/${docKey}/history`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.revisions) ? data.revisions : null;
  } catch {
    return null;
  }
}

export async function restoreRevision(docKey: string, heads: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/crdt/docs/${docKey}/restore`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toHeads: heads }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Best-effort flatten of a revision snapshot into a single diffable string, for both chapter and scene doc shapes. */
export function snapshotText(snapshot: Record<string, unknown>): string {
  if (Array.isArray(snapshot.paragraphs)) return (snapshot.paragraphs as string[]).join("\n\n");
  if (Array.isArray(snapshot.blocks)) {
    return (snapshot.blocks as Array<{ text?: string }>).map((b) => b.text || "").join("\n");
  }
  if (typeof snapshot.description === "string") return snapshot.description;
  return "";
}

export function snapshotTitle(snapshot: Record<string, unknown>): string {
  if (typeof snapshot.title === "string") return snapshot.title;
  if (typeof snapshot.slugline === "string") return snapshot.slugline;
  return "";
}
