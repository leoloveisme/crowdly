import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Highlighter, Minus, Plus, StickyNote, Trash2, ExternalLink } from "lucide-react";
import { useTabTitle, useWorkspace } from "@web/shell/workspace";
import { platformLink } from "@web/lib/api";
import { addLibraryStory, getPosition, savePosition, sendReadingSessions, syncHighlights, type Highlight } from "@web/lib/discovery";
import { loadReadable, type Block, type Loaded } from "./content";
import { OverlayBubble } from "@/components/story/media/FrameView";
import { listEditions } from "@/lib/mediaApi";
import { listWorkEditions } from "@/lib/workApi";

// The reader (desktop: ui/discovery/reader_widget.py): remembers where you
// stopped, counts active reading time, and keeps highlights + notes that
// re-attach to their quote even after the text is edited. Everything syncs
// through library.js so the desktop app sees the same position and notes.

const COLORS: Record<string, string> = { yellow: "#fde68a", green: "#bbf7d0", blue: "#bfdbfe", pink: "#fbcfe8" };
const THEMES = { light: "bg-white text-neutral-900", sepia: "bg-[#f4ecd8] text-[#3b2f1e]", dark: "bg-neutral-900 text-neutral-100" } as const;
const uuid = () => crypto.randomUUID();

function deviceId() {
  let d = localStorage.getItem("crowdly_webapp_device");
  if (!d) {
    d = `web-${uuid()}`;
    localStorage.setItem("crowdly_webapp_device", d);
  }
  return d;
}

/** Wrap the first occurrence of `quote` inside `root` (single text node match). */
function markQuote(root: HTMLElement, quote: string, color: string, id: string) {
  if (!quote) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node.textContent ?? "";
    const at = t.indexOf(quote);
    if (at === -1) continue;
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + quote.length);
    const mark = document.createElement("mark");
    mark.style.background = color;
    mark.dataset.hl = id;
    range.surroundContents(mark);
    return true;
  }
  return false;
}

const BlockView: React.FC<{ b: Block; i: number }> = React.memo(({ b, i }) => {
  if (b.kind === "image") {
    if (!b.overlays?.length) return <img data-idx={i} src={b.src} alt={b.alt} className="mx-auto my-4 max-h-[90vh] rounded" loading="lazy" />;
    // Comic text layers sit over the page at x/y percent of the image.
    return (
      <div data-idx={i} className="relative mx-auto my-4 w-fit">
        <img src={b.src} alt={b.alt} className="block max-h-[90vh] rounded" loading="lazy" />
        {b.overlays.map((o, k) => (
          <OverlayBubble key={k} overlay={o} />
        ))}
      </div>
    );
  }
  if (b.kind === "heading") {
    const Tag = (`h${b.level}` as unknown) as "h2";
    return <Tag data-idx={i} className={b.level === 1 ? "mb-4 mt-8 text-3xl font-bold" : b.level === 2 ? "mb-3 mt-8 text-2xl font-semibold" : "mb-2 mt-6 text-lg font-semibold"} dangerouslySetInnerHTML={{ __html: b.html }} />;
  }
  return <div data-idx={i} className="wa-prose mb-[0.9em]" dangerouslySetInnerHTML={{ __html: b.html }} />;
});
BlockView.displayName = "BlockView";

const ReaderPage: React.FC = () => {
  const { kind = "story", id = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { prefs, setPrefs, setStatus } = useWorkspace();
  const [data, setData] = useState<(Loaded & { libraryItemId?: string }) | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState<{ quote: string; block: number; x: number; y: number } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [editions, setEditions] = useState<{ id: string; name: string; status: string }[]>([]);
  const [editionId, setEditionId] = useState<string>("");
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const since = useRef(0);
  const restored = useRef(false);
  const localKey = `crowdly_webapp_read:${kind}:${id}`;

  useTabTitle(location.pathname, data?.title);

  // ---- load ------------------------------------------------------------------
  useEffect(() => {
    let off = false;
    restored.current = false;
    setData(null);
    setError(null);
    (async () => {
      try {
        const d = await loadReadable(kind, id, user?.id, editionId || undefined);
        if (off) return;
        setData(d);
        // Crowdly stories become "crowdly_story" library items so their
        // position/notes sync like books (desktop does the same).
        let lib = d.libraryItemId ?? null;
        if (!lib && kind === "story" && user) lib = (await addLibraryStory(id).catch(() => null))?.id ?? null;
        if (!off) setItemId(lib);
      } catch (err) {
        if (!off) setError((err as Error).message);
      }
    })();
    return () => {
      off = true;
    };
  }, [kind, id, user, editionId]);

  // Editions (a branch picked per paragraph / element / page) to read instead of the current text.
  useEffect(() => {
    setEditionId(new URLSearchParams(location.search).get("edition") ?? "");
    const list =
      kind === "story" ? listEditions(id) : kind === "screenplay" || kind === "comic" ? listWorkEditions(kind, id) : Promise.resolve([]);
    list.then((rows) => setEditions(rows)).catch(() => setEditions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  // ---- position --------------------------------------------------------------
  const blocks = data?.mode === "blocks" ? data.blocks : [];
  const currentBlock = useRef(0);

  useEffect(() => {
    if (!data || restored.current) return;
    (async () => {
      let loc: { block?: number; time?: number } | null = null;
      if (itemId) loc = ((await getPosition(itemId).catch(() => null))?.locator as typeof loc) ?? null;
      if (!loc) {
        try {
          loc = JSON.parse(localStorage.getItem(localKey) ?? "null");
        } catch {
          loc = null;
        }
      }
      restored.current = true;
      if (!loc) return;
      if (data.mode === "audio" && audio.current && loc.time) audio.current.currentTime = loc.time;
      if (data.mode === "blocks" && loc.block) requestAnimationFrame(() => scroller.current?.querySelector(`[data-idx="${loc!.block}"]`)?.scrollIntoView());
    })();
  }, [data, itemId, localKey]);

  const persist = useCallback(
    (locator: Record<string, unknown>, pct: number) => {
      localStorage.setItem(localKey, JSON.stringify(locator));
      if (itemId) savePosition(itemId, pct, locator).catch(() => {});
    },
    [itemId, localKey],
  );

  useEffect(() => {
    if (data?.mode !== "blocks" || !scroller.current) return;
    const root = scroller.current;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const top = root.getBoundingClientRect().top;
      const els = root.querySelectorAll<HTMLElement>("[data-idx]");
      let idx = 0;
      for (const el of els) {
        if (el.getBoundingClientRect().bottom > top + 40) {
          idx = Number(el.dataset.idx);
          break;
        }
      }
      currentBlock.current = idx;
      const pct = blocks.length ? Math.round(((idx + 1) / blocks.length) * 100) : 0;
      setPercent(pct);
      if (t) clearTimeout(t);
      t = setTimeout(() => restored.current && persist({ block: idx }, pct), 1500);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [data, blocks.length, persist]);

  useEffect(() => {
    setStatus({ message: `${percent}%` });
  }, [percent, setStatus]);

  // ---- reading time (active time only) -------------------------------------------
  useEffect(() => {
    if (!itemId) return;
    let started = new Date();
    let seconds = 0;
    let lastActive = Date.now();
    const bump = () => (lastActive = Date.now());
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActive < 120_000) seconds += 1;
    }, 1000);
    const flush = () => {
      if (seconds >= 10) sendReadingSessions([{ id: uuid(), libraryItemId: itemId, startedAt: started.toISOString(), endedAt: new Date().toISOString(), seconds }]).catch(() => {});
      started = new Date();
      seconds = 0;
    };
    const every = setInterval(flush, 60_000);
    ["scroll", "keydown", "pointermove", "touchstart"].forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    return () => {
      clearInterval(tick);
      clearInterval(every);
      flush();
      ["scroll", "keydown", "pointermove", "touchstart"].forEach((e) => window.removeEventListener(e, bump, { capture: true }));
    };
  }, [itemId]);

  // ---- highlights -------------------------------------------------------------------
  const hlKey = `crowdly_webapp_hl:${kind}:${id}`;
  const pushHighlights = useCallback(
    async (changes: Highlight[]) => {
      if (itemId) {
        try {
          const r = await syncHighlights(itemId, deviceId(), since.current, changes);
          since.current = r.ack;
          setHighlights((hs) => {
            const map = new Map(hs.map((h) => [h.id, h]));
            for (const h of r.highlights) map.set(h.id, h);
            return [...map.values()].filter((h) => !h.deleted);
          });
          return;
        } catch {
          /* fall through to local */
        }
      }
      setHighlights((hs) => {
        const map = new Map(hs.map((h) => [h.id, h]));
        for (const h of changes) map.set(h.id, h);
        const next = [...map.values()].filter((h) => !h.deleted);
        localStorage.setItem(hlKey, JSON.stringify(next));
        return next;
      });
    },
    [itemId, hlKey],
  );

  useEffect(() => {
    if (itemId) {
      since.current = 0;
      pushHighlights([]);
    } else {
      try {
        setHighlights(JSON.parse(localStorage.getItem(hlKey) ?? "[]"));
      } catch {
        setHighlights([]);
      }
    }
  }, [itemId, hlKey, pushHighlights]);

  // Paint highlights (re-attached by quote, so edits elsewhere don't break them).
  useLayoutEffect(() => {
    const root = content.current;
    if (!root) return;
    root.querySelectorAll("mark[data-hl]").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
    root.normalize();
    for (const h of highlights) {
      const b = Number((h.locator as { block?: number }).block);
      const el = (Number.isFinite(b) && root.querySelector<HTMLElement>(`[data-idx="${b}"]`)) || null;
      if (!(el && markQuote(el, h.quote, COLORS[h.color] ?? COLORS.yellow, h.id))) markQuote(root, h.quote, COLORS[h.color] ?? COLORS.yellow, h.id);
    }
  }, [highlights, data]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    const quote = sel?.toString().trim() ?? "";
    if (!sel || !quote || quote.length > 2000 || !content.current?.contains(sel.anchorNode)) return setSelection(null);
    const el = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest<HTMLElement>("[data-idx]");
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelection({ quote, block: Number(el?.dataset.idx ?? currentBlock.current), x: rect.left + rect.width / 2, y: rect.top });
  };

  const addHighlight = (color: string, withNote = false) => {
    if (!selection) return;
    const h: Highlight = { id: uuid(), color, note: "", quote: selection.quote, locator: { block: selection.block }, updated_at: new Date().toISOString() };
    pushHighlights([h]);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (withNote) setNotesOpen(true);
  };

  const fontSize = prefs.readerFontSize;
  const theme = THEMES[prefs.readerTheme] ?? THEMES.light;
  const sorted = useMemo(() => [...highlights].sort((a, b) => Number((a.locator as { block?: number }).block ?? 0) - Number((b.locator as { block?: number }).block ?? 0)), [highlights]);

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  return (
    <div className={`flex h-full flex-col ${theme}`}>
      <div className="flex items-center gap-1 border-b border-current/10 px-3 py-1.5 text-sm">
        <span className="mr-auto truncate font-medium">
          {data.title}
          {data.mode === "blocks" && data.author ? <span className="font-normal opacity-60"> — {data.author}</span> : null}
        </span>
        {data.mode === "blocks" && editions.length > 0 && (
          <select value={editionId} onChange={(e) => setEditionId(e.target.value)} className="h-7 max-w-[10rem] rounded border bg-transparent px-1 text-xs" aria-label="Edition">
            <option value="">Current version</option>
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.status === "draft" ? " (draft)" : ""}
              </option>
            ))}
          </select>
        )}
        {data.mode === "blocks" && (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPrefs({ readerFontSize: Math.max(12, fontSize - 1) })} aria-label="Smaller text">
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-6 text-center text-xs">{fontSize}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPrefs({ readerFontSize: Math.min(32, fontSize + 1) })} aria-label="Bigger text">
              <Plus className="h-4 w-4" />
            </Button>
            <select value={prefs.readerTheme} onChange={(e) => setPrefs({ readerTheme: e.target.value as "light" | "sepia" | "dark" })} className="h-7 rounded border bg-transparent px-1 text-xs" aria-label="Theme">
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
            </select>
            <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setNotesOpen(true)}>
              <StickyNote className="h-4 w-4" />
              {highlights.length}
            </Button>
          </>
        )}
        {kind !== "library" && (
          <a href={platformLink(`/${kind}/${id}`)} target="_blank" rel="noreferrer" className="rounded p-1.5 hover:bg-black/5" title="Open on the platform">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {data.mode === "pdf" && <iframe title={data.title} src={data.url} className="min-h-0 flex-1" />}
      {data.mode === "audio" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-xl font-medium">{data.title}</p>
          <audio
            ref={audio}
            controls
            src={data.url}
            className="w-full max-w-xl"
            onTimeUpdate={(e) => {
              const a = e.currentTarget;
              const pct = a.duration ? Math.round((a.currentTime / a.duration) * 100) : 0;
              setPercent(pct);
              if (Math.floor(a.currentTime) % 10 === 0 && restored.current) persist({ time: a.currentTime }, pct);
            }}
          />
          <div className="flex gap-2 text-sm">
            {[0.75, 1, 1.25, 1.5, 2].map((r) => (
              <button key={r} onClick={() => audio.current && (audio.current.playbackRate = r)} className="rounded border px-2 py-0.5">
                {r}×
              </button>
            ))}
          </div>
        </div>
      )}
      {data.mode === "blocks" && (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto" onMouseUp={onMouseUp} onTouchEnd={() => setTimeout(onMouseUp, 50)}>
          <article
            ref={content}
            dir={data.rtl ? "rtl" : undefined}
            className={`mx-auto px-5 py-8 font-serif leading-relaxed ${data.comic ? "max-w-4xl" : "max-w-2xl"}`}
            style={{ fontSize }}
          >
            {blocks.map((b, i) => (
              <BlockView key={i} b={b} i={i} />
            ))}
            {blocks.length === 0 && (
              <EditableText id="webapp-reader-empty" as="p" className="opacity-60">
                There's nothing to read here yet.
              </EditableText>
            )}
          </article>
        </div>
      )}

      {selection && (
        <div className="fixed z-50 flex -translate-x-1/2 -translate-y-full gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md" style={{ left: selection.x, top: selection.y - 6 }}>
          {Object.entries(COLORS).map(([name, c]) => (
            <button key={name} onMouseDown={(e) => e.preventDefault()} onClick={() => addHighlight(name)} className="h-6 w-6 rounded-full border" style={{ background: c }} aria-label={`Highlight ${name}`} />
          ))}
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => addHighlight("yellow", true)} className="flex items-center gap-1 rounded px-1.5 text-xs hover:bg-muted">
            <Highlighter className="h-3.5 w-3.5" />
            <EditableText id="webapp-reader-note">Note</EditableText>
          </button>
        </div>
      )}

      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              <EditableText id="webapp-reader-notes">Highlights and notes</EditableText>
            </SheetTitle>
          </SheetHeader>
          <ul className="mt-3 space-y-3">
            {sorted.length === 0 && (
              <li className="text-sm text-muted-foreground">
                <EditableText id="webapp-reader-notes-empty">Select text to highlight it or add a note.</EditableText>
              </li>
            )}
            {sorted.map((h) => (
              <li key={h.id} className="space-y-1 rounded border p-2 text-sm">
                <button
                  className="block text-left"
                  style={{ background: COLORS[h.color] ?? COLORS.yellow }}
                  onClick={() => {
                    setNotesOpen(false);
                    content.current?.querySelector(`mark[data-hl="${h.id}"]`)?.scrollIntoView({ block: "center" });
                  }}
                >
                  {h.quote}
                </button>
                <Textarea
                  defaultValue={h.note}
                  rows={2}
                  placeholder="Add a note"
                  onBlur={(e) => e.target.value !== h.note && pushHighlights([{ ...h, note: e.target.value, updated_at: new Date().toISOString() }])}
                />
                <button className="text-destructive" onClick={() => pushHighlights([{ ...h, deleted: true, updated_at: new Date().toISOString() }])} aria-label="Delete highlight">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ReaderPage;

