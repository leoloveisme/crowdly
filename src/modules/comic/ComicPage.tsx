import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookImage, Clock, ListOrdered, Users } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ApiError, errorMessage } from "@/lib/apiBase";
import { getWorkAccess, updateWorkSettings, type WorkAccess } from "@/lib/workApi";
import {
  createComicIssue,
  deleteComicIssue,
  deleteComicPage,
  getComic,
  renameComicIssue,
  reorderComicIssues,
  reorderComicPages,
  setComicIssuePublished,
  updateComicPage,
  uploadComicPages,
  type ComicIssue,
  type ComicPage as ComicPageRow,
  type ComicWithPages,
} from "@/lib/comicsApi";
import ComicReader from "./ComicReader";
import ComicEditor from "./ComicEditor";
import ComicExportDialog from "./ComicExportDialog";

type TabKey = "comic" | "contributors" | "revisions";

const ISSUE_LABELS = sidebarLabelsFor("comic", "issue", "issues");

interface ComicPageProps {
  comicId: string;
  issueId?: string;
}

/**
 * /comic/:id — the story page's layout for comics: tabs, header with
 * Viewing/Editing and Settings, an issues sidebar, and the current issue in
 * the page reader or the page editor.
 */
const ComicPage: React.FC<ComicPageProps> = ({ comicId, issueId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [comic, setComic] = useState<ComicWithPages | null>(null);
  const [access, setAccess] = useState<WorkAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("comic");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<ChapterSidebarMode>("view");
  const [mobileIssuesOpen, setMobileIssuesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const reloadComic = useCallback(async () => {
    setComic(await getComic(comicId));
  }, [comicId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, myAccess] = await Promise.all([getComic(comicId), getWorkAccess("comic", comicId)]);
      setComic(data);
      setAccess(myAccess);
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 403 || err.status === 404)
          ? err.message
          : errorMessage(err) || "Failed to load comic",
      );
    } finally {
      setLoading(false);
    }
  }, [comicId]);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  useEffect(() => {
    if (editing) setSidebarMode("edit");
  }, [editing]);

  const issues = useMemo(
    () => [...(comic?.issues ?? [])].sort((a, b) => a.issue_index - b.issue_index),
    [comic?.issues],
  );
  const currentIndex = Math.max(
    0,
    issues.findIndex((i) => i.issue_id === issueId),
  );
  const currentIssue = issues[currentIndex] ?? null;
  const currentPages = useMemo(
    () =>
      currentIssue
        ? (comic?.pages ?? [])
            .filter((p) => p.issue_id === currentIssue.issue_id)
            .sort((a, b) => a.page_index - b.page_index)
        : [],
    [comic?.pages, currentIssue],
  );

  const fail = (err: unknown, fallback: string) =>
    toast({ title: "Error", description: errorMessage(err) || fallback, variant: "destructive" });

  const selectIssue = (id: string) => {
    setMobileIssuesOpen(false);
    const query = searchParams.toString();
    navigate(`/comic/${comicId}/issue/${id}${query ? `?${query}` : ""}`);
  };

  // --- issues (sidebar) -----------------------------------------------------

  const applyIssueOrder = async (ordered: ComicIssue[]) => {
    setComic((prev) => (prev ? { ...prev, issues: ordered.map((i, n) => ({ ...i, issue_index: n })) } : prev));
    try {
      await reorderComicIssues(comicId, ordered.map((i) => i.issue_id));
      return true;
    } catch (err) {
      fail(err, "Failed to reorder issues");
      await reloadComic();
      return false;
    }
  };

  const moveIssue = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= issues.length) return;
    const previous = issues;
    const next = [...issues];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    if (!(await applyIssueOrder(next))) return;
    toast({
      title: "Issue moved",
      description: `"${moved.title || "Untitled issue"}" is now issue ${to + 1}.`,
      action: (
        <ToastAction altText="Undo issue move" onClick={() => applyIssueOrder(previous)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const updateIssue = (updated: ComicIssue) =>
    setComic((prev) =>
      prev ? { ...prev, issues: prev.issues.map((i) => (i.issue_id === updated.issue_id ? { ...i, ...updated } : i)) } : prev,
    );

  const insertIssue = async (afterId: string | null) => {
    try {
      const created = await createComicIssue(comicId, `Issue ${issues.length + 1}`, afterId);
      await reloadComic();
      selectIssue(created.issue_id);
    } catch (err) {
      fail(err, "Failed to add issue");
    }
  };

  const removeIssue = async (id: string) => {
    try {
      await deleteComicIssue(id);
      await reloadComic();
      if (id === currentIssue?.issue_id) navigate(`/comic/${comicId}${editing ? "?mode=edit" : ""}`);
    } catch (err) {
      fail(err, "Failed to delete issue");
    }
  };

  // --- pages (editor) -------------------------------------------------------

  const applyPageOrder = async (ordered: ComicPageRow[]) => {
    setComic((prev) => {
      if (!prev) return prev;
      const others = prev.pages.filter((p) => p.issue_id !== currentIssue?.issue_id);
      return { ...prev, pages: [...others, ...ordered.map((p, i) => ({ ...p, page_index: i }))] };
    });
    try {
      await reorderComicPages(comicId, ordered.map((p) => p.page_id));
      return true;
    } catch (err) {
      fail(err, "Failed to reorder pages");
      await reloadComic();
      return false;
    }
  };

  const movePage = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= currentPages.length) return;
    const previous = currentPages;
    const next = [...currentPages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    if (!(await applyPageOrder(next))) return;
    toast({
      title: "Page moved",
      description: `Now page ${to + 1} of ${currentPages.length}.`,
      action: (
        <ToastAction altText="Undo page move" onClick={() => applyPageOrder(previous)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      await uploadComicPages(comicId, files, currentIssue?.issue_id);
      await reloadComic();
    } catch (err) {
      fail(err, "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removePage = async (page: ComicPageRow, pageNumber: number) => {
    if (!window.confirm(`Delete page ${pageNumber}? This can't be undone.`)) return;
    try {
      await deleteComicPage(page.page_id);
      await reloadComic();
    } catch (err) {
      fail(err, "Failed to delete page");
    }
  };

  const saveAltText = async (page: ComicPageRow, altText: string) => {
    try {
      const updated = await updateComicPage(page.page_id, { alt_text: altText || null });
      setComic((prev) =>
        prev ? { ...prev, pages: prev.pages.map((p) => (p.page_id === page.page_id ? { ...p, ...updated } : p)) } : prev,
      );
    } catch (err) {
      fail(err, "Failed to save");
    }
  };

  const saveTitle = async (title: string) => {
    try {
      const updated = await updateWorkSettings<ComicWithPages>("comic", comicId, { title });
      setComic((prev) => (prev ? { ...prev, ...updated, issues: prev.issues, pages: prev.pages } : prev));
    } catch (err) {
      fail(err, "Failed to update title");
    }
  };

  // --- render ---------------------------------------------------------------

  if (loading && !comic) {
    return <EditableText id="comic-reader-loading" as="div" className="text-sm text-gray-500">Loading comic...</EditableText>;
  }
  if (error || !comic) {
    return <div className="border rounded-lg bg-white p-4 text-sm text-gray-600">{error ?? "Comic not found"}</div>;
  }

  const isRtl = comic.reading_direction === "rtl";
  const sidebarItems: StoryChapter[] = issues.map((i) => ({
    chapter_id: i.issue_id,
    chapter_title: i.title,
    paragraphs: [],
    published: i.published !== false,
  }));
  const issueById = (id: string) => issues.find((i) => i.issue_id === id);

  const sidebar = (
    <ChapterSidebar
      chapters={sidebarItems}
      currentChapterId={currentIssue?.issue_id ?? null}
      onSelect={selectIssue}
      canEdit={isTeam}
      isOwner={isOwner}
      mode={sidebarMode}
      onModeChange={setSidebarMode}
      onMove={moveIssue}
      onRename={(item, title) =>
        renameComicIssue(item.chapter_id, title)
          .then(updateIssue)
          .catch((err) => fail(err, "Failed to rename issue"))
      }
      onTogglePublish={(item) => {
        const issue = issueById(item.chapter_id);
        if (issue) {
          setComicIssuePublished(issue.issue_id, issue.published === false)
            .then(updateIssue)
            .catch((err) => fail(err, "Failed to update issue"));
        }
      }}
      onDelete={removeIssue}
      onInsertAfter={insertIssue}
      labels={ISSUE_LABELS}
    />
  );

  const tabs: WorkTab<TabKey>[] = [
    { key: "comic", icon: <BookImage size={18} />, label: <EditableText id="comic-tab-comic">Comic</EditableText> },
    { key: "contributors", icon: <Users size={18} />, label: <EditableText id="comic-tab-contributors">Contributors</EditableText> },
  ];

  const showSidebar = issues.length > 1 || editing;

  return (
    <div className="space-y-6">
      <WorkTabs<TabKey> tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "comic" && (
        <div className="space-y-6">
          <WorkHeader
            kind="comic"
            workId={comicId}
            title={comic.title}
            visibility={comic.visibility}
            published={comic.published}
            completionStatus={comic.completion_status}
            isTeam={isTeam}
            isOwner={isOwner}
            isAdmin={!!access?.isAdmin}
            canClone={comic.can_clone !== false}
            canExport={comic.can_export !== false}
            pageMode={pageMode}
            onPageModeChange={setPageMode}
            onSaveTitle={saveTitle}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={() => setExportOpen(true)}
            extraBadges={
              <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                {isRtl ? (
                  <EditableText id="comic-reader-rtl-badge">Right to left</EditableText>
                ) : (
                  <EditableText id="comic-reader-ltr-badge">Left to right</EditableText>
                )}
              </span>
            }
          >
            {isOwner && <CollaborationRequestsPanel work={{ kind: "comic", id: comicId }} onChanged={load} />}
          </WorkHeader>

          <div className={showSidebar ? "lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8" : ""}>
            {showSidebar && (
              <aside className="hidden lg:block">
                <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pb-4">{sidebar}</div>
              </aside>
            )}

            <div className="min-w-0 space-y-6">
              <WorkSummary
                kind="comic"
                coverUrl={comic.cover_image_url}
                description={comic.description}
                tags={comic.tags}
                onEditCover={editing && isOwner ? () => setSettingsOpen(true) : undefined}
              />

              {!editing && <InteractionsWidget kind="comic" comicId={comicId} label="Comic comments" />}

              {showSidebar && (
                <button
                  type="button"
                  onClick={() => setMobileIssuesOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded border text-xs text-gray-600 bg-white hover:bg-gray-50"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  <EditableText id={ISSUE_LABELS.heading.id}>{ISSUE_LABELS.heading.text}</EditableText>
                  <span>({issues.length})</span>
                </button>
              )}

              {currentIssue && issues.length > 1 && (
                <h2 className="text-lg font-semibold">
                  <span className="text-gray-400 mr-2">{currentIndex + 1}.</span>
                  {currentIssue.title || <EditableText id={ISSUE_LABELS.untitled.id}>{ISSUE_LABELS.untitled.text}</EditableText>}
                </h2>
              )}

              {!currentIssue ? (
                <EditableText id="comic-no-issues" as="p" className="text-sm text-gray-500">No issues yet.</EditableText>
              ) : editing ? (
                <ComicEditor
                  pages={currentPages}
                  isRtl={isRtl}
                  canManagePages={isTeam}
                  uploading={uploading}
                  onUpload={upload}
                  onMove={movePage}
                  onDelete={removePage}
                  onSaveAltText={saveAltText}
                />
              ) : (
                <>
                  <ComicReader pages={currentPages} isRtl={isRtl} resetKey={currentIssue.issue_id} />
                  {issues.length > 1 && (
                    <div className="flex justify-between text-sm">
                      <button
                        type="button"
                        disabled={currentIndex === 0}
                        onClick={() => selectIssue(issues[currentIndex - 1].issue_id)}
                        className="text-blue-700 hover:underline disabled:opacity-30 disabled:no-underline"
                      >
                        ‹ <EditableText id="comic-issue-prev">Previous issue</EditableText>
                      </button>
                      <button
                        type="button"
                        disabled={currentIndex === issues.length - 1}
                        onClick={() => selectIssue(issues[currentIndex + 1].issue_id)}
                        className="text-blue-700 hover:underline disabled:opacity-30 disabled:no-underline"
                      >
                        <EditableText id="comic-issue-next">Next issue</EditableText> ›
                      </button>
                    </div>
                  )}
                  <InteractionsWidget
                    kind="issue"
                    comicId={comicId}
                    issueId={currentIssue.issue_id}
                    label="Issue comments"
                  />
                </>
              )}

              {!isTeam && !editing && <WorkContributeSection kind="comic" workId={comicId} />}
            </div>
          </div>

          <Sheet open={mobileIssuesOpen} onOpenChange={setMobileIssuesOpen}>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  <EditableText id={ISSUE_LABELS.heading.id}>{ISSUE_LABELS.heading.text}</EditableText>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">{sidebar}</div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {activeTab === "contributors" && <WorkContributorsList kind="comic" workId={comicId} />}

      {isOwner && (
        <WorkSettings<ComicWithPages>
          kind="comic"
          workId={comicId}
          work={comic}
          onWorkChange={(updated) => setComic((prev) => (prev ? { ...prev, ...updated, issues: prev.issues, pages: prev.pages } : prev))}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onOwnershipTransferred={load}
          extraDetails={
            <div className="flex items-center justify-between gap-3 text-sm">
              <EditableText id="comic-settings-direction">Reading direction</EditableText>
              <select
                value={comic.reading_direction}
                onChange={(e) =>
                  updateWorkSettings<ComicWithPages>("comic", comicId, {
                    reading_direction: e.target.value === "rtl" ? "rtl" : "ltr",
                  })
                    .then((updated) =>
                      setComic((prev) => (prev ? { ...prev, ...updated, issues: prev.issues, pages: prev.pages } : prev)),
                    )
                    .catch((err) => fail(err, "Failed to save"))
                }
                className="border rounded px-2 py-1 text-xs bg-white"
              >
                <option value="ltr">Left to right</option>
                <option value="rtl">Right to left (manga)</option>
              </select>
            </div>
          }
        />
      )}

      <ComicExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={comic.title}
        issues={issues}
        pages={comic.pages}
      />
    </div>
  );
};

export default ComicPage;
