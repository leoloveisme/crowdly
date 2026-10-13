import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import { useLocation, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { uploadGalleryImages } from "@/lib/galleryApi";
import { ListTree, GitBranch, ExternalLink, Inbox, MessageSquare, PencilLine, Users, Film } from "lucide-react";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { platformLink } from "@web/lib/api";
import { countParagraphs, countWords } from "@web/lib/text";
import {
  applyCrdtContent,
  createChapter,
  deleteChapter,
  ensureCrdtDoc,
  getChapters,
  getMyAccess,
  getStory,
  listBranches,
  publishChapter,
  renameStory,
  reorderChapters,
  saveChapter,
  updateStorySettings,
  type Branch,
  type Chapter,
  type StoryRole,
  type StoryTitle,
} from "@web/lib/story";
import { DualPaneEditor, type DualPaneHandle } from "../DualPaneEditor";
import { joinParagraphs, mdToPlain, splitParagraphs } from "../markdown";
import { RevisionsDialog } from "../RevisionsDialog";
import { ChapterList } from "./ChapterList";
import { BranchesPanel } from "./BranchesPanel";
import { StoryMetadataDialog, type MetadataValue } from "./StoryMetadataDialog";
import { ChangeStoryDialog } from "./ChangeStoryDialog";
import { ReviewPanel } from "./ReviewPanel";
import { CommentsPanel } from "./CommentsPanel";
import { FormatsPanel } from "./FormatsPanel";
import { useLiveChapter } from "@web/lib/live";
import { useWorkFileActions } from "../useWorkFileActions";
import { createProposal, diffSuggestions } from "@web/lib/collab";

const AUTOSAVE_MS = 2000; // desktop: autosave 2 s after typing stops

interface Draft {
  title: string;
  md: string;
}

const StoryEditor: React.FC = () => {
  const { id = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { setStatus, prefs, online } = useWorkspace();
  const isMobile = useIsMobile();

  const [story, setStory] = useState<StoryTitle | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [role, setRole] = useState<StoryRole>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<"chapters" | "branches" | "review" | "comments" | "formats" | null>("chapters");
  const [changeOpen, setChangeOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const editorRef = useRef<DualPaneHandle>(null);
  const docKeys = useRef<Record<string, string | null>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const isOwner = role === "owner";
  // Contributors and readers edit a private copy in suggestion mode; the
  // owner edits the real thing.
  const canEdit = isOwner || suggesting;
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;

  // Live co-editing of the open chapter with everyone else who has it open
  // (owner and team; suggestion copies stay private).
  const me = useMemo(() => (user ? { id: user.id, email: user.email } : null), [user]);
  const live = useLiveChapter(activeId, prefs.liveCollab && isOwner && online, me, (v) => {
    const cid = activeIdRef.current;
    if (!cid) return;
    setDrafts((d) => ({ ...d, [cid]: { title: v.title, md: joinParagraphs(v.paragraphs) } }));
  });
  const liveRef = useRef(live);
  liveRef.current = live;
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();

  useTabTitle(location.pathname, story?.title);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, ch, access] = await Promise.all([getStory(id, user?.id), getChapters(id, user?.id), user ? getMyAccess(id) : Promise.resolve({ role: null as StoryRole })]);
      setStory(s);
      setTitleDraft(s.title);
      setChapters(ch);
      setRole(access.role);
      setDrafts((prev) => {
        const next: Record<string, Draft> = {};
        for (const c of ch) next[c.chapter_id] = dirtyRef.current.has(c.chapter_id) && prev[c.chapter_id] ? prev[c.chapter_id] : { title: c.chapter_title ?? "", md: joinParagraphs(c.paragraphs ?? []) };
        return next;
      });
      setActiveId((cur) => (cur && ch.some((c) => c.chapter_id === cur) ? cur : (ch[0]?.chapter_id ?? null)));
      listBranches(id).then(setBranches).catch(() => setBranches([]));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, user]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- saving -------------------------------------------------------------
  const flush = useCallback(async () => {
    const ids = [...dirtyRef.current];
    if (!ids.length || !isOwnerRef.current) return;
    setStatus({ sync: "saving" });
    let failed = false;
    for (const cid of ids) {
      const d = draftsRef.current[cid];
      if (!d) continue;
      const paragraphs = splitParagraphs(d.md);
      try {
        await saveChapter(cid, d.title, paragraphs);
        setDirty((s) => {
          const n = new Set(s);
          // Only clear if nothing changed while we were saving.
          if (draftsRef.current[cid] === d) n.delete(cid);
          return n;
        });
        setChapters((cs) => cs.map((c) => (c.chapter_id === cid ? { ...c, chapter_title: d.title, paragraphs } : c)));
        // Mirror into the chapter's CRDT doc so revision history sees web
        // edits too (best effort — history is a bonus, the save is above).
        if (!liveRef.current.connected) (async () => {
          if (!(cid in docKeys.current)) docKeys.current[cid] = await ensureCrdtDoc({ docType: "chapter", chapterId: cid }).catch(() => null);
          const key = docKeys.current[cid];
          if (key) await applyCrdtContent(key, { title: d.title, paragraphs }).catch(() => {});
        })();
      } catch (err) {
        failed = true;
        toast({ title: "Couldn't save the chapter", description: (err as Error).message, variant: "destructive" });
      }
    }
    setStatus({ sync: failed ? "error" : "saved" });
  }, [setStatus]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_MS);
  }, [flush]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  const updateDraft = (patch: Partial<Draft>) => {
    if (!activeId || !canEdit) return;
    const next = { ...drafts[activeId], ...patch };
    setDrafts((d) => ({ ...d, [activeId]: next }));
    setDirty((s) => new Set(s).add(activeId));
    if (!isOwner) return; // suggestion copy: kept until "Send my suggestions"
    setStatus({ sync: "queued" });
    scheduleSave();
    if (live.connected) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => live.push({ title: next.title, paragraphs: splitParagraphs(next.md) }), 250);
    }
  };

  // ---- suggestion mode ----------------------------------------------------------
  const sendSuggestions = async () => {
    if (!story) return;
    let sent = 0;
    try {
      for (const cid of dirty) {
        const orig = chapters.find((c) => c.chapter_id === cid);
        const d = drafts[cid];
        if (!orig || !d) continue;
        for (const s of diffSuggestions(cid, orig.chapter_title ?? "", d.title, orig.paragraphs ?? [], splitParagraphs(d.md))) {
          await createProposal(story.story_title_id, s);
          sent++;
        }
      }
      toast({ title: sent ? `${sent} suggestion${sent === 1 ? "" : "s"} sent to the author` : "Nothing changed" });
      setSuggesting(false);
      setDirty(new Set());
      load();
    } catch (err) {
      toast({ title: "Couldn't send the suggestions", description: (err as Error).message, variant: "destructive" });
    }
  };
  const discardSuggestions = () => {
    setSuggesting(false);
    setDirty(new Set());
    setDrafts(Object.fromEntries(chapters.map((c) => [c.chapter_id, { title: c.chapter_title ?? "", md: joinParagraphs(c.paragraphs ?? []) }])));
  };

  // ---- chapter operations -----------------------------------------------------
  const addChapter = async () => {
    if (!story) return;
    await flush();
    const idx = chapters.findIndex((c) => c.chapter_id === activeId);
    try {
      const c = await createChapter(story.story_title_id, `Chapter ${chapters.length + 1}`, [""]);
      const order = [...chapters];
      order.splice(idx + 1, 0, c);
      await reorderChapters(story.story_title_id, order.map((x) => x.chapter_id)).catch(() => {});
      setChapters(order);
      setDrafts((d) => ({ ...d, [c.chapter_id]: { title: c.chapter_title, md: "" } }));
      setActiveId(c.chapter_id);
    } catch (err) {
      toast({ title: "Couldn't add a chapter", description: (err as Error).message, variant: "destructive" });
    }
  };

  const removeChapter = async (cid: string) => {
    const c = chapters.find((x) => x.chapter_id === cid);
    if (!await askConfirm(`Delete "${c?.chapter_title || "this chapter"}"? This can't be undone.`)) return;
    try {
      await deleteChapter(cid);
      const rest = chapters.filter((x) => x.chapter_id !== cid);
      setChapters(rest);
      setDirty((s) => {
        const n = new Set(s);
        n.delete(cid);
        return n;
      });
      if (activeId === cid) setActiveId(rest[0]?.chapter_id ?? null);
    } catch (err) {
      toast({ title: "Couldn't delete the chapter", description: (err as Error).message, variant: "destructive" });
    }
  };

  const moveChapter = async (from: number, to: number) => {
    if (!story || to < 0 || to >= chapters.length) return;
    const prev = chapters;
    const next = chapters.slice();
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    setChapters(next);
    try {
      await reorderChapters(story.story_title_id, next.map((x) => x.chapter_id));
    } catch (err) {
      setChapters(prev);
      toast({ title: "Couldn't reorder", description: (err as Error).message, variant: "destructive" });
    }
  };

  const togglePublish = async (c: Chapter) => {
    const published = c.published === false;
    try {
      await publishChapter(c.chapter_id, published);
      setChapters((cs) => cs.map((x) => (x.chapter_id === c.chapter_id ? { ...x, published } : x)));
    } catch (err) {
      toast({ title: "Couldn't change it", description: (err as Error).message, variant: "destructive" });
    }
  };

  const saveTitle = async () => {
    if (!story || !user || !isOwner) return;
    const t = titleDraft.trim();
    if (!t || t === story.title) return;
    try {
      await renameStory(story.story_title_id, t, user.id);
      setStory({ ...story, title: t });
    } catch (err) {
      setTitleDraft(story.title);
      toast({ title: "Couldn't rename the story", description: (err as Error).message, variant: "destructive" });
    }
  };

  const saveMetadata = async (v: MetadataValue) => {
    if (!story || !user) return;
    if (v.title.trim() && v.title !== story.title) await renameStory(story.story_title_id, v.title.trim(), user.id);
    await updateStorySettings(story.story_title_id, { description: v.description, genre: v.genre, tags: v.tags, visibility: v.visibility, published: v.published, userId: user.id });
    setStory({ ...story, title: v.title.trim() || story.title, description: v.description, genre: v.genre, tags: v.tags, visibility: v.visibility, published: v.published });
    setTitleDraft(v.title.trim() || story.title);
  };

  const insertImage = () => {
    if (!story) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const [img] = await uploadGalleryImages(story.story_title_id, [f], { kind: "inline_illustration", chapterId: activeId ?? undefined });
        editorRef.current?.insertImage(img.image_url, f.name.replace(/\.[^.]+$/, ""));
      } catch (err) {
        toast({ title: "Couldn't upload the image", description: (err as Error).message, variant: "destructive" });
      }
    };
    input.click();
  };

  // ---- derived ------------------------------------------------------------------
  const active = activeId ? drafts[activeId] : undefined;
  const activeParagraphs = useMemo(() => (active ? splitParagraphs(active.md) : []), [active]);

  useEffect(() => {
    const words = Object.values(drafts).reduce((n, d) => n + countWords(mdToPlain(d.md)), 0);
    setStatus({ words, paragraphs: countParagraphs(activeParagraphs), chapters: chapters.length });
  }, [drafts, activeParagraphs, chapters.length, setStatus]);

  useEffect(() => {
    setStatus({ peers: live.peers.length || undefined, ...(live.connected && dirty.size === 0 ? { sync: "live" as const } : {}) });
  }, [live.peers.length, live.connected, dirty.size, setStatus]);

  const fileActions = useWorkFileActions("story", id, flush);
  useDocActions(
    {
      ...fileActions.actions,
      kind: "story",
      find: () => editorRef.current?.openFind(false),
      replace: canEdit ? () => editorRef.current?.openFind(true) : undefined,
      insertImage: isOwner ? insertImage : undefined,
      metadata: () => setMetaOpen(true),
      revisions: activeId && user ? () => setRevOpen(true) : undefined,
      change: user && !isOwner ? () => setChangeOpen(true) : undefined,
    },
    [canEdit, isOwner, activeId, story, user],
  );

  // ---- render -------------------------------------------------------------------
  if (error) {
    return (
      <div className="p-6">
        <EditableText id="webapp-story-error" as="p" className="mb-2 font-medium">
          This story couldn't be opened.
        </EditableText>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!story) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  const chapterList = (
    <ChapterList
      chapters={chapters}
      activeId={activeId}
      dirty={dirty}
      canEdit={isOwner}
      onSelect={(cid) => {
        flush();
        setActiveId(cid);
        if (isMobile) setSide(null);
      }}
      onAdd={addChapter}
      onDelete={removeChapter}
      onMove={moveChapter}
      onTogglePublish={togglePublish}
    />
  );
  const branchPanel = activeId ? (
    <BranchesPanel chapterId={activeId} paragraphs={activeParagraphs} branches={branches} userId={user?.id} canBranch={!!user && role !== null} isOwner={isOwner} onChanged={() => listBranches(id).then(setBranches)} />
  ) : null;
  const reviewPanel = <ReviewPanel storyId={story.story_title_id} chapters={chapters} onApplied={load} />;
  const commentsPanel = <CommentsPanel storyId={story.story_title_id} chapterId={activeId} userId={user?.id} />;
  const formatsPanel = (
    <FormatsPanel storyId={story.story_title_id} language={story.language ?? "en"} chapter={chapters.find((c) => c.chapter_id === activeId) ?? null} chapters={chapters} paragraphs={activeParagraphs} canEdit={isOwner} />
  );
  const panels = { chapters: chapterList, branches: branchPanel, review: reviewPanel, comments: commentsPanel, formats: formatsPanel };
  const sidePanel = side ? panels[side] : null;
  const rightPanel = side && side !== "chapters" ? panels[side] : null;

  const header = (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <Button size="icon" variant={side === "chapters" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setSide(side === "chapters" ? null : "chapters")} aria-label="Chapters">
        <ListTree className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <input
          value={titleDraft}
          readOnly={!isOwner}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Story title"
          className="w-full truncate bg-transparent text-lg font-semibold outline-none"
        />
        {active && (
          <input
            value={active.title}
            readOnly={!canEdit}
            onChange={(e) => updateDraft({ title: e.target.value })}
            aria-label="Chapter title"
            placeholder="Chapter title"
            className="w-full truncate bg-transparent text-sm text-muted-foreground outline-none"
          />
        )}
      </div>
      {live.peers.length > 0 && (
        <span className="flex items-center -space-x-1.5" title={live.peers.map((p) => p.name).join(", ")}>
          <Users className="mr-2 h-4 w-4 text-muted-foreground" />
          {live.peers.slice(0, 4).map((p) => (
            <span key={p.peer} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold uppercase text-white" style={{ background: p.color }}>
              {p.name.slice(0, 2)}
            </span>
          ))}
        </span>
      )}
      {user && !isOwner && !suggesting && (
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setChangeOpen(true)}>
          <PencilLine className="h-4 w-4" />
          <EditableText id="webapp-story-change-btn">I want to change this</EditableText>
        </Button>
      )}
      <Button size="icon" variant={side === "branches" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setSide(side === "branches" ? null : "branches")} aria-label="Branches">
        <GitBranch className="h-4 w-4" />
      </Button>
      {user && (
        <Button size="icon" variant={side === "formats" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setSide(side === "formats" ? null : "formats")} aria-label="Formats and translations">
          <Film className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon" variant={side === "comments" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setSide(side === "comments" ? null : "comments")} aria-label="Comments">
        <MessageSquare className="h-4 w-4" />
      </Button>
      {isOwner && (
        <Button size="icon" variant={side === "review" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setSide(side === "review" ? null : "review")} aria-label="Suggestions and requests">
          <Inbox className="h-4 w-4" />
        </Button>
      )}
      <a href={platformLink(`/story/${story.story_title_id}`)} target="_blank" rel="noreferrer" className="rounded p-2 hover:bg-muted" title="Open on the platform">
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {!isMobile && sidePanel && side === "chapters" && <aside className="w-60 shrink-0 border-r">{sidePanel}</aside>}
      <section className="flex min-w-0 flex-1 flex-col">
        {header}
        {suggesting && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-yellow-100 px-3 py-1.5 text-sm text-yellow-900">
            <EditableText id="webapp-story-suggesting">You're editing a suggestion copy. The author sees your changes once you send them.</EditableText>
            <span className="flex-1" />
            <Button size="sm" className="h-7" onClick={sendSuggestions} disabled={dirty.size === 0}>
              <EditableText id="webapp-story-send-suggestions">Send my suggestions</EditableText>
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={discardSuggestions}>
              <EditableText id="webapp-story-discard-suggestions">Discard</EditableText>
            </Button>
          </div>
        )}
        {!canEdit && (
          <div className="border-b bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            {user ? (
              <EditableText id="webapp-story-readonly-contrib">You're reading this story. To change it, use "I want to change this" (Story settings).</EditableText>
            ) : (
              <EditableText id="webapp-story-readonly-guest">You're reading this story. Log in to write or suggest changes.</EditableText>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {active ? (
            <DualPaneEditor key={activeId} ref={editorRef} markdown={active.md} onChange={(md) => updateDraft({ md })} readOnly={!canEdit} placeholder="Once upon a time…" />
          ) : (
            <EditableText id="webapp-story-no-chapters" as="p" className="p-6 text-muted-foreground">
              This story has no chapters yet.
            </EditableText>
          )}
        </div>
      </section>
      {!isMobile && rightPanel && <aside className={`${side === "formats" ? "w-[28rem]" : "w-80"} shrink-0 border-l`}>{rightPanel}</aside>}
      {isMobile && (
        <Sheet open={!!sidePanel} onOpenChange={(o) => !o && setSide(null)}>
          <SheetContent side={side === "chapters" ? "left" : "right"} className="w-[85vw] max-w-sm p-0">
            {sidePanel}
          </SheetContent>
        </Sheet>
      )}

      <StoryMetadataDialog
        open={metaOpen}
        onOpenChange={setMetaOpen}
        canEdit={isOwner}
        platformPath={`/story/${story.story_title_id}`}
        value={{ title: story.title, description: story.description ?? "", genre: story.genre ?? "", tags: story.tags ?? [], visibility: story.visibility ?? "public", published: !!story.published }}
        onSave={saveMetadata}
      />
      {fileActions.dialog}
      {user && <ChangeStoryDialog open={changeOpen} onOpenChange={setChangeOpen} storyId={story.story_title_id} userId={user.id} onSuggest={() => setSuggesting(true)} />}
      {activeId && <RevisionsDialog open={revOpen} onOpenChange={setRevOpen} chapterId={activeId} title={active?.title} onRestored={load} />}
    </div>
  );
};

export default StoryEditor;
