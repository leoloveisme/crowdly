import React, { useEffect, useState } from "react";
import RevisionComparison from "@/components/RevisionComparison";
import type { RevisionSnapshot, ContentType } from "@/types/revisions";
import EditableText from "@/components/EditableText";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const UNSUPPORTED_TYPES: ContentType[] = ["comic", "presentation", "audio", "video"];

export interface CompareRevisionsContainerProps {
  /** For stories: the chapter ID to compare revisions for */
  chapterId?: string;
  /** For screenplays: the screenplay title ID */
  screenplayTitleId?: string;
  /** Optional scene filter for screenplay revisions */
  sceneId?: string;
  /** Content type determines which endpoint to call */
  contentType: ContentType;
  className?: string;
}

// Maps a /crdt/docs/:docKey/history entry (see backend/src/crdt/repo.js
// buildRevisionHistory) into the same RevisionSnapshot shape the legacy
// endpoints return, so RevisionComparison/RevisionTile don't need to know
// which source a revision came from — only docKey/heads being present
// signals "this one supports restore".
function crdtRevisionToSnapshot(
  docKey: string,
  entry: {
    revisionNumber: number;
    heads: string[];
    createdAt: string;
    createdBy: string | null;
    createdByName: string | null;
    snapshot: Record<string, unknown>;
  },
  contentType: ContentType,
): RevisionSnapshot {
  const snapshot = entry.snapshot ?? {};
  const title = typeof snapshot.title === "string" ? snapshot.title : (typeof snapshot.slugline === "string" ? snapshot.slugline : "");
  let contentText = "";
  if (Array.isArray(snapshot.paragraphs)) {
    contentText = (snapshot.paragraphs as string[]).join("\n\n");
  } else if (Array.isArray(snapshot.blocks)) {
    contentText = (snapshot.blocks as Array<{ text?: string }>).map((b) => b.text || "").join("\n");
  } else if (typeof snapshot.description === "string") {
    contentText = snapshot.description;
  }

  return {
    id: `${docKey}:${entry.heads.join(",")}`,
    revisionNumber: entry.revisionNumber,
    title,
    contentText,
    contentData: snapshot,
    contentType,
    createdBy: entry.createdBy,
    createdByName: entry.createdByName ?? undefined,
    createdAt: entry.createdAt,
    revisionReason: null,
    isContribution: false,
    docKey,
    heads: entry.heads,
  };
}

async function ensureCrdtDoc(body: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/crdt/docs/ensure`, {
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

async function fetchCrdtHistory(docKey: string, contentType: ContentType): Promise<RevisionSnapshot[] | null> {
  try {
    const res = await fetch(`${API_BASE}/crdt/docs/${docKey}/history`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.revisions)) return null;
    return data.revisions.map((entry: Parameters<typeof crdtRevisionToSnapshot>[1]) =>
      crdtRevisionToSnapshot(docKey, entry, contentType),
    );
  } catch {
    return null;
  }
}

const CompareRevisionsContainer: React.FC<CompareRevisionsContainerProps> = ({
  chapterId,
  screenplayTitleId,
  sceneId,
  contentType,
  className,
}) => {
  const [revisions, setRevisions] = useState<RevisionSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRevisions = React.useCallback(async () => {
    if (UNSUPPORTED_TYPES.includes(contentType)) return;

    setLoading(true);
    setError(null);

    // Prefer the real-time CRDT history (supports restore); fall back to
    // the legacy read-only *_revisions endpoints for content that hasn't
    // been migrated to a CRDT doc yet (see backend/scripts/backfill-crdt-docs.js) —
    // this keeps every existing story/screenplay's revision view working
    // exactly as before, CRDT migration status aside.
    try {
      if (contentType === "story" && chapterId) {
        const docKey = await ensureCrdtDoc({ docType: "chapter", chapterId });
        const crdtRevisions = docKey ? await fetchCrdtHistory(docKey, contentType) : null;
        if (crdtRevisions) {
          setRevisions(crdtRevisions);
          return;
        }
      } else if (contentType === "screenplay" && screenplayTitleId && sceneId) {
        const docKey = await ensureCrdtDoc({ docType: "scene", sceneId });
        const crdtRevisions = docKey ? await fetchCrdtHistory(docKey, contentType) : null;
        if (crdtRevisions) {
          setRevisions(crdtRevisions);
          return;
        }
      }
    } catch (err) {
      console.error("[CompareRevisionsContainer] CRDT history fetch failed, falling back:", err);
    }

    let url: string | null = null;
    if (contentType === "story" && chapterId) {
      url = `${API_BASE}/chapter-revisions/${chapterId}/compare`;
    } else if (contentType === "screenplay" && screenplayTitleId) {
      const params = new URLSearchParams();
      if (sceneId) params.set("sceneId", sceneId);
      const qs = params.toString();
      url = `${API_BASE}/screenplay-revisions/${screenplayTitleId}/compare${qs ? `?${qs}` : ""}`;
    }
    if (!url) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RevisionSnapshot[] = await res.json();
      setRevisions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[CompareRevisionsContainer] fetch failed:", err);
      setError("Failed to load revisions");
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, [chapterId, screenplayTitleId, sceneId, contentType]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  const handleRestore = async (revision: RevisionSnapshot) => {
    if (!revision.docKey || !revision.heads) return;
    try {
      const res = await fetch(`${API_BASE}/crdt/docs/${revision.docKey}/restore`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toHeads: revision.heads }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadRevisions();
    } catch (err) {
      console.error("[CompareRevisionsContainer] restore failed:", err);
      setError("Failed to restore this revision");
    }
  };

  // Placeholder for unsupported content types
  if (UNSUPPORTED_TYPES.includes(contentType)) {
    return (
      <div className={className}>
        <div className="bg-gray-50 border rounded-md p-8 text-center text-gray-500">
          <p className="text-lg font-medium mb-2"><EditableText id="compare-coming-soon">Coming soon</EditableText></p>
          <p className="text-sm">
            <EditableText id="compare-coming-soon-desc">Revision comparison for this content type is coming soon.</EditableText>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={className}>
        <div className="text-gray-500 text-sm"><EditableText id="compare-loading">Loading revisions...</EditableText></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <RevisionComparison
      revisions={revisions}
      contentType={contentType}
      className={className}
      onRestore={handleRestore}
    />
  );
};

export default CompareRevisionsContainer;
