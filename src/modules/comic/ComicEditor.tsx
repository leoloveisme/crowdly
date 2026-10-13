import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Trash2, Upload } from "lucide-react";
import EditableText from "@/components/EditableText";
import type { ComicPage } from "@/lib/comicsApi";

interface ComicEditorProps {
  pages: ComicPage[];
  isRtl: boolean;
  /** Team members manage pages; others only suggest text (phase 2). */
  canManagePages: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (page: ComicPage, pageNumber: number) => void;
  onSaveAltText: (page: ComicPage, altText: string) => void;
  /** Under each page: alternatives, text layers, suggestions (phase 2). */
  renderPageExtras?: (page: ComicPage, pageNumber: number) => React.ReactNode;
  banner?: React.ReactNode;
}

const AltTextInput: React.FC<{ page: ComicPage; onSave: (text: string) => void; disabled: boolean }> = ({
  page,
  onSave,
  disabled,
}) => {
  const [value, setValue] = useState(page.alt_text ?? "");
  useEffect(() => setValue(page.alt_text ?? ""), [page.alt_text]);
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (page.alt_text ?? "")) onSave(value);
      }}
      placeholder="Describe this page (alt text)"
      className="w-full border rounded px-2 py-1 text-xs disabled:bg-gray-50"
    />
  );
};

/** Editing mode for one issue: page order, alt text, uploads and deletes. */
const ComicEditor: React.FC<ComicEditorProps> = ({
  pages,
  isRtl,
  canManagePages,
  uploading,
  onUpload,
  onMove,
  onDelete,
  onSaveAltText,
  renderPageExtras,
  banner,
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {banner}
      {canManagePages && pages.length > 1 && (
        <EditableText id="comic-reader-reorder-hint" as="div" className="text-[11px] text-gray-400">
          Drag a page thumbnail, or use the arrows under it, to change the page order.
        </EditableText>
      )}
      {pages.length === 0 && (
        <EditableText id="comic-reader-empty" as="div" className="text-sm text-gray-500 italic">
          No pages yet.
        </EditableText>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" dir={isRtl ? "rtl" : "ltr"}>
        {pages.map((page, idx) => {
          // The grid flows right-to-left for RTL comics, so "earlier" is on the right there.
          const earlier = idx - 1;
          const later = idx + 1;
          return (
            <div
              key={page.page_id}
              dir="ltr"
              onDragOver={(e) => {
                if (!canManagePages || !draggedId) return;
                e.preventDefault();
                setDropTargetId(page.page_id);
              }}
              onDragLeave={() => setDropTargetId((cur) => (cur === page.page_id ? null : cur))}
              onDrop={() => {
                const from = pages.findIndex((p) => p.page_id === draggedId);
                setDraggedId(null);
                setDropTargetId(null);
                if (from !== -1) onMove(from, idx);
              }}
              className={`rounded-lg border bg-white p-2 space-y-2 ${draggedId === page.page_id ? "opacity-40" : ""} ${
                dropTargetId === page.page_id && draggedId !== page.page_id ? "outline outline-2 outline-dashed outline-blue-400" : ""
              }`}
            >
              <div
                draggable={canManagePages && pages.length > 1}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedId(page.page_id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTargetId(null);
                }}
                className={`aspect-[3/4] overflow-hidden rounded bg-gray-100 ${canManagePages && pages.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <img src={page.image_url} alt={page.alt_text ?? ""} draggable={false} className="h-full w-full object-contain" />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  <EditableText id="comic-reader-page-of">Page</EditableText> {idx + 1}
                </span>
                {canManagePages && (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(idx, isRtl ? later : earlier)}
                      disabled={(isRtl ? later : earlier) < 0 || (isRtl ? later : earlier) >= pages.length}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      aria-label="Move page left"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(idx, isRtl ? earlier : later)}
                      disabled={(isRtl ? earlier : later) < 0 || (isRtl ? earlier : later) >= pages.length}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      aria-label="Move page right"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(page, idx + 1)}
                      className="p-0.5 rounded hover:bg-red-50"
                      aria-label="Delete page"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </span>
                )}
              </div>
              <AltTextInput page={page} disabled={!canManagePages} onSave={(text) => onSaveAltText(page, text)} />
              {renderPageExtras?.(page, idx + 1)}
            </div>
          );
        })}
      </div>

      {canManagePages && (
        <div className="border-2 border-dashed rounded-md p-4 flex flex-col items-center gap-2">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : <Upload className="h-5 w-5 text-gray-400" />}
          <label className="text-xs text-blue-600 hover:underline cursor-pointer">
            <EditableText id="comic-reader-add-pages">Add pages</EditableText>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
                e.target.value = "";
                if (files.length) onUpload(files);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};

export default ComicEditor;
