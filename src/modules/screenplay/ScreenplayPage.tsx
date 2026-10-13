import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock, Film, ListOrdered, Users } from "lucide-react";
import EditableText from "@/components/EditableText";
import ChapterSidebar, { type ChapterSidebarMode } from "@/components/story/ChapterSidebar";
import { sidebarLabelsFor } from "@/components/story/sidebarLabels";
import type { StoryChapter } from "@/components/story/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import WorkHeader, { type PageMode } from "@/components/work/WorkHeader";
import WorkSettings from "@/components/work/WorkSettings";
import WorkSummary from "@/components/work/WorkSummary";
import WorkContributeSection from "@/components/work/WorkContributeSection";
import { WorkContributorsList, WorkTabs, type WorkTab } from "@/components/work/WorkTabs";
import InteractionsWidget from "@/modules/InteractionsWidget";
import CollaborationRequestsPanel from "@/modules/CollaborationRequestsPanel";
import { ExportDialog } from "@/modules/import-export";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ApiError, errorMessage } from "@/lib/apiBase";
import { getWorkAccess, updateWorkSettings, type WorkAccess } from "@/lib/workApi";
import {
  createBlock,
  createScene,
  deleteBlock,
  deleteScene,
  getScreenplay,
  getScreenplayStructure,
  reorderScenes,
  setScenePublished,
  updateBlock,
  updateScene,
  type ScreenplayBlock,
  type ScreenplayScene,
  type ScreenplayTitle,
} from "@/lib/screenplayApi";
import ScreenplayReader from "./ScreenplayReader";
import ScreenplayEditor from "./ScreenplayEditor";
import ScreenplayRevisions from "./ScreenplayRevisions";
import { screenplayToHtml, screenplayToMarkdown } from "./exportContent";

type TabKey = "screenplay" | "contributors" | "revisions";

const SCENE_LABELS = sidebarLabelsFor("screenplay", "scene", "scenes");

const FORMAT_LABELS: Record<string, string> = {
  feature_film: "Feature film",
  short_film: "Short film",
  tv_episode: "TV episode",
  web_series: "Web series",
  stage_play: "Stage play",
};

interface ScreenplayPageProps {
  screenplayId: string;
  sceneId?: string;
}

/**
 * /screenplay/:id — the story page's layout for screenplays: tabs, header
 * with Viewing/Editing and Settings, a scenes sidebar, and one scene at a
 * time in the reader (formatted) or the editor.
 */
const ScreenplayPage: React.FC<ScreenplayPageProps> = ({ screenplayId, sceneId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [screenplay, setScreenplay] = useState<ScreenplayTitle | null>(null);
  const [scenes, setScenes] = useState<ScreenplayScene[]>([]);
  const [blocks, setBlocks] = useState<ScreenplayBlock[]>([]);
  const [access, setAccess] = useState<WorkAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("screenplay");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<ChapterSidebarMode>("view");
  const [mobileScenesOpen, setMobileScenesOpen] = useState(false);

  const isTeam = !!access?.explicit;
  const isOwner = !!access?.isOwner;
  const pageMode: PageMode = isTeam && searchParams.get("mode") === "edit" ? "edit" : "view";
  const editing = pageMode === "edit";

  const setPageMode = (mode: PageMode) => {
    const next = new URLSearchParams(searchParams);
    if (mode === "edit") next.set("mode", "edit");
    else next.delete("mode");
    setSearchParams(next, { replace: true });
    setSidebarMode(mode === "edit" ? "edit" : "view");
  };

  const loadStructure = useCallback(async () => {
    const data = await getScreenplayStructure(screenplayId);
    setScenes(data.scenes ?? []);
    setBlocks(data.blocks ?? []);
  }, [screenplayId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, myAccess] = await Promise.all([getScreenplay(screenplayId), getWorkAccess("screenplay", screenplayId)]);
      setScreenplay(meta);
      setAccess(myAccess);
      await loadStructure();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 403 || err.status === 404)
          ? err.message
          : errorMessage(err) || "Failed to load screenplay",
      );
    } finally {
      setLoading(false);
    }
  }, [screenplayId, loadStructure]);

  useEffect(() => {
    load();
    // Reload when the viewer signs in or out: access and drafts differ.
  }, [load, user?.id]);

  useEffect(() => {
    if (editing) setSidebarMode("edit");
  }, [editing]);

  const sortedScenes = useMemo(
    () => [...scenes].sort((a, b) => (a.scene_index ?? 0) - (b.scene_index ?? 0)),
    [scenes],
  );
  const currentIndex = Math.max(
    0,
    sortedScenes.findIndex((s) => s.scene_id === sceneId),
  );
  const currentScene = sortedScenes[currentIndex] ?? null;
  const currentBlocks = useMemo(
    () =>
      currentScene
        ? blocks.filter((b) => b.scene_id === currentScene.scene_id).sort((a, b) => a.block_index - b.block_index)
        : [],
    [blocks, currentScene],
  );

  const fail = (err: unknown, fallback: string) =>
    toast({ title: "Error", description: errorMessage(err) || fallback, variant: "destructive" });

  const selectScene = (id: string) => {
    setMobileScenesOpen(false);
    const query = searchParams.toString();
    navigate(`/screenplay/${screenplayId}/scene/${id}${query ? `?${query}` : ""}`);
  };

  // --- scenes (sidebar) -----------------------------------------------------

  const applySceneOrder = async (ordered: ScreenplayScene[]) => {
    setScenes(ordered.map((s, i) => ({ ...s, scene_index: i + 1 })));
    try {
      await reorderScenes(screenplayId, ordered.map((s) => s.scene_id));
      return true;
    } catch (err) {
      fail(err, "Failed to reorder scenes");
      await loadStructure();
      return false;
    }
  };

  const moveScene = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= sortedScenes.length) return;
    const previous = sortedScenes;
    const next = [...sortedScenes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    if (!(await applySceneOrder(next))) return;
    toast({
      title: "Scene moved",
      description: `"${moved.slugline || "Untitled scene"}" is now scene ${to + 1}.`,
      action: (
        <ToastAction altText="Undo scene move" onClick={() => applySceneOrder(previous)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const saveScene = async (scene: ScreenplayScene, patch: { slugline?: string; synopsis?: string | null }) => {
    try {
      const updated = await updateScene(scene.scene_id, patch);
      setScenes((prev) => prev.map((s) => (s.scene_id === scene.scene_id ? { ...s, ...updated } : s)));
    } catch (err) {
      fail(err, "Failed to update scene");
    }
  };

  const toggleScenePublished = async (scene: ScreenplayScene) => {
    try {
      const updated = await setScenePublished(scene.scene_id, scene.published === false);
      setScenes((prev) => prev.map((s) => (s.scene_id === scene.scene_id ? { ...s, ...updated } : s)));
    } catch (err) {
      fail(err, "Failed to update scene");
    }
  };

  const removeScene = async (id: string) => {
    try {
      await deleteScene(id);
      setScenes((prev) => prev.filter((s) => s.scene_id !== id));
      setBlocks((prev) => prev.filter((b) => b.scene_id !== id));
      if (id === currentScene?.scene_id) navigate(`/screenplay/${screenplayId}${editing ? "?mode=edit" : ""}`);
    } catch (err) {
      fail(err, "Failed to delete scene");
    }
  };

  // New scene at the end, or right after `afterSceneId`, with one starter element.
  const insertScene = async (afterSceneId: string | null, copyOf?: ScreenplayScene) => {
    try {
      const created = await createScene(screenplayId, {
        sceneIndex: sortedScenes.length + 1,
        slugline: copyOf ? `${copyOf.slugline} (copy)` : `INT. NEW SCENE ${sortedScenes.length + 1} - DAY`,
        synopsis: copyOf?.synopsis ?? null,
      });
      const sourceBlocks = copyOf
        ? blocks.filter((b) => b.scene_id === copyOf.scene_id).sort((a, b) => a.block_index - b.block_index)
        : [{ block_type: "action", text: " ", metadata: null } as ScreenplayBlock];
      let index = 1;
      for (const b of sourceBlocks) {
        await createBlock(screenplayId, {
          sceneId: created.scene_id,
          blockIndex: index++,
          blockType: b.block_type,
          text: b.text || " ",
          metadata: b.metadata ?? null,
        });
      }
      if (afterSceneId && isOwner) {
        const order = sortedScenes.map((s) => s.scene_id);
        order.splice(order.indexOf(afterSceneId) + 1, 0, created.scene_id);
        await reorderScenes(screenplayId, order);
      }
      await loadStructure();
      selectScene(created.scene_id);
    } catch (err) {
      fail(err, "Failed to add scene");
    }
  };

  // --- elements (editor) ----------------------------------------------------

  const saveBlock = async (block: ScreenplayBlock, patch: { text?: string; blockType?: string }) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.block_id === block.block_id
          ? { ...b, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.blockType ? { block_type: patch.blockType } : {}) }
          : b,
      ),
    );
    try {
      await updateBlock(block.block_id, patch);
    } catch (err) {
      fail(err, "Failed to save");
      await loadStructure();
    }
  };

  const addBlock = async (after: ScreenplayBlock | null, blockType: string) => {
    if (!currentScene) return;
    try {
      await createBlock(screenplayId, {
        sceneId: currentScene.scene_id,
        blockIndex: (currentBlocks[currentBlocks.length - 1]?.block_index ?? 0) + 1,
        blockType,
        text: " ",
        afterBlockId: after?.block_id ?? null,
      });
      await loadStructure();
    } catch (err) {
      fail(err, "Failed to add element");
    }
  };

  const removeBlock = async (block: ScreenplayBlock) => {
    try {
      await deleteBlock(block.block_id);
      setBlocks((prev) => prev.filter((b) => b.block_id !== block.block_id));
    } catch (err) {
      fail(err, "Failed to delete element");
    }
  };

  const saveTitle = async (title: string) => {
    try {
      const updated = await updateWorkSettings<ScreenplayTitle>("screenplay", screenplayId, { title });
      setScreenplay((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      fail(err, "Failed to update title");
    }
  };

  // --- render ---------------------------------------------------------------

  if (loading && !screenplay) {
    return <EditableText id="screenplay-loading" as="p" className="text-sm text-gray-500">Loading screenplay...</EditableText>;
  }
  if (error || !screenplay) {
    return <div className="border rounded-lg bg-white p-4 text-sm text-gray-600">{error ?? "Screenplay not found"}</div>;
  }

  // The sidebar speaks "chapters"; scenes map onto that shape.
  const sidebarItems: StoryChapter[] = sortedScenes.map((s) => ({
    chapter_id: s.scene_id,
    chapter_title: s.slugline,
    paragraphs: [],
    published: s.published !== false,
  }));
  const sceneById = (id: string) => sortedScenes.find((s) => s.scene_id === id);

  const sidebar = (
    <ChapterSidebar
      chapters={sidebarItems}
      currentChapterId={currentScene?.scene_id ?? null}
      onSelect={selectScene}
      canEdit={isTeam}
      isOwner={isOwner}
      mode={sidebarMode}
      onModeChange={setSidebarMode}
      onMove={moveScene}
      onRename={(item, slugline) => {
        const scene = sceneById(item.chapter_id);
        if (scene) saveScene(scene, { slugline });
      }}
      onTogglePublish={(item) => {
        const scene = sceneById(item.chapter_id);
        if (scene) toggleScenePublished(scene);
      }}
      onDelete={removeScene}
      onInsertAfter={(afterId) => insertScene(afterId)}
      labels={SCENE_LABELS}
    />
  );

  const tabs: WorkTab<TabKey>[] = [
    { key: "screenplay", icon: <Film size={18} />, label: <EditableText id="screenplay-tab-screenplay">Screenplay</EditableText> },
    { key: "contributors", icon: <Users size={18} />, label: <EditableText id="screenplay-tab-contributors">Contributors</EditableText> },
    { key: "revisions", icon: <Clock size={18} />, label: <EditableText id="screenplay-tab-revisions">Revisions</EditableText> },
  ];

  const formatLabel = screenplay.format_type ? FORMAT_LABELS[screenplay.format_type] ?? screenplay.format_type : null;

  return (
    <div className="space-y-6">
      <WorkTabs<TabKey> tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "screenplay" && (
        <div className="space-y-6">
          <WorkHeader
            kind="screenplay"
            workId={screenplayId}
            title={screenplay.title}
            visibility={screenplay.visibility}
            published={screenplay.published}
            completionStatus={screenplay.completion_status}
            isTeam={isTeam}
            isOwner={isOwner}
            isAdmin={!!access?.isAdmin}
            canClone={screenplay.can_clone !== false}
            canExport={screenplay.can_export !== false}
            pageMode={pageMode}
            onPageModeChange={setPageMode}
            onSaveTitle={saveTitle}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={() => setExportOpen(true)}
            extraBadges={
              formatLabel && (
                <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">{formatLabel}</span>
              )
            }
          >
            {isOwner && <CollaborationRequestsPanel work={{ kind: "screenplay", id: screenplayId }} onChanged={load} />}
          </WorkHeader>

          <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
            <aside className="hidden lg:block">
              <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pb-4">{sidebar}</div>
            </aside>

            <div className="min-w-0 max-w-3xl space-y-6">
              <WorkSummary
                kind="screenplay"
                coverUrl={screenplay.cover_image_url}
                description={screenplay.description}
                tags={screenplay.tags}
                onEditCover={editing && isOwner ? () => setSettingsOpen(true) : undefined}
              />

              {!editing && <InteractionsWidget kind="screenplay" screenplayId={screenplayId} label="Screenplay comments" />}

              {sortedScenes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMobileScenesOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-gray-600 bg-white hover:bg-gray-50"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  <EditableText id={SCENE_LABELS.heading.id}>{SCENE_LABELS.heading.text}</EditableText>
                  <span>({sortedScenes.length})</span>
                </button>
              )}

              {!currentScene ? (
                <div className="text-sm text-gray-500 space-y-3">
                  <EditableText id="screenplay-no-scenes" as="p">No scenes yet.</EditableText>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => insertScene(null)}
                      className="px-3 py-1 text-xs rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <EditableText id={SCENE_LABELS.add.id}>{SCENE_LABELS.add.text}</EditableText>
                    </button>
                  )}
                </div>
              ) : editing ? (
                <ScreenplayEditor
                  scene={currentScene}
                  sceneNumber={currentIndex + 1}
                  blocks={currentBlocks}
                  canDeleteBlocks={isTeam}
                  onSaveScene={(patch) => saveScene(currentScene, patch)}
                  onSaveBlock={saveBlock}
                  onAddBlock={addBlock}
                  onDeleteBlock={removeBlock}
                  onCloneScene={() => insertScene(currentScene.scene_id, currentScene)}
                />
              ) : (
                <ScreenplayReader
                  scene={currentScene}
                  sceneNumber={currentIndex + 1}
                  sceneCount={sortedScenes.length}
                  blocks={currentBlocks}
                  onPrev={() => currentIndex > 0 && selectScene(sortedScenes[currentIndex - 1].scene_id)}
                  onNext={() =>
                    currentIndex < sortedScenes.length - 1 && selectScene(sortedScenes[currentIndex + 1].scene_id)
                  }
                >
                  <InteractionsWidget
                    kind="scene"
                    screenplayId={screenplayId}
                    sceneId={currentScene.scene_id}
                    label="Scene comments"
                  />
                </ScreenplayReader>
              )}

              {!isTeam && !editing && <WorkContributeSection kind="screenplay" workId={screenplayId} />}
            </div>
          </div>

          <Sheet open={mobileScenesOpen} onOpenChange={setMobileScenesOpen}>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  <EditableText id={SCENE_LABELS.heading.id}>{SCENE_LABELS.heading.text}</EditableText>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">{sidebar}</div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {activeTab === "contributors" && <WorkContributorsList kind="screenplay" workId={screenplayId} />}

      {activeTab === "revisions" && <ScreenplayRevisions screenplayId={screenplayId} scenes={sortedScenes} />}

      {isOwner && (
        <WorkSettings<ScreenplayTitle>
          kind="screenplay"
          workId={screenplayId}
          work={screenplay}
          onWorkChange={setScreenplay}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onOwnershipTransferred={load}
          extraDetails={
            <div className="flex items-center justify-between gap-3 text-sm">
              <EditableText id="screenplay-settings-format">Format</EditableText>
              <select
                value={screenplay.format_type ?? ""}
                onChange={(e) =>
                  updateWorkSettings<ScreenplayTitle>("screenplay", screenplayId, { format_type: e.target.value || null })
                    .then((updated) => setScreenplay((prev) => (prev ? { ...prev, ...updated } : prev)))
                    .catch((err) => fail(err, "Failed to save"))
                }
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                <option value="">—</option>
                {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        getContentHtml={() => screenplayToHtml(screenplay.title, sortedScenes, blocks)}
        getContentMarkdown={() => screenplayToMarkdown(screenplay.title, sortedScenes, blocks)}
        getTitle={() => screenplay.title || "Untitled Screenplay"}
        contentType="screenplay"
        contentId={screenplayId}
      />
    </div>
  );
};

export default ScreenplayPage;
