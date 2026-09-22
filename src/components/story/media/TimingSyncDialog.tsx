import React, { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Undo2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEdition, updateMedia, type AudioTiming, type ChapterMedia } from "@/lib/mediaApi";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface TimingSyncDialogProps {
  media: ChapterMedia;
  /** Used when the narration isn't tied to an edition. */
  fallbackParagraphs: string[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Capture read-along timings: play the narration and press Space (or the
 * button) whenever the narrator starts the next paragraph. Paragraphs come
 * from the narration's edition snapshot — the exact text that was read.
 */
const TimingSyncDialog: React.FC<TimingSyncDialogProps> = ({ media, fallbackParagraphs, onClose, onSaved }) => {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [paragraphs, setParagraphs] = useState<string[] | null>(media.edition_id ? null : fallbackParagraphs);
  const [timings, setTimings] = useState<AudioTiming[]>(media.timings ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!media.edition_id) return;
    getEdition(media.edition_id)
      .then((edition) => {
        const ch = edition.chapters.find((c) => c.chapter_id === media.chapter_id);
        setParagraphs(ch ? ch.snapshot_paragraphs : fallbackParagraphs);
      })
      .catch(() => setParagraphs(fallbackParagraphs));
  }, [media.edition_id, media.chapter_id, fallbackParagraphs]);

  const nextParagraph = timings.length === 0 ? 0 : Math.max(...timings.map((t) => t.paragraph)) + 1;
  const done = paragraphs !== null && nextParagraph >= paragraphs.length;

  const mark = () => {
    if (done || !audioRef.current) return;
    const start = Math.round(audioRef.current.currentTime * 10) / 10;
    setTimings((prev) => [...prev, { paragraph: nextParagraph, start }]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.preventDefault();
      mark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = async () => {
    setSaving(true);
    try {
      await updateMedia(media.id, { timings });
      toast({ title: "Timings saved", description: "Readers can now follow along in the text." });
      onSaved();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save timings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="story-sync-title">Sync narration to paragraphs</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="story-sync-desc">
              Play the narration and press Space (or the button) each time a new paragraph begins.
            </EditableText>
          </DialogDescription>
        </DialogHeader>

        <audio ref={audioRef} controls src={media.url ?? undefined} className="w-full" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={done || paragraphs === null}
            onClick={mark}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {done ? (
              <EditableText id="story-sync-all-marked">All paragraphs marked</EditableText>
            ) : (
              <>
                <EditableText id="story-sync-mark">Paragraph starts now</EditableText> ({nextParagraph + 1})
              </>
            )}
          </button>
          <button
            type="button"
            disabled={timings.length === 0}
            onClick={() => setTimings((prev) => prev.slice(0, -1))}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded border hover:bg-gray-50 disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <EditableText id="story-sync-undo">Undo last</EditableText>
          </button>
          <button
            type="button"
            disabled={timings.length === 0}
            onClick={() => setTimings([])}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded border hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <EditableText id="story-sync-clear">Start over</EditableText>
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto space-y-1 text-sm border rounded p-2 bg-gray-50">
          {paragraphs === null ? (
            <li className="text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin inline" />
            </li>
          ) : (
            paragraphs.map((p, i) => {
              const t = timings.find((x) => x.paragraph === i);
              return (
                <li
                  key={i}
                  className={cn(
                    "flex gap-2 rounded px-2 py-1",
                    i === nextParagraph && "bg-blue-50 ring-1 ring-blue-200",
                    t && "text-gray-500",
                  )}
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums pt-0.5 text-gray-500">
                    {t ? fmt(t.start) : "—"}
                  </span>
                  <span className="line-clamp-2">{p}</span>
                </li>
              );
            })
          )}
        </ol>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50">
            <EditableText id="story-dialog-cancel">Cancel</EditableText>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <EditableText id="story-sync-save">Save timings</EditableText>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TimingSyncDialog;
