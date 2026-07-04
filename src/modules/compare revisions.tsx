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

  useEffect(() => {
    if (UNSUPPORTED_TYPES.includes(contentType)) return;

    let url: string | null = null;

    if (contentType === "story" && chapterId) {
      url = `${API_BASE}/chapter-revisions/${chapterId}/compare`;
    } else if (contentType === "screenplay" && screenplayTitleId) {
      const params = new URLSearchParams();
      if (sceneId) params.set("sceneId", sceneId);
      const qs = params.toString();
      url = `${API_BASE}/screenplay-revisions/${screenplayTitleId}/compare${qs ? `?${qs}` : ""}`;
    }

    if (!url) return;

    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: RevisionSnapshot[]) => {
        setRevisions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("[CompareRevisionsContainer] fetch failed:", err);
        setError("Failed to load revisions");
        setRevisions([]);
      })
      .finally(() => setLoading(false));
  }, [chapterId, screenplayTitleId, sceneId, contentType]);

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
    />
  );
};

export default CompareRevisionsContainer;
