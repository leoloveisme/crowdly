import React, { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
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
  createEdition,
  listStoryBranches,
  updateEdition,
  type Edition,
  type EditionSelections,
  type ParagraphBranch,
} from "@/lib/mediaApi";
import type { StoryChapter } from "./types";

interface EditionBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyTitleId: string;
  chapters: StoryChapter[];
  /** When set, edit this edition (re-resolves its snapshot on save). */
  edition?: Edition | null;
  /** How many narrations use `edition` — re-saving can misalign their timings. */
  narrationCount?: number;
  onSaved: (editionId: string) => void;
}

/**
 * Build an edition: a named path through the story's paragraph branches.
 * For each paragraph that has branches, pick the original text or one branch;
 * the preview shows the resulting chapter.
 */
const EditionBuilderDialog: React.FC<EditionBuilderDialogProps> = ({
  open,
  onOpenChange,
  storyTitleId,
  chapters,
  edition,
  narrationCount = 0,
  onSaved,
}) => {
  const { toast } = useToast();
  const [branches, setBranches] = useState<ParagraphBranch[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [publish, setPublish] = useState(true);
  const [selections, setSelections] = useState<EditionSelections>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(edition?.name ?? "");
    setDescription(edition?.description ?? "");
    setPublish(edition ? edition.status === "published" : true);
    const initial: EditionSelections = {};
    for (const ch of edition?.chapters ?? []) {
      if (ch.chapter_id && Object.keys(ch.selections ?? {}).length) initial[ch.chapter_id] = { ...ch.selections };
    }
    setSelections(initial);
    setBranches(null);
    listStoryBranches(storyTitleId)
      .then((rows) => setBranches(rows.filter((b) => (b.branch_text ?? "").trim())))
      .catch(() => setBranches([]));
  }, [open, edition, storyTitleId]);

  /** chapterId -> paragraph index -> branches */
  const byParagraph = useMemo(() => {
    const map = new Map<string, Map<number, ParagraphBranch[]>>();
    for (const b of branches ?? []) {
      if (!map.has(b.chapter_id)) map.set(b.chapter_id, new Map());
      const inner = map.get(b.chapter_id)!;
      inner.set(b.parent_paragraph_index, [...(inner.get(b.parent_paragraph_index) ?? []), b]);
    }
    return map;
  }, [branches]);

  const choose = (chapterId: string, index: number, branchId: string | null) =>
    setSelections((prev) => {
      const chapterSel = { ...(prev[chapterId] ?? {}) };
      if (branchId === null) delete chapterSel[index];
      else chapterSel[index] = branchId;
      return { ...prev, [chapterId]: chapterSel };
    });

  const chosenCount = Object.values(selections).reduce((n, sel) => n + Object.keys(sel).length, 0);
  const chaptersWithBranches = chapters.filter((ch) => byParagraph.has(ch.chapter_id));

  const save = async () => {
    if (!name.trim()) return;
    if (
      edition &&
      narrationCount > 0 &&
      !window.confirm(
        "This edition has narrations. Saving re-freezes its text from the story as it is now, which may misalign their read-along timings. Continue?",
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), description, status: publish ? ("published" as const) : ("draft" as const), selections };
      const saved = edition ? await updateEdition(edition.id, data) : await createEdition(storyTitleId, data);
      toast({ title: edition ? "Edition updated" : "Edition created" });
      onSaved(saved.id);
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {edition ? (
              <EditableText id="story-edition-edit-title">Edit edition</EditableText>
            ) : (
              <EditableText id="story-edition-new-title">Build an edition</EditableText>
            )}
          </DialogTitle>
          <DialogDescription>
            <EditableText id="story-edition-desc">
              Choose which paragraph branches make up your version of the story. The result is frozen when you save, so
              narrations of it stay in sync even if the story changes.
            </EditableText>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[2fr_3fr]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Edition name, e.g. “The dark version”"
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 border rounded p-3 bg-gray-50">
          {branches === null ? (
            <div className="text-center text-gray-400 py-6">
              <Loader2 className="h-5 w-5 animate-spin inline" />
            </div>
          ) : chaptersWithBranches.length === 0 ? (
            <p className="text-sm text-gray-500">
              <EditableText id="story-edition-no-branches">
                This story has no paragraph branches yet — an edition would be identical to the original.
              </EditableText>
            </p>
          ) : (
            chaptersWithBranches.map((ch) => {
              const paraBranches = byParagraph.get(ch.chapter_id)!;
              const paragraphs = Array.isArray(ch.paragraphs) ? ch.paragraphs : [];
              return (
                <section key={ch.chapter_id} className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {chapters.indexOf(ch) + 1}. {ch.chapter_title || "Untitled chapter"}
                  </h4>
                  {[...paraBranches.entries()]
                    .filter(([index]) => index < paragraphs.length)
                    .sort(([a], [b]) => a - b)
                    .map(([index, options]) => {
                      const chosen = selections[ch.chapter_id]?.[index] ?? null;
                      return (
                        <div key={index} className="bg-white border rounded p-2 space-y-1.5">
                          <div className="text-[11px] text-gray-500">
                            <EditableText id="story-edition-paragraph">Paragraph</EditableText> {index + 1}
                          </div>
                          <OptionRow
                            selected={chosen === null}
                            onSelect={() => choose(ch.chapter_id, index, null)}
                            badge={<EditableText id="story-edition-original">Original</EditableText>}
                            text={paragraphs[index]}
                          />
                          {options.map((b) => (
                            <OptionRow
                              key={b.id}
                              selected={chosen === String(b.id)}
                              onSelect={() => choose(ch.chapter_id, index, String(b.id))}
                              badge={
                                <span className="inline-flex items-center gap-0.5">
                                  <GitBranch className="h-3 w-3" />
                                  <EditableText id="story-edition-branch">Branch</EditableText>
                                </span>
                              }
                              text={b.branch_text}
                            />
                          ))}
                        </div>
                      );
                    })}
                </section>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:items-center gap-2">
          <label className="flex items-center gap-2 text-sm mr-auto">
            <input type="checkbox" className="accent-blue-500" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <EditableText id="story-edition-publish">Visible to readers</EditableText>
            <span className="text-xs text-gray-500">
              · {chosenCount} <EditableText id="story-edition-branches-chosen">branch(es) chosen</EditableText>
            </span>
          </label>
          <button type="button" onClick={() => onOpenChange(false)} className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50">
            <EditableText id="story-dialog-cancel">Cancel</EditableText>
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={save}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <EditableText id="story-edition-save">Save edition</EditableText>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const OptionRow: React.FC<{ selected: boolean; onSelect: () => void; badge: React.ReactNode; text: string }> = ({
  selected,
  onSelect,
  badge,
  text,
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      "w-full text-left flex gap-2 rounded border px-2 py-1.5 text-sm transition",
      selected ? "border-blue-400 bg-blue-50" : "border-transparent hover:bg-gray-50",
    )}
  >
    <span
      className={cn(
        "mt-1 h-3 w-3 shrink-0 rounded-full border",
        selected ? "border-blue-600 bg-blue-600" : "border-gray-400",
      )}
    />
    <span className="flex-1 min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-gray-500">{badge}</span>
      <span className="block whitespace-pre-wrap line-clamp-4">{text}</span>
    </span>
  </button>
);

export default EditionBuilderDialog;
