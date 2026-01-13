import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface StoryAttachment {
  id: string;
  space_id: string;
  item_id: string;
  kind: string;
  role?: string | null;
  relative_path: string;
  name: string;
  item_kind: string;
  mime_type?: string | null;
  size_bytes?: number | null;
}

interface StoryWithSpace {
  story_title_id: string;
  title: string;
  creator_id?: string;
  visibility?: string;
  published?: boolean;
  creative_space_id?: string | null;
  attachments?: StoryAttachment[];
}

interface CreativeSpaceSummary {
  id: string;
  name: string;
}

const StoryDetails: React.FC = () => {
  const { story_id } = useParams<{ story_id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [story, setStory] = useState<StoryWithSpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<CreativeSpaceSummary[]>([]);
  const [savingSpace, setSavingSpace] = useState(false);
  const [actionSpaceId, setActionSpaceId] = useState<string | "none">("none");
  const [creatingSpace, setCreatingSpace] = useState(false);

  const isOwner = !!(user && story && story.creator_id === user.id);

  useEffect(() => {
    const loadStory = async () => {
      if (!story_id) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (user?.id) params.set("userId", user.id);
        const url = params.toString()
          ? `${API_BASE}/story-titles/${story_id}?${params.toString()}`
          : `${API_BASE}/story-titles/${story_id}`;
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || "Failed to load story");
          setStory(null);
        } else {
          setStory(body as StoryWithSpace);
        }
      } catch (err) {
        console.error("[StoryDetails] Failed to load story", err);
        setError("Failed to load story");
        setStory(null);
      } finally {
        setLoading(false);
      }
    };

    loadStory();
  }, [story_id, user?.id]);

  useEffect(() => {
    const loadSpaces = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`${API_BASE}/creative-spaces?userId=${user.id}`);
        const body = await res.json().catch(() => ([]));
        if (!res.ok || !Array.isArray(body)) {
          console.error("[StoryDetails] Failed to load creative spaces", { status: res.status, body });
          return;
        }
        const mapped: CreativeSpaceSummary[] = body.map((row: any) => ({
          id: row.id,
          name: row.name,
        }));
        setSpaces(mapped);
      } catch (err) {
        console.error("[StoryDetails] Error loading creative spaces", err);
      }
    };

    loadSpaces();
  }, [user?.id]);

  const handleChangeSpace = async (value: string) => {
    if (!story_id) return;
    if (!isOwner) {
      toast({
        title: "Not allowed",
        description: "Only the story creator can change its Space.",
        variant: "destructive",
      });
      return;
    }
    const nextSpaceId = value === "none" ? null : value;
    setSavingSpace(true);
    try {
      const res = await fetch(`${API_BASE}/story-titles/${story_id}/space`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeSpaceId: nextSpaceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to update Space",
          description: body.error || "Could not update story Space.",
          variant: "destructive",
        });
        return;
      }
      setStory(body as StoryWithSpace);
      toast({ title: "Space updated", description: "Story is now linked to the selected Space." });
    } catch (err) {
      console.error("[StoryDetails] Failed to update Space", err);
      toast({
        title: "Failed to update Space",
        description: "Network error while updating Space.",
        variant: "destructive",
      });
    } finally {
      setSavingSpace(false);
    }
  };

  const createNewSpace = async (): Promise<string | null> => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Log in to create a new Space.",
        variant: "destructive",
      });
      return null;
    }

    const rawName = window.prompt("Name for the new Creative Space:", "");
    if (rawName === null) {
      return null;
    }
    const name = rawName.trim();
    if (!name) {
      toast({
        title: "No name entered",
        description: "Please provide a non-empty Space name.",
        variant: "destructive",
      });
      return null;
    }

    setCreatingSpace(true);
    try {
      const res = await fetch(`${API_BASE}/creative-spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to create Space",
          description: (body as any).error || "Unexpected error while creating Space.",
          variant: "destructive",
        });
        return null;
      }
      const createdId = (body as any).id as string | undefined;
      const createdName = ((body as any).name as string) || name;
      if (createdId) {
        const newSpace: CreativeSpaceSummary = { id: createdId, name: createdName };
        setSpaces((prev) => {
          if (prev.some((s) => s.id === createdId)) return prev;
          return [...prev, newSpace];
        });
        toast({
          title: "Space created",
          description: `Space "${createdName}" is ready to use.`,
        });
        return createdId;
      }
      return null;
    } catch (err) {
      console.error("[StoryDetails] Failed to create Space", err);
      toast({
        title: "Failed to create Space",
        description: "Unexpected error while creating Space.",
        variant: "destructive",
      });
      return null;
    } finally {
      setCreatingSpace(false);
    }
  };

  const handleDetach = async (attachment: StoryAttachment) => {
    if (!story) return;
    const ok = window.confirm(`Detach ${attachment.name} from this story?`);
    if (!ok) return;
    try {
      const res = await fetch(
        `${API_BASE}/stories/${story.story_title_id}/attachments/${attachment.id}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to detach",
          description: body.error || "Could not detach attachment.",
          variant: "destructive",
        });
        return;
      }
      setStory((prev) =>
        prev
          ? {
              ...prev,
              attachments: (prev.attachments || []).filter((a) => a.id !== attachment.id),
            }
          : prev,
      );
    } catch (err) {
      console.error("[StoryDetails] Failed to detach attachment", err);
      toast({
        title: "Failed to detach",
        description: "Network error while detaching attachment.",
        variant: "destructive",
      });
    }
  };

  const handleCopyToSpace = async () => {
    if (!story) return;
    if (!user) {
      toast({
        title: "Login required",
        description: "Log in to copy this story into another Space.",
        variant: "destructive",
      });
      return;
    }
    const target = actionSpaceId === "none" ? null : actionSpaceId;
    if (!target) {
      toast({
        title: "No Space selected",
        description: "Choose a target Space first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/copy-to-space`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSpaceId: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to copy to Space",
          description: (body as any).error || "Could not add story to the selected Space.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Copied",
        description: "Story is now also available in the selected Space.",
      });
    } catch (err) {
      console.error("[StoryDetails] Failed to copy to Space", err);
      toast({
        title: "Failed to copy to Space",
        description: "Network error while copying to Space.",
        variant: "destructive",
      });
    }
  };

  const handleCloneToSpace = async () => {
    if (!story) return;
    if (!user) {
      toast({
        title: "Login required",
        description: "Log in to clone this story into another Space.",
        variant: "destructive",
      });
      return;
    }
    const target = actionSpaceId === "none" ? null : actionSpaceId;
    if (!target) {
      toast({
        title: "No Space selected",
        description: "Choose a target Space first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/stories/${story.story_title_id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, targetSpaceId: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to clone to Space",
          description: (body as any).error || "Could not clone story into the selected Space.",
          variant: "destructive",
        });
        return;
      }
      const newId =
        (body as any).storyTitleId ||
        (body as any).story_title_id ||
        (body as any).id ||
        null;
      toast({
        title: "Clone created",
        description: "A new copy of this story was created in the selected Space.",
      });
      if (newId && window.confirm("Open the cloned story now?")) {
        navigate(`/story/${newId}`);
      }
    } catch (err) {
      console.error("[StoryDetails] Failed to clone to Space", err);
      toast({
        title: "Failed to clone to Space",
        description: "Network error while cloning to Space.",
        variant: "destructive",
      });
    }
  };

  const renderSpaceSelector = () => {
    if (!story) return null;
    if (!user) {
      return <p className="text-xs text-gray-500">Log in to manage this story's Space.</p>;
    }

    const currentId = story.creative_space_id || "none";

    const onSelectValueChange = async (value: string) => {
      if (value === "__create__") {
        const createdId = await createNewSpace();
        if (createdId) {
          await handleChangeSpace(createdId);
        }
        return;
      }
      await handleChangeSpace(value);
    };

    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500">
          Link this story to a Creative Space so desktop project spaces and web stay in sync.
        </p>
        <Select
          value={currentId}
          onValueChange={onSelectValueChange}
          disabled={!isOwner || savingSpace || creatingSpace}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Select Space" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Space</SelectItem>
            {spaces.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            <SelectItem value="__create__">+ Create new Space</SelectItem>
          </SelectContent>
        </Select>
        {!isOwner && (
          <p className="text-[11px] text-gray-500">
            Only the story creator can change the owning Space.
          </p>
        )}
      </div>
    );
  };

  const renderAttachments = () => {
    if (!story) return null;
    const attachments = story.attachments || [];
    if (attachments.length === 0) {
      return <p className="text-sm text-gray-500">No attachments are linked to this story yet.</p>;
    }
    return (
      <div className="mt-2 border rounded-lg bg-white divide-y text-sm">
        {attachments.map((att) => {
          const parentPath = att.relative_path.includes("/")
            ? att.relative_path.split("/").slice(0, -1).join("/")
            : "";
          const openUrl = `/creative_space/${att.space_id}` +
            (parentPath ? `?path=${encodeURIComponent(parentPath)}` : "");
          const openLabel = parentPath ? parentPath : "/";
          return (
            <div key={att.id} className="px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{att.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {att.relative_path} · {att.kind || att.item_kind}
                    {typeof att.size_bytes === "number" &&
                      ` · ${Math.round(att.size_bytes / 1024)} KB`}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                  <Link
                    to={openUrl}
                    className="px-2 py-1 rounded border hover:bg-gray-50"
                  >
                    Open folder
                  </Link>
                  {isOwner && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => handleDetach(att)}
                    >
                      Detach
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading story details...</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-2xl font-bold mb-2">Story details</h1>
          <p className="text-sm text-gray-600 mb-4">{error || "Story not found"}</p>
          <Button variant="outline" onClick={() => navigate(story_id ? `/story/${story_id}` : "/")}>
            Back to story
          </Button>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  const currentSpace = story.creative_space_id
    ? spaces.find((s) => s.id === story.creative_space_id)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl space-y-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold break-words mb-1">{story.title}</h1>
            <p className="text-xs text-gray-500 break-all mb-1">story_id: {story.story_title_id}</p>
            {story.visibility && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 mr-1">
                {story.visibility === "private" ? "Private" : "Public"}
              </span>
            )}
            {story.published === false && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-200 text-gray-700">
                Unpublished
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-auto px-2 py-1"
              onClick={() => navigate(`/story/${story.story_title_id}`)}
            >
              Back to story
            </Button>
          </div>
        </div>

        <section className="border rounded-lg bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="text-sm font-semibold">Creative Space</h2>
            {currentSpace && (
              <Link
                to={`/creative_space/${currentSpace.id}`}
                className="text-xs text-purple-700 hover:underline"
              >
                Open Space
              </Link>
            )}
          </div>
          {renderSpaceSelector()}
          {currentSpace && (
            <p className="text-xs text-gray-500 mt-1">
              Current Space: <span className="font-medium">{currentSpace.name}</span>
            </p>
          )}
          {isOwner && spaces.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <p className="text-xs font-semibold">Space actions</p>
              <div className="flex flex-wrap items-center gap-2">
        <Select
          value={actionSpaceId}
          onValueChange={async (val) => {
            if (val === "__create__") {
              const createdId = await createNewSpace();
              if (createdId) {
                setActionSpaceId(createdId);
              }
            } else {
              setActionSpaceId(val as string | "none");
            }
          }}
        >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Choose target Space" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select Space…</SelectItem>
                    {spaces.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__create__">+ Create new Space</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionSpaceId === "none"}
                  onClick={handleCopyToSpace}
                >
                  Copy to
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionSpaceId === "none"}
                  onClick={handleCloneToSpace}
                >
                  Clone to
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">
                Copy keeps this story&apos;s id and adds it to another Space. Clone creates a new
                story id in the selected Space.
              </p>
            </div>
          )}
        </section>

        <section className="border rounded-lg bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Attachments</h2>
          </div>
          {renderAttachments()}
        </section>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default StoryDetails;
