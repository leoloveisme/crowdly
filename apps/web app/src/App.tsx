import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./app.css";

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

const App: React.FC = () => {
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

  // Render all blocks (including hidden) so Aloha can bootstrap them once.
  return (
    <div className="page">
      <div className="topbar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => resetToSample()}
          title="Restore the sample story title/chapter/paragraph"
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

                    const html = getHtmlFromDom(b.id);
                    const newId = withNewBlockAfter(b.id, b.kind, html);
                    saveAllFromDom();
                    if (newId) pendingActivateIdRef.current = newId;
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

                    // Ensure we clone the latest HTML (not a possibly stale React state value).
                    const html = getHtmlFromDom(b.id);
                    const newId = withNewBlockAfter(b.id, b.kind, html);
                    saveAllFromDom();
                    if (newId) pendingActivateIdRef.current = newId;
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
    </div>
  );
};

export default App;
