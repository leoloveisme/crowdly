import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

export type SearchResultType = "story" | "screenplay" | "user";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string | null;
  snippet?: string | null;
  url: string;
  created_at?: string | null;
}

interface SearchApiResponse {
  results: SearchResult[];
}

export async function fetchSearchResults(
  query: string,
  options?: { limit?: number; includePrivate?: boolean },
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams();
  params.set("q", q);
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.includePrivate) {
    params.set("includePrivate", "true");
  }

  const res = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (!res.ok) {
    // For now, log and return empty; callers can show a generic error.
    console.error("[fetchSearchResults] search failed", res.status);
    return [];
  }
  const data = (await res.json()) as SearchApiResponse;
  if (!data || !Array.isArray(data.results)) return [];
  return data.results;
}

interface SearchBoxProps {
  placeholder?: string;
  maxSuggestions?: number;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  placeholder = "Search",
  maxSuggestions = 10,
}) => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = !!user && typeof hasRole === "function" && hasRole("platform_admin");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastRequestedQueryRef = useRef<string>("");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setOpen(false);
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }

    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        lastRequestedQueryRef.current = trimmed;
        const apiResults = await fetchSearchResults(trimmed, {
          limit: maxSuggestions + 1,
          includePrivate: isAdmin,
        });

        // Guard against out-of-order responses
        if (lastRequestedQueryRef.current !== trimmed) {
          return;
        }

        setResults(apiResults);
        setOpen(true);
      } catch (err) {
        console.error("[SearchBox] search error", err);
        setError("Failed to search.");
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, isAdmin, maxSuggestions]);

  const visibleResults = results.slice(0, maxSuggestions);
  const hasMore = results.length > maxSuggestions;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.url);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 md:w-64 pl-9 bg-white/80 dark:bg-gray-900/60 border-none shadow-inner rounded-xl"
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            {loading ? (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            ) : (
              <Search className="w-4 h-4 text-indigo-400" />
            )}
          </div>
        </div>
      </form>

      {open && (visibleResults.length > 0 || error) && (
        <Card className="absolute mt-1 w-full max-h-96 overflow-auto shadow-xl border border-indigo-100 dark:border-indigo-900 bg-white/95 dark:bg-gray-900/95 rounded-xl z-50">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
            {error && (
              <li className="px-3 py-2 text-red-600 dark:text-red-400 text-xs">
                {error}
              </li>
            )}
            {visibleResults.map((result) => (
              <li
                key={result.id}
                className="px-3 py-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/40 flex flex-col"
                onClick={() => handleResultClick(result)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-50 truncate">
                    {result.title}
                  </span>
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {result.type}
                  </span>
                </div>
                {result.subtitle && (
                  <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                    {result.subtitle}
                  </div>
                )}
                {result.snippet && (
                  <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                    {result.snippet}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              className="w-full text-xs text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/40 px-3 py-2 border-t border-gray-100 dark:border-gray-800 text-left"
              onClick={() => {
                const trimmed = query.trim();
                if (!trimmed) return;
                navigate(`/search?q=${encodeURIComponent(trimmed)}`);
                setOpen(false);
              }}
            >
              See all results for "{query.trim()}" on search page
            </button>
          )}
        </Card>
      )}
    </div>
  );
};

export default SearchBox;
