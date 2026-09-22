import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import type { ChapterMedia } from "@/lib/mediaApi";
import FrameView from "./FrameView";

interface VisualPanelProps {
  presentations: ChapterMedia[];
  /** Paragraph currently being read (scroll position or narration); frames anchored to it are shown. */
  activeParagraph: number | null;
  footer?: React.ReactNode;
}

/**
 * The reader's Cartoon/Presentation panel: a frame-by-frame viewer. When the
 * reader is also reading the text (or following a narration), the viewer
 * jumps to the frame anchored to the current paragraph.
 */
const VisualPanel: React.FC<VisualPanelProps> = ({ presentations, activeParagraph, footer }) => {
  const approved = presentations.filter((m) => m.status === "approved" && (m.frames?.length ?? 0) > 0);
  const [selectedId, setSelectedId] = useState<string | null>(approved[0]?.id ?? null);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!approved.some((m) => m.id === selectedId)) setSelectedId(approved[0]?.id ?? null);
  }, [approved, selectedId]);
  useEffect(() => setFrameIndex(0), [selectedId]);

  const selected = approved.find((m) => m.id === selectedId) ?? null;
  const frames = selected?.frames ?? [];

  // Follow the text: show the frame whose anchor covers the active paragraph.
  useEffect(() => {
    if (activeParagraph === null || frames.length === 0) return;
    const idx = frames.findIndex(
      (f) =>
        f.anchor_start !== null &&
        activeParagraph >= f.anchor_start &&
        activeParagraph <= (f.anchor_end ?? f.anchor_start),
    );
    if (idx >= 0) setFrameIndex(idx);
  }, [activeParagraph, frames]);

  if (!selected) {
    return (
      <div className="w-full bg-gray-50 rounded p-4 border text-sm text-gray-500 space-y-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          <EditableText id="story-visual-none">No cartoon or presentation for this chapter yet.</EditableText>
        </div>
        {footer}
      </div>
    );
  }

  const frame = frames[Math.min(frameIndex, frames.length - 1)];

  return (
    <div className="w-full bg-gray-50 rounded p-4 border space-y-3">
      {approved.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {approved.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={cn(
                "px-2 py-1 rounded-full border text-xs",
                m.id === selectedId ? "bg-pink-50 border-pink-300 text-pink-800" : "bg-white hover:bg-gray-100",
              )}
            >
              {m.label || "Presentation"}
              {m.creator_name && <span className="text-gray-500"> · {m.creator_name}</span>}
            </button>
          ))}
        </div>
      )}

      {frame && <FrameView frame={frame} />}

      {frames.length > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
          <button
            type="button"
            disabled={frameIndex <= 0}
            onClick={() => setFrameIndex((i) => Math.max(0, i - 1))}
            className="p-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
            aria-label="Previous frame"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            {frameIndex + 1} / {frames.length}
          </span>
          <button
            type="button"
            disabled={frameIndex >= frames.length - 1}
            onClick={() => setFrameIndex((i) => Math.min(frames.length - 1, i + 1))}
            className="p-1 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
            aria-label="Next frame"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {footer}
    </div>
  );
};

export default VisualPanel;
