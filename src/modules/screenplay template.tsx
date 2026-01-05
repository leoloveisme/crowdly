import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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
            <div className="text-xs text-gray-500 whitespace-nowrap ml-2">
              Screenplay ID:{" "}
              <Link
                to={`/screenplay/${screenplayId}`}
                className="font-mono text-blue-600 hover:underline"
              >
                {screenplayId}
              </Link>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          This template uses standard screenplay elements (scene headings, action,
          character, dialogue, parentheticals, transitions, shots).
        </p>
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
          {loading ? (
            <div className="text-sm text-gray-500">Loading screenplay...</div>
          ) : sortedScenes.length === 0 ? (
            <div className="text-sm text-gray-500">
              No scenes yet. Future versions of this editor will let you add and
              reorder scenes.
            </div>
          ) : (
            <div className="space-y-8 font-mono text-[13px]">
              {sortedScenes.map((scene) => {
                const key = scene.scene_id ?? "__none__";
                const sceneBlocks = blocksByScene.get(key) ?? [];
                return (
                  <section key={scene.scene_id} className="space-y-3">
                    <div className="uppercase tracking-wide text-xs text-gray-500">
                      Scene {scene.scene_index}
                    </div>
                    <div className="font-bold">
                      {scene.slugline}
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
