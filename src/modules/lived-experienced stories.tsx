import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Film, BookOpen } from "lucide-react";

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

interface LivedExperiencedStoriesProps {
  userId: string | null;
}

const LivedExperiencedStories: React.FC<LivedExperiencedStoriesProps> = ({
  userId,
}) => {
  const [items, setItems] = useState<ExperienceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }

    const fetchExperienced = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/users/${userId}/experienced`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[LivedExperiencedStories] Failed to fetch experienced", {
            status: res.status,
            body,
          });
          setError("Failed to load lived / experienced titles.");
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
        console.error("[LivedExperiencedStories] Error fetching experienced", err);
        setError("Failed to load lived / experienced titles.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchExperienced();
  }, [userId]);

  if (!userId) {
    return (
      <div className="text-sm text-gray-500 mt-4">
        Login to see the stories and screenplays you have already lived / experienced.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-400 mt-4 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-teal-600" />
        Loading your lived / experienced titles...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 mt-4">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 mt-4 italic">
        You have not yet finished experiencing any stories here.
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            className="block rounded-md bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/30 hover:bg-cyan-100/80 transition p-4 shadow-sm ring-1 ring-cyan-100 dark:ring-cyan-900/40 hover-scale group"
            title={item.title}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm truncate text-teal-900 dark:text-teal-50 group-hover:underline">
                {item.title}
              </div>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-teal-900/60 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-100">
                {icon}
                <span>{isScreenplay ? "Screenplay" : "Story"}</span>
              </span>
            </div>
            {item.slugline && (
              <div className="text-xs text-gray-700 dark:text-gray-200 truncate">
                {item.slugline}
              </div>
            )}
            <div className="text-[11px] text-gray-500 mt-1">
              Completed at: {new Date(item.created_at).toLocaleString()}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default LivedExperiencedStories;
