import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EditableText from "@/components/EditableText";
import type { ComicPage } from "@/lib/comicsApi";

interface ComicReaderProps {
  pages: ComicPage[];
  isRtl: boolean;
  /** Reset to the first page when this changes (switching issues). */
  resetKey: string;
  /** Rendered under the current page (alternatives, proposals…). */
  renderPageExtras?: (page: ComicPage) => React.ReactNode;
}

/**
 * Page-by-page reader for one issue: arrows, ←/→ keys (reversed for
 * right-to-left manga) and a thumbnail strip.
 */
const ComicReader: React.FC<ComicReaderProps> = ({ pages, isRtl, resetKey, renderPageExtras }) => {
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => setPageIndex(0), [resetKey]);
  useEffect(() => {
    setPageIndex((i) => Math.min(i, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  const goNext = useCallback(() => setPageIndex((i) => Math.min(pages.length - 1, i + 1)), [pages.length]);
  const goPrev = useCallback(() => setPageIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "ArrowLeft") (isRtl ? goNext : goPrev)();
      if (e.key === "ArrowRight") (isRtl ? goPrev : goNext)();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRtl, goNext, goPrev]);

  if (pages.length === 0) {
    return (
      <EditableText id="comic-reader-empty" as="div" className="text-sm text-gray-500 italic">
        No pages yet.
      </EditableText>
    );
  }

  const currentPage = pages[pageIndex];
  const prevIcon = isRtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />;
  const nextIcon = isRtl ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />;

  return (
    <div className="space-y-3">
      <div className="relative flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg min-h-[60vh]">
        <button
          type="button"
          onClick={goPrev}
          disabled={pageIndex === 0}
          className={`absolute ${isRtl ? "right-2" : "left-2"} top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 shadow disabled:opacity-30`}
          aria-label="Previous page"
        >
          {prevIcon}
        </button>
        {currentPage && (
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
          className={`absolute ${isRtl ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 shadow disabled:opacity-30`}
          aria-label="Next page"
        >
          {nextIcon}
        </button>
      </div>
      <div className="text-center text-xs text-gray-500">
        <EditableText id="comic-reader-page-of">Page</EditableText> {pageIndex + 1} / {pages.length}
      </div>
      {currentPage && renderPageExtras?.(currentPage)}
      <div className={`flex gap-2 overflow-x-auto pb-2 ${isRtl ? "flex-row-reverse" : ""}`}>
        {pages.map((page, idx) => (
          <button
            key={page.page_id}
            type="button"
            onClick={() => setPageIndex(idx)}
            title={`Page ${idx + 1}`}
            className={`h-16 w-12 shrink-0 rounded overflow-hidden ring-2 transition ${
              idx === pageIndex ? "ring-blue-500" : "ring-transparent opacity-70 hover:opacity-100"
            }`}
          >
            <img src={page.image_url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ComicReader;
