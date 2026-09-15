
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Info, Maximize2, Minimize2, X } from "lucide-react";
import type { RevisionSnapshot, ContentType } from "@/types/revisions";
import { buildDiffHtml } from "@/lib/diff-utils";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  REVISION_LAYOUTS as LAYOUTS,
  type LayoutNode,
} from "@/lib/revision-layouts";

// ---------------------------------------------------------------------------
// Layout thumbnails — a generic recursive renderer replaces one hand-drawn
// SVG per preset (was only feasible for 7 presets; REVISION_LAYOUTS now
// defines 19 four-tile presets to match the desktop editor exactly, see
// src/lib/revision-layouts.ts). Draws the same box+divider-lines look by
// walking the same split tree the resizable-panel renderer below uses, so
// a thumbnail can never drift out of sync with what selecting it produces.
// ---------------------------------------------------------------------------

function collectDividerLines(
  node: LayoutNode,
  rect: { x: number; y: number; w: number; h: number },
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>,
): void {
  if (node.type === "leaf") return;
  const sizes = node.sizes || Array(node.children.length).fill(100 / node.children.length);
  const boundaries = [0];
  sizes.forEach((s) => boundaries.push(boundaries[boundaries.length - 1] + s));

  node.children.forEach((child, i) => {
    const startFrac = boundaries[i] / 100;
    const endFrac = boundaries[i + 1] / 100;
    let childRect;
    if (node.direction === "horizontal") {
      childRect = { x: rect.x + rect.w * startFrac, y: rect.y, w: rect.w * (endFrac - startFrac), h: rect.h };
      if (i > 0) lines.push({ x1: childRect.x, y1: rect.y, x2: childRect.x, y2: rect.y + rect.h });
    } else {
      childRect = { x: rect.x, y: rect.y + rect.h * startFrac, w: rect.w, h: rect.h * (endFrac - startFrac) };
      if (i > 0) lines.push({ x1: rect.x, y1: childRect.y, x2: rect.x + rect.w, y2: childRect.y });
    }
    collectDividerLines(child, childRect, lines);
  });
}

function LayoutIcon({ tree }: { tree: LayoutNode }) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  collectDividerLines(tree, { x: 3, y: 3, w: 18, h: 18 }, lines);
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Diff tile renderer
// ---------------------------------------------------------------------------

interface TileProps {
  revision: RevisionSnapshot;
  prevRevision?: RevisionSnapshot;
  showDiff: boolean;
}

function RevisionTile({ revision, prevRevision, showDiff }: TileProps) {
  const diffContent = useMemo(() => {
    if (!showDiff || !prevRevision) return null;
    return buildDiffHtml(prevRevision.contentText, revision.contentText);
  }, [showDiff, prevRevision, revision.contentText]);

  const dateStr = revision.createdAt
    ? new Date(revision.createdAt).toLocaleString()
    : "";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Rev {revision.revisionNumber}</span>
          {revision.isContribution && (
            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">
              Contribution
            </span>
          )}
          <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">
            {revision.contentType}
          </span>
        </div>
        <div className="text-gray-500 text-right">
          {revision.createdByName && (
            <span className="mr-2">{revision.createdByName}</span>
          )}
          <span>{dateStr}</span>
        </div>
      </div>
      {revision.revisionReason && (
        <div className="px-3 py-1 bg-yellow-50 border-b text-[10px] text-gray-600 flex-shrink-0">
          {revision.revisionReason}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3 text-sm font-mono whitespace-pre-wrap">
        {showDiff && diffContent ? (
          <div dangerouslySetInnerHTML={{ __html: diffContent.newHtml }} />
        ) : (
          <div>{revision.contentText}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive layout renderer — builds nested ResizablePanelGroup trees
// ---------------------------------------------------------------------------

function renderLayoutNode(
  node: LayoutNode,
  revisions: RevisionSnapshot[],
  showDiff: boolean,
  keyPrefix: string,
): React.ReactNode {
  if (node.type === "leaf") {
    const rev = revisions[node.tileIndex];
    if (!rev) return null;
    const prevRev = node.tileIndex > 0 ? revisions[node.tileIndex - 1] : undefined;
    return <RevisionTile revision={rev} prevRevision={prevRev} showDiff={showDiff} />;
  }

  const childCount = node.children.length;
  const defaultSizes = node.sizes || Array(childCount).fill(100 / childCount);

  return (
    <ResizablePanelGroup direction={node.direction} className="h-full">
      {node.children.map((child, i) => (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          {i > 0 && <ResizableHandle withHandle />}
          <ResizablePanel defaultSize={defaultSizes[i]} minSize={10}>
            <div className="h-full border rounded overflow-hidden">
              {renderLayoutNode(child, revisions, showDiff, `${keyPrefix}-${i}`)}
            </div>
          </ResizablePanel>
        </React.Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface RevisionComparisonProps {
  revisions: RevisionSnapshot[];
  className?: string;
  contentType?: ContentType;
  /** If true, show "show all" toggle for auto-saves vs manual saves */
  showFilterToggle?: boolean;
  /**
   * Restores content to this revision (a new forward change, never a
   * truncation — the restored-from and restored-to revisions both stay in
   * history). Only called for revisions that carry `docKey`/`heads` (i.e.
   * ones sourced from the CRDT history endpoint) — the restore button is
   * hidden for legacy-endpoint revisions since there's nothing to restore
   * them through yet.
   */
  onRestore?: (revision: RevisionSnapshot) => void | Promise<void>;
}

const RevisionComparison: React.FC<RevisionComparisonProps> = ({
  revisions,
  className,
  showFilterToggle = true,
  onRestore,
}) => {
  const isMobile = useIsMobile();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestoreClick = async (rev: RevisionSnapshot) => {
    if (!onRestore || restoringId) return;
    setRestoringId(rev.id);
    try {
      await onRestore(rev);
    } finally {
      setRestoringId(null);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeLayout, setActiveLayout] = useState(0);
  const [showDiff, setShowDiff] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Filter: by default hide auto-saves (reason starts with "auto" or is null)
  const filteredRevisions = useMemo(() => {
    if (showAll) return revisions;
    return revisions.filter(
      (r) => r.revisionReason && !r.revisionReason.toLowerCase().startsWith("auto"),
    );
  }, [revisions, showAll]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const selectedRevisions = useMemo(
    () => filteredRevisions.filter((r) => selectedIds.includes(r.id)),
    [filteredRevisions, selectedIds],
  );

  const count = selectedRevisions.length;
  const layouts = LAYOUTS[count] || [];

  // Reset layout index when count changes
  const safeLayout = activeLayout < layouts.length ? activeLayout : 0;

  const comparisonContent = (
    <div className={`${fullScreen ? "h-full" : "h-[400px]"} flex flex-col`}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="text-sm font-medium shrink-0">Layout:</span>
          <div className="flex flex-wrap gap-1">
            {layouts.map((preset, i) => {
              return (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveLayout(i)}
                        className={`border p-1.5 rounded ${safeLayout === i ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
                      >
                        <LayoutIcon tree={preset.tree} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{preset.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
          {isMobile && (
            <p className="text-xs text-gray-400 w-full sm:hidden">
              Revisions are shown stacked on small screens.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:contents">
          <div className="flex items-center gap-2 sm:ml-4">
            <Checkbox
              id="show-diff"
              checked={showDiff}
              onCheckedChange={(v) => setShowDiff(!!v)}
            />
            <label htmlFor="show-diff" className="text-sm cursor-pointer">
              Show diff highlights
            </label>
          </div>

          {!fullScreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullScreen(true)}
              className="sm:ml-auto"
            >
              <Maximize2 className="h-4 w-4 mr-1" />
              Full screen
            </Button>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className={`flex-1 ${fullScreen ? "" : "h-[350px]"} border rounded overflow-hidden`}>
        {isMobile ? (
          <div className="h-full overflow-y-auto flex flex-col gap-2 p-2">
            {selectedRevisions.map((rev, i) => (
              <div key={rev.id} className="border rounded overflow-hidden min-h-[240px]">
                <RevisionTile
                  revision={rev}
                  prevRevision={i > 0 ? selectedRevisions[i - 1] : undefined}
                  showDiff={showDiff}
                />
              </div>
            ))}
          </div>
        ) : (
          layouts[safeLayout] && (
            <React.Fragment key={`${count}-${safeLayout}`}>
              {renderLayoutNode(layouts[safeLayout].tree, selectedRevisions, showDiff, "root")}
            </React.Fragment>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <span className="text-blue-500 text-sm hover:underline cursor-pointer">
          Revisions
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <Info className="h-5 w-5 text-gray-400 shrink-0" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-gray-600">
                  Compare up to 4 revisions
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Select 2-4 revisions and click Compare</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Filter toggle */}
      {showFilterToggle && revisions.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Checkbox
            id="show-all-revisions"
            checked={showAll}
            onCheckedChange={(v) => setShowAll(!!v)}
          />
          <label htmlFor="show-all-revisions" className="text-sm cursor-pointer">
            Show all revisions (including auto-saves)
          </label>
        </div>
      )}

      {/* Revision list */}
      <div className="mb-4">
        <Table>
          <TableBody>
            {filteredRevisions.map((rev) => (
              <TableRow key={rev.id} className="grid grid-cols-2 gap-1 p-2 sm:table-row sm:gap-0 sm:p-0">
                <TableCell className="hidden font-medium sm:table-cell sm:w-10 sm:p-4">
                  {rev.revisionNumber}
                </TableCell>
                <TableCell className="col-span-2 block p-1.5 text-sm font-medium sm:table-cell sm:col-span-1 sm:p-4 sm:font-normal">
                  <span className="text-gray-400 font-normal mr-1 sm:hidden">#{rev.revisionNumber}</span>
                  {rev.title}
                </TableCell>
                <TableCell className="col-span-2 block p-1.5 text-blue-500 text-xs sm:table-cell sm:col-span-1 sm:p-4">
                  {new Date(rev.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="col-span-2 block p-1.5 text-xs text-gray-500 sm:table-cell sm:col-span-1 sm:p-4">
                  {rev.createdByName || ""}
                </TableCell>
                <TableCell className="col-span-2 block p-1.5 text-xs text-gray-400 sm:table-cell sm:col-span-1 sm:p-4">
                  <span className="sm:hidden font-medium text-gray-500 mr-1">Reason:</span>
                  {rev.revisionReason || ""}
                </TableCell>
                <TableCell className="col-span-1 block p-1.5 sm:table-cell sm:w-8 sm:p-4">
                  <Checkbox
                    checked={selectedIds.includes(rev.id)}
                    onCheckedChange={() => toggleSelection(rev.id)}
                  />
                </TableCell>
                <TableCell className="col-span-1 block p-1.5 sm:table-cell sm:w-24 sm:p-4">
                  {onRestore && rev.docKey && rev.heads && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={restoringId !== null}
                      onClick={() => handleRestoreClick(rev)}
                    >
                      {restoringId === rev.id ? "Restoring..." : "Restore"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredRevisions.length === 0 && (
              <TableRow className="grid grid-cols-2 sm:table-row">
                <TableCell colSpan={7} className="col-span-2 block text-gray-400 text-sm text-center sm:table-cell">
                  No revisions available.
                </TableCell>
              </TableRow>
            )}
            <TableRow className="grid grid-cols-2 sm:table-row">
              <TableCell colSpan={7} className="col-span-2 block sm:table-cell">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <Button
                    variant="link"
                    size="sm"
                    className="text-blue-500 p-0"
                    disabled={count < 2}
                    onClick={() => {
                      setCompareOpen(true);
                      setActiveLayout(0);
                    }}
                  >
                    Compare{count >= 2 ? ` (${count})` : ""}
                  </Button>
                  {compareOpen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-7 w-7"
                      onClick={() => setCompareOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Inline comparison */}
      {compareOpen && count >= 2 && !fullScreen && (
        <div className="border rounded-md p-4 bg-gray-50 mb-4">
          <h4 className="font-medium mb-3">Compare Revisions</h4>
          {comparisonContent}
        </div>
      )}

      {/* Full-screen comparison dialog */}
      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center flex-wrap gap-2">
              Compare Revisions
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullScreen(false)}
                className="ml-auto"
              >
                <Minimize2 className="h-4 w-4 mr-1" />
                Exit full screen
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {count >= 2 && comparisonContent}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RevisionComparison;
