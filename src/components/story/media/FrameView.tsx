import React from "react";
import { cn } from "@/lib/utils";
import type { FrameOverlay, MediaFrame } from "@/lib/mediaApi";

interface FrameViewProps {
  frame: Pick<MediaFrame, "image_url" | "caption" | "overlays">;
  className?: string;
  /** Editor: click on the image to place an overlay (x/y in percent). */
  onImageClick?: (x: number, y: number) => void;
  selectedOverlay?: number | null;
  onOverlayClick?: (index: number) => void;
}

/** Positioned text overlay (speech bubble or caption box) over a frame image. */
export const OverlayBubble: React.FC<{
  overlay: FrameOverlay;
  selected?: boolean;
  onClick?: () => void;
}> = ({ overlay, selected, onClick }) => (
  <div
    onClick={
      onClick
        ? (e) => {
            e.stopPropagation();
            onClick();
          }
        : undefined
    }
    style={{ left: `${overlay.x}%`, top: `${overlay.y}%` }}
    className={cn(
      "absolute -translate-x-1/2 -translate-y-1/2 max-w-[45%] px-2 py-1 text-xs sm:text-sm leading-snug whitespace-pre-wrap shadow",
      overlay.style === "box"
        ? "bg-amber-50 text-gray-900 border border-gray-800 rounded-sm"
        : "bg-white text-gray-900 border-2 border-gray-900 rounded-2xl",
      onClick && "cursor-pointer",
      selected && "ring-2 ring-blue-500",
    )}
  >
    {overlay.text}
  </div>
);

/**
 * A Cartoon/Presentation frame: the image with its text overlays rendered as
 * HTML (not baked into the image), plus the caption underneath.
 */
const FrameView: React.FC<FrameViewProps> = ({ frame, className, onImageClick, selectedOverlay, onOverlayClick }) => (
  <figure className={cn("w-full", className)}>
    <div
      className={cn("relative w-full", onImageClick && "cursor-crosshair")}
      onClick={
        onImageClick
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onImageClick(
                Math.round(((e.clientX - rect.left) / rect.width) * 100),
                Math.round(((e.clientY - rect.top) / rect.height) * 100),
              );
            }
          : undefined
      }
    >
      <img src={frame.image_url} alt={frame.caption ?? ""} className="w-full h-auto rounded-md select-none" draggable={false} />
      {(frame.overlays ?? []).map((o, i) => (
        <OverlayBubble
          key={i}
          overlay={o}
          selected={selectedOverlay === i}
          onClick={onOverlayClick ? () => onOverlayClick(i) : undefined}
        />
      ))}
    </div>
    {frame.caption && <figcaption className="text-sm text-gray-600 text-center mt-2">{frame.caption}</figcaption>}
  </figure>
);

export default FrameView;
