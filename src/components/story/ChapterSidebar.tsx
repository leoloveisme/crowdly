import React, { useState } from "react";
import {
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isChapterUntitled, type StoryChapter } from "./types";

export type ChapterSidebarMode = "view" | "edit";

interface ChapterSidebarProps {
  chapters: StoryChapter[];
  currentChapterId: string | null;
  onSelect: (chapterId: string) => void;
  /** Owner or contributor — may switch the list into Edit mode. */
  canEdit: boolean;
  /** Owner-only actions: reorder, publish, delete (the backend enforces the same). */
  isOwner: boolean;
  mode: ChapterSidebarMode;
  onModeChange: (mode: ChapterSidebarMode) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRename: (chapter: StoryChapter, newTitle: string) => void;
  onTogglePublish: (chapter: StoryChapter) => void;
  onDelete: (chapterId: string) => void;
  /** Opens the add-chapter form; null appends at the end. */
  onInsertAfter: (chapterId: string | null) => void;
}

/**
 * Table of contents for a story. In View mode it's a plain chapter list; in
 * Edit mode rows gain a drag handle, inline rename and a ⋯ actions menu.
 */
const ChapterSidebar: React.FC<ChapterSidebarProps> = ({
  chapters,
  currentChapterId,
  onSelect,
  canEdit,
  isOwner,
  mode,
  onModeChange,
  onMove,
  onRename,
  onTogglePublish,
  onDelete,
  onInsertAfter,
}) => {
  const editing = canEdit && mode === "edit";
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoryChapter | null>(null);

  const startRename = (chapter: StoryChapter) => {
    setRenamingId(chapter.chapter_id);
    setRenameValue(isChapterUntitled(chapter) ? "" : chapter.chapter_title || "");
  };

  const commitRename = (chapter: StoryChapter) => {
    const next = renameValue.trim();
    setRenamingId(null);
    if (next && next !== chapter.chapter_title) onRename(chapter, next);
  };

  const handleDrop = (targetIndex: number) => {
    const fromIndex = chapters.findIndex((c) => c.chapter_id === draggedId);
    setDraggedId(null);
    setDropTargetId(null);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    onMove(fromIndex, targetIndex);
  };

  const handleHandleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      onMove(index, index - 1);
    } else if (e.key === "ArrowDown" && index < chapters.length - 1) {
      e.preventDefault();
      onMove(index, index + 1);
    }
  };

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          <EditableText id="story-sidebar-heading">Chapters</EditableText>
          <span className="ml-1 font-normal normal-case">· {chapters.length}</span>
        </h3>
        {canEdit && (
          <div className="inline-flex rounded-md border bg-gray-50 p-0.5 text-xs" role="group">
            {(["view", "edit"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onModeChange(m)}
                className={cn(
                  "px-2 py-0.5 rounded transition",
                  mode === m ? "bg-white shadow-sm text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900",
                )}
              >
                {m === "view" ? (
                  <EditableText id="story-sidebar-view">View</EditableText>
                ) : (
                  <EditableText id="story-sidebar-edit">Edit</EditableText>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {chapters.length === 0 && (
        <p className="text-xs text-gray-500 px-1 py-2">
          <EditableText id="story-sidebar-empty">No chapters yet.</EditableText>
        </p>
      )}

      <ol className="space-y-0.5">
        {chapters.map((chapter, index) => {
          const isActive = chapter.chapter_id === currentChapterId;
          const untitled = isChapterUntitled(chapter);
          const isRenaming = editing && renamingId === chapter.chapter_id;

          return (
            <li
              key={chapter.chapter_id}
              onDragOver={
                editing && isOwner && draggedId
                  ? (e) => {
                      e.preventDefault();
                      if (dropTargetId !== chapter.chapter_id) setDropTargetId(chapter.chapter_id);
                    }
                  : undefined
              }
              onDragLeave={editing && isOwner ? () => setDropTargetId(null) : undefined}
              onDrop={editing && isOwner ? () => handleDrop(index) : undefined}
              className={cn(
                "group flex items-center gap-1 rounded border transition",
                isActive ? "border-blue-400 bg-blue-50" : "border-transparent hover:bg-gray-50",
                draggedId === chapter.chapter_id && "opacity-40",
                dropTargetId === chapter.chapter_id && draggedId !== chapter.chapter_id && "border-dashed border-blue-400",
              )}
            >
              {editing && isOwner && (
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedId(chapter.chapter_id);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDropTargetId(null);
                  }}
                  onKeyDown={(e) => handleHandleKeyDown(e, index)}
                  className="pl-1 py-2 text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder (Alt+↑ / Alt+↓)"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              )}

              {isRenaming ? (
                <div className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1">
                  <span className="text-xs text-gray-500">{index + 1}.</span>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(chapter)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(chapter);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                    placeholder="Chapter title"
                    className="flex-1 min-w-0 border-b border-dashed border-blue-400 bg-transparent px-1 py-0.5 focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(chapter.chapter_id)}
                  onDoubleClick={editing ? () => startRename(chapter) : undefined}
                  className={cn(
                    "flex items-start gap-2 flex-1 min-w-0 text-left py-2",
                    editing && isOwner ? "px-1" : "px-3",
                  )}
                >
                  <span className="text-xs text-gray-500 pt-0.5 tabular-nums">{index + 1}.</span>
                  <span
                    className={cn(
                      "flex-1 min-w-0 break-words",
                      isActive && "text-blue-800",
                      untitled && "italic text-gray-500",
                    )}
                  >
                    {untitled ? (
                      <EditableText id="story-sidebar-untitled">Untitled chapter</EditableText>
                    ) : (
                      chapter.chapter_title
                    )}
                  </span>
                  {canEdit && chapter.source_stale && (
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      title="Out of date — the original chapter changed"
                    />
                  )}
                  {canEdit && chapter.published === false && (
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400"
                      title="Unpublished — hidden from public listings"
                    />
                  )}
                </button>
              )}

              {editing && !isRenaming && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mr-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      aria-label="Chapter actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => startRename(chapter)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      <EditableText id="story-chapter-rename-btn">Rename</EditableText>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onInsertAfter(chapter.chapter_id)}>
                      <Plus className="h-3.5 w-3.5 mr-2" />
                      <EditableText id="story-sidebar-insert-after">Insert chapter after</EditableText>
                    </DropdownMenuItem>
                    {isOwner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index, 0)}>
                          <ChevronsUp className="h-3.5 w-3.5 mr-2" />
                          <EditableText id="story-sidebar-move-top">Move to top</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index, index - 1)}>
                          <ChevronUp className="h-3.5 w-3.5 mr-2" />
                          <EditableText id="story-sidebar-move-up">Move up</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === chapters.length - 1}
                          onSelect={() => onMove(index, index + 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5 mr-2" />
                          <EditableText id="story-sidebar-move-down">Move down</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === chapters.length - 1}
                          onSelect={() => onMove(index, chapters.length - 1)}
                        >
                          <ChevronsDown className="h-3.5 w-3.5 mr-2" />
                          <EditableText id="story-sidebar-move-bottom">Move to bottom</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onTogglePublish(chapter)}>
                          {chapter.published ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5 mr-2" />
                              <EditableText id="story-sidebar-unpublish">Unpublish chapter</EditableText>
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 mr-2" />
                              <EditableText id="story-sidebar-publish">Publish chapter</EditableText>
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-700"
                          onSelect={() => setPendingDelete(chapter)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          <EditableText id="story-chapter-delete-btn">Delete</EditableText>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ol>

      {editing && (
        <button
          type="button"
          onClick={() => onInsertAfter(null)}
          className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-2 text-xs rounded border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          <EditableText id="story-chapter-add-btn">+ Add chapter</EditableText>
        </button>
      )}
      {editing && isOwner && chapters.length > 1 && (
        <p className="mt-2 text-[11px] text-gray-400 leading-snug">
          <EditableText id="story-sidebar-reorder-hint">
            Drag the handle or use the ⋯ menu to reorder. Double-click a title to rename.
          </EditableText>
        </p>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <EditableText id="story-chapter-delete-title">Delete this chapter?</EditableText>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.chapter_title ? `“${pendingDelete.chapter_title}” — ` : ""}
              <EditableText id="story-chapter-delete-desc">This cannot be undone.</EditableText>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <EditableText id="story-dialog-cancel">Cancel</EditableText>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.chapter_id);
                setPendingDelete(null);
              }}
            >
              <EditableText id="story-chapter-delete-btn">Delete</EditableText>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChapterSidebar;
