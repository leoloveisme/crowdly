import React, { useEffect, useState } from "react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { StoriesOutput, StoriesOutputItem } from "@/modules/stories output";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface NewestScreenplayApiRow {
  screenplay_id: string;
  title: string;
  created_at: string;
  slugline?: string | null;
}

const NewestScreenplaysOutput: React.FC = () => {
  const [items, setItems] = useState<StoriesOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNewest = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "50" });
        const res = await fetch(`${API_BASE}/screenplays/newest?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[NewestScreenplaysOutput] Failed to fetch newest screenplays", { status: res.status, body });
          setError("Failed to load newest screenplays.");
          setItems([]);
          return;
        }

        const data = (await res.json()) as NewestScreenplayApiRow[] | unknown;
        if (Array.isArray(data)) {
          const mapped: StoriesOutputItem[] = data.map((row) => ({
            id: row.screenplay_id,
            name: row.title || "Untitled Screenplay",
            authors: null,
            createdAt: row.created_at,
            updatedAt: null,
            href: `/screenplay/${row.screenplay_id}`,
          }));
          setItems(mapped);
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error("[NewestScreenplaysOutput] Error fetching newest screenplays", err);
        setError("Failed to load newest screenplays.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNewest();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8">
        <StoriesOutput
          title="Newest Screenplays"
          items={items}
          loading={loading}
          error={error}
        />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default NewestScreenplaysOutput;
