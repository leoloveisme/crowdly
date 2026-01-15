import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./app.css";
import Header, { InterfaceLanguage } from "./Header";

type BlockKind = "title" | "chapter" | "paragraph";

type Block = {
  id: string;
  kind: BlockKind;
  order: number;
  visible: boolean;
  html: string;
};

type PersistedState = {
  blocks: Array<Pick<Block, "id" | "kind" | "order" | "visible" | "html">>;
};

type UndoEntry = {
  prevBlocks: Block[];
  message: string;
};

const STORAGE_KEY = "web-editor:blocks:v1";

// In this standalone editor, talk directly to the Crowdly backend.
// Prefer VITE_API_BASE_URL if provided; otherwise fall back to using
// the current hostname on port 4000 so it works from both desktop and
// mobile devices on the same LAN.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

const TITLE_POOL = 3;
const CHAPTER_POOL = 10;
const PARAGRAPH_POOL = 50;

function buildInitialBlocks(): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < TITLE_POOL; i++) {
    blocks.push({
      id: `title-${i}`,
      kind: "title",
      order: 1000 + blocks.length,
      visible: i === 0,
      html: i === 0 ? "Title of the story" : "",
    });
  }

  for (let i = 0; i < CHAPTER_POOL; i++) {
    blocks.push({
      id: `chapter-${i}`,
      kind: "chapter",
      order: 1000 + blocks.length,
      visible: i === 0,
      html: i === 0 ? "Chapter 1 - Journey into wilderness" : "",
    });
  }

  for (let i = 0; i < PARAGRAPH_POOL; i++) {
    blocks.push({
      id: `p-${i}`,
      kind: "paragraph",
      order: 1000 + blocks.length,
      visible: i < 2,
      html:
        i === 0
          ? "Some text with some text"
          : i === 1
            ? "Another paragraph with some more text"
            : "",
    });
  }

  // Set initial visible order: title, chapter, p0, p1.
  const byId = new Map(blocks.map((b) => [b.id, b]));
  byId.get("title-0")!.order = 0;
  byId.get("chapter-0")!.order = 1;
  byId.get("p-0")!.order = 2;
  byId.get("p-1")!.order = 3;

  return blocks;
}

function normalizeOrders(blocks: Block[]): Block[] {
  const visible = blocks
    .filter((b) => b.visible)
    .slice()
    .sort((a, b) => a.order - b.order);

  const next = blocks.map((b) => ({ ...b }));
  const byId = new Map(next.map((b) => [b.id, b]));

  visible.forEach((b, idx) => {
    const ref = byId.get(b.id);
    if (ref) ref.order = idx;
  });

  // Keep hidden blocks after visible ones.
  let tail = visible.length;
  next
    .filter((b) => !b.visible)
    .forEach((b) => {
      b.order = 1000 + tail++;
    });

  return next;
}

function elementId(blockId: string) {
  return `field-${blockId}`;
}

const greetingsByLanguage: Record<InterfaceLanguage, string[]> = {
  english: ["Welcome", "Hello", "Hi", "Hey", "Greetings"],
  russian: ["Добро пожаловать", "Здравствуйте", "Привет"],
  chinese_simpl: ["欢迎", "你好"],
  chinese_trad: ["歡迎", "你好"],
  portuguese: ["Bem-vindo", "Olá"],
  arabic: ["أهلاً وسهلاً", "مرحباً"],
  korean: ["환영합니다", "안녕하세요"],
  japanese: ["ようこそ", "こんにちは"],
};

const wishesByLanguage: Record<InterfaceLanguage, string[]> = {
  english: [
    "Have a great day",
    "Have a great month",
    "Have a great year",
    "Have a great life",
    "Have a thoughtful minute ;)",
  ],
  russian: ["Хорошего дня", "Хорошего месяца", "Хорошего года", "Хорошей жизни"],
  chinese_simpl: ["祝你有美好的一天"],
  chinese_trad: ["祝你有美好的一天"],
  portuguese: ["Tenha um ótimo dia", "Tenha um ótimo ano"],
  arabic: ["أتمنى لك يوماً سعيداً"],
  korean: ["좋은 하루 보내세요"],
  japanese: ["良い一日をお過ごしください"],
};

function pickRandom(list: string[], fallback: string): string {
  if (!list || list.length === 0) return fallback;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] ?? fallback;
}

const App: React.FC = () => {
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>("english");

  // When opened as /story/:id, treat the path segment as the
  // canonical story_title_id from the Crowdly backend so we can
  // load the same story content as the main platform.
  const [storyIdFromUrl] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/story\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [greeting, setGreeting] = useState<string>(() =>
    pickRandom(greetingsByLanguage["english"], "Welcome")
  );

  const [wish, setWish] = useState<string>(() =>
    pickRandom(wishesByLanguage["english"], "Have a great day")
  );

  const [authUser, setAuthUser] = useState<{ id: string; email: string; roles?: string[] } | null>(
    () => {
      try {
        const raw = localStorage.getItem("crowdly_auth_user");
        if (!raw) return null;
        return JSON.parse(raw) as { id: string; email: string; roles?: string[] };
      } catch {
        return null;
      }
    }
  );

  const [storyTitleId, setStoryTitleId] = useState<string | null>(() => {
    // If we are on /story/:id, prefer that ID as the canonical
    // story_title_id; otherwise fall back to whatever the web
    // editor last created.
    try {
      const match = window.location.pathname.match(/^\/story\/(.+)$/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
      return localStorage.getItem("web-editor:last-story-title-id") ?? null;
    } catch {
      return null;
    }
  });

  const storyCreationInFlightRef = useRef(false);
  const initialBlocksRef = useRef<Block[] | null>(null);

  const isLoggedIn = !!authUser;
  const username = authUser?.email || "username";

  const [blocks, setBlocks] = useState<Block[]>(() => {
    const base = buildInitialBlocks();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;

      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed?.blocks?.length) return base;

      const byId = new Map(base.map((b) => [b.id, b]));
      for (const saved of parsed.blocks) {
        const target = byId.get(saved.id);
        if (!target) continue;
        target.visible = !!saved.visible;
        target.order = typeof saved.order === "number" ? saved.order : target.order;
        target.html = typeof saved.html === "string" ? saved.html : target.html;
      }

      return normalizeOrders(Array.from(byId.values()));
    } catch {
      return base;
    }
  });

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  const DANGER_CONFIRM_TEXT =
    "Yes, I want to reset the story. I'm aware that I will lose ALL content from this story.";

  const pendingActivateIdRef = useRef<string | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTargetRef = useRef<HTMLElement | null>(null);

  const getHtmlFromDom = useCallback((blockId: string) => {
    return document.getElementById(elementId(blockId))?.innerHTML ?? "";
  }, []);

  const persistBlocks = useCallback((next: Block[]) => {
    try {
      const payload: PersistedState = {
        blocks: next.map(({ id, kind, order, visible, html }) => ({
          id,
          kind,
          order,
          visible,
          html,
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, []);

  const snapshotBlocksFromDom = useCallback(
    (src: Block[]) => {
      return src.map((b) => {
        if (!b.visible) return { ...b };
        return { ...b, html: getHtmlFromDom(b.id) };
      });
    },
    [getHtmlFromDom]
  );

  const saveAllFromDom = useCallback(() => {
    setBlocks((prev) => {
      const next = prev.map((b) => {
        const el = document.getElementById(elementId(b.id));
        if (!el) return b;
        if (!b.visible) return b;
        return { ...b, html: el.innerHTML };
      });

      persistBlocks(next);
      return next;
    });
  }, [persistBlocks]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const hideControlsEverywhere = useCallback(() => {
    document
      .querySelectorAll<HTMLElement>(".block.show-controls")
      .forEach((el) => el.classList.remove("show-controls"));
  }, []);

  const deactivateEditing = useCallback(
    (opts?: { skipSave?: boolean }) => {
      const Aloha = window.Aloha;

      try {
        if (typeof Aloha?.deactivateEditable === "function") {
          Aloha.deactivateEditable();
        }

        if (Aloha?.jQuery) {
          const $ = Aloha.jQuery;
          $(".aloha-editable").contentEditable(false);
        }
      } catch {
        // ignore
      }

      document.body.classList.remove("has-active-editable");
      setActiveBlockId(null);

      if (!opts?.skipSave) {
        saveAllFromDom();
      }
    },
    [saveAllFromDom]
  );

  const resetToSample = useCallback(() => {
    // Don't let the current DOM overwrite our reset state.
    deactivateEditing({ skipSave: true });
    hideControlsEverywhere();

    const next = buildInitialBlocks();
    setBlocks(next);
    persistBlocks(next);
  }, [deactivateEditing, hideControlsEverywhere, persistBlocks]);

  const activateEditing = useCallback((blockId: string) => {
    const Aloha = window.Aloha;
    if (!Aloha?.ready || !Aloha?.jQuery) return;

    Aloha.ready(() => {
      const $ = Aloha.jQuery;
      const id = elementId(blockId);

      // Only one active at a time.
      $(".aloha-editable").contentEditable(false);

      const $el = $(`#${id}`);
      $el.contentEditable(true);

      const node = document.getElementById(id);

      // Focus + put caret at end (click happened while contenteditable was false).
      if (node) {
        node.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(node);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } catch {
          // ignore
        }
      }

      const editable =
        typeof Aloha.getEditableById === "function" ? Aloha.getEditableById(id) : null;
      if (editable && typeof editable.activate === "function") {
        editable.activate();
      }

      document.body.classList.add("has-active-editable");
      setActiveBlockId(blockId);
    });
  }, []);

  const withNewBlockAfter = useCallback((sourceId: string, kind: BlockKind, html: string) => {
    let createdId: string | null = null;

    setBlocks((prev) => {
      const source = prev.find((b) => b.id === sourceId);
      if (!source) return prev;

      const slot = prev.find((b) => b.kind === kind && !b.visible);
      if (!slot) return prev;

      const next = prev.map((b) => ({ ...b }));
      const byId = new Map(next.map((b) => [b.id, b]));

      const target = byId.get(slot.id)!;
      target.visible = true;
      target.html = html;
      target.order = source.order + 0.1;

      createdId = target.id;
      return normalizeOrders(Array.from(byId.values()));
    });

    return createdId;
  }, []);

  const addChapterAfter = useCallback((sourceChapterId: string) => {
    let createdChapterId: string | null = null;

    setBlocks((prev) => {
      const source = prev.find((b) => b.id === sourceChapterId);
      if (!source || source.kind !== "chapter") return prev;

      const chapterSlot = prev.find((b) => b.kind === "chapter" && !b.visible);
      const paragraphSlot = prev.find((b) => b.kind === "paragraph" && !b.visible);
      if (!chapterSlot || !paragraphSlot) return prev;

      // Insert *after the entire current chapter section*, i.e. after all blocks
      // until the next chapter (or end of document).
      const visible = prev
        .filter((b) => b.visible)
        .slice()
        .sort((a, b) => a.order - b.order);

      const sourceIdx = visible.findIndex((b) => b.id === sourceChapterId);
      if (sourceIdx === -1) return prev;

      const nextChapterIdx = visible.findIndex(
        (b, idx) => idx > sourceIdx && b.kind === "chapter"
      );

      const anchorIdx = nextChapterIdx === -1 ? visible.length - 1 : nextChapterIdx - 1;
      const anchorOrder = visible[anchorIdx]?.order ?? source.order;

      const next = prev.map((b) => ({ ...b }));
      const byId = new Map(next.map((b) => [b.id, b]));

      const chapter = byId.get(chapterSlot.id)!;
      chapter.visible = true;
      chapter.html = "New chapter";
      chapter.order = anchorOrder + 0.1;

      const paragraph = byId.get(paragraphSlot.id)!;
      paragraph.visible = true;
      paragraph.html = "Some paragraph text";
      paragraph.order = anchorOrder + 0.2;

      createdChapterId = chapter.id;
      return normalizeOrders(Array.from(byId.values()));
    });

    return createdChapterId;
  }, []);

  const cloneChapterAfter = useCallback(
    (sourceChapterId: string) => {
      let createdChapterId: string | null = null;

      setBlocks((prev) => {
        const visible = prev
          .filter((b) => b.visible)
          .slice()
          .sort((a, b) => a.order - b.order);

        const sourceIdx = visible.findIndex(
          (b) => b.id === sourceChapterId && b.kind === "chapter",
        );
        if (sourceIdx === -1) return prev;

        // Build the chapter section: chapter heading + its paragraphs until the
        // next chapter or title (or end of document).
        const section: Block[] = [];
        const source = visible[sourceIdx];
        section.push(source);
        for (let i = sourceIdx + 1; i < visible.length; i++) {
          const block = visible[i];
          if (block.kind === "chapter" || block.kind === "title") break;
          if (block.kind === "paragraph") section.push(block);
        }

        if (section.length === 0) return prev;

        const lastBlock = section[section.length - 1];
        const anchorOrder = lastBlock.order;
        const next = prev.map((b) => ({ ...b }));

        const now = Date.now();
        let offset = 0.1;

        section.forEach((src, idx) => {
          const newId = `${src.kind}-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          if (idx === 0) {
            createdChapterId = newId;
          }
          next.push({
            id: newId,
            kind: src.kind,
            order: anchorOrder + offset,
            visible: true,
            html: getHtmlFromDom(src.id) || src.html,
          });
          offset += 0.1;
        });

        return normalizeOrders(next);
      });

      return createdChapterId;
    },
    [getHtmlFromDom],
  );

  const cloneStoryAfter = useCallback(
    (sourceTitleId: string) => {
      setBlocks((prev) => {
        const visible = prev
          .filter((b) => b.visible)
          .slice()
          .sort((a, b) => a.order - b.order);

        const sourceIdx = visible.findIndex(
          (b) => b.id === sourceTitleId && b.kind === "title",
        );
        if (sourceIdx === -1) return prev;

        // Story section: from this title up to (but not including) the next
        // title, or end of document.
        const section: Block[] = [];
        const sourceTitle = visible[sourceIdx];
        section.push(sourceTitle);
        for (let i = sourceIdx + 1; i < visible.length; i++) {
          const block = visible[i];
          if (block.kind === "title") break;
          section.push(block);
        }

        if (section.length === 0) return prev;

        const lastBlock = section[section.length - 1];
        const anchorOrder = lastBlock.order;
        const next = prev.map((b) => ({ ...b }));

        const now = Date.now();
        let offset = 0.1;

        section.forEach((src, idx) => {
          const newId = `${src.kind}-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          next.push({
            id: newId,
            kind: src.kind,
            order: anchorOrder + offset,
            visible: true,
            html: getHtmlFromDom(src.id) || src.html,
          });
          offset += 0.1;
        });

        return normalizeOrders(next);
      });
    },
    [getHtmlFromDom],
  );

  const showUndo = useCallback((entry: UndoEntry) => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    setUndoEntry(entry);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoEntry(null);
      undoTimerRef.current = null;
    }, 8000);
  }, []);

  const undoLastDelete = useCallback(() => {
    if (!undoEntry) return;

    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    // Avoid saveAllFromDom() overwriting the restored state.
    deactivateEditing({ skipSave: true });

    setBlocks(undoEntry.prevBlocks);
    persistBlocks(undoEntry.prevBlocks);
    setUndoEntry(null);
  }, [deactivateEditing, persistBlocks, undoEntry]);

  const requestDeleteBlock = useCallback(
    (blockId: string) => {
      const snapshot = snapshotBlocksFromDom(blocks);
      const target = snapshot.find((b) => b.id === blockId);
      if (!target) return;

      // Determine which blocks should be deleted.
      // For chapters, delete the chapter *and all following paragraphs* until the next chapter.
      const idsToDelete = new Set<string>();
      idsToDelete.add(blockId);

      if (target.kind === "title") {
        const visibleTitles = snapshot.filter((b) => b.visible && b.kind === "title").length;
        if (visibleTitles === 1) {
          const ok = window.confirm("This is the story title. Delete it anyway?");
          if (!ok) return;
        }
      }

      if (target.kind === "chapter") {
        const visibleChapters = snapshot.filter(
          (b) => b.visible && b.kind === "chapter"
        ).length;

        if (visibleChapters === 1) {
          const ok = window.confirm(
            "This is the last chapter. Delete it anyway?"
          );
          if (!ok) return;
        }

        const visible = snapshot
          .filter((b) => b.visible)
          .slice()
          .sort((a, b) => a.order - b.order);

        const idx = visible.findIndex((b) => b.id === blockId);
        if (idx !== -1) {
          for (let i = idx + 1; i < visible.length; i++) {
            const b = visible[i];
            if (b.kind === "chapter") break;
            if (b.kind === "paragraph") idsToDelete.add(b.id);
          }
        }
      }

      // If the active editable is inside what we're deleting, stop editing first.
      if (activeBlockId && idsToDelete.has(activeBlockId)) {
        // Don't save from DOM here; we've already captured it in `snapshot`.
        deactivateEditing({ skipSave: true });
      }

      const next = normalizeOrders(
        snapshot.map((b) =>
          idsToDelete.has(b.id) ? { ...b, visible: false, html: "" } : { ...b }
        )
      );

      setBlocks(next);
      persistBlocks(next);

      const label =
        target.kind === "title"
          ? "Title"
          : target.kind === "chapter"
            ? "Chapter"
            : "Paragraph";

      showUndo({
        prevBlocks: snapshot,
        message: idsToDelete.size > 1 ? `${label} section deleted` : `${label} deleted`,
      });
    },
    [
      activeBlockId,
      blocks,
      deactivateEditing,
      persistBlocks,
      showUndo,
      snapshotBlocksFromDom,
    ]
  );

  // Remember the very first blocks array so we can detect the
  // first *change* caused by the user. This lets us delay backend
  // story creation until the user actually edits something.
  useEffect(() => {
    if (!initialBlocksRef.current) {
      initialBlocksRef.current = blocks;
    }
  }, [blocks]);

  // When editing an existing story via /story/:id, load the
  // canonical story title + chapters from the Crowdly backend and
  // map them into the Aloha block model. The backend is the source
  // of truth for the initial content; subsequent edits are local
  // (for now) but start from the same data as the platform.
  useEffect(() => {
    if (!storyIdFromUrl) return;
    if (!storyTitleId || storyTitleId !== storyIdFromUrl) return;

    let cancelled = false;

    const loadStoryIntoBlocks = async () => {
      try {
        // 1) Fetch story title
        const titleRes = await fetch(`${API_BASE}/story-titles/${encodeURIComponent(storyTitleId)}`);
        if (!titleRes.ok) {
          // Do not crash editor if backend is unavailable; just keep local blocks.
          return;
        }
        const titleRow = (await titleRes.json()) as { title?: string };

        // 2) Fetch chapters
        const params = new URLSearchParams({ storyTitleId: storyTitleId });
        const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
        if (!chaptersRes.ok) {
          return;
        }
        const chapters = (await chaptersRes.json()) as Array<{
          chapter_id: string;
          chapter_title: string;
          paragraphs: string[] | null;
        }>;

        if (cancelled) return;

        setBlocks((prev) => {
          // Start from a fresh pool so we don't mix old sample
          // content with loaded story content.
          const base = buildInitialBlocks().map((b) => ({ ...b, visible: false, html: "" }));

          let order = 0;

          // Title
          const titleBlock = base.find((b) => b.kind === "title");
          if (titleBlock) {
            titleBlock.visible = true;
            titleBlock.order = order++;
            titleBlock.html = (titleRow.title || "Untitled story").replace(/</g, "&lt;");
          }

          // Chapters + paragraphs
          const chapterPool = base.filter((b) => b.kind === "chapter");
          const paragraphPool = base.filter((b) => b.kind === "paragraph");
          let chapterIdx = 0;
          let paragraphIdx = 0;

          for (const ch of chapters) {
            const chapterBlock = chapterPool[chapterIdx++];
            if (!chapterBlock) break;
            chapterBlock.visible = true;
            chapterBlock.order = order++;
            chapterBlock.html = (ch.chapter_title || "").replace(/</g, "&lt;");

            const paras = Array.isArray(ch.paragraphs) ? ch.paragraphs : [];
            for (const text of paras) {
              const pBlock = paragraphPool[paragraphIdx++];
              if (!pBlock) break;
              pBlock.visible = true;
              pBlock.order = order++;
              pBlock.html = String(text || "").replace(/</g, "&lt;");
            }
          }

          const next = normalizeOrders(base);
          // Also update persisted blocks so refresh keeps this state.
          persistBlocks(next);
          return next;
        });
      } catch {
        // Ignore backend errors; fall back to existing local blocks.
      }
    };

    void loadStoryIntoBlocks();

    return () => {
      cancelled = true;
    };
  }, [storyIdFromUrl, storyTitleId, persistBlocks]);

  const createStoryFromBlocks = useCallback(
    async (currentBlocks: Block[]) => {
      if (!authUser?.id) return;
      if (storyTitleId) return;
      if (storyCreationInFlightRef.current) return;

      storyCreationInFlightRef.current = true;

      try {
        const snapshot = snapshotBlocksFromDom(currentBlocks);
        const visible = snapshot
          .filter((b) => b.visible)
          .slice()
          .sort((a, b) => a.order - b.order);

        const titleBlock = visible.find((b) => b.kind === "title");
        const chapterBlock = visible.find((b) => b.kind === "chapter");
        const paragraphBlocks = visible.filter((b) => b.kind === "paragraph");

        const stripHtml = (html: string) =>
          html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

        const titleText = stripHtml(titleBlock?.html || "Title of the story") || "Title of the story";
        const chapterTitleText =
          stripHtml(chapterBlock?.html || "Chapter 1 - Journey into wilderness") ||
          "Chapter 1 - Journey into wilderness";

        const paragraphs = paragraphBlocks
          .map((b) => stripHtml(b.html))
          .filter((text) => text.length > 0);

        const payload = {
          title: titleText,
          chapterTitle: chapterTitleText,
          paragraphs: paragraphs.length > 0 ? paragraphs : [""],
          userId: authUser.id,
          creativeSpaceId: null as string | null,
        };

        try {
          const res = await fetch(`${API_BASE}/stories/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const body = await res.json().catch(() => ({}));

          if (!res.ok) {
            console.error("[web-editor] Failed to create story template", {
              status: res.status,
              body,
            });
            if (typeof window !== "undefined") {
              window.alert(
                (body && (body.error || body.details)) ||
                  "Failed to create story on the Crowdly backend.",
              );
            }
            return;
          }

          const newId = (body as any).storyTitleId as string | undefined;
          if (!newId) {
            console.error("[web-editor] /stories/template missing storyTitleId", body);
            return;
          }

          setStoryTitleId(newId);
          try {
            localStorage.setItem("web-editor:last-story-title-id", newId);
          } catch {
            // ignore storage errors
          }
        } catch (err) {
          console.error("[web-editor] Error while creating story template", err);
          if (typeof window !== "undefined") {
            window.alert("Unexpected error while creating story on the backend.");
          }
        }
      } finally {
        storyCreationInFlightRef.current = false;
      }
    },
    [authUser, snapshotBlocksFromDom, storyTitleId],
  );

  const resetStoryOnBackendToSample = useCallback(
    async (): Promise<boolean> => {
      if (!authUser?.id || !storyTitleId) return false;

      const payload = {
        userId: authUser.id,
        title: "Title of the story",
        chapters: [
          {
            chapterTitle: "Chapter 1 - Journey into wilderness",
            paragraphs: [
              "Some text with some text",
              "Another paragraph with some more text",
            ],
          },
        ],
      };

      try {
        const res = await fetch(
          `${API_BASE}/story-titles/${encodeURIComponent(storyTitleId)}/sync-desktop`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[web-editor] Failed to reset story on backend", {
            status: res.status,
            body,
          });
          if (typeof window !== "undefined") {
            window.alert(
              (body && (body.error || body.details)) ||
                "Failed to reset story on the Crowdly backend.",
            );
          }
          return false;
        }
        return true;
      } catch (err) {
        console.error("[web-editor] Error while resetting story on backend", err);
        if (typeof window !== "undefined") {
          window.alert("Unexpected error while resetting story on the backend.");
        }
        return false;
      }
    },
    [authUser?.id, storyTitleId],
  );

  // Whenever the blocks change for the first time after mount and we
  // don't yet have a storyTitleId, create a real story in the Crowdly
  // database so the footer can show a true story ID. When editing an
  // existing story via /story/:id, skip auto-creation and rely on the
  // existing story_title_id instead.
  useEffect(() => {
    if (!authUser?.id) return;
    if (storyIdFromUrl) return; // do not create a new story when bound to an existing one
    if (storyTitleId) return;
    if (!initialBlocksRef.current) return;
    if (blocks === initialBlocksRef.current) return;

    void createStoryFromBlocks(blocks);
  }, [authUser, blocks, createStoryFromBlocks, storyIdFromUrl, storyTitleId]);

  // Bootstrap Aloha once.
  useEffect(() => {
    let cancelled = false;

    const bootstrapAlohaOnce = () => {
      if (cancelled) return;

      const Aloha = window.Aloha;
      if (!Aloha?.ready || !Aloha?.jQuery) {
        window.setTimeout(bootstrapAlohaOnce, 50);
        return;
      }

      Aloha.ready(() => {
        if (cancelled) return;

        const $ = Aloha.jQuery;
        const $editables = $(".aloha-editable:not([data-aloha-bootstrapped])");
        $editables.attr("data-aloha-bootstrapped", "true");
        $editables.aloha();

        // Default to reading mode.
        $(".aloha-editable").contentEditable(false);
        document.body.classList.remove("has-active-editable");
      });
    };

    bootstrapAlohaOnce();

    return () => {
      cancelled = true;
    };
  }, []);

  // Click-away: hide controls + stop editing + save.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If you click outside the currently active editable block, deactivate.
      if (activeBlockId) {
        const activeEl = document.getElementById(elementId(activeBlockId));
        if (activeEl && !activeEl.contains(target)) {
          deactivateEditing();
        }
      }

      // Clicking anywhere else hides hover/long-press controls.
      if (!target.closest(".block")) {
        hideControlsEverywhere();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [activeBlockId, deactivateEditing, hideControlsEverywhere]);

  useEffect(() => {
    const id = pendingActivateIdRef.current;
    if (!id) return;

    // The new block should now be in the DOM.
    pendingActivateIdRef.current = null;
    activateEditing(id);
  }, [blocks, activateEditing]);

  const hasVisibleContent = useMemo(() => blocks.some((b) => b.visible), [blocks]);

  useEffect(() => {
    const greetings = greetingsByLanguage[interfaceLanguage] ?? greetingsByLanguage["english"];
    const wishes = wishesByLanguage[interfaceLanguage] ?? wishesByLanguage["english"];

    setGreeting(pickRandom(greetings, greeting || "Welcome"));
    setWish(pickRandom(wishes, wish || "Have a great day"));
  }, [interfaceLanguage]);

  const handleLanguageChange = (language: InterfaceLanguage) => {
    setInterfaceLanguage(language);
  };

  const openAuthFromHeader = () => {
    // For now, route back to the landing page where the auth popup lives.
    window.location.href = "/";
  };

  const handleLogoutFromHeader = () => {
    try {
      localStorage.removeItem("crowdly_auth_user");
    } catch {
      // ignore
    }
    setAuthUser(null);
    window.location.href = "/";
  };

  // Render all blocks (including hidden) so Aloha can bootstrap them once.
  return (
    <div className="page">
      <Header
        language={interfaceLanguage}
        onLanguageChange={handleLanguageChange}
        greeting={greeting}
        username={username}
        wish={wish}
        isLoggedIn={isLoggedIn}
        onLoginClick={openAuthFromHeader}
        onLogoutClick={handleLogoutFromHeader}
        onRegisterClick={openAuthFromHeader}
      />

      <div className="topbar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => {
            setIsResetDialogOpen(true);
            setResetConfirmation("");
          }}
          title="Reset this story back to the original template (dangerous)"
        >
          Reset to sample
        </button>
      </div>
      {!hasVisibleContent ? (
        <div className="empty-state">
          <p>There is nothing left here.</p>
          <p>
            You can create a new story here{" "}
            <a href="http://localhost:8080/new-story-template">
              http://localhost:8080/new-story-template
            </a>
          </p>
        </div>
      ) : null}

      <div className="doc">
        {blocks.map((b) => {
          const fieldId = elementId(b.id);

          const controls =
            b.kind === "paragraph" ? (
              <div className="block-controls" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="control-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();

                    const newId = withNewBlockAfter(b.id, "paragraph", "New branch...");
                    if (newId) pendingActivateIdRef.current = newId;
                  }}
                >
                  Branch
                </button>
                <button
                  type="button"
                  className="control-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();
                    requestDeleteBlock(b.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ) : b.kind === "chapter" ? (
              <div className="block-controls" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="control-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();

                    const newChapterId = addChapterAfter(b.id);
                    if (newChapterId) pendingActivateIdRef.current = newChapterId;

                    // Persist after React has rendered the new chapter/paragraph.
                    window.setTimeout(saveAllFromDom, 0);
                  }}
                >
                  Add another chapter
                </button>
                <button
                  type="button"
                  className="control-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();

                    const newChapterId = cloneChapterAfter(b.id);
                    saveAllFromDom();
                    if (newChapterId) pendingActivateIdRef.current = newChapterId;
                  }}
                >
                  Clone
                </button>
                <button
                  type="button"
                  className="control-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();
                    requestDeleteBlock(b.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="block-controls" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="control-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();

                    // Clone the entire story (title + all chapters and paragraphs)
                    // and append it below the current one.
                    cloneStoryAfter(b.id);
                    saveAllFromDom();
                  }}
                >
                  Clone
                </button>
                <button
                  type="button"
                  className="control-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideControlsEverywhere();
                    requestDeleteBlock(b.id);
                  }}
                >
                  Delete
                </button>
              </div>
            );

          const wrapperProps = {
            className: `block block--${b.kind} ${b.visible ? "" : "is-hidden"} ${
              activeBlockId === b.id ? "is-active" : ""
            }`,
            style: { order: b.order },
            "data-block-id": b.id,
            onPointerEnter: (e: React.PointerEvent) => {
              // On mouse hover, show controls via :hover CSS.
              // Also clear any previous long-press state.
              if (longPressTargetRef.current && longPressTargetRef.current !== e.currentTarget) {
                longPressTargetRef.current.classList.remove("show-controls");
              }
            },
            onPointerLeave: (e: React.PointerEvent) => {
              // Hide long-press controls when pointer leaves.
              e.currentTarget.classList.remove("show-controls");
              clearLongPress();
            },
            onPointerDown: (e: React.PointerEvent) => {
              // Touch long-press to reveal controls.
              clearLongPress();
              hideControlsEverywhere();

              longPressTargetRef.current = e.currentTarget;
              longPressTimerRef.current = window.setTimeout(() => {
                e.currentTarget.classList.add("show-controls");
              }, 450);
            },
            onPointerUp: () => {
              clearLongPress();
            },
            onPointerCancel: () => {
              clearLongPress();
            },
          } as const;

          const editableProps = {
            id: fieldId,
            className: "aloha-editable",
            suppressContentEditableWarning: true,
            dangerouslySetInnerHTML: { __html: b.html },
            onPointerDown: (e: React.PointerEvent) => {
              // Activate on pointerdown so we can enable contenteditable + focus
              // before the click sequence finishes.
              e.stopPropagation();
              hideControlsEverywhere();
              activateEditing(b.id);
            },
          } as const;

          return (
            <div key={b.id} {...wrapperProps}>
              {controls}
              {b.kind === "title" ? (
                <h1 {...editableProps} />
              ) : b.kind === "chapter" ? (
                <h2 {...editableProps} />
              ) : (
                <p {...editableProps} />
              )}
            </div>
          );
        })}
      </div>

      <div className="story-id-footer">
        Story ID{" "}
        {storyTitleId ? (
          <>
            <a href={`/story/${storyTitleId}`}>{storyTitleId}</a>
            {" "}|{" "}
            <a
              href={`http://localhost:8080/story/${storyTitleId}`}
              target="_blank"
              rel="noreferrer"
            >
              open on Crowdly platform
            </a>
          </>
        ) : (
          <span>not yet created</span>
        )}
      </div>

      {undoEntry ? (
        <div className="undo-toast" onPointerDown={(e) => e.stopPropagation()}>
          <span className="undo-message">{undoEntry.message}</span>
          <button
            type="button"
            className="undo-btn"
            onClick={(e) => {
              e.stopPropagation();
              undoLastDelete();
            }}
          >
            Undo
          </button>
        </div>
      ) : null}

      {isResetDialogOpen && (
        <div
          onClick={() => {
            setIsResetDialogOpen(false);
            setResetConfirmation("");
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: "24px 28px",
              maxWidth: 520,
              width: "100%",
              boxSizing: "border-box",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
              color: "#111",
            }}
          >
            <h2
              style={{
                margin: 0,
                marginBottom: 12,
                fontSize: 18,
                fontWeight: 600,
                color: "#b00020",
              }}
            >
              Danger Zone: reset this story?
            </h2>
            <p
              style={{
                margin: 0,
                marginBottom: 12,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              This will delete your story and reset with the template content. This
              operation is <strong>IRREVERSIBLE</strong>!
            </p>
            <p
              style={{
                margin: 0,
                marginBottom: 8,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              To confirm, please type the following sentence exactly (including
              punctuation and capitalization):
            </p>
            <p
              style={{
                margin: 0,
                marginBottom: 8,
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "#f5f5f5",
                padding: "6px 8px",
                borderRadius: 6,
              }}
            >
              {DANGER_CONFIRM_TEXT}
            </p>
            <input
              type="text"
              value={resetConfirmation}
              onChange={(e) => setResetConfirmation(e.target.value)}
              placeholder={DANGER_CONFIRM_TEXT}
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.3)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsResetDialogOpen(false);
                  setResetConfirmation("");
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.25)",
                  backgroundColor: "#f5f5f5",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmation !== DANGER_CONFIRM_TEXT}
                onClick={async () => {
                  if (resetConfirmation !== DANGER_CONFIRM_TEXT) return;

                  // If this story already exists in the Crowdly backend,
                  // reset the persisted content there as well so 8080 and
                  // 5173 stay in sync.
                  let ok = true;
                  if (storyTitleId && authUser?.id) {
                    ok = await resetStoryOnBackendToSample();
                  }
                  if (!ok) return;

                  // Perform the existing local reset behavior.
                  resetToSample();
                  setIsResetDialogOpen(false);
                  setResetConfirmation("");
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 999,
                  border: "1px solid #b00020",
                  backgroundColor:
                    resetConfirmation === DANGER_CONFIRM_TEXT ? "#b00020" : "#e3b6bf",
                  color: "#fff",
                  fontSize: 13,
                  cursor:
                    resetConfirmation === DANGER_CONFIRM_TEXT ? "pointer" : "default",
                  opacity: resetConfirmation === DANGER_CONFIRM_TEXT ? 1 : 0.8,
                }}
              >
                Reset the story
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
