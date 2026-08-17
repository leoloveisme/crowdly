import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, BookOpen } from "lucide-react";
import EditableText from "@/components/EditableText";
import TagBadge from "@/components/TagBadge";

export type StoriesOutputItem = {
  id: string;
  name: string;
  authors?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  href?: string | null;
  language?: string | null;
  coverImageUrl?: string | null;
  tags?: string[] | null;
  // Populated for comics/manga listings — a hover-style preview strip of the
  // first few page images, shown under the cover art when present.
  filmstripUrls?: string[] | null;
};

export type StoriesOutputSortKey = "name" | "createdAt" | "updatedAt";
export type StoriesOutputSortDirection = "asc" | "desc";

interface StoriesOutputProps {
  title: string;
  items: StoriesOutputItem[];
  loading?: boolean;
  error?: string | null;
}

const PAGE_SIZE_OPTIONS = [50, 100, Infinity] as const;

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export const StoriesOutput: React.FC<StoriesOutputProps> = ({
  title,
  items,
  loading = false,
  error = null,
}) => {
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<StoriesOutputSortKey>("name");
  const [sortDirection, setSortDirection] = useState<StoriesOutputSortDirection>("asc");

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;

      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (sortKey === "name") {
        const aStr = (aVal ?? "").toString();
        const bStr = (bVal ?? "").toString();
        return aStr.localeCompare(bStr, undefined, { sensitivity: "base" }) * dir;
      }

      const aDate = aVal ? new Date(aVal as string) : null;
      const bDate = bVal ? new Date(bVal as string) : null;

      const aTime = aDate && !Number.isNaN(aDate.getTime()) ? aDate.getTime() : 0;
      const bTime = bDate && !Number.isNaN(bDate.getTime()) ? bDate.getTime() : 0;

      if (aTime === bTime) return 0;
      return aTime < bTime ? -1 * dir : 1 * dir;
    });
    return copy;
  }, [items, sortKey, sortDirection]);

  const totalItems = sortedItems.length;
  const effectivePageSize = pageSize === Infinity ? totalItems || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalItems);
  const pageItems = sortedItems.slice(startIndex, endIndex);

  const handleChangePageSize = (value: string) => {
    const numeric = value === "all" ? Infinity : Number(value);
    if (!Number.isFinite(numeric) && numeric !== Infinity) return;
    setPageSize(numeric as (typeof PAGE_SIZE_OPTIONS)[number]);
    setPage(1);
  };

  const handleHeaderClick = (key: StoriesOutputSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderDisplayControl = () => (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <EditableText id="stories-output-display">Display:</EditableText>
      <select
        className="border rounded-md px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700"
        value={pageSize === Infinity ? "all" : String(pageSize)}
        onChange={(e) => handleChangePageSize(e.target.value)}
      >
        <option value="50">50 per page</option>
        <option value="100">100 per page</option>
        <option value="all">All on one page</option>
      </select>
    </div>
  );

  const renderSortLabel = (key: StoriesOutputSortKey, label: string) => {
    const isActive = sortKey === key;
    const directionSymbol = !isActive ? "" : sortDirection === "asc" ? "↑" : "↓";
    return (
      <button
        type="button"
        onClick={() => handleHeaderClick(key)}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
      >
        <span>{label}</span>
        <ArrowUpDown className="h-3 w-3" />
        {directionSymbol && <span>{directionSymbol}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{title}</h1>
        {renderDisplayControl()}
      </div>

      {loading && (
        <EditableText id="stories-output-loading" as="div" className="text-sm text-gray-500">Loading...</EditableText>
      )}

      {error && !loading && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && totalItems === 0 && (
        <EditableText id="stories-output-no-items" as="div" className="text-sm text-gray-500 italic">No items found.</EditableText>
      )}

      {!loading && !error && totalItems > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-xs">
            {renderSortLabel("name", "Story name")}
            {renderSortLabel("createdAt", "Creation date")}
            {renderSortLabel("updatedAt", "Last modification date")}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {pageItems.map((item) => {
              const card = (
                <>
                  <div className="relative aspect-[2/3] bg-gradient-to-br from-blue-200 via-sky-200 to-purple-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900">
                    {item.coverImageUrl ? (
                      <img
                        src={item.coverImageUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-10 w-10 text-white/80" />
                      </div>
                    )}
                    {item.language && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-white">
                        {item.language.toUpperCase()}
                      </span>
                    )}
                    {item.filmstripUrls && item.filmstripUrls.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 flex gap-0.5 p-1 bg-gradient-to-t from-black/60 to-transparent">
                        {item.filmstripUrls.slice(0, 4).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className="h-8 w-8 object-cover rounded-sm ring-1 ring-white/50"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:underline">
                      {item.name}
                    </div>
                    {item.authors && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {item.authors}
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                      {formatDate(item.updatedAt ?? item.createdAt)}
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.slice(0, 3).map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );

              return item.href ? (
                <Link
                  key={item.id}
                  to={item.href}
                  className="group block rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 hover-scale"
                >
                  {card}
                </Link>
              ) : (
                <div
                  key={item.id}
                  className="group block rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800"
                >
                  {card}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Showing {totalItems === 0 ? 0 : startIndex + 1}‑{endIndex} of {totalItems}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-900 dark:border-gray-700"
              >
                <EditableText id="stories-output-prev">Previous</EditableText>
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-900 dark:border-gray-700"
              >
                <EditableText id="stories-output-next">Next</EditableText>
              </button>
              {renderDisplayControl()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoriesOutput;
