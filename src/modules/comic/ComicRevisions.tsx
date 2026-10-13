import React, { useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { listComicRevisions, type ComicRevision } from "@/lib/comicsApi";

const EVENT_LABELS: Record<string, { id: string; text: string }> = {
  pages_added: { id: "comic-rev-pages-added", text: "Pages added" },
  pages_reordered: { id: "comic-rev-pages-reordered", text: "Pages reordered" },
  page_deleted: { id: "comic-rev-page-deleted", text: "Page deleted" },
  layers_edited: { id: "comic-rev-layers-edited", text: "Page text edited" },
  layers_suggestion_approved: { id: "comic-rev-layers-approved", text: "Suggested page text merged" },
  alternative_added: { id: "comic-rev-alternative-added", text: "Page alternative added" },
  issue_added: { id: "comic-rev-issue-added", text: "Issue added" },
  issue_renamed: { id: "comic-rev-issue-renamed", text: "Issue renamed" },
  issue_deleted: { id: "comic-rev-issue-deleted", text: "Issue deleted" },
  desktop_sync: { id: "comic-rev-desktop-sync", text: "Synced from the desktop app" },
};

const overlayTexts = (value: unknown) =>
  Array.isArray(value) ? value.map((o) => (o as { text?: string }).text ?? "").join(" / ") : "";

/** Revisions tab for comics: the change log, newest first, with text before/after. */
const ComicRevisions: React.FC<{ comicId: string }> = ({ comicId }) => {
  const [revisions, setRevisions] = useState<ComicRevision[] | null>(null);

  useEffect(() => {
    listComicRevisions(comicId)
      .then(setRevisions)
      .catch(() => setRevisions([]));
  }, [comicId]);

  if (revisions === null) {
    return <EditableText id="comic-rev-loading" as="p" className="text-sm text-gray-500">Loading revisions...</EditableText>;
  }
  if (revisions.length === 0) {
    return <EditableText id="comic-rev-empty" as="p" className="text-sm text-gray-500">No changes recorded yet.</EditableText>;
  }
  return (
    <ul className="divide-y rounded-lg border bg-white">
      {revisions.map((r) => {
        const label = EVENT_LABELS[r.event] ?? { id: `comic-rev-${r.event}`, text: r.event };
        const detail = r.detail ?? {};
        return (
          <li key={r.id} className="px-4 py-2 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                <EditableText id={label.id}>{label.text}</EditableText>
              </span>
              {r.issue_title && <span className="text-gray-500">· {r.issue_title}</span>}
              {r.page_index !== null && (
                <span className="text-gray-500">
                  · <EditableText id="comic-reader-page-of">Page</EditableText> {r.page_index + 1}
                </span>
              )}
              <span className="flex-1" />
              <span className="text-xs text-gray-400">
                {r.author_email} · {new Date(r.created_at).toLocaleString()}
              </span>
            </div>
            {r.event === "layers_edited" && (
              <div className="text-xs">
                <p className="text-gray-500 line-through">{overlayTexts(detail.before)}</p>
                <p className="text-gray-800">{overlayTexts(detail.after)}</p>
              </div>
            )}
            {r.event === "issue_renamed" && (
              <p className="text-xs text-gray-600">
                {String(detail.before ?? "")} → {String(detail.after ?? "")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ComicRevisions;
