import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, ArrowUp, ArrowDown, Upload, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import TagBadge from "@/components/TagBadge";
import { useAuth } from "@/contexts/AuthContext";
import {
  getComic,
  uploadComicPages,
  reorderComicPages,
  deleteComicPage,
  type ComicWithPages,
} from "@/lib/comicsApi";
import { errorMessage } from "@/lib/apiBase";

interface ComicReaderProps {
  comicId: string;
}

const ComicReader: React.FC<ComicReaderProps> = ({ comicId }) => {
  const { user } = useAuth();
  const [comic, setComic] = useState<ComicWithPages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getComic(comicId)
      .then((data) => {
        setComic(data);
        setPageIndex((prev) => Math.min(prev, Math.max(0, data.pages.length - 1)));
      })
      .catch(() => setError("Failed to load comic."))
      .finally(() => setLoading(false));
  }, [comicId]);

  useEffect(() => {
    load();
  }, [load]);

  const isRtl = comic?.reading_direction === "rtl";
  const canManage = !!(user && comic && comic.creator_id === user.id);
  const pages = comic?.pages ?? [];

  const goNext = useCallback(() => {
    setPageIndex((i) => Math.min(pages.length - 1, i + 1));
  }, [pages.length]);
  const goPrev = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // In RTL (manga) reading order, the left arrow key advances and the
      // right arrow goes back — the opposite of LTR.
      if (e.key === "ArrowLeft") isRtl ? goNext() : goPrev();
      if (e.key === "ArrowRight") isRtl ? goPrev() : goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRtl, goNext, goPrev]);

  const handleUpload = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setUploading(true);
    try {
      await uploadComicPages(comicId, files);
      load();
    } catch (err) {
      setError(errorMessage(err) || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const movePage = async (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= pages.length) return;
    const reordered = [...pages];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try {
      const updated = await reorderComicPages(comicId, reordered.map((p) => p.page_id));
      setComic((prev) => (prev ? { ...prev, pages: updated } : prev));
    } catch {
      // Best-effort; a failed reorder click just leaves the order as-is.
    }
  };

  const removePage = async (pageId: string) => {
    try {
      await deleteComicPage(pageId);
      load();
    } catch {
      // Best-effort, same as movePage.
    }
  };

  if (loading) {
    return <EditableText id="comic-reader-loading" as="div" className="text-sm text-gray-500">Loading comic...</EditableText>;
  }
  if (error && !comic) {
    return <div className="text-sm text-red-600">{error}</div>;
  }
  if (!comic) return null;

  const currentPage = pages[pageIndex];
  const prevIcon = isRtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />;
  const nextIcon = isRtl ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{comic.title}</h1>
          {comic.tags && comic.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {comic.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
          {isRtl ? (
            <EditableText id="comic-reader-rtl-badge">Right to left</EditableText>
          ) : (
            <EditableText id="comic-reader-ltr-badge">Left to right</EditableText>
          )}
        </span>
      </div>

      {pages.length === 0 ? (
        <EditableText id="comic-reader-empty" as="div" className="text-sm text-gray-500 italic">
          No pages yet.
        </EditableText>
      ) : (
        <>
          <div className="relative flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg min-h-[60vh]">
            <button
              type="button"
              onClick={goPrev}
              disabled={pageIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 shadow disabled:opacity-30"
              aria-label="Previous"
            >
              {prevIcon}
            </button>
            {currentPage && (
              // Fixed (not max-) height, so pages smaller than the frame still
              // scale up to fill it instead of rendering at their natural size.
              <img
                src={currentPage.image_url}
                alt={currentPage.alt_text ?? `Page ${pageIndex + 1}`}
                className="h-[70vh] w-full object-contain rounded-md"
              />
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={pageIndex === pages.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 shadow disabled:opacity-30"
              aria-label="Next"
            >
              {nextIcon}
            </button>
          </div>
          <div className="text-center text-xs text-gray-500">
            <EditableText id="comic-reader-page-of">Page</EditableText> {pageIndex + 1} / {pages.length}
          </div>

          <div className={`flex gap-2 overflow-x-auto pb-2 ${isRtl ? "flex-row-reverse" : ""}`}>
            {pages.map((page, idx) => (
              <div key={page.page_id} className="flex flex-col items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPageIndex(idx)}
                  className={`h-16 w-12 rounded overflow-hidden ring-2 transition ${
                    idx === pageIndex ? "ring-blue-500" : "ring-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={page.image_url} alt="" className="h-full w-full object-cover" />
                </button>
                {canManage && (
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => movePage(idx, -1)} disabled={idx === 0} className="disabled:opacity-30">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} className="disabled:opacity-30">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => removePage(page.page_id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {canManage && (
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
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      )}
    </div>
  );
};

export default ComicReader;
