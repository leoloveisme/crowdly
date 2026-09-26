import React, { useEffect, useState } from "react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { StoriesOutput, StoriesOutputItem } from "@/modules/stories output";
import type { ExperienceItem } from "@/modules/favorite stories";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const FavoritesOutput: React.FC = () => {
  const { user } = useAuth();
  const userId = user ? user.id : null;

  const [items, setItems] = useState<StoriesOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setError(
        <EditableText id="favorites-error-login">
          You need to be logged in to see your favorites.
        </EditableText>
      );
      return;
    }

    const fetchFavorites = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/users/${userId}/favorites`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[FavoritesOutput] Failed to fetch favorites", { status: res.status, body });
          setError(<EditableText id="favorites-error-load-failed">Failed to load favorites.</EditableText>);
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
              // Author names are not yet available from this endpoint.
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
        console.error("[FavoritesOutput] Error fetching favorites", err);
        setError(<EditableText id="favorites-error-load-failed">Failed to load favorites.</EditableText>);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [userId]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StoriesOutput
          title={<EditableText id="favorites-title">Favorites</EditableText>}
          items={items}
          loading={loading}
          error={error}
        />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default FavoritesOutput;
