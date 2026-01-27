import React, { useEffect, useState } from "react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import { StoriesOutput, StoriesOutputItem } from "@/modules/stories output";
import type { ExperienceItem } from "@/modules/living-experiencing stories";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const LivingStoriesOutput: React.FC = () => {
  const { user } = useAuth();
  const userId = user ? ((user as any).id ?? (user as any).user_id ?? null) : null;

  const [items, setItems] = useState<StoriesOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setError("You need to be logged in to see stories you are currently living / experiencing.");
      return;
    }

    const fetchLiving = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/users/${userId}/experiencing`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[LivingStoriesOutput] Failed to fetch experiencing", { status: res.status, body });
          setError("Failed to load currently experienced titles.");
          setItems([]);
          return;
        }

        const data = (await res.json()) as ExperienceItem[] | unknown;
        if (Array.isArray(data)) {
          const mapped: StoriesOutputItem[] = data.map((item) => {
            const isScreenplay = item.content_type === "screenplay";
            const href = isScreenplay
              ? `/screenplay/${item.content_id}`
              : `/story/${item.content_id}`;

            return {
              id: item.id,
              name: item.title,
              authors: null,
              createdAt: item.created_at,
              updatedAt: null,
              href,
            };
          });
          setItems(mapped);
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error("[LivingStoriesOutput] Error fetching experiencing", err);
        setError("Failed to load currently experienced titles.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLiving();
  }, [userId]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StoriesOutput
          title="Living / Experiencing the story(-ies)"
          items={items}
          loading={loading}
          error={error}
        />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default LivingStoriesOutput;
