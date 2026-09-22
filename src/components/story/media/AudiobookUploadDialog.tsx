import React, { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createNarrationSnapshot,
  readAudioDuration,
  uploadNarration,
  type EditionSummary,
} from "@/lib/mediaApi";
import { ProgressBar } from "./MediaItemControls";
import { AUDIO_ACCEPT, EditionSelect } from "./mediaShared";

type RowState = { file: File | null; progress: number | null; status: "idle" | "done" | "error"; error?: string };

interface AudiobookUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyTitleId: string;
  chapters: { chapter_id: string; chapter_title: string }[];
  editions: EditionSummary[];
  onDone: () => void;
  /** Upload straight to object storage (when configured). */
  direct?: boolean;
}

/**
 * Upload a narration for many chapters at once — one file per chapter.
 * Dropping several files assigns them to chapters in filename order.
 * "Current text" is frozen ONCE for the whole audiobook, so every chapter
 * file refers to the same snapshot.
 */
const AudiobookUploadDialog: React.FC<AudiobookUploadDialogProps> = ({
  open,
  onOpenChange,
  storyTitleId,
  chapters,
  editions,
  onDone,
  direct,
}) => {
  const { toast } = useToast();
  const [editionId, setEditionId] = useState("");
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);

  const setRow = (chapterId: string, patch: Partial<RowState>) =>
    setRows((prev) => ({
      ...prev,
      [chapterId]: { file: null, progress: null, status: "idle", ...prev[chapterId], ...patch },
    }));

  const assignInOrder = (files: FileList | File[]) => {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const empty = chapters.filter((c) => !rows[c.chapter_id]?.file);
    sorted.forEach((file, i) => {
      if (empty[i]) setRow(empty[i].chapter_id, { file, status: "idle", error: undefined });
    });
  };

  const queued = chapters.filter((c) => rows[c.chapter_id]?.file && rows[c.chapter_id]?.status !== "done");

  const uploadAll = async () => {
    if (queued.length === 0) return;
    setRunning(true);
    try {
      let targetEdition = editionId || null;
      if (!targetEdition) targetEdition = (await createNarrationSnapshot(storyTitleId)).id;
      setEditionId(targetEdition);
      let failures = 0;
      for (const ch of queued) {
        const row = rows[ch.chapter_id];
        if (!row?.file) continue;
        setRow(ch.chapter_id, { progress: 0, status: "idle", error: undefined });
        try {
          const durationSeconds = await readAudioDuration(row.file);
          await uploadNarration(
            ch.chapter_id,
            row.file,
            { label, editionId: targetEdition, durationSeconds, direct },
            (p) => setRow(ch.chapter_id, { progress: p }),
          );
          setRow(ch.chapter_id, { progress: null, status: "done" });
        } catch (err) {
          failures++;
          setRow(ch.chapter_id, {
            progress: null,
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        }
      }
      toast({
        title: failures ? "Audiobook partly uploaded" : "Audiobook uploaded",
        description: failures ? `${failures} chapter(s) failed — you can retry them.` : undefined,
        variant: failures ? "destructive" : undefined,
      });
      onDone();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="story-audiobook-title">Upload an audiobook</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="story-audiobook-desc">
              One audio file per chapter. Drop several files at once to assign them to chapters in filename order.
            </EditableText>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="space-y-1">
            <span className="text-xs text-gray-600">
              <EditableText id="story-audio-which-text">Which text did you read?</EditableText>
            </span>
            <EditionSelect editions={editions} value={editionId} onChange={setEditionId} />
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. “Narrated by Anna”"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <label
            className="block border-2 border-dashed rounded p-3 text-center text-sm text-gray-500 hover:bg-gray-50 cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              assignInOrder(e.dataTransfer.files);
            }}
          >
            <EditableText id="story-audiobook-drop">Drop audio files here, or click to choose several</EditableText>
            <input
              type="file"
              multiple
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files && assignInOrder(e.target.files)}
            />
          </label>
        </div>

        <ol className="flex-1 overflow-y-auto space-y-1.5 text-sm">
          {chapters.map((ch, i) => {
            const row = rows[ch.chapter_id];
            return (
              <li key={ch.chapter_id} className="border rounded px-2 py-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">{i + 1}.</span>
                  <span className="flex-1 min-w-0 truncate">{ch.chapter_title || "Untitled chapter"}</span>
                  {row?.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {row?.status === "error" && (
                    <span title={row.error}>
                      <XCircle className="h-4 w-4 text-red-600" />
                    </span>
                  )}
                  <input
                    type="file"
                    accept={AUDIO_ACCEPT}
                    disabled={running}
                    onChange={(e) =>
                      setRow(ch.chapter_id, { file: e.target.files?.[0] ?? null, status: "idle", error: undefined })
                    }
                    className="text-xs max-w-[12rem]"
                  />
                </div>
                {row?.file && <div className="text-[11px] text-gray-500 pl-8 truncate">{row.file.name}</div>}
                {row?.error && <div className="text-[11px] text-red-600 pl-8">{row.error}</div>}
                <ProgressBar value={row?.progress ?? null} />
              </li>
            );
          })}
        </ol>

        <DialogFooter>
          <button
            type="button"
            disabled={running}
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            <EditableText id="story-dialog-close">Close</EditableText>
          </button>
          <button
            type="button"
            disabled={running || queued.length === 0}
            onClick={uploadAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <EditableText id="story-audiobook-upload">Upload</EditableText> ({queued.length})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AudiobookUploadDialog;
