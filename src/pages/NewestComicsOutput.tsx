import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { StoriesOutput, StoriesOutputItem } from "@/modules/stories output";
import { listNewestComics, createComic } from "@/lib/comicsApi";
import { errorMessage } from "@/lib/apiBase";

const NewestComicsOutput: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<StoriesOutputItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">("ltr");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    listNewestComics(50)
      .then((rows) => {
        setItems(
          rows.map((row) => ({
            id: row.comic_id,
            name: row.title || "Untitled Comic",
            authors: null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            href: `/comic/${row.comic_id}`,
            language: null,
            coverImageUrl: row.cover_image_url,
            tags: row.tags,
            filmstripUrls: row.filmstrip_urls,
          })),
        );
      })
      .catch(() => setError("Failed to load newest comics."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const comic = await createComic({ title: newTitle.trim(), reading_direction: readingDirection });
      navigate(`/comic/${comic.comic_id}`);
    } catch (err) {
      toast({ title: "Could not create comic", description: errorMessage(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8 space-y-6">
        {user && (
          <div className="flex flex-wrap items-end gap-2 border rounded-lg bg-white dark:bg-gray-900 p-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                <EditableText id="newest-comics-new-title-label">New comic or manga title</EditableText>
              </label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Untitled" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                <EditableText id="newest-comics-direction-label">Reading direction</EditableText>
              </label>
              <select
                className="border rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                value={readingDirection}
                onChange={(e) => setReadingDirection(e.target.value as "ltr" | "rtl")}
              >
                <option value="ltr">Left to right (comic)</option>
                <option value="rtl">Right to left (manga)</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              <EditableText id="newest-comics-create-btn">Create</EditableText>
            </Button>
          </div>
        )}
        <StoriesOutput title="Newest Comics & Manga" items={items} loading={loading} error={error} />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default NewestComicsOutput;
