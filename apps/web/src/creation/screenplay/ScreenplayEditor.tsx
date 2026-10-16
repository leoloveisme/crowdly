import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ArrowDown, ArrowUp, ExternalLink, History, Inbox, ListTree, Plus, Trash2 } from "lucide-react";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { platformLink } from "@web/lib/api";
import { countWords } from "@web/lib/text";
import {
  BLOCK_TYPES,
  NEXT_TYPE,
  createBlock,
  createScene,
  deleteBlock,
  deleteScene,
  getScenes,
  getScreenplay,
  reorderScenes,
  updateBlock,
  updateScene,
  updateScreenplay,
  type Block,
  type BlockType,
  type Scene,
  type Screenplay,
} from "@web/lib/screenplay";
import BlockBranches from "@/modules/screenplay/BlockBranches";
import WorkContributeSection from "@/components/work/WorkContributeSection";
import { createBlockBranch, deleteBlockBranch, listBlockBranches, updateBlockBranch, type BlockBranch, type ScreenplayBlock } from "@/lib/screenplayApi";
import { createWorkProposal, getWorkAccess, listWorkProposals, type WorkAccess, type WorkProposal } from "@/lib/workApi";
import { WorkReviewPanel } from "../WorkReviewPanel";
import WorkEditionsBar, { type EditionChoicePart } from "@/components/work/WorkEditionsBar";
import { FindBar, buildFindRegex, type FindOptions } from "../FindBar";
import { RevisionsDialog } from "../RevisionsDialog";
import { useWorkFileActions } from "../useWorkFileActions";

// Screenplay editor: scene outline + a script page where every element is
// a typed block (desktop .screenplay; platform screenplay template). Enter
// adds the conventional next element, Tab cycles the element type,
// Backspace on an empty element removes it. Edits save 2 s after typing.

const BLOCK_STYLE: Record<BlockType, string> = {
  scene_heading: "font-bold uppercase",
  action: "",
  character: "mx-auto w-1/2 text-center uppercase",
  dialogue: "mx-auto w-[70%]",
  parenthetical: "mx-auto w-1/2 italic",
  transition: "text-right uppercase",
  shot: "uppercase",
  general: "",
};

const AutoText: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  className?: string;
  readOnly?: boolean;
  id?: string;
  placeholder?: string;
}> = ({ value, onChange, onKeyDown, onBlur, className, readOnly, id, placeholder }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={cn("block w-full resize-none overflow-hidden bg-transparent outline-none focus:bg-primary/5", className)}
    />
  );
};

const ScreenplayEditor: React.FC = () => {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setStatus } = useWorkspace();
  const isMobile = useIsMobile();

  const [sp, setSp] = useState<Screenplay | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [access, setAccess] = useState<WorkAccess | null>(null);
  const [branches, setBranches] = useState<BlockBranch[]>([]);
  const [pendingProposals, setPendingProposals] = useState<WorkProposal[]>([]);
  // Readers outside the team "suggest changes": edits go to the owner as proposals.
  const [suggesting, setSuggesting] = useState(false);
  const [review, setReview] = useState(false);
  const saved = useRef<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState(!isMobile);
  const [find, setFind] = useState<null | "find" | "replace">(null);
  const [revScene, setRevScene] = useState<Scene | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  const pending = useRef<Map<string, { kind: "block" | "scene"; patch: Record<string, string> }>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focusAfter = useRef<string | null>(null);

  useTabTitle(location.pathname, sp?.title);

  const loadContributions = useCallback(() => {
    listBlockBranches(id).then(setBranches).catch(() => setBranches([]));
    listWorkProposals("screenplay", id, "undecided").then(setPendingProposals).catch(() => setPendingProposals([]));
  }, [id]);

  const load = useCallback(async () => {
    try {
      const [s, sc, myAccess] = await Promise.all([getScreenplay(id), getScenes(id), getWorkAccess("screenplay", id).catch(() => null)]);
      setSp(s);
      setTitleDraft(s.title);
      setScenes(sc.scenes);
      setBlocks(sc.blocks);
      setAccess(myAccess);
      // What the server has, to tell a suggestion apart from an unchanged text.
      saved.current = new Map([
        ...sc.blocks.map((b) => [b.block_id, b.text] as [string, string]),
        ...sc.scenes.map((x) => [`scene:${x.scene_id}`, x.slugline] as [string, string]),
      ]);
      loadContributions();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id, loadContributions]);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  // The team (owner or invited collaborators) edits directly.
  const canEdit = !!access?.explicit;
  const isOwner = !!access?.isOwner;
  const canSuggest = !!user && !!access?.role && !canEdit;
  const writable = canEdit || (canSuggest && suggesting);

  // In suggestion mode an edited text is sent as a proposal when the field is left.
  const suggest = async (proposal: Parameters<typeof createWorkProposal>[2], restore: () => void) => {
    restore();
    try {
      await createWorkProposal("screenplay", id, proposal);
      toast({ title: "Suggestion sent", description: "The owner will review your change." });
      loadContributions();
    } catch (err) {
      toast({ title: "Couldn't send the suggestion", description: (err as Error).message, variant: "destructive" });
    }
  };
  const suggestBlock = (b: Block) => {
    const original = saved.current.get(b.block_id) ?? "";
    const current = blocks.find((x) => x.block_id === b.block_id)?.text ?? "";
    if (!suggesting || current.trim() === original.trim()) return;
    suggest({ targetType: "block", targetBlockId: b.block_id, proposedText: current }, () =>
      setBlocks((bs) => bs.map((x) => (x.block_id === b.block_id ? { ...x, text: original } : x))),
    );
  };
  const suggestScene = (sc: Scene) => {
    const original = saved.current.get(`scene:${sc.scene_id}`) ?? "";
    const current = scenes.find((x) => x.scene_id === sc.scene_id)?.slugline ?? "";
    if (!suggesting || current.trim() === original.trim() || !current.trim()) return;
    suggest({ targetType: "scene", targetSceneId: sc.scene_id, proposedText: current.trim() }, () =>
      setScenes((ss) => ss.map((x) => (x.scene_id === sc.scene_id ? { ...x, slugline: original } : x))),
    );
  };

  const canEditBranch = (br: BlockBranch) => !!user && (br.user_id === user.id || isOwner || !!access?.isAdmin);
  const branchActions = {
    create: (b: Block, text: string) =>
      createBlockBranch(b.block_id, { text })
        .then((nb) => setBranches((xs) => [...xs, nb]))
        .catch((err) => toast({ title: "Couldn't create the branch", description: (err as Error).message, variant: "destructive" })),
    save: (br: BlockBranch, text: string) =>
      canEditBranch(br)
        ? updateBlockBranch(br.id, { text })
            .then((nb) => setBranches((xs) => xs.map((x) => (x.id === br.id ? { ...x, ...nb } : x))))
            .catch((err) => toast({ title: "Couldn't save the branch", description: (err as Error).message, variant: "destructive" }))
        : suggest({ targetType: "block_branch", targetBranchId: br.id, proposedText: text }, () => {}),
    remove: (br: BlockBranch) =>
      deleteBlockBranch(br.id)
        .then(() => setBranches((xs) => xs.filter((x) => x.id !== br.id)))
        .catch((err) => toast({ title: "Couldn't delete the branch", description: (err as Error).message, variant: "destructive" })),
  };

  const flush = useCallback(async () => {
    const items = [...pending.current.entries()];
    pending.current.clear();
    if (!items.length) return;
    setStatus({ sync: "saving" });
    try {
      await Promise.all(items.map(([key, it]) => (it.kind === "block" ? updateBlock(key, it.patch) : updateScene(key, it.patch))));
      setStatus({ sync: "saved" });
    } catch (err) {
      setStatus({ sync: "error" });
      toast({ title: "Couldn't save", description: (err as Error).message, variant: "destructive" });
    }
  }, [setStatus]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const queue = (kind: "block" | "scene", key: string, patch: Record<string, string>) => {
    const prev = pending.current.get(key);
    pending.current.set(key, { kind, patch: { ...(prev?.patch ?? {}), ...patch } });
    setStatus({ sync: "queued" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 2000);
  };

  const setBlockText = (b: Block, text: string) => {
    setBlocks((bs) => bs.map((x) => (x.block_id === b.block_id ? { ...x, text } : x)));
    if (canEdit) queue("block", b.block_id, { text });
  };

  const setBlockType = async (b: Block, blockType: BlockType) => {
    setBlocks((bs) => bs.map((x) => (x.block_id === b.block_id ? { ...x, block_type: blockType } : x)));
    try {
      await updateBlock(b.block_id, { blockType });
    } catch (err) {
      toast({ title: "Couldn't change the element type", description: (err as Error).message, variant: "destructive" });
    }
  };

  const addBlockAfter = async (scene: Scene, after: Block | null, blockType: BlockType) => {
    await flush();
    try {
      const nb = await createBlock(id, { sceneId: scene.scene_id, blockType, text: " ", afterBlockId: after?.block_id });
      focusAfter.current = nb.block_id;
      // The backend shifts later elements; reload to get the new order.
      const sc = await getScenes(id);
      setBlocks(sc.blocks);
    } catch (err) {
      toast({ title: "Couldn't add the element", description: (err as Error).message, variant: "destructive" });
    }
  };

  const removeBlock = async (b: Block, focusPrev?: string) => {
    try {
      await deleteBlock(b.block_id);
      pending.current.delete(b.block_id);
      setBlocks((bs) => bs.filter((x) => x.block_id !== b.block_id));
      if (focusPrev) focusAfter.current = focusPrev;
    } catch (err) {
      toast({ title: "Couldn't delete the element", description: (err as Error).message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!focusAfter.current) return;
    const el = document.getElementById(`blk-${focusAfter.current}`) as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      focusAfter.current = null;
    }
  }, [blocks]);

  const onBlockKey = (scene: Scene, b: Block, idx: number, list: Block[]) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!canEdit) return;
    const el = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBlockAfter(scene, b, NEXT_TYPE[b.block_type] ?? "action");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const order = BLOCK_TYPES.map((t) => t.value);
      const i = order.indexOf(b.block_type);
      setBlockType(b, order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
    } else if (e.key === "Backspace" && el.value.trim() === "" && list.length > 1) {
      e.preventDefault();
      removeBlock(b, list[idx - 1]?.block_id ?? list[idx + 1]?.block_id);
    }
  };

  const addScene = async () => {
    const n = scenes.length + 1;
    try {
      const s = await createScene(id, (scenes[scenes.length - 1]?.scene_index ?? 0) + 1, `INT. NEW SCENE ${n} - DAY`);
      setScenes((ss) => [...ss, s]);
      await addBlockAfter(s, null, "action");
      document.getElementById(`scene-${s.scene_id}`)?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      toast({ title: "Couldn't add a scene", description: (err as Error).message, variant: "destructive" });
    }
  };

  const removeScene = async (s: Scene) => {
    if (!await askConfirm(`Delete scene "${s.slugline}" and everything in it?`)) return;
    try {
      await deleteScene(s.scene_id);
      setScenes((ss) => ss.filter((x) => x.scene_id !== s.scene_id));
      setBlocks((bs) => bs.filter((b) => b.scene_id !== s.scene_id));
    } catch (err) {
      toast({ title: "Couldn't delete the scene", description: (err as Error).message, variant: "destructive" });
    }
  };

  const moveScene = async (from: number, to: number) => {
    if (to < 0 || to >= scenes.length) return;
    const next = scenes.slice();
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    const prev = scenes;
    setScenes(next);
    try {
      await reorderScenes(id, next.map((x) => x.scene_id));
    } catch (err) {
      setScenes(prev);
      toast({ title: "Couldn't reorder", description: (err as Error).message, variant: "destructive" });
    }
  };

  const saveTitle = async () => {
    if (!sp || !titleDraft.trim() || titleDraft === sp.title) return;
    if (!isOwner) {
      if (suggesting) suggest({ targetType: "screenplay_title", proposedText: titleDraft.trim() }, () => setTitleDraft(sp.title));
      return;
    }
    try {
      await updateScreenplay(sp.screenplay_id, { title: titleDraft.trim() });
      setSp({ ...sp, title: titleDraft.trim() });
    } catch (err) {
      toast({ title: "Couldn't rename", description: (err as Error).message, variant: "destructive" });
    }
  };

  // ---- find / replace across all elements --------------------------------------
  const findHit = useRef<{ block: number; at: number }>({ block: 0, at: -1 });
  const orderedBlocks = useMemo(() => {
    const byScene = new Map<string, Block[]>();
    for (const b of blocks) if (b.scene_id) byScene.set(b.scene_id, [...(byScene.get(b.scene_id) ?? []), b]);
    for (const list of byScene.values()) list.sort((a, b) => a.block_index - b.block_index);
    return { byScene, flat: scenes.flatMap((s) => byScene.get(s.scene_id) ?? []) };
  }, [blocks, scenes]);

  const onFind = (q: string, o: FindOptions, dir: 1 | -1) => {
    const flat = orderedBlocks.flat;
    const re = buildFindRegex(q, o);
    const hits: { block: number; at: number; len: number }[] = [];
    flat.forEach((b, i) => {
      for (const m of b.text.matchAll(re)) hits.push({ block: i, at: m.index!, len: m[0].length });
    });
    if (!hits.length) return 0;
    const cur = findHit.current;
    const after = (h: { block: number; at: number }) => h.block > cur.block || (h.block === cur.block && h.at > cur.at);
    const before = (h: { block: number; at: number }) => h.block < cur.block || (h.block === cur.block && h.at < cur.at);
    let h = dir === 1 ? hits.find(after) : [...hits].reverse().find(before);
    if (!h && o.wrap) h = dir === 1 ? hits[0] : hits[hits.length - 1];
    if (h) {
      findHit.current = { block: h.block, at: h.at };
      const el = document.getElementById(`blk-${flat[h.block].block_id}`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(h.at, h.at + h.len);
      el?.scrollIntoView({ block: "center" });
    }
    return hits.length;
  };
  const onReplaceAll = (q: string, r: string, o: FindOptions) => {
    const re = buildFindRegex(q, o);
    let n = 0;
    for (const b of orderedBlocks.flat) {
      const count = [...b.text.matchAll(re)].length;
      if (count) {
        n += count;
        setBlockText(b, b.text.replace(re, () => r));
      }
    }
    return n;
  };
  const onReplace = (q: string, r: string, o: FindOptions) => {
    const flat = orderedBlocks.flat;
    const b = flat[findHit.current.block];
    const re = buildFindRegex(q, o);
    re.lastIndex = Math.max(0, findHit.current.at);
    const m = b ? re.exec(b.text) : null;
    if (b && m) setBlockText(b, b.text.slice(0, m.index) + r + b.text.slice(m.index + m[0].length));
    onFind(q, o, 1);
  };

  useEffect(() => {
    const words = blocks.reduce((n, b) => n + countWords(b.text), 0) + scenes.reduce((n, s) => n + countWords(s.slugline), 0);
    setStatus({ words, paragraphs: blocks.length, chapters: scenes.length });
  }, [blocks, scenes, setStatus]);

  const fileActions = useWorkFileActions("screenplay", id, flush);
  useDocActions(
    {
      ...fileActions.actions,
      kind: "screenplay",
      find: () => setFind("find"),
      replace: canEdit ? () => setFind("replace") : undefined,
      revisions: scenes[0] && user ? () => setRevScene(scenes[0]) : undefined,
    },
    [canEdit, scenes, user],
  );

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!sp) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  const outlineEl = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        <EditableText id="webapp-sp-scenes" className="text-sm font-medium">
          Scenes
        </EditableText>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={addScene}>
            <Plus className="h-4 w-4" />
            <EditableText id="webapp-sp-add-scene">Add</EditableText>
          </Button>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-auto p-1 text-sm">
        {scenes.map((s, i) => (
          <li key={s.scene_id} className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted">
            <button className="min-w-0 flex-1 truncate text-left uppercase" onClick={() => document.getElementById(`scene-${s.scene_id}`)?.scrollIntoView({ behavior: "smooth" })}>
              <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
              {s.slugline}
            </button>
            {canEdit && (
              <span className="flex opacity-0 group-hover:opacity-100 max-md:opacity-100">
                <button onClick={() => moveScene(i, i - 1)} disabled={i === 0} className="p-0.5 disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => moveScene(i, i + 1)} disabled={i === scenes.length - 1} className="p-0.5 disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {!isMobile && outline && <aside className="w-64 shrink-0 border-r">{outlineEl}</aside>}
      {isMobile && (
        <Sheet open={outline} onOpenChange={setOutline}>
          <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
            {outlineEl}
          </SheetContent>
        </Sheet>
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        {find && <FindBar showReplace={find === "replace"} onClose={() => setFind(null)} onFind={onFind} onReplace={onReplace} onReplaceAll={onReplaceAll} />}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button size="icon" variant={outline ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setOutline(!outline)} aria-label="Scenes">
            <ListTree className="h-4 w-4" />
          </Button>
          <input
            value={titleDraft}
            readOnly={!isOwner && !suggesting}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
            aria-label="Screenplay title"
          />
          <div className="hidden sm:block">
            <WorkEditionsBar
              kind="screenplay"
              workId={id}
              parts={scenes.map((sc) => ({
              id: sc.scene_id,
              title: sc.slugline,
              items: (orderedBlocks.byScene.get(sc.scene_id) ?? []).map((b) => ({
                id: b.block_id,
                label: b.text,
                branches: branches.filter((br) => br.block_id === b.block_id).map((br) => ({ id: br.id, label: br.name ? `${br.name}: ${br.text}` : br.text })),
              })),
            })) as EditionChoicePart[]}
              selectedEditionId={null}
              onSelect={(editionId) => editionId && navigate(`/read/screenplay/${id}?edition=${editionId}`)}
            />
          </div>
          {(isOwner || access?.isAdmin) && (
            <Button size="icon" variant={review ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setReview(!review)} aria-label="Suggestions and requests">
              <Inbox className="h-4 w-4" />
            </Button>
          )}
          <a href={platformLink(`/screenplay/${sp.screenplay_id}`)} target="_blank" rel="noreferrer" className="rounded p-2 hover:bg-muted" title="Open on the platform">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        {!canEdit && (
          <div className="border-b bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            {suggesting ? (
              <span className="flex flex-wrap items-center gap-2">
                <EditableText id="webapp-sp-suggesting">You're suggesting changes: each edited element is sent to the owner when you leave it.</EditableText>
                <button className="underline" onClick={() => setSuggesting(false)}>
                  <EditableText id="webapp-sp-stop-suggesting">Stop suggesting</EditableText>
                </button>
              </span>
            ) : (
              <EditableText id="webapp-sp-readonly">You're reading this screenplay. Only its team can edit it.</EditableText>
            )}
            {canSuggest && !suggesting && (
              <WorkContributeSection kind="screenplay" workId={id} onSuggestChanges={() => setSuggesting(true)} />
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 py-4">
          <div className="mx-auto max-w-[8.5in] space-y-6 bg-background px-6 py-8 font-mono text-[15px] leading-6 shadow-sm sm:px-16">
            {scenes.map((s) => {
              const list = orderedBlocks.byScene.get(s.scene_id) ?? [];
              return (
                <div key={s.scene_id} id={`scene-${s.scene_id}`} className="group/scene space-y-2">
                  <div className="flex items-start gap-2">
                    <AutoText
                      value={s.slugline}
                      readOnly={!writable}
                      onChange={(v) => {
                        setScenes((ss) => ss.map((x) => (x.scene_id === s.scene_id ? { ...x, slugline: v } : x)));
                        if (canEdit) queue("scene", s.scene_id, { slugline: v });
                      }}
                      onBlur={() => suggestScene(s)}
                      className="font-bold uppercase"
                    />
                    <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover/scene:opacity-100 max-md:opacity-100">
                      {user && (
                        <button onClick={() => setRevScene(s)} title="Revisions" className="p-1 text-muted-foreground hover:text-foreground">
                          <History className="h-4 w-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => removeScene(s)} title="Delete scene" className="p-1 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </div>
                  {list.map((b, i) => (
                    <div key={b.block_id} className="group/blk relative">
                      {canEdit && (
                        <select
                          value={b.block_type}
                          onChange={(e) => setBlockType(b, e.target.value as BlockType)}
                          className="mb-0.5 hidden rounded border bg-background px-1 font-sans text-[11px] group-focus-within/blk:block sm:absolute sm:-left-2 sm:top-0 sm:mb-0 sm:block sm:-translate-x-full sm:opacity-0 sm:group-hover/blk:opacity-100 sm:group-focus-within/blk:opacity-100"
                          aria-label="Element type"
                        >
                          {BLOCK_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <AutoText
                        id={`blk-${b.block_id}`}
                        value={b.text === " " ? "" : b.text}
                        readOnly={!writable}
                        placeholder={BLOCK_TYPES.find((t) => t.value === b.block_type)?.label}
                        onChange={(v) => setBlockText(b, v)}
                        onKeyDown={onBlockKey(s, b, i, list)}
                        onBlur={() => suggestBlock(b)}
                        className={BLOCK_STYLE[b.block_type] ?? ""}
                      />
                      {pendingProposals
                        .filter((p) => p.target_block_id === b.block_id)
                        .map((p) => (
                          <p key={p.id} className="mt-1 whitespace-pre-wrap rounded bg-purple-50 px-2 py-1 text-purple-800" title={p.author_email ?? undefined}>
                            <EditableText id="webapp-sp-suggested" className="mr-1 font-sans text-[10px] uppercase tracking-wide text-purple-500">
                              Suggested
                            </EditableText>
                            {p.proposed_text}
                          </p>
                        ))}
                      <div className="font-sans">
                        <BlockBranches
                          block={b as unknown as ScreenplayBlock}
                          branches={branches.filter((br) => br.block_id === b.block_id)}
                          editable={!!user}
                          canCreate={!!user}
                          canEditBranch={canEditBranch}
                          onCreate={(text) => branchActions.create(b, text)}
                          onSave={branchActions.save}
                          onDelete={branchActions.remove}
                        />
                      </div>
                    </div>
                  ))}
                  {canEdit && list.length === 0 && (
                    <button className="text-sm text-muted-foreground underline" onClick={() => addBlockAfter(s, null, "action")}>
                      <EditableText id="webapp-sp-add-element">Add an element</EditableText>
                    </button>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={addScene} className="font-sans">
                <Plus className="mr-1 h-4 w-4" />
                <EditableText id="webapp-sp-new-scene">New scene</EditableText>
              </Button>
            )}
            {canEdit && (
              <EditableText id="webapp-sp-hint" as="p" className="font-sans text-xs text-muted-foreground">
                Enter adds the next element · Tab changes the element type · Backspace on an empty element removes it
              </EditableText>
            )}
          </div>
        </div>
      </section>
      {review && !isMobile && (
        <aside className="w-80 shrink-0 border-l">
          <WorkReviewPanel kind="screenplay" workId={id} onApplied={load} />
        </aside>
      )}
      {review && isMobile && (
        <Sheet open={review} onOpenChange={setReview}>
          <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
            <WorkReviewPanel kind="screenplay" workId={id} onApplied={load} />
          </SheetContent>
        </Sheet>
      )}
      {fileActions.dialog}
      {revScene && <RevisionsDialog open onOpenChange={(o) => !o && setRevScene(null)} screenplayId={id} sceneId={revScene.scene_id} title={revScene.slugline} onRestored={load} />}
    </div>
  );
};

export default ScreenplayEditor;
