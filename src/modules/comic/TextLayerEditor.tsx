import React, { useEffect, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import FrameView from "@/components/story/media/FrameView";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FrameOverlay } from "@/lib/mediaApi";

interface TextLayerEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  overlays: FrameOverlay[];
  /** Team saves directly; other readers send the layers as a suggestion. */
  mode: "save" | "suggest";
  onSave: (overlays: FrameOverlay[]) => Promise<void> | void;
}

/**
 * Speech bubbles and captions over a comic page, stored as positioned text
 * (the same overlays a story's Comics | Manga frames use), so they can be
 * edited, suggested and translated without redrawing the page.
 */
const TextLayerEditor: React.FC<TextLayerEditorProps> = ({ open, onOpenChange, imageUrl, overlays, mode, onSave }) => {
  const [draft, setDraft] = useState<FrameOverlay[]>(overlays);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(overlays);
      setSelected(null);
    }
  }, [open, overlays]);

  const patch = (i: number, change: Partial<FrameOverlay>) =>
    setDraft((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...change } : o)));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.filter((o) => o.text.trim()));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="comic-layers-title">Text on this page</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="comic-layers-hint">Click on the page to add a speech bubble or text box.</EditableText>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <FrameView
            frame={{ image_url: imageUrl, caption: null, overlays: draft }}
            onImageClick={(x, y) => {
              setDraft((prev) => [...prev, { text: "…", x, y, style: "bubble" }]);
              setSelected(draft.length);
            }}
            selectedOverlay={selected}
            onOverlayClick={setSelected}
          />
          <div className="space-y-2 text-sm">
            {draft.length === 0 && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MessageSquarePlus className="h-3 w-3" />
                <EditableText id="comic-layers-empty">No text yet.</EditableText>
              </p>
            )}
            {draft.map((o, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                className={cn("border rounded p-2 space-y-1 bg-white", selected === i && "ring-2 ring-blue-400")}
              >
                <textarea
                  value={o.text}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  rows={2}
                  autoFocus={selected === i && o.text === "…"}
                  className="w-full border rounded px-1.5 py-1 text-sm"
                />
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <select
                    value={o.style}
                    onChange={(e) => patch(i, { style: e.target.value as FrameOverlay["style"] })}
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
                    onChange={(e) => patch(i, { x: Number(e.target.value) })}
                    className="w-14 border rounded px-1 py-0.5"
                  />
                  <span>y</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={o.y}
                    onChange={(e) => patch(i, { y: Number(e.target.value) })}
                    className="w-14 border rounded px-1 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft((prev) => prev.filter((_, idx) => idx !== i));
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
            <Button onClick={save} disabled={saving} className="w-full">
              {mode === "save" ? (
                <EditableText id="comic-layers-save">Save text</EditableText>
              ) : (
                <EditableText id="comic-layers-suggest">Send as a suggestion</EditableText>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TextLayerEditor;
