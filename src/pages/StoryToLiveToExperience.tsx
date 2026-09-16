import React, { useEffect, useState } from "react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { StoriesOutput, StoriesOutputItem } from "@/modules/stories output";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface NewestStoryApiRow {
  chapter_id: string;
  chapter_title: string;
  created_at: string;
  story_title: string;
  story_title_id: string;
}

interface NewestScreenplayApiRow {
  screenplay_id: string;
  title: string;
  created_at: string;
  slugline?: string | null;
}

const StoryToLiveToExperience: React.FC = () => {
  const [items, setItems] = useState<StoriesOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    const fetchAllContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ limit: "50" });

        const [storiesRes, screenplaysRes] = await Promise.all([
          fetch(`${API_BASE}/stories/newest?${params.toString()}`),
          fetch(`${API_BASE}/screenplays/newest?${params.toString()}`),
        ]);

        const problems: React.ReactNode[] = [];
        const combined: StoriesOutputItem[] = [];

        // Stories
        if (!storiesRes.ok) {
          const body = await storiesRes.json().catch(() => ({}));
          console.error("[StoryToLiveToExperience] Failed to fetch newest stories", {
            status: storiesRes.status,
            body,
          });
          problems.push(
            <EditableText key="stories" id="story-to-live-error-stories-failed">Failed to load newest stories.</EditableText>
          );
        } else {
          const data = (await storiesRes.json()) as NewestStoryApiRow[] | unknown;
          if (Array.isArray(data)) {
            combined.push(
              ...data.map((row) => ({
                id: `story:${row.story_title_id}:${row.chapter_id}`,
                name: row.story_title || "Untitled Story",
                // Author names are not yet available from this endpoint.
                authors: null,
                createdAt: row.created_at,
                // No dedicated last-modified field here yet; use creation time.
                updatedAt: row.created_at,
                href: `/story/${row.story_title_id}`,
              })),
            );
          }
        }

        // Screenplays
        if (!screenplaysRes.ok) {
          const body = await screenplaysRes.json().catch(() => ({}));
          console.error(
            "[StoryToLiveToExperience] Failed to fetch newest screenplays",
            { status: screenplaysRes.status, body },
          );
          problems.push(
            <EditableText key="screenplays" id="story-to-live-error-screenplays-failed">Failed to load newest screenplays.</EditableText>
          );
        } else {
          const data = (await screenplaysRes.json()) as NewestScreenplayApiRow[] | unknown;
          if (Array.isArray(data)) {
            combined.push(
              ...data.map((row) => ({
                id: `screenplay:${row.screenplay_id}`,
                name: row.title || "Untitled Screenplay",
                authors: null,
                createdAt: row.created_at,
                updatedAt: row.created_at,
                href: `/screenplay/${row.screenplay_id}`,
              })),
            );
          }
        }

        setItems(combined);
        setError(
          problems.length > 0
            ? problems.reduce<React.ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, " ", node]), [])
            : null
        );
      } catch (err) {
        console.error("[StoryToLiveToExperience] Error fetching content", err);
        setItems([]);
        setError(<EditableText id="story-to-live-error-generic">Failed to load content.</EditableText>);
      } finally {
        setLoading(false);
      }
    };

    fetchAllContent();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StoriesOutput
          title={<EditableText id="story-to-live-title">Story(-ies) to live / to experience</EditableText>}
          items={items}
          loading={loading}
          error={error}
        />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default StoryToLiveToExperience;
