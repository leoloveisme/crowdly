import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Film, BookOpen } from "lucide-react";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

export interface ExperienceItem {
  id: string;
  content_type: "story" | "screenplay";
  content_id: string;
  title: string;
  created_at: string;
  slugline?: string | null;
  kind?: string | null;
}

interface FavoriteStoriesProps {
  userId: string | null;
}

const FavoriteStories: React.FC<FavoriteStoriesProps> = ({ userId }) => {
  const [items, setItems] = useState<ExperienceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }

    const fetchFavorites = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/users/${userId}/favorites`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[FavoriteStories] Failed to fetch favorites", {
            status: res.status,
            body,
          });
          setError("Failed to load favorites.");
          setItems([]);
        } else {
          const data = await res.json();
          if (Array.isArray(data)) {
            setItems(data as ExperienceItem[]);
          } else {
            setItems([]);
          }
        }
      } catch (err) {
        console.error("[FavoriteStories] Error fetching favorites", err);
        setError("Failed to load favorites.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [userId]);

  if (!userId) {
    return (
      <div className="text-sm text-gray-500 mt-3">
        Login to see your favorite stories and screenplays.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-400 mt-3 flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        Loading your favorites...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 mt-3">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 mt-3 italic">
        You have not added any favorites yet.
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => {
        const isScreenplay = item.content_type === "screenplay";
        const icon = isScreenplay ? (
          <Film className="h-3 w-3 text-amber-600" />
        ) : (
          <BookOpen className="h-3 w-3 text-indigo-600" />
        );
        const href = isScreenplay
          ? `/screenplay/${item.content_id}`
          : `/story/${item.content_id}`;

        return (
          <Link
            key={item.id}
            to={href}
            className="block rounded-md bg-white dark:bg-slate-800/80 hover:bg-pink-50 dark:hover:bg-pink-900/30 transition p-4 shadow-sm ring-1 ring-pink-100 dark:ring-pink-900/40 hover-scale group"
            title={item.title}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm truncate text-gray-900 dark:text-gray-50 group-hover:underline">
                {item.title}
              </div>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-900/40 px-2 py-0.5 text-[10px] font-medium text-pink-700 dark:text-pink-100">
                {icon}
                <span>{isScreenplay ? "Screenplay" : "Story"}</span>
              </span>
            </div>
            {item.slugline && (
              <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                {item.slugline}
              </div>
            )}
            <div className="text-[11px] text-gray-400 mt-1">
              {new Date(item.created_at).toLocaleString()}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default FavoriteStories;
