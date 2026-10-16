import React, { useState } from "react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import type { Chapter } from "@web/lib/story";

// Chapter sidebar: pick, add, delete, publish/unpublish and reorder (buttons
// and drag-and-drop, as on the platform's ChapterSidebar).
interface Props {
  chapters: Chapter[];
  activeId: string | null;
  dirty: Set<string>;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onTogglePublish: (c: Chapter) => void;
}

export const ChapterList: React.FC<Props> = ({ chapters, activeId, dirty, canEdit, onSelect, onAdd, onDelete, onMove, onTogglePublish }) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        <EditableText id="webapp-story-chapters" className="text-sm font-medium">
          Chapters
        </EditableText>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            <EditableText id="webapp-story-add-chapter">Add</EditableText>
          </Button>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-auto p-1">
        {chapters.map((c, i) => (
          <li
            key={c.chapter_id}
            draggable={canEdit}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
              setDragFrom(null);
              setOver(null);
            }}
            className={`group flex items-center gap-1 rounded px-1 py-1 text-sm ${c.chapter_id === activeId ? "bg-primary/10 font-medium" : "hover:bg-muted"} ${over === i ? "ring-1 ring-primary" : ""}`}
          >
            {canEdit && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />}
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(c.chapter_id)}>
              <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
              {c.chapter_title || "Untitled chapter"}
              {dirty.has(c.chapter_id) && <span className="ml-1 text-amber-600">•</span>}
              {c.published === false && <span className="ml-1 text-xs text-muted-foreground">(draft)</span>}
            </button>
            {canEdit && (
              <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                <button className="rounded p-0.5 hover:bg-background disabled:opacity-30" disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button className="rounded p-0.5 hover:bg-background disabled:opacity-30" disabled={i === chapters.length - 1} onClick={() => onMove(i, i + 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button className="rounded p-0.5 hover:bg-background" onClick={() => onTogglePublish(c)} aria-label={c.published === false ? "Publish" : "Unpublish"} title={c.published === false ? "Publish" : "Unpublish"}>
                  {c.published === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button className="rounded p-0.5 text-destructive hover:bg-background disabled:opacity-30" disabled={chapters.length <= 1} onClick={() => onDelete(c.chapter_id)} aria-label="Delete chapter">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};
