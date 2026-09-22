import React, { useCallback, useEffect, useState } from "react";
import { BookCopy, Pencil, Plus, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import { deleteEdition, getEdition, listEditions, type Edition, type EditionSummary } from "@/lib/mediaApi";
import EditionBuilderDialog from "./EditionBuilderDialog";
import type { StoryChapter } from "./types";

interface EditionPickerProps {
  storyTitleId: string;
  chapters: StoryChapter[];
  canCreate: boolean;
  /** The edition being read (null = the story's current text). */
  value: Edition | null;
  onChange: (edition: Edition | null) => void;
}

/**
 * "Reading: Original ▾" — switch the reader between the story's current text
 * and published editions (named paths through its paragraph branches), and
 * build / edit / delete your own editions.
 */
const EditionPicker: React.FC<EditionPickerProps> = ({ storyTitleId, chapters, canCreate, value, onChange }) => {
  const { toast } = useToast();
  const [editions, setEditions] = useState<EditionSummary[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Edition | null>(null);

  const reload = useCallback(() => {
    listEditions(storyTitleId)
      .then(setEditions)
      .catch(() => setEditions([]));
  }, [storyTitleId]);
  useEffect(reload, [reload]);

  const select = async (id: string) => {
    if (!id) return onChange(null);
    try {
      onChange(await getEdition(id));
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load edition", variant: "destructive" });
    }
  };

  const current = editions.find((e) => e.id === value?.id);

  if (editions.length === 0 && !canCreate) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
      <BookCopy className="h-4 w-4 text-gray-500" />
      <span className="text-gray-600">
        <EditableText id="story-edition-reading">Reading:</EditableText>
      </span>
      <select
        value={value?.id ?? ""}
        onChange={(e) => select(e.target.value)}
        className="border rounded px-2 py-1 text-sm bg-white max-w-[16rem]"
      >
        <option value="">Original (current text)</option>
        {editions.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.status === "draft" ? " (draft)" : ""}
            {e.creator_name ? ` · ${e.creator_name}` : ""}
          </option>
        ))}
      </select>
      {value && current?.is_mine && (
        <>
          <button
            type="button"
            title="Edit edition"
            onClick={() => {
              setEditing(value);
              setBuilderOpen(true);
            }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete edition"
            onClick={async () => {
              const warn = current.narration_count > 0 ? " Its narrations will lose read-along." : "";
              if (!window.confirm(`Delete the edition “${value.name}”?${warn}`)) return;
              try {
                await deleteEdition(value.id);
                onChange(null);
                reload();
              } catch (err) {
                toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
              }
            }}
            className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {canCreate && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setBuilderOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-gray-700 bg-white hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" />
          <EditableText id="story-edition-new-btn">New edition</EditableText>
        </button>
      )}

      <EditionBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        storyTitleId={storyTitleId}
        chapters={chapters}
        edition={editing}
        narrationCount={current?.narration_count ?? 0}
        onSaved={async (id) => {
          reload();
          await select(id);
        }}
      />
    </div>
  );
};

export default EditionPicker;
