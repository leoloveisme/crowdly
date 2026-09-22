import React, { useEffect, useState } from "react";
import { ImagePlus, Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  addFrames,
  createPresentation,
  deleteFrame,
  reorderFrames,
  updateFrame,
  type ChapterMedia,
  type ChapterMediaList,
  type FrameOverlay,
  type MediaFrame,
} from "@/lib/mediaApi";
import FrameView from "./FrameView";
import MediaItemControls, { ProgressBar } from "./MediaItemControls";
import { AiComicGenerator } from "./AiGenerators";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

interface VisualMediaEditorProps {
  chapterId: string;
  chapterParagraphs: string[];
  list: ChapterMediaList;
  onChanged: () => void;
  onAiJobQueued?: () => void;
}

/** Edit one frame: overlays (click the image to add), caption, paragraph anchor. */
const FrameEditor: React.FC<{
  media: ChapterMedia;
  frame: MediaFrame;
  paragraphCount: number;
  onSaved: () => void;
  onDeleted: () => void;
}> = ({ media, frame, paragraphCount, onSaved, onDeleted }) => {
  const { toast } = useToast();
  const [overlays, setOverlays] = useState<FrameOverlay[]>(frame.overlays ?? []);
  const [caption, setCaption] = useState(frame.caption ?? "");
  const [anchorStart, setAnchorStart] = useState<number | null>(frame.anchor_start);
  const [anchorEnd, setAnchorEnd] = useState<number | null>(frame.anchor_end);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOverlays(frame.overlays ?? []);
    setCaption(frame.caption ?? "");
    setAnchorStart(frame.anchor_start);
    setAnchorEnd(frame.anchor_end);
    setSelected(null);
  }, [frame]);

  const dirty =
    JSON.stringify(overlays) !== JSON.stringify(frame.overlays ?? []) ||
    caption !== (frame.caption ?? "") ||
    anchorStart !== frame.anchor_start ||
    anchorEnd !== frame.anchor_end;

  const patchOverlay = (i: number, patch: Partial<FrameOverlay>) =>
    setOverlays((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const save = async () => {
    setSaving(true);
    try {
      await updateFrame(media.id, frame.id, {
        overlays: overlays.filter((o) => o.text.trim()),
        caption: caption.trim() || null,
        anchorStart,
        anchorEnd: anchorStart === null ? null : anchorEnd,
      });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const paragraphOptions = Array.from({ length: paragraphCount }, (_, i) => i);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-1">
        <FrameView
          frame={{ image_url: frame.image_url, caption: caption || null, overlays }}
          onImageClick={(x, y) => {
            setOverlays((prev) => [...prev, { text: "…", x, y, style: "bubble" }]);
            setSelected(overlays.length);
          }}
          selectedOverlay={selected}
          onOverlayClick={setSelected}
        />
        <p className="text-[11px] text-gray-500 flex items-center gap-1">
          <MessageSquarePlus className="h-3 w-3" />
          <EditableText id="story-frame-click-hint">Click on the image to add a speech bubble or text box.</EditableText>
        </p>
      </div>

      <div className="space-y-3 text-sm">
        {overlays.length > 0 && (
          <div className="space-y-2">
            {overlays.map((o, i) => (
              <div
                key={i}
                className={cn("border rounded p-2 space-y-1 bg-white", selected === i && "ring-2 ring-blue-400")}
                onClick={() => setSelected(i)}
              >
                <textarea
                  value={o.text}
                  onChange={(e) => patchOverlay(i, { text: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-1.5 py-1 text-sm"
                  autoFocus={selected === i && o.text === "…"}
                />
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <select
                    value={o.style}
                    onChange={(e) => patchOverlay(i, { style: e.target.value as FrameOverlay["style"] })}
                    className="border rounded px-1 py-0.5 bg-white"
                  >
                    <option value="bubble">Speech bubble</option>
                    <option value="box">Text box</option>
                  </select>
                  <span>x</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={o.x}
                    onChange={(e) => patchOverlay(i, { x: Number(e.target.value) })}
                    className="w-14 border rounded px-1 py-0.5"
                  />
                  <span>y</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={o.y}
                    onChange={(e) => patchOverlay(i, { y: Number(e.target.value) })}
                    className="w-14 border rounded px-1 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverlays((prev) => prev.filter((_, idx) => idx !== i));
                      setSelected(null);
                    }}
                    className="ml-auto p-1 rounded text-gray-400 hover:text-red-600"
                    aria-label="Remove text"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-gray-600">
            <EditableText id="story-frame-caption">Caption</EditableText>
          </span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </label>

        <div className="space-y-1">
          <span className="text-xs text-gray-600">
            <EditableText id="story-frame-anchor">Shown while reading paragraphs</EditableText>
          </span>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={anchorStart ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setAnchorStart(v);
                if (v !== null && (anchorEnd === null || anchorEnd < v)) setAnchorEnd(v);
              }}
              className="border rounded px-1 py-1 bg-white"
            >
              <option value="">—</option>
              {paragraphOptions.map((i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
            <span>–</span>
            <select
              value={anchorEnd ?? ""}
              disabled={anchorStart === null}
              onChange={(e) => setAnchorEnd(e.target.value === "" ? null : Number(e.target.value))}
              className="border rounded px-1 py-1 bg-white disabled:opacity-50"
            >
              {paragraphOptions
                .filter((i) => anchorStart === null || i >= anchorStart)
                .map((i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <EditableText id="story-frame-save">Save frame</EditableText>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Delete this frame?")) return;
              try {
                await deleteFrame(media.id, frame.id);
                onDeleted();
              } catch (err) {
                toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
              }
            }}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-sm rounded border text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <EditableText id="story-frame-delete">Delete frame</EditableText>
          </button>
        </div>
      </div>
    </div>
  );
};

const VisualMediaEditor: React.FC<VisualMediaEditorProps> = ({ chapterId, chapterParagraphs, list, onChanged, onAiJobQueued }) => {
  const { toast } = useToast();
  const presentations = list.media.filter((m) => m.kind === "visual");
  const [selectedId, setSelectedId] = useState<string | null>(presentations[0]?.id ?? null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [draggedFrame, setDraggedFrame] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (!presentations.some((m) => m.id === selectedId)) setSelectedId(presentations[0]?.id ?? null);
  }, [presentations, selectedId]);

  const selected = presentations.find((m) => m.id === selectedId) ?? null;
  const frames = selected?.frames ?? [];
  const frame = frames.find((f) => f.id === frameId) ?? frames[0] ?? null;

  const withProgress = async (action: () => Promise<unknown>, success: string) => {
    setProgress(0);
    try {
      await action();
      toast({ title: success });
      onChanged();
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
    } finally {
      setProgress(null);
    }
  };

  const dropOnFrame = async (targetId: string) => {
    if (!selected || !draggedFrame || draggedFrame === targetId) return setDraggedFrame(null);
    const ids = frames.map((f) => f.id);
    const from = ids.indexOf(draggedFrame);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDraggedFrame(null);
    try {
      await reorderFrames(selected.id, ids);
      onChanged();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Reorder failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {presentations.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {presentations.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelectedId(m.id);
                setFrameId(null);
              }}
              className={cn(
                "px-2 py-1 rounded-full border text-xs",
                m.id === selectedId ? "bg-pink-50 border-pink-300 text-pink-800" : "bg-white hover:bg-gray-100",
              )}
            >
              {m.label || "Presentation"}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="border rounded p-3 bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">{selected.label || "Presentation"}</span>
              {selected.creator_name && <span className="text-gray-500"> · {selected.creator_name}</span>}
            </div>
            <MediaItemControls media={selected} canModerate={list.can_moderate} onChanged={onChanged} />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                draggable
                onDragStart={() => setDraggedFrame(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOnFrame(f.id)}
                onClick={() => setFrameId(f.id)}
                className={cn(
                  "relative shrink-0 w-20 h-20 rounded border overflow-hidden",
                  frame?.id === f.id ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-gray-300",
                  draggedFrame === f.id && "opacity-40",
                )}
                title="Drag to reorder"
              >
                <img src={f.image_url} alt="" className="w-full h-full object-cover" draggable={false} />
                <span className="absolute bottom-0 left-0 px-1 text-[10px] bg-black/60 text-white">{i + 1}</span>
              </button>
            ))}
            {(list.can_moderate || selected.is_mine) && (
              <label className="shrink-0 w-20 h-20 rounded border-2 border-dashed flex flex-col items-center justify-center text-[10px] text-gray-500 hover:bg-gray-50 cursor-pointer">
                <ImagePlus className="h-4 w-4" />
                <EditableText id="story-frame-add">Add frames</EditableText>
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (files.length) withProgress(() => addFrames(selected.id, files, setProgress), "Frames added");
                  }}
                />
              </label>
            )}
          </div>

          {frame && (list.can_moderate || selected.is_mine) ? (
            <FrameEditor
              media={selected}
              frame={frame}
              paragraphCount={chapterParagraphs.length}
              onSaved={onChanged}
              onDeleted={() => {
                setFrameId(null);
                onChanged();
              }}
            />
          ) : (
            frame && <FrameView frame={frame} />
          )}
        </div>
      )}

      <div className="border rounded p-3 bg-gray-50 space-y-2">
        <div className="text-sm font-medium">
          <EditableText id="story-visual-new-heading">New cartoon / presentation</EditableText>
        </div>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Title (optional)"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
        <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 cursor-pointer">
          <ImagePlus className="h-3.5 w-3.5" />
          <EditableText id="story-visual-choose-images">Choose images…</EditableText>
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length)
                withProgress(async () => {
                  const created = await createPresentation(chapterId, files, newLabel, setProgress);
                  setSelectedId(created.id);
                  setNewLabel("");
                }, "Presentation created");
            }}
          />
        </label>
        <ProgressBar value={progress} />
        <p className="text-[11px] text-gray-500">
          <EditableText id="story-visual-formats">PNG, JPEG, WEBP or GIF, up to 10 MB each and 20 per upload.</EditableText>
        </p>
      </div>

      <AiComicGenerator chapterId={chapterId} paragraphs={chapterParagraphs} onQueued={onAiJobQueued} />
    </div>
  );
};

export default VisualMediaEditor;
