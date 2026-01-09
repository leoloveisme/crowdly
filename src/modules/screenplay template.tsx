import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Heart } from "lucide-react";
import InteractionsWidget from "@/modules/InteractionsWidget";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

// Types aligned with backend screenplay tables
export type ScreenplayScene = {
  scene_id: string;
  screenplay_id: string;
  scene_index: number;
  slugline: string;
  location: string | null;
  time_of_day: string | null;
  is_interior: boolean | null;
  synopsis: string | null;
};

export type ScreenplayBlock = {
  block_id: string;
  screenplay_id: string;
  scene_id: string | null;
  block_index: number;
  block_type: string;
  text: string;
  metadata: any | null;
};

interface ScreenplayTemplateProps {
  // Optional: if provided, the module will load an existing screenplay
  // instead of creating a new one from the template endpoint.
  initialScreenplayId?: string | null;
}

const BLOCK_TYPE_LABELS: { value: string; label: string }[] = [
  { value: "scene_heading", label: "Scene Heading" },
  { value: "action", label: "Action" },
  { value: "character", label: "Character" },
  { value: "dialogue", label: "Dialogue" },
  { value: "parenthetical", label: "Parenthetical" },
  { value: "transition", label: "Transition" },
  { value: "shot", label: "Shot" },
  { value: "general", label: "General" },
];

// Scene-level wrapper around the shared InteractionsWidget
const SceneComments: React.FC<SceneCommentsProps> = ({ sceneId, screenplayId }) => {
  if (!screenplayId) return null;
  return (
    <InteractionsWidget
      kind="scene"
      screenplayId={screenplayId}
      sceneId={sceneId}
      label="Scene comments"
    />
  );
};

const ScreenplayTemplate: React.FC<ScreenplayTemplateProps> = ({
  initialScreenplayId,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [screenplayId, setScreenplayId] = useState<string | null>(
    initialScreenplayId ?? null,
  );
  const [title, setTitle] = useState<string>("Untitled Screenplay");
  const [formatType, setFormatType] = useState<string | null>("feature_film");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [scenes, setScenes] = useState<ScreenplayScene[]>([]);
  const [blocks, setBlocks] = useState<ScreenplayBlock[]>([]);

  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const canEdit = !!user;

  const loadScreenplayStructure = async (id: string) => {
    setLoading(true);
    try {
      const metaRes = await fetch(`${API_BASE}/screenplays/${id}`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        setTitle(meta.title ?? "Untitled Screenplay");
        setFormatType(meta.format_type ?? null);
      }

      const res = await fetch(
        `${API_BASE}/screenplays/${id}/scenes?includeBlocks=true`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to load screenplay scenes", {
          status: res.status,
          body,
        });
        toast({
          title: "Error",
          description: body.error || "Failed to load screenplay structure",
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
    } catch (err) {
      console.error("Failed to load screenplay", err);
      toast({
        title: "Error",
        description: "Failed to load screenplay",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScreenplay = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to create a screenplay.",
        variant: "destructive",
      });
      return;
    }
    if (creating) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/screenplays/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          formatType: formatType ?? "feature_film",
          userId: user.id,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to create screenplay",
          variant: "destructive",
        });
        return;
      }

      const newId = body.screenplayId;
      if (newId) {
        setScreenplayId(newId);
        setTitle(body.title ?? title);
        setFormatType(body.formatType ?? formatType);
        await loadScreenplayStructure(newId);
        toast({
          title: "Screenplay created",
          description: "A new screenplay has been created from the template.",
        });
      }
    } catch (err) {
      console.error("Failed to create screenplay", err);
      toast({
        title: "Error",
        description: "Failed to create screenplay",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (initialScreenplayId) {
      setScreenplayId(initialScreenplayId);
      loadScreenplayStructure(initialScreenplayId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreenplayId]);

  // Load favorite state for this screenplay when user or screenplay changes
  useEffect(() => {
    const loadFavorite = async () => {
      if (!user?.id || !screenplayId) {
        setIsFavorite(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}/favorites`);
        if (!res.ok) {
          setIsFavorite(false);
          return;
        }
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data)) {
          setIsFavorite(false);
          return;
        }
        const found = data.some(
          (item: any) => item.content_type === 'screenplay' && item.content_id === screenplayId,
        );
        setIsFavorite(found);
      } catch (err) {
        console.error('[ScreenplayTemplate] Failed to load favorite state', err);
        setIsFavorite(false);
      }
    };
    loadFavorite();
  }, [user?.id, screenplayId]);

  // Automatically mark this screenplay as "living" when opened by a logged-in user.
  useEffect(() => {
    const markLiving = async () => {
      if (!user?.id || !screenplayId) return;
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: "screenplay",
            screenplayId,
            isLiving: true,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('[ScreenplayTemplate] Failed to auto-mark screenplay as living', {
            status: res.status,
            body,
          });
        }
      } catch (err) {
        console.error('[ScreenplayTemplate] Failed to auto-mark screenplay as living', err);
      }
    };
    markLiving();
  }, [user?.id, screenplayId]);

  // (Reactions for screenplay title are handled by InteractionsWidget)

  const toggleFavorite = async () => {
    if (!user || !screenplayId) {
      toast({
        title: "Login required",
        description: "You must be logged in to favorite this screenplay.",
        variant: "destructive",
      });
      return;
    }
    if (favoriteLoading) return;
    const next = !isFavorite;
    setFavoriteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "screenplay",
          screenplayId,
          isFavorite: next,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[ScreenplayTemplate] Failed to toggle favorite', { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to update favorite state.",
          variant: "destructive",
        });
        return;
      }
      setIsFavorite(next);
    } catch (err) {
      console.error('[ScreenplayTemplate] Failed to toggle favorite', err);
      toast({
        title: "Error",
        description: "Failed to update favorite state.",
        variant: "destructive",
      });
    } finally {
      setFavoriteLoading(false);
    }
  };

  const markAsLived = async () => {
    if (!user || !screenplayId) {
      toast({
        title: "Login required",
        description: "You must be logged in to mark this screenplay as finished.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/story-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "screenplay",
          screenplayId,
          isLiving: false,
          isLived: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[ScreenplayTemplate] Failed to mark screenplay as lived', {
          status: res.status,
          body,
        });
        toast({
          title: "Error",
          description: body.error || "Failed to mark screenplay as lived.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Marked as finished",
        description: "This screenplay will now appear in your 'Lived / Experienced' list.",
      });
    } catch (err) {
      console.error('[ScreenplayTemplate] Failed to mark screenplay as lived', err);
      toast({
        title: "Error",
        description: "Failed to mark screenplay as lived.",
        variant: "destructive",
      });
    }
  };

  const handlePostComment = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "You must be logged in to comment.",
        variant: "destructive",
      });
      return;
    }
    if (!screenplayId || !newComment.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          screenplayId,
          body: newComment.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to post comment",
          variant: "destructive",
        });
        return;
      }
      setNewComment("");
      setComments((prev) => [...prev, body]);
    } catch (err) {
      console.error('[ScreenplayTemplate] Failed to post comment', err);
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    }
  };

  const handleSaveTitle = async () => {
    if (!screenplayId || savingTitle) return;
    const trimmed = title.trim();
    if (!trimmed) return;

    setSavingTitle(true);
    try {
      const res = await fetch(`${API_BASE}/screenplays/${screenplayId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to update screenplay title",
          variant: "destructive",
        });
        return;
      }
      setTitle(body.title ?? trimmed);
      toast({ title: "Title updated" });
    } catch (err) {
      console.error("Failed to update screenplay title", err);
      toast({
        title: "Error",
        description: "Failed to update screenplay title",
        variant: "destructive",
      });
    } finally {
      setSavingTitle(false);
    }
  };

  const handleUpdateScene = async (
    sceneId: string,
    partial: Partial<Pick<ScreenplayScene, "slugline" | "scene_index" | "location" | "time_of_day" | "is_interior" | "synopsis">>,
  ) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/screenplay-scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...partial,
          userId: user.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to update scene",
          variant: "destructive",
        });
        return;
      }
      setScenes((prev) =>
        prev.map((s) => (s.scene_id === sceneId ? { ...s, ...body } : s)),
      );
    } catch (err) {
      console.error("Failed to update scene", err);
      toast({
        title: "Error",
        description: "Failed to update scene",
        variant: "destructive",
      });
    }
  };

  const handleUpdateBlock = async (
    blockId: string,
    partial: Partial<Pick<ScreenplayBlock, "block_type" | "text">>,
  ) => {
    if (!screenplayId || !user) return;
    try {
      const res = await fetch(`${API_BASE}/screenplay-blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...partial,
          userId: user.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to update block",
          variant: "destructive",
        });
        return;
      }
      setBlocks((prev) =>
        prev.map((b) => (b.block_id === blockId ? { ...b, ...body } : b)),
      );
    } catch (err) {
      console.error("Failed to update screenplay block", err);
      toast({
        title: "Error",
        description: "Failed to update screenplay block",
        variant: "destructive",
      });
    }
  };

  const getMaxSceneIndex = () =>
    scenes.reduce((max, scene) => Math.max(max, scene.scene_index ?? 0), 0);

  const getMaxBlockIndex = () =>
    blocks.reduce((max, block) => Math.max(max, block.block_index ?? 0), 0);

  const handleAddScene = async () => {
    if (!screenplayId || !user) return;

    const nextIndex = (getMaxSceneIndex() || 0) + 1;

    try {
      const res = await fetch(`${API_BASE}/screenplays/${screenplayId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex: nextIndex,
          slugline: `INT. NEW SCENE ${nextIndex} - DAY`,
          userId: user.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to add scene",
          variant: "destructive",
        });
        return;
      }

      const newScene: ScreenplayScene = body;
      setScenes((prev) => [...prev, newScene]);

      // Best-effort: create an initial empty action block so the user can type
      // directly into the new scene. The backend requires non-empty text, so
      // we start with a single space which will be replaced by user input.
      const initialBlockIndex = (getMaxBlockIndex() || 0) + 1;
      try {
        const blockRes = await fetch(
          `${API_BASE}/screenplays/${screenplayId}/blocks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneId: newScene.scene_id,
              blockIndex: initialBlockIndex,
              blockType: "action",
              text: " ",
              userId: user.id,
            }),
          },
        );
        const blockBody = await blockRes.json().catch(() => ({}));
        if (!blockRes.ok) {
          console.error("Failed to create initial block for new scene", blockBody);
          return;
        }
        setBlocks((prev) => [...prev, blockBody as ScreenplayBlock]);
      } catch (err) {
        console.error("Failed to create initial block for new scene", err);
      }
    } catch (err) {
      console.error("Failed to add scene", err);
      toast({
        title: "Error",
        description: "Failed to add scene",
        variant: "destructive",
      });
    }
  };

  const handleDeleteScene = async (scene: ScreenplayScene) => {
    if (!scene.scene_id) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Delete this scene and all of its blocks? This cannot be undone.",
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/screenplay-scenes/${scene.scene_id}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: body.error || "Failed to delete scene",
          variant: "destructive",
        });
        return;
      }

      setScenes((prev) => prev.filter((s) => s.scene_id !== scene.scene_id));
      setBlocks((prev) => prev.filter((b) => b.scene_id !== scene.scene_id));
    } catch (err) {
      console.error("Failed to delete scene", err);
      toast({
        title: "Error",
        description: "Failed to delete scene",
        variant: "destructive",
      });
    }
  };

  const handleCloneScene = async (scene: ScreenplayScene) => {
    if (!screenplayId || !user || !scene.scene_id) return;

    const nextIndex = (getMaxSceneIndex() || 0) + 1;

    try {
      const res = await fetch(`${API_BASE}/screenplays/${screenplayId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex: nextIndex,
          slugline: `${scene.slugline} (copy)`.trim(),
          userId: user.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to clone scene",
          variant: "destructive",
        });
        return;
      }

      const newScene: ScreenplayScene = body;
      setScenes((prev) => [...prev, newScene]);

      const sourceBlocks = blocks.filter((b) => b.scene_id === scene.scene_id);
      if (sourceBlocks.length === 0) return;

      let currentIndex = getMaxBlockIndex() || 0;
      const createdBlocks: ScreenplayBlock[] = [];

      for (const block of sourceBlocks) {
        currentIndex += 1;
        try {
          const blockRes = await fetch(
            `${API_BASE}/screenplays/${screenplayId}/blocks`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sceneId: newScene.scene_id,
                blockIndex: currentIndex,
                blockType: block.block_type,
                text: block.text,
                metadata: block.metadata ?? null,
                userId: user.id,
              }),
            },
          );
          const blockBody = await blockRes.json().catch(() => ({}));
          if (!blockRes.ok) {
            console.error("Failed to clone block", blockBody);
            toast({
              title: "Error",
              description:
                (blockBody as { error?: string }).error ||
                "Failed to clone all blocks for the scene. Some blocks may be missing.",
              variant: "destructive",
            });
            break;
          }
          createdBlocks.push(blockBody as ScreenplayBlock);
        } catch (err) {
          console.error("Failed to clone block", err);
          toast({
            title: "Error",
            description:
              "Failed to clone all blocks for the scene. Some blocks may be missing.",
            variant: "destructive",
          });
          break;
        }
      }

      if (createdBlocks.length > 0) {
        setBlocks((prev) => [...prev, ...createdBlocks]);
      }
    } catch (err) {
      console.error("Failed to clone scene", err);
      toast({
        title: "Error",
        description: "Failed to clone scene",
        variant: "destructive",
      });
    }
  };

  const handleAddBlockToScene = async (scene: ScreenplayScene) => {
    if (!screenplayId || !user || !scene.scene_id) return;

    const sceneBlocks = blocks.filter((b) => b.scene_id === scene.scene_id);
    const nextIndex =
      sceneBlocks.reduce((max, b) => Math.max(max, b.block_index ?? 0), 0) + 1;

    try {
      const res = await fetch(`${API_BASE}/screenplays/${screenplayId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: scene.scene_id,
          blockIndex: nextIndex,
          blockType: "action",
          text: " ",
          userId: user.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to add element",
          variant: "destructive",
        });
        return;
      }
      setBlocks((prev) => [...prev, body as ScreenplayBlock]);
    } catch (err) {
      console.error("Failed to add block", err);
      toast({
        title: "Error",
        description: "Failed to add element",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBlock = async (block: ScreenplayBlock) => {
    if (!block.block_id) return;

    try {
      const res = await fetch(`${API_BASE}/screenplay-blocks/${block.block_id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Error",
          description: body.error || "Failed to delete element",
          variant: "destructive",
        });
        return;
      }
      setBlocks((prev) => prev.filter((b) => b.block_id !== block.block_id));
    } catch (err) {
      console.error("Failed to delete block", err);
      toast({
        title: "Error",
        description: "Failed to delete element",
        variant: "destructive",
      });
    }
  };

  const sortedScenes = [...scenes].sort(
    (a, b) => (a.scene_index ?? 0) - (b.scene_index ?? 0),
  );

  const blocksByScene = new Map<string | null, ScreenplayBlock[]>();
  for (const block of blocks) {
    const key = block.scene_id ?? "__none__";
    if (!blocksByScene.has(key)) {
      blocksByScene.set(key, []);
    }
    blocksByScene.get(key)!.push(block);
  }
  for (const [key, arr] of blocksByScene.entries()) {
    arr.sort((a, b) => a.block_index - b.block_index);
    blocksByScene.set(key, arr);
  }

  if (!user) {
    return (
      <div className="border rounded-lg bg-white p-4 text-sm text-gray-600">
        You must be logged in to create a screenplay.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex-1">
            <input
              type="text"
              className="w-full border-b border-dashed border-blue-300 px-1 py-0.5 text-2xl font-bold focus:outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveTitle}
              disabled={!canEdit || !screenplayId || savingTitle}
              placeholder="Enter screenplay title"
            />
          </div>
          {screenplayId && (
            <div className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap ml-2">
              <span>
                Screenplay ID{" "}
                <Link
                  to={`/screenplay/${screenplayId}`}
                  className="font-mono text-blue-600 hover:underline"
                >
                  {screenplayId}
                </Link>
              </span>
              <button
                type="button"
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                className="inline-flex items-center justify-center p-1 rounded-full border border-transparent hover:bg-pink-50 disabled:opacity-60"
              >
                <Heart
                  className={
                    isFavorite
                      ? "h-4 w-4 text-pink-500 fill-pink-500"
                      : "h-4 w-4 text-gray-400"
                  }
                />
              </button>
              {user && (
                <button
                  type="button"
                  onClick={markAsLived}
                  className="inline-flex items-center px-2 py-1 rounded-full border border-dashed border-teal-300 text-[11px] text-teal-700 hover:bg-teal-50 ml-2"
                >
                  Mark as finished
                </button>
              )}
            </div>
          )}
        </div>
        {screenplayId && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {/* Screenplay-level reactions + comments via shared widget */}
            <InteractionsWidget
              kind="screenplay"
              screenplayId={screenplayId}
              label="Screenplay comments"
            />
          </div>
        )}
      </div>

      {!screenplayId && (
        <div className="border rounded-lg bg-white p-6 flex flex-col items-start gap-3">
          <p className="text-sm text-gray-600">
            Start by creating a new screenplay. You will get an initial scene and a
            few sample elements that demonstrate the formatting.
          </p>
          <button
            type="button"
            onClick={handleCreateScreenplay}
            disabled={creating}
            className="px-4 py-2 text-sm rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
          >
            {creating ? "Creating screenplay..." : "Create screenplay from template"}
          </button>
        </div>
      )}

      {screenplayId && (
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Scenes</h2>
            <button
              type="button"
              onClick={handleAddScene}
              disabled={!canEdit || loading}
              className="px-3 py-1 text-xs rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              Add scene
            </button>
          </div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading screenplay...</div>
          ) : sortedScenes.length === 0 ? (
            <div className="text-sm text-gray-500">
              No scenes yet. Use the "Add scene" button above to create your first
              scene.
            </div>
          ) : (
            <div className="space-y-8 font-mono text-[13px]">
              {sortedScenes.map((scene) => {
                const key = scene.scene_id ?? "__none__";
                const sceneBlocks = blocksByScene.get(key) ?? [];
                return (
                  <section key={scene.scene_id} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="uppercase tracking-wide text-xs text-gray-500">
                          Scene {scene.scene_index}
                        </div>
                        <input
                          type="text"
                          className="font-bold bg-transparent border-b border-dashed border-gray-300 px-0.5 py-0.5 focus:outline-none text-sm"
                          value={scene.slugline}
                          onChange={(e) => {
                            const value = e.target.value;
                            setScenes((prev) =>
                              prev.map((s) =>
                                s.scene_id === scene.scene_id
                                  ? { ...s, slugline: value }
                                  : s,
                              ),
                            );
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            if (value === scene.slugline) return;
                            handleUpdateScene(scene.scene_id, { slugline: value });
                          }}
                          disabled={!canEdit}
                          placeholder="INT. LOCATION - TIME"
                        />
                      </div>
                      <div className="flex gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleCloneScene(scene)}
                          className="px-2 py-0.5 border border-dashed border-gray-300 rounded-full hover:bg-gray-50"
                        >
                          Clone
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteScene(scene)}
                          className="px-2 py-0.5 border border-dashed border-red-300 text-red-600 rounded-full hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 mt-2">
                      {sceneBlocks.map((block) => {
                        const typeDef =
                          BLOCK_TYPE_LABELS.find(
                            (t) => t.value === block.block_type,
                          ) ?? BLOCK_TYPE_LABELS.find((t) => t.value === "action");
                        const label = typeDef?.label ?? block.block_type;

                        return (
                          <div
                            key={block.block_id}
                            className="flex flex-col gap-1 border-b border-dashed border-gray-200 pb-2"
                          >
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              <span className="uppercase tracking-wide">{label}</span>
                              <select
                                className="border rounded px-1 py-0.5 text-[11px] bg-white"
                                value={block.block_type}
                                onChange={(e) => {
                                  const newType = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) =>
                                      b.block_id === block.block_id
                                        ? { ...b, block_type: newType }
                                        : b,
                                    ),
                                  );
                                  handleUpdateBlock(block.block_id, {
                                    block_type: newType,
                                  });
                                }}
                              >
                                {BLOCK_TYPE_LABELS.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteBlock(block)}
                                disabled={!canEdit}
                                className="ml-auto px-2 py-0.5 border border-dashed border-red-200 text-red-600 rounded-full hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                            <textarea
                              className="w-full resize-none border-none bg-transparent focus:outline-none leading-relaxed"
                              rows={Math.max(1, Math.min(6, block.text.split(/\n/).length))}
                              value={block.text}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBlocks((prev) =>
                                  prev.map((b) =>
                                    b.block_id === block.block_id
                                      ? { ...b, text: value }
                                      : b,
                                  ),
                                );
                              }}
                              onBlur={(e) => {
                                const value = e.target.value;
                                handleUpdateBlock(block.block_id, { text: value });
                              }}
                            />
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleAddBlockToScene(scene)}
                        disabled={!canEdit}
                        className="mt-2 inline-flex items-center px-3 py-1 text-[11px] rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Add element
                      </button>
                      {/* Scene-specific comments */}
                      <div className="mt-4 border-t pt-3">
                        <h4 className="text-[11px] font-semibold mb-1">Scene comments</h4>
                        <SceneComments sceneId={scene.scene_id} screenplayId={screenplayId} />
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScreenplayTemplate;
