import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSearchResults, SearchResult, SearchResultType, SEARCH_TYPE_LABELS } from "@/modules/search";
import { useAuth } from "@/contexts/AuthContext";

function useQueryParam(name: string): string {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get(name) ?? "";
  }, [location.search, name]);
}

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = !!user && typeof hasRole === "function" && hasRole("platform_admin");

  const queryParam = useQueryParam("q");
  const [query, setQuery] = useState(queryParam);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"relevance" | "newest" | "oldest" | "title-asc" | "title-desc">(
    "relevance",
  );
  const [typeFilter, setTypeFilter] = useState<"all" | SearchResultType>("all");

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const trimmed = queryParam.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const apiResults = await fetchSearchResults(trimmed, {
          limit: 100,
          includePrivate: isAdmin,
        });
        if (cancelled) return;
        setResults(apiResults);
      } catch (err) {
        console.error("[SearchPage] search error", err);
        if (cancelled) return;
        setError("Failed to load search results.");
        setResults([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [queryParam, isAdmin]);

  const sortedResults = useMemo(() => {
    const filtered = typeFilter === "all" ? results : results.filter((r) => r.type === typeFilter);
    const copy = [...filtered];
    switch (sort) {
      case "title-asc":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      case "title-desc":
        return copy.sort((a, b) => b.title.localeCompare(a.title));
      case "newest":
        return copy.sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        });
      case "oldest":
        return copy.sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return aTime - bTime;
        });
      case "relevance":
      default:
        return copy; // server order is treated as relevance
    }
  }, [results, sort]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Card className="mb-6 p-4">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search across stories, screenplays, and users"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="story">{SEARCH_TYPE_LABELS.story}</SelectItem>
                  <SelectItem value="screenplay">{SEARCH_TYPE_LABELS.screenplay}</SelectItem>
                  <SelectItem value="user">{SEARCH_TYPE_LABELS.user}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Best match</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="title-asc">Title A–Z</SelectItem>
                  <SelectItem value="title-desc">Title Z–A</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit">Search</Button>
            </div>
          </form>
        </Card>

        {loading && (
          <div className="text-sm text-gray-500">Searching…</div>
        )}
        {error && !loading && (
          <div className="text-sm text-red-600 mb-4">{error}</div>
        )}
        {!loading && !error && queryParam.trim() && sortedResults.length === 0 && (
          <div className="text-sm text-gray-500">No results found.</div>
        )}

        {!loading && sortedResults.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Title
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Details
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => (
                    <tr
                      key={result.id}
                      className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-900 dark:even:bg-gray-800/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/40 cursor-pointer"
                      onClick={() => navigate(result.url)}
                    >
                      <td className="px-4 py-2 align-top">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          result.type === "user"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                            : result.type === "story"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}>
                          {SEARCH_TYPE_LABELS[result.type] || result.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top text-indigo-700 dark:text-indigo-200 font-medium">
                        {result.title}
                      </td>
                      <td className="px-4 py-2 align-top text-gray-700 dark:text-gray-200">
                        {result.subtitle && (
                          <div className="text-xs font-medium mb-0.5">{result.subtitle}</div>
                        )}
                        {result.snippet && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                            {result.snippet}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {result.created_at
                          ? new Date(result.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default SearchPage;
