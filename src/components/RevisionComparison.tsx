
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

// ---------------------------------------------------------------------------
// Layout presets — ported from desktop compare_revisions.py
// ---------------------------------------------------------------------------

// Each layout is described as a tree of splits for nested ResizablePanelGroup.
// A "leaf" holds a tile index; a "split" holds direction + children.

type LayoutLeaf = { type: "leaf"; tileIndex: number };
type LayoutSplit = {
  type: "split";
  direction: "horizontal" | "vertical";
  children: LayoutNode[];
  sizes?: number[]; // default panel sizes (percentages)
};
type LayoutNode = LayoutLeaf | LayoutSplit;

interface LayoutPreset {
  label: string;
  tree: LayoutNode;
}

const LAYOUTS: Record<number, LayoutPreset[]> = {
  2: [
    {
      label: "Side by side",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          { type: "leaf", tileIndex: 0 },
          { type: "leaf", tileIndex: 1 },
        ],
      },
    },
    {
      label: "Top / bottom",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          { type: "leaf", tileIndex: 0 },
          { type: "leaf", tileIndex: 1 },
        ],
      },
    },
  ],
  3: [
    {
      label: "One top, two below",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          { type: "leaf", tileIndex: 0 },
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 1 },
              { type: "leaf", tileIndex: 2 },
            ],
          },
        ],
      },
    },
    {
      label: "Two top, one below",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 0 },
              { type: "leaf", tileIndex: 1 },
            ],
          },
          { type: "leaf", tileIndex: 2 },
        ],
      },
    },
    {
      label: "Two left, one right",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          {
            type: "split",
            direction: "vertical",
            children: [
              { type: "leaf", tileIndex: 0 },
              { type: "leaf", tileIndex: 1 },
            ],
          },
          { type: "leaf", tileIndex: 2 },
        ],
      },
    },
    {
      label: "One left, two right",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          { type: "leaf", tileIndex: 0 },
          {
            type: "split",
            direction: "vertical",
            children: [
              { type: "leaf", tileIndex: 1 },
              { type: "leaf", tileIndex: 2 },
            ],
          },
        ],
      },
    },
  ],
  4: [
    {
      label: "2x2 grid",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 0 },
              { type: "leaf", tileIndex: 1 },
            ],
          },
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 2 },
              { type: "leaf", tileIndex: 3 },
            ],
          },
        ],
      },
    },
    {
      label: "4 columns",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          { type: "leaf", tileIndex: 0 },
          { type: "leaf", tileIndex: 1 },
          { type: "leaf", tileIndex: 2 },
          { type: "leaf", tileIndex: 3 },
        ],
      },
    },
    {
      label: "4 rows",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          { type: "leaf", tileIndex: 0 },
          { type: "leaf", tileIndex: 1 },
          { type: "leaf", tileIndex: 2 },
          { type: "leaf", tileIndex: 3 },
        ],
      },
    },
    {
      label: "Two wide top, two below",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          { type: "leaf", tileIndex: 0 },
          { type: "leaf", tileIndex: 1 },
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 2 },
              { type: "leaf", tileIndex: 3 },
            ],
          },
        ],
        sizes: [33, 33, 34],
      },
    },
    {
      label: "Two top, two wide below",
      tree: {
        type: "split",
        direction: "vertical",
        children: [
          {
            type: "split",
            direction: "horizontal",
            children: [
              { type: "leaf", tileIndex: 0 },
              { type: "leaf", tileIndex: 1 },
            ],
          },
          { type: "leaf", tileIndex: 2 },
          { type: "leaf", tileIndex: 3 },
        ],
        sizes: [34, 33, 33],
      },
    },
    {
      label: "One tall left, three right",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          { type: "leaf", tileIndex: 0 },
          {
            type: "split",
            direction: "vertical",
            children: [
              { type: "leaf", tileIndex: 1 },
              { type: "leaf", tileIndex: 2 },
              { type: "leaf", tileIndex: 3 },
            ],
          },
        ],
      },
    },
    {
      label: "Three left, one tall right",
      tree: {
        type: "split",
        direction: "horizontal",
        children: [
          {
            type: "split",
            direction: "vertical",
            children: [
              { type: "leaf", tileIndex: 0 },
              { type: "leaf", tileIndex: 1 },
              { type: "leaf", tileIndex: 2 },
            ],
          },
          { type: "leaf", tileIndex: 3 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Layout thumbnail SVGs
// ---------------------------------------------------------------------------

function LayoutSvg2Col() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}
function LayoutSvg2Row() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function LayoutSvg1Top2Bot() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </svg>
  );
}
function LayoutSvg2Top1Bot() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="3" x2="12" y2="12" />
    </svg>
  );
}
function LayoutSvg2Left1Right() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="12" y2="12" />
    </svg>
  );
}
function LayoutSvg1Left2Right() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="12" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function LayoutSvg2x2() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function LayoutSvg4Col() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="7.5" y1="3" x2="7.5" y2="21" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16.5" y1="3" x2="16.5" y2="21" />
    </svg>
  );
}
function LayoutSvg4Row() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="7.5" x2="21" y2="7.5" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="16.5" x2="21" y2="16.5" />
    </svg>
  );
}
function LayoutSvg2Wide2Bot() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="12" y1="15" x2="12" y2="21" />
    </svg>
  );
}
function LayoutSvg2Top2Wide() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="9" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}
function LayoutSvg1Tall3Right() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="12" y1="9" x2="21" y2="9" />
      <line x1="12" y1="15" x2="21" y2="15" />
    </svg>
  );
}
function LayoutSvg3Left1Tall() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="9" x2="12" y2="9" />
      <line x1="3" y1="15" x2="12" y2="15" />
    </svg>
  );
}

// Map layout presets to their SVG icons
const LAYOUT_ICONS: Record<number, React.FC[]> = {
  2: [LayoutSvg2Col, LayoutSvg2Row],
  3: [LayoutSvg1Top2Bot, LayoutSvg2Top1Bot, LayoutSvg2Left1Right, LayoutSvg1Left2Right],
  4: [LayoutSvg2x2, LayoutSvg4Col, LayoutSvg4Row, LayoutSvg2Wide2Bot, LayoutSvg2Top2Wide, LayoutSvg1Tall3Right, LayoutSvg3Left1Tall],
};

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
}

const RevisionComparison: React.FC<RevisionComparisonProps> = ({
  revisions,
  className,
  showFilterToggle = true,
}) => {
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
  const icons = LAYOUT_ICONS[count] || [];

  // Reset layout index when count changes
  const safeLayout = activeLayout < layouts.length ? activeLayout : 0;

  const comparisonContent = (
    <div className={`${fullScreen ? "h-full" : "min-h-[400px]"} flex flex-col`}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-sm font-medium">Layout:</span>
        <div className="flex gap-1">
          {layouts.map((preset, i) => {
            const IconComp = icons[i];
            return (
              <TooltipProvider key={i}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveLayout(i)}
                      className={`border p-1.5 rounded ${safeLayout === i ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
                    >
                      {IconComp ? <IconComp /> : <span className="text-xs px-1">{i + 1}</span>}
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

        <div className="flex items-center gap-2 ml-4">
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
            className="ml-auto"
          >
            <Maximize2 className="h-4 w-4 mr-1" />
            Full screen
          </Button>
        )}
      </div>

      {/* Panels */}
      <div className={`flex-1 ${fullScreen ? "" : "min-h-[350px]"} border rounded`}>
        {layouts[safeLayout] &&
          renderLayoutNode(layouts[safeLayout].tree, selectedRevisions, showDiff, "root")}
      </div>
    </div>
  );

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-blue-500 text-sm hover:underline cursor-pointer">
          Revisions
        </span>
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-gray-400" />
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
              <TableRow key={rev.id}>
                <TableCell className="font-medium w-10">
                  {rev.revisionNumber}
                </TableCell>
                <TableCell className="text-sm">
                  {rev.title}
                </TableCell>
                <TableCell className="text-blue-500 text-xs">
                  {new Date(rev.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {rev.createdByName || ""}
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {rev.revisionReason || ""}
                </TableCell>
                <TableCell className="w-8">
                  <Checkbox
                    checked={selectedIds.includes(rev.id)}
                    onCheckedChange={() => toggleSelection(rev.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filteredRevisions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-gray-400 text-sm text-center">
                  No revisions available.
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell colSpan={6}>
                <div className="flex justify-between items-center">
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
            <DialogTitle className="flex items-center gap-2">
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
