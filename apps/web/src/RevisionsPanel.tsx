import React, { useEffect, useMemo, useState } from "react";
import {
  ensureCrdtDoc,
  fetchRevisionHistory,
  restoreRevision,
  snapshotText,
  snapshotTitle,
  type CrdtDocType,
  type RevisionEntry,
} from "./lib/revisionsApi";
import { REVISION_LAYOUTS, type LayoutNode } from "./lib/revision-layouts";
import { wordDiff } from "./lib/word-diff";

// First-ever revision history / restore UI for this app (apps/web) — the
// desktop editor's "Compare revisions" window and the main platform's
// RevisionComparison.tsx both already had this; this app had nothing.
// Layout presets come from ./lib/revision-layouts.ts, the exact same 25
// (2+4+19) presets used everywhere else, so the "multiple viewing
// switchers" set can't drift between apps — only the rendering is
// different (plain CSS Grid here instead of shadcn's resizable panels,
// since this app carries no extra UI-library dependencies by design).

export interface RevisionsPanelProps {
  docType: CrdtDocType;
  chapterId?: string;
  sceneId?: string;
  storyTitleId?: string;
  screenplayId?: string;
}

function LayoutGrid({
  node,
  revisions,
  showDiff,
  style,
}: {
  node: LayoutNode;
  revisions: RevisionEntry[];
  showDiff: boolean;
  style?: React.CSSProperties;
}) {
  if (node.type === "leaf") {
    const rev = revisions[node.tileIndex];
    const prevRev = node.tileIndex > 0 ? revisions[node.tileIndex - 1] : undefined;
    if (!rev) return <div style={style} />;
    const text = snapshotText(rev.snapshot);
    const prevText = prevRev ? snapshotText(prevRev.snapshot) : null;
    return (
      <div style={{ ...style, border: "1px solid #ddd", borderRadius: 4, overflow: "auto", background: "#fff" }}>
        <div style={{ padding: "4px 8px", background: "#f3f3f3", borderBottom: "1px solid #ddd", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
          <span>Rev {rev.revisionNumber}</span>
          <span style={{ color: "#777" }}>{rev.createdByName || ""}</span>
        </div>
        <div style={{ padding: 8, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {showDiff && prevText !== null
            ? wordDiff(prevText, text).map((part, i) => (
                <span
                  key={i}
                  style={
                    part.kind === "added"
                      ? { background: "#d4f7d4" }
                      : part.kind === "removed"
                      ? { background: "#f8d4d4", textDecoration: "line-through" }
                      : undefined
                  }
                >
                  {part.text}
                </span>
              ))
            : text}
        </div>
      </div>
    );
  }

  const sizes = node.sizes || Array(node.children.length).fill(100 / node.children.length);
  const template = sizes.map((s) => `${s}fr`).join(" ");
  return (
    <div
      style={{
        ...style,
        display: "grid",
        gap: 4,
        gridTemplateColumns: node.direction === "horizontal" ? template : "1fr",
        gridTemplateRows: node.direction === "vertical" ? template : "1fr",
      }}
    >
      {node.children.map((child, i) => (
        <LayoutGrid key={i} node={child} revisions={revisions} showDiff={showDiff} />
      ))}
    </div>
  );
}

const RevisionsPanel: React.FC<RevisionsPanelProps> = ({ docType, chapterId, sceneId, storyTitleId, screenplayId }) => {
  const [open, setOpen] = useState(false);
  const [docKey, setDocKey] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [layoutIndex, setLayoutIndex] = useState(0);
  const [showDiff, setShowDiff] = useState(true);
  const [restoringRev, setRestoringRev] = useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const key = await ensureCrdtDoc({ docType, chapterId, sceneId, storyTitleId, screenplayId });
    if (!key) {
      setError("Revisions aren't available for this content yet.");
      setLoading(false);
      return;
    }
    setDocKey(key);
    const history = await fetchRevisionHistory(key);
    if (!history) {
      setError("Failed to load revisions.");
      setLoading(false);
      return;
    }
    setRevisions(history);
    setLoading(false);
  }, [docType, chapterId, sceneId, storyTitleId, screenplayId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleSelect = (revisionNumber: number) => {
    setSelected((prev) => {
      if (prev.includes(revisionNumber)) return prev.filter((n) => n !== revisionNumber);
      if (prev.length >= 4) return [...prev.slice(1), revisionNumber];
      return [...prev, revisionNumber];
    });
  };

  const selectedRevisions = useMemo(
    () => revisions.filter((r) => selected.includes(r.revisionNumber)),
    [revisions, selected],
  );
  const count = selectedRevisions.length;
  const layouts = REVISION_LAYOUTS[count] || [];
  const safeLayoutIndex = layoutIndex < layouts.length ? layoutIndex : 0;

  const handleRestore = async (rev: RevisionEntry) => {
    if (!docKey || restoringRev !== null) return;
    setRestoringRev(rev.revisionNumber);
    const ok = await restoreRevision(docKey, rev.heads);
    setRestoringRev(null);
    if (ok) await load();
    else setError("Failed to restore this revision.");
  };

  return (
    <div style={{ marginTop: 12, fontFamily: "inherit" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 12,
          color: "#2563eb",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        {open ? "Hide revisions" : "Show revisions"}
      </button>

      {open && (
        <div style={{ marginTop: 6, border: "1px solid #e5e5e5", borderRadius: 6, padding: 10, background: "#fafafa" }}>
          {loading && <div style={{ fontSize: 12, color: "#777" }}>Loading revisions...</div>}
          {error && <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>}

          {!loading && !error && (
            <>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <tbody>
                  {revisions.map((rev) => (
                    <tr key={rev.revisionNumber} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "4px 6px", width: 28 }}>{rev.revisionNumber}</td>
                      <td style={{ padding: "4px 6px" }}>{snapshotTitle(rev.snapshot) || <em>(untitled)</em>}</td>
                      <td style={{ padding: "4px 6px", color: "#2563eb" }}>
                        {new Date(rev.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "4px 6px", color: "#777" }}>{rev.createdByName || ""}</td>
                      <td style={{ padding: "4px 6px", width: 20 }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(rev.revisionNumber)}
                          onChange={() => toggleSelect(rev.revisionNumber)}
                        />
                      </td>
                      <td style={{ padding: "4px 6px", width: 70 }}>
                        <button
                          type="button"
                          disabled={restoringRev !== null}
                          onClick={() => handleRestore(rev)}
                          style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
                        >
                          {restoringRev === rev.revisionNumber ? "Restoring..." : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {revisions.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 8, textAlign: "center", color: "#999" }}>
                        No revisions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {count >= 2 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Layout:</span>
                    {layouts.map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        title={preset.label}
                        onClick={() => setLayoutIndex(i)}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          border: i === safeLayoutIndex ? "1px solid #2563eb" : "1px solid #ccc",
                          background: i === safeLayoutIndex ? "#eff6ff" : "#fff",
                          cursor: "pointer",
                          borderRadius: 3,
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <label style={{ fontSize: 12, marginLeft: 8 }}>
                      <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} /> Show diff
                    </label>
                  </div>
                  {layouts[safeLayoutIndex] && (
                    <LayoutGrid
                      node={layouts[safeLayoutIndex].tree}
                      revisions={selectedRevisions}
                      showDiff={showDiff}
                      style={{ height: 260 }}
                    />
                  )}
                </div>
              )}
              {count === 1 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>Select at least 2 revisions to compare.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RevisionsPanel;
