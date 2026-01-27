import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown } from "lucide-react";

export type StoriesOutputItem = {
  id: string;
  name: string;
  authors?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  href?: string | null;
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
      <span>Display:</span>
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
        <div className="text-sm text-gray-500">Loading...</div>
      )}

      {error && !loading && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && totalItems === 0 && (
        <div className="text-sm text-gray-500 italic">No items found.</div>
      )}

      {!loading && !error && totalItems > 0 && (
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700">
                  {renderSortLabel("name", "Story name")}
                </th>
                <th className="px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200">
                  Author(s)
                </th>
                <th className="px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700">
                  {renderSortLabel("createdAt", "Creation date")}
                </th>
                <th className="px-4 py-3 text-left border-b border-gray-200 dark:border-gray-700">
                  {renderSortLabel("updatedAt", "Last modification date")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr
                  key={item.id}
                  className="odd:bg-white even:bg-gray-50/50 dark:odd:bg-gray-900 dark:even:bg-gray-800/60 hover:bg-blue-50/60 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <td className="px-4 py-3 align-top">
                    {item.href ? (
                      <Link
                        to={item.href}
                        className="text-blue-700 dark:text-blue-300 hover:underline font-medium"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {item.authors || "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">
                    {formatDate(item.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
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
                Previous
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
                Next
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
