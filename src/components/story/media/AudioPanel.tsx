import React, { useEffect, useRef, useState } from "react";
import { Headphones, ListMusic } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { defaultNarration, type AudioTiming, type ChapterMedia } from "@/lib/mediaApi";

/** Which paragraph is being read at `time`, per the narration's timings. */
export function paragraphAt(timings: AudioTiming[] | null | undefined, time: number): number | null {
  if (!timings || timings.length === 0) return null;
  let current: number | null = null;
  for (const t of timings) {
    if (t.start <= time + 0.05) current = t.paragraph;
    else break;
  }
  return current;
}

export const narrationTitle = (m: ChapterMedia) => m.label || (m.source === "ai" ? "AI narration" : "Narration");

interface AudioPanelProps {
  narrations: ChapterMedia[];
  /** Read-along: which narration (edition) to follow, and where it is. */
  following: boolean;
  onFollowingChange: (following: boolean, narration: ChapterMedia | null) => void;
  onParagraphChange: (paragraph: number | null) => void;
  /** Reader clicked a paragraph while following: jump the narration there. */
  seekRequest?: { paragraph: number; nonce: number } | null;
  /** Rendered at the bottom (e.g. "Submit your narration"). */
  footer?: React.ReactNode;
}

/**
 * The reader's Audio panel: pick a narration, play it, and (when it has
 * paragraph timings) follow along — the reader highlights the paragraph being
 * read, showing the exact text the narrator read (their edition).
 */
const AudioPanel: React.FC<AudioPanelProps> = ({
  narrations,
  following,
  onFollowingChange,
  onParagraphChange,
  seekRequest,
  footer,
}) => {
  const approved = narrations.filter((m) => m.status === "approved");
  const [selectedId, setSelectedId] = useState<string | null>(defaultNarration(approved)?.id ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!approved.some((m) => m.id === selectedId)) setSelectedId(defaultNarration(approved)?.id ?? null);
  }, [approved, selectedId]);

  const selected = approved.find((m) => m.id === selectedId) ?? null;
  const hasTimings = Boolean(selected?.timings && selected.timings.length > 0);

  // Leaving the panel / switching narration stops following.
  useEffect(() => {
    onParagraphChange(null);
    if (following) onFollowingChange(hasTimings, hasTimings ? selected : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  useEffect(
    () => () => {
      onParagraphChange(null);
      onFollowingChange(false, null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!seekRequest || !audioRef.current) return;
    const timing = selected?.timings?.find((t) => t.paragraph === seekRequest.paragraph);
    if (!timing) return;
    audioRef.current.currentTime = timing.start;
    audioRef.current.play().catch(() => {});
    onParagraphChange(seekRequest.paragraph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  if (approved.length === 0) {
    return (
      <div className="w-full bg-gray-50 rounded p-4 border text-sm text-gray-500 space-y-2">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          <EditableText id="story-audio-none">No narration for this chapter yet.</EditableText>
        </div>
        {footer}
      </div>
    );
  }

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
                "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs",
                m.id === selectedId ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white hover:bg-gray-100",
              )}
            >
              <ListMusic className="h-3 w-3" />
              {narrationTitle(m)}
              {m.creator_name && <span className="text-gray-500">· {m.creator_name}</span>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <audio
            key={selected.id}
            ref={audioRef}
            controls
            preload="metadata"
            src={selected.url ?? undefined}
            className="w-full"
            onTimeUpdate={(e) => {
              if (following) onParagraphChange(paragraphAt(selected.timings, e.currentTarget.currentTime));
            }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span>
              <EditableText id="story-audio-narrated-by">Narrated by</EditableText>{" "}
              <span className="font-medium">{selected.creator_name || "—"}</span>
            </span>
            {selected.edition_name && (
              <span>
                {selected.edition_is_auto_snapshot ? (
                  <>
                    <EditableText id="story-audio-version-of">Narrated from the version of</EditableText>{" "}
                    {selected.edition_snapshot_at ? new Date(selected.edition_snapshot_at).toLocaleDateString() : ""}
                  </>
                ) : (
                  <>
                    <EditableText id="story-audio-edition">Edition:</EditableText> {selected.edition_name}
                  </>
                )}
              </span>
            )}
            {hasTimings && (
              <label className="inline-flex items-center gap-1 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={following}
                  onChange={(e) => {
                    onFollowingChange(e.target.checked, e.target.checked ? selected : null);
                    onParagraphChange(
                      e.target.checked ? paragraphAt(selected.timings, audioRef.current?.currentTime ?? 0) : null,
                    );
                  }}
                />
                <EditableText id="story-audio-follow">Follow along in the text</EditableText>
              </label>
            )}
          </div>
        </>
      )}
      {footer}
    </div>
  );
};

export default AudioPanel;
