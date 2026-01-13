import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface UnboundStoryRow {
  story_title_id: string;
  title: string;
  visibility?: string;
  published?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface CreativeSpaceRow {
  id: string;
  name: string;
}

const StoriesSpacesMigration: React.FC = () => {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<UnboundStoryRow[]>([]);
  const [spaces, setSpaces] = useState<CreativeSpaceRow[]>([]);
  const [selection, setSelection] = useState<Record<string, string | "none">>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [filterText, setFilterText] = useState("");

  const canUseTool = !!user && (hasRole("platform_admin") || true);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [spacesRes, storiesRes] = await Promise.all([
          fetch(`${API_BASE}/creative-spaces?userId=${user.id}`),
          fetch(`${API_BASE}/stories/unbound?userId=${user.id}`),
        ]);

        const spacesBody = await spacesRes.json().catch(() => []);
        if (spacesRes.ok && Array.isArray(spacesBody)) {
          const mappedSpaces: CreativeSpaceRow[] = spacesBody.map((row: any) => ({
            id: row.id,
            name: row.name,
          }));
          setSpaces(mappedSpaces);
        } else {
          console.error("[StoriesSpacesMigration] Failed to load spaces", { status: spacesRes.status, spacesBody });
        }

        const storiesBody = await storiesRes.json().catch(() => []);
        if (storiesRes.ok && Array.isArray(storiesBody)) {
          setStories(storiesBody as UnboundStoryRow[]);
        } else {
          console.error("[StoriesSpacesMigration] Failed to load unbound stories", { status: storiesRes.status, storiesBody });
        }
      } catch (err) {
        console.error("[StoriesSpacesMigration] Error loading data", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const handleAssign = async (story: UnboundStoryRow) => {
    const chosen = selection[story.story_title_id] ?? "none";
    if (chosen === "none") {
      toast({
        title: "No Space selected",
        description: "Choose a Creative Space before assigning.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(story.story_title_id);
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story.story_title_id}/space`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeSpaceId: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to assign Space",
          description: body.error || "Could not update story Space.",
          variant: "destructive",
        });
        return;
      }
      setStories((prev) => prev.filter((s) => s.story_title_id !== story.story_title_id));
      toast({ title: "Assigned", description: `Story moved into the selected Space.` });
    } catch (err) {
      console.error("[StoriesSpacesMigration] Failed to assign Space", err);
      toast({
        title: "Failed to assign Space",
        description: "Network error while assigning Space.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateSpace = async () => {
    if (!user?.id) return;
    const name = window.prompt("Name for the new Creative Space:", "");
    if (name === null) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        title: "No name entered",
        description: "Please provide a non-empty Space name.",
        variant: "destructive",
      });
      return;
    }

    setCreatingSpace(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to create Space",
          description: (body as any).error || "Unexpected error while creating Space.",
          variant: "destructive",
        });
        return;
      }
      const createdId = (body as any).id as string | undefined;
      const createdName = ((body as any).name as string) || trimmed;
      if (createdId) {
        const newSpace: CreativeSpaceRow = { id: createdId, name: createdName };
        setSpaces((prev) => {
          if (prev.some((s) => s.id === createdId)) return prev;
          return [...prev, newSpace];
        });
      }
      toast({
        title: "Space created",
        description: `Space "${createdName}" is ready to use.`,
      });
    } catch (err) {
      console.error("[StoriesSpacesMigration] Failed to create Space", err);
      toast({
        title: "Failed to create Space",
        description: "Unexpected error while creating Space.",
        variant: "destructive",
      });
    } finally {
      setCreatingSpace(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-600">
          Log in to manage story–Space assignments.
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (!canUseTool) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-600 px-4 text-center">
          You do not have access to the story–Space migration tool.
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  const filteredStories = stories.filter((story) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      (story.title && story.title.toLowerCase().includes(q)) ||
      story.story_title_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto px-4 pt-8 pb-16 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Story–Space migration</h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            These are your stories that do not yet belong to any Creative Space. Assign them to
            Spaces so desktop project spaces and web stay aligned.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading stories and spaces...</p>
        ) : filteredStories.length === 0 ? (
          <p className="text-sm text-gray-500">No unbound stories match the current filter.</p>
        ) : (
          <div className="border rounded-lg bg-white divide-y text-sm">
            {filteredStories.map((story) => (
              <div key={story.story_title_id} className="px-3 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{story.title}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    story_id: {story.story_title_id}
                    {story.visibility && ` · ${story.visibility}`}
                    {story.published === false && " · unpublished"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select
                    value={selection[story.story_title_id] ?? "none"}
                    onValueChange={(val) =>
                      setSelection((prev) => ({ ...prev, [story.story_title_id]: val as string | "none" }))
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Select Space" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Space</SelectItem>
                      {spaces.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={savingId === story.story_title_id}
                    onClick={() => handleAssign(story)}
                  >
                    {savingId === story.story_title_id ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default StoriesSpacesMigration;
