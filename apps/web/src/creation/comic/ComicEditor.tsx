import React, { useCallback, useEffect, useRef, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, ExternalLink, Eye, EyeOff, Inbox, Plus, Trash2, Type, Upload } from "lucide-react";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { useWorkFileActions } from "../useWorkFileActions";
import { mediaUrl, platformLink } from "@web/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import TextLayerEditor from "@/modules/comic/TextLayerEditor";
import PageAlternatives from "@/modules/comic/PageAlternatives";
import WorkContributeSection from "@/components/work/WorkContributeSection";
import { OverlayBubble } from "@/components/story/media/FrameView";
import {
  createComicPageBranch,
  deleteComicPageBranch,
  listComicPageBranches,
  updateComicPage,
  updateComicPageBranch,
  type ComicPageBranch,
} from "@/lib/comicsApi";
import { createWorkProposal, getWorkAccess, listWorkProposals, type WorkAccess, type WorkProposal } from "@/lib/workApi";
import type { FrameOverlay } from "@/lib/mediaApi";
import { WorkReviewPanel } from "../WorkReviewPanel";
import WorkEditionsBar, { type EditionChoicePart } from "@/components/work/WorkEditionsBar";
import {
  createIssue,
  deleteIssue,
  deletePage,
  getComic,
  publishIssue,
  renameIssue,
  reorderPages,
  updateComicSettings,
  updatePage,
  uploadPages,
  type Comic,
  type ComicIssue,
  type ComicPage,
} from "@web/lib/comic";

// Comic / manga editor: issues, and each issue's pages — upload (or drop)
// images, drag to reorder, alt text, delete — plus reading direction.

const ComicEditor: React.FC = () => {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setStatus } = useWorkspace();
  const [comic, setComic] = useState<Comic | null>(null);
  const [access, setAccess] = useState<WorkAccess | null>(null);
  const [branches, setBranches] = useState<ComicPageBranch[]>([]);
  const [pendingProposals, setPendingProposals] = useState<WorkProposal[]>([]);
  const [layersOf, setLayersOf] = useState<{ type: "page"; page: ComicPage } | { type: "alt"; branch: ComicPageBranch } | null>(null);
  const [review, setReview] = useState(false);
  const isMobile = useIsMobile();
  const [issueId, setIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useTabTitle(location.pathname, comic?.title);

  const load = useCallback(async () => {
    try {
      const [c, myAccess] = await Promise.all([getComic(id), getWorkAccess("comic", id).catch(() => null)]);
      setComic(c);
      setAccess(myAccess);
      listComicPageBranches(id).then(setBranches).catch(() => setBranches([]));
      listWorkProposals("comic", id, "undecided").then(setPendingProposals).catch(() => setPendingProposals([]));
      setIssueId((cur) => (cur && c.issues?.some((i) => i.issue_id === cur) ? cur : (c.issues?.[c.issues.length - 1]?.issue_id ?? null)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  // The team (owner or invited collaborators) manages pages; other signed-in
  // readers of a public comic suggest page text (proposals) and add alternatives.
  const canEdit = !!access?.explicit;
  const isOwner = !!access?.isOwner;
  const canSuggest = !!user && !!access?.role && !canEdit;
  const canEditBranch = (b: ComicPageBranch) => !!user && (b.user_id === user.id || isOwner || !!access?.isAdmin);

  const saveLayers = async (overlays: FrameOverlay[]) => {
    if (!layersOf) return;
    try {
      if (layersOf.type === "alt") {
        const nb = await updateComicPageBranch(layersOf.branch.id, { overlays });
        setBranches((xs) => xs.map((x) => (x.id === nb.id ? { ...x, ...nb } : x)));
      } else if (canEdit) {
        await updateComicPage(layersOf.page.page_id, { overlays });
        setComic((c) => (c ? { ...c, pages: c.pages.map((p) => (p.page_id === layersOf.page.page_id ? { ...p, overlays } : p)) } : c));
      } else {
        await createWorkProposal("comic", id, { targetType: "page_layer", targetPageId: layersOf.page.page_id, proposedText: JSON.stringify(overlays) });
        toast({ title: "Suggestion sent", description: "The owner will review your change." });
        listWorkProposals("comic", id, "undecided").then(setPendingProposals).catch(() => {});
      }
    } catch (err) {
      toast({ title: "Couldn't save the text", description: (err as Error).message, variant: "destructive" });
    }
  };
  const issues: ComicIssue[] = comic?.issues ?? [];
  const pages: ComicPage[] = (comic?.pages ?? []).filter((p) => !issueId || p.issue_id === issueId || (!p.issue_id && issues.length <= 1)).sort((a, b) => a.page_index - b.page_index);

  useEffect(() => {
    setStatus({ paragraphs: undefined, words: undefined, chapters: issues.length, message: `${pages.length} pages` });
  }, [issues.length, pages.length, setStatus]);

  const fileActions = useWorkFileActions("comic", id);
  useDocActions({ ...fileActions.actions, kind: "comic" }, [id]);

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length || !comic) return;
    setBusy(true);
    setStatus({ sync: "saving" });
    try {
      await uploadPages(comic.comic_id, imgs, issueId ?? undefined);
      await load();
      setStatus({ sync: "saved" });
    } catch (err) {
      setStatus({ sync: "error" });
      toast({ title: "Couldn't upload the pages", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const move = async (from: number, to: number) => {
    if (!comic || to < 0 || to >= pages.length) return;
    const order = pages.slice();
    const [p] = order.splice(from, 1);
    order.splice(to, 0, p);
    // Optimistic, then persist.
    setComic({ ...comic, pages: comic.pages.map((x) => ({ ...x, page_index: order.findIndex((o) => o.page_id === x.page_id) >= 0 ? order.findIndex((o) => o.page_id === x.page_id) : x.page_index })) });
    try {
      await reorderPages(comic.comic_id, order.map((x) => x.page_id));
    } catch (err) {
      toast({ title: "Couldn't reorder", description: (err as Error).message, variant: "destructive" });
      load();
    }
  };

  const remove = async (p: ComicPage) => {
    if (!await askConfirm("Delete this page?")) return;
    try {
      await deletePage(p.page_id);
      load();
    } catch (err) {
      toast({ title: "Couldn't delete the page", description: (err as Error).message, variant: "destructive" });
    }
  };

  const saveAlt = async (p: ComicPage, alt: string) => {
    if ((p.alt_text ?? "") === alt) return;
    try {
      await updatePage(p.page_id, alt);
    } catch (err) {
      toast({ title: "Couldn't save the description", description: (err as Error).message, variant: "destructive" });
    }
  };

  const addIssue = async () => {
    if (!comic) return;
    const title = await askText("Title of the new issue", `Issue ${issues.length + 1}`);
    if (!title) return;
    try {
      const i = await createIssue(comic.comic_id, title, issues[issues.length - 1]?.issue_id);
      await load();
      setIssueId(i.issue_id);
    } catch (err) {
      toast({ title: "Couldn't add an issue", description: (err as Error).message, variant: "destructive" });
    }
  };

  const settings = async (patch: Parameters<typeof updateComicSettings>[1]) => {
    if (!comic) return;
    try {
      await updateComicSettings(comic.comic_id, patch);
      setComic({ ...comic, ...patch } as Comic);
    } catch (err) {
      toast({ title: "Couldn't save", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!comic) return <div className="p-6 text-sm text-muted-foreground">…</div>;
  const current = issues.find((i) => i.issue_id === issueId);
  const rtl = comic.reading_direction === "rtl";

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => canEdit && e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!canEdit || !e.dataTransfer.files.length) return;
        e.preventDefault();
        upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <input
          defaultValue={comic.title}
          readOnly={!isOwner}
          onBlur={(e) => e.target.value.trim() && e.target.value !== comic.title && settings({ title: e.target.value.trim() })}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
          aria-label="Comic title"
        />
        {isOwner && (
          <select value={comic.reading_direction} onChange={(e) => settings({ reading_direction: e.target.value as "ltr" | "rtl" })} className="h-8 rounded border bg-background px-2 text-sm" aria-label="Reading direction">
            <option value="ltr">Left → right</option>
            <option value="rtl">Right → left (manga)</option>
          </select>
        )}
        <div className="hidden sm:block">
          <WorkEditionsBar
            kind="comic"
            workId={id}
            parts={issues.map((iss) => ({
              id: iss.issue_id,
              title: iss.title,
              items: (comic.pages ?? [])
                .filter((pg) => pg.issue_id === iss.issue_id)
                .sort((a, b) => a.page_index - b.page_index)
                .map((pg, n) => ({
                  id: pg.page_id,
                  label: `Page ${n + 1}`,
                  branches: branches.filter((b) => b.page_id === pg.page_id).map((b, k) => ({ id: b.id, label: b.name || `Alternative ${k + 1}` })),
                })),
            })) as EditionChoicePart[]}
            selectedEditionId={null}
            onSelect={(editionId) => editionId && navigate(`/read/comic/${id}?edition=${editionId}`)}
          />
        </div>
        {(isOwner || access?.isAdmin) && (
          <Button size="icon" variant={review ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setReview(!review)} aria-label="Suggestions and requests">
            <Inbox className="h-4 w-4" />
          </Button>
        )}
        <a href={platformLink(`/comic/${comic.comic_id}`)} target="_blank" rel="noreferrer" className="rounded p-2 hover:bg-muted" title="Open on the platform">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1">
        {issues.map((i) => (
          <button key={i.issue_id} onClick={() => setIssueId(i.issue_id)} className={`shrink-0 rounded px-2.5 py-1 text-sm ${i.issue_id === issueId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
            {i.title}
            {i.published === false && <span className="ml-1 text-xs text-muted-foreground">(draft)</span>}
          </button>
        ))}
        {isOwner && (
          <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1" onClick={addIssue}>
            <Plus className="h-4 w-4" />
            <EditableText id="webapp-comic-add-issue">Issue</EditableText>
          </Button>
        )}
        <span className="flex-1" />
        {isOwner && current && (
          <>
            <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={async () => {
              const t = await askText("Rename issue", current.title);
              if (t) { await renameIssue(current.issue_id, t).catch(() => {}); load(); }
            }}>
              <EditableText id="webapp-comic-rename-issue">Rename</EditableText>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1" onClick={async () => { await publishIssue(current.issue_id, current.published === false).catch((e) => toast({ title: (e as Error).message, variant: "destructive" })); load(); }}>
              {current.published === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {current.published === false ? <EditableText id="webapp-comic-publish">Publish</EditableText> : <EditableText id="webapp-comic-unpublish">Unpublish</EditableText>}
            </Button>
            {issues.length > 1 && (
              <Button size="sm" variant="ghost" className="h-7 shrink-0 text-destructive" onClick={async () => {
                if (!await askConfirm(`Delete "${current.title}" and its pages?`)) return;
                await deleteIssue(current.issue_id).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
                setIssueId(null);
                load();
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {!canEdit && user && (
        <div className="border-b bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          <EditableText id="webapp-comic-readonly">
            Only this comic's team manages its pages. You can suggest page text and add page alternatives.
          </EditableText>
          {canSuggest && <WorkContributeSection kind="comic" workId={id} />}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        {canEdit && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && upload([...e.target.files])} />
            <Button onClick={() => fileRef.current?.click()} disabled={busy} className="gap-1">
              <Upload className="h-4 w-4" />
              <EditableText id="webapp-comic-upload">Add pages</EditableText>
            </Button>
            <EditableText id="webapp-comic-drop-hint" className="text-sm text-muted-foreground">
              …or drop images anywhere here. Drag pages to reorder them.
            </EditableText>
          </div>
        )}
        {pages.length === 0 ? (
          <EditableText id="webapp-comic-empty" as="p" className="text-muted-foreground">
            No pages in this issue yet.
          </EditableText>
        ) : (
          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" dir={rtl ? "rtl" : "ltr"}>
            {pages.map((p, i) => (
              <li
                key={p.page_id}
                draggable={canEdit}
                onDragStart={(e) => {
                  setDragFrom(p.page_id);
                  e.dataTransfer.setData("text/plain", p.page_id);
                }}
                onDragOver={(e) => dragFrom && e.preventDefault()}
                onDrop={(e) => {
                  if (!dragFrom) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const from = pages.findIndex((x) => x.page_id === dragFrom);
                  if (from !== i) move(from, i);
                  setDragFrom(null);
                }}
                className="group space-y-1 rounded border bg-muted/30 p-1.5"
                dir="ltr"
              >
                <div className="relative">
                  <img src={mediaUrl(p.image_url)} alt={p.alt_text ?? `Page ${i + 1}`} className="aspect-[2/3] w-full rounded object-cover" loading="lazy" />
                  {(p.overlays ?? []).map((o, k) => (
                    <OverlayBubble key={k} overlay={o} />
                  ))}
                  <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 text-xs">{i + 1}</span>
                  {canEdit && (
                    <span className="absolute right-1 top-1 flex gap-0.5 rounded bg-background/80 opacity-0 group-hover:opacity-100 max-md:opacity-100">
                      <button onClick={() => move(i, i + (rtl ? 1 : -1))} className="p-1" aria-label="Move earlier">
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => move(i, i + (rtl ? -1 : 1))} className="p-1" aria-label="Move later">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(p)} className="p-1 text-destructive" aria-label="Delete page">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                <Input defaultValue={p.alt_text ?? ""} readOnly={!canEdit} onBlur={(e) => saveAlt(p, e.target.value)} placeholder="Describe this page" className="h-7 text-xs" />
                {(canEdit || canSuggest) && (
                  <button onClick={() => setLayersOf({ type: "page", page: p })} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Type className="h-3 w-3" />
                    {canEdit ? <EditableText id="webapp-comic-edit-text">Edit text</EditableText> : <EditableText id="webapp-comic-suggest-text">Suggest text</EditableText>}
                    {(p.overlays?.length ?? 0) > 0 && <span className="text-muted-foreground">({p.overlays!.length})</span>}
                  </button>
                )}
                {pendingProposals.some((x) => x.target_page_id === p.page_id) && (
                  <EditableText id="webapp-comic-pending" as="p" className="text-xs text-purple-700">
                    Suggested text waiting for review
                  </EditableText>
                )}
                <PageAlternatives
                  branches={branches.filter((b) => b.page_id === p.page_id).map((b) => ({ ...b, image_url: mediaUrl(b.image_url) }))}
                  canCreate={!!user}
                  canEdit={canEditBranch}
                  onCreate={async (file) => {
                    try {
                      const nb = await createComicPageBranch(p.page_id, file);
                      setBranches((xs) => [...xs, nb]);
                    } catch (err) {
                      toast({ title: "Couldn't add the alternative", description: (err as Error).message, variant: "destructive" });
                    }
                  }}
                  onDelete={(b) =>
                    deleteComicPageBranch(b.id)
                      .then(() => setBranches((xs) => xs.filter((x) => x.id !== b.id)))
                      .catch((err) => toast({ title: "Couldn't delete", description: (err as Error).message, variant: "destructive" }))
                  }
                  onEditLayers={(b) => setLayersOf({ type: "alt", branch: b })}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
      {review && !isMobile && (
        <aside className="w-80 shrink-0 border-l">
          <WorkReviewPanel kind="comic" workId={id} onApplied={load} />
        </aside>
      )}
      </div>
      {review && isMobile && (
        <Sheet open={review} onOpenChange={setReview}>
          <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
            <WorkReviewPanel kind="comic" workId={id} onApplied={load} />
          </SheetContent>
        </Sheet>
      )}
      <TextLayerEditor
        open={!!layersOf}
        onOpenChange={(o) => !o && setLayersOf(null)}
        // Alternatives reach here with their URL already resolved (see PageAlternatives above).
        imageUrl={layersOf?.type === "alt" ? layersOf.branch.image_url : mediaUrl(layersOf?.page.image_url ?? "")}
        overlays={(layersOf?.type === "alt" ? layersOf.branch.overlays : layersOf?.page.overlays) ?? []}
        mode={layersOf?.type === "page" && !canEdit ? "suggest" : "save"}
        onSave={saveLayers}
      />
      {fileActions.dialog}
    </div>
  );
};

export default ComicEditor;
