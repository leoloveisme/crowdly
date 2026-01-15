import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header, { InterfaceLanguage } from "./Header";

// In this standalone editor, talk directly to the Crowdly backend.
// Prefer VITE_API_BASE_URL if provided; otherwise fall back to using
// the current hostname on port 4000 so it works from both desktop and
// mobile devices on the same LAN.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

type AuthUser = {
  id: string;
  email: string;
  roles?: string[];
};

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function elementIdForTitle() {
  return "screenplay-title";
}

function elementIdForScene(sceneId: string) {
  return `scene-${sceneId}`;
}

function elementIdForBlock(blockId: string) {
  return `block-${blockId}`;
}

const ScreenplayEditor: React.FC = () => {
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>("english");

  // Parse screenplay_id from /screenplay/:id
  const [screenplayId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/screenplay\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [greeting, setGreeting] = useState<string>(() =>
    pickRandom(greetingsByLanguage["english"], "Welcome"),
  );

  const [wish, setWish] = useState<string>(() =>
    pickRandom(wishesByLanguage["english"], "Have a great day"),
  );

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("crowdly_auth_user");
      if (!raw) return null;
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });

  const [title, setTitle] = useState<string>("Untitled Screenplay");
  const [formatType, setFormatType] = useState<string | null>("feature_film");
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  const [scenes, setScenes] = useState<ScreenplayScene[]>([]);
  const [blocks, setBlocks] = useState<ScreenplayBlock[]>([]);

  const [activeEditableId, setActiveEditableId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTargetRef = useRef<HTMLElement | null>(null);

  const isLoggedIn = !!authUser;
  const username = authUser?.email || "username";

  const canEdit = useMemo(() => {
    if (!authUser || !screenplayId) return false;
    if (!creatorId) return false;
    return authUser.id === creatorId;
  }, [authUser, creatorId, screenplayId]);

  const handleLanguageChange = (language: InterfaceLanguage) => {
    setInterfaceLanguage(language);
  };

  const getHtmlFromDom = useCallback((elementId: string) => {
    return document.getElementById(elementId)?.innerHTML ?? "";
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const deactivateEditing = useCallback(
    (opts?: { skipFlush?: boolean }) => {
      const Aloha = (window as any).Aloha;
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

      if (!opts?.skipFlush && activeEditableId) {
        // Flush the active editable's contents back to the backend.
        const id = activeEditableId;
        setActiveEditableId(null);

        if (id === elementIdForTitle()) {
          const html = getHtmlFromDom(id);
          const text = stripHtml(html || "");
          if (text && text !== title && canEdit) {
            // Reuse title saving logic.
            void (async () => {
              try {
                const res = await fetch(
                  `${API_BASE}/screenplays/${encodeURIComponent(screenplayId!)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: text }),
                  },
                );
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                  console.error("[ScreenplayEditor] Failed to update title", {
                    status: res.status,
                    body,
                  });
                  return;
                }
                setTitle(body.title ?? text);
              } catch (err) {
                console.error("[ScreenplayEditor] Error updating title", err);
              }
            })();
          }
        } else if (id.startsWith("scene-")) {
          const sceneId = id.slice("scene-".length);
          const scene = scenes.find((s) => s.scene_id === sceneId);
          if (scene && canEdit) {
            const html = getHtmlFromDom(id);
            const text = stripHtml(html || "");
            if (text && text !== (scene.slugline ?? "")) {
              void handleUpdateScene(sceneId, { slugline: text });
            }
          }
        } else if (id.startsWith("block-")) {
          const blockId = id.slice("block-".length);
          const block = blocks.find((b) => b.block_id === blockId);
          if (block && canEdit) {
            const html = getHtmlFromDom(id);
            const text = stripHtml(html || "");
            if (text !== (block.text ?? "")) {
              void handleUpdateBlock(blockId, { text });
            }
          }
        }
      } else {
        setActiveEditableId(null);
      }
    },
    [activeEditableId, blocks, canEdit, getHtmlFromDom, scenes, screenplayId, title],
  );

  const activateEditing = useCallback(
    (editableId: string) => {
      if (!canEdit) return;
      const Aloha = (window as any).Aloha;
      if (!Aloha?.ready || !Aloha?.jQuery) return;

      Aloha.ready(() => {
        const $ = Aloha.jQuery;

        try {
          $(".aloha-editable").contentEditable(false);
        } catch {
          // ignore
        }

        const $el = $(`#${editableId}`);
        $el.contentEditable(true);

        const node = document.getElementById(editableId);
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
          typeof Aloha.getEditableById === "function"
            ? Aloha.getEditableById(editableId)
            : null;
        if (editable && typeof editable.activate === "function") {
          editable.activate();
        }

        document.body.classList.add("has-active-editable");
        setActiveEditableId(editableId);
      });
    },
    [canEdit],
  );

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

  useEffect(() => {
    const greetings = greetingsByLanguage[interfaceLanguage] ?? greetingsByLanguage["english"];
    const wishes = wishesByLanguage[interfaceLanguage] ?? wishesByLanguage["english"];

    setGreeting(pickRandom(greetings, greeting || "Welcome"));
    setWish(pickRandom(wishes, wish || "Have a great day"));
  }, [interfaceLanguage]);

  // Bootstrap Aloha once for inline editing.
  useEffect(() => {
    let cancelled = false;

    const bootstrapAlohaOnce = () => {
      if (cancelled) return;

      const Aloha = (window as any).Aloha;
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
        $(".aloha-editable").contentEditable(false);
        document.body.classList.remove("has-active-editable");
      });
    };

    bootstrapAlohaOnce();

    return () => {
      cancelled = true;
    };
  }, []);

  // Click-away: stop editing and flush changes when clicking outside.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (activeEditableId) {
        const activeEl = document.getElementById(activeEditableId);
        if (activeEl && !activeEl.contains(target)) {
          deactivateEditing();
        }
      }

      // Clear any long-press visual state.
      if (!target.closest(".aloha-editable")) {
        clearLongPress();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [activeEditableId, clearLongPress, deactivateEditing]);

  useEffect(() => {
    if (!screenplayId) return;

    const load = async () => {
      setLoading(true);
      try {
        // Metadata
        const metaRes = await fetch(`${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}`);
        if (!metaRes.ok) {
          console.error("[ScreenplayEditor] Failed to load screenplay metadata", metaRes.status);
          return;
        }
        const meta = await metaRes.json();
        setTitle(meta.title ?? "Untitled Screenplay");
        setFormatType(meta.format_type ?? null);
        setCreatorId(meta.creator_id ?? null);

        // Scenes + blocks
        const res = await fetch(
          `${API_BASE}/screenplays/${encodeURIComponent(
            screenplayId,
          )}/scenes?includeBlocks=true`,
        );
        if (!res.ok) {
          console.error("[ScreenplayEditor] Failed to load screenplay scenes", res.status);
          return;
        }
        const data = await res.json();
        setScenes(Array.isArray(data.scenes) ? data.scenes : []);
        setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      } catch (err) {
        console.error("[ScreenplayEditor] Failed to load screenplay", err);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [screenplayId]);

  const handleSaveTitle = async () => {
    if (!screenplayId || savingTitle) return;
    const trimmed = title.trim();
    if (!trimmed) return;

    setSavingTitle(true);
    try {
      const res = await fetch(`${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to update title", { status: res.status, body });
        return;
      }
      setTitle(body.title ?? trimmed);
    } catch (err) {
      console.error("[ScreenplayEditor] Error updating title", err);
    } finally {
      setSavingTitle(false);
    }
  };

  const handleUpdateScene = async (
    sceneId: string,
    partial: Partial<
      Pick<ScreenplayScene, "slugline" | "scene_index" | "location" | "time_of_day" | "is_interior" | "synopsis">
    >,
  ) => {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_BASE}/screenplay-scenes/${encodeURIComponent(sceneId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...partial,
          userId: authUser.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to update scene", { status: res.status, body });
        return;
      }
      setScenes((prev) => prev.map((s) => (s.scene_id === sceneId ? { ...s, ...body } : s)));
    } catch (err) {
      console.error("[ScreenplayEditor] Error updating scene", err);
    }
  };

  const handleUpdateBlock = async (
    blockId: string,
    partial: Partial<Pick<ScreenplayBlock, "block_type" | "text">>,
  ) => {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_BASE}/screenplay-blocks/${encodeURIComponent(blockId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...partial,
          userId: authUser.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to update block", { status: res.status, body });
        return;
      }
      setBlocks((prev) => prev.map((b) => (b.block_id === blockId ? { ...b, ...body } : b)));
    } catch (err) {
      console.error("[ScreenplayEditor] Error updating block", err);
    }
  };

  const getMaxSceneIndex = () =>
    scenes.reduce((max, scene) => Math.max(max, scene.scene_index ?? 0), 0);

  const getMaxBlockIndex = () =>
    blocks.reduce((max, block) => Math.max(max, block.block_index ?? 0), 0);

  const handleAddScene = async () => {
    if (!screenplayId || !authUser || !canEdit) return;

    const nextIndex = (getMaxSceneIndex() || 0) + 1;

    try {
      const res = await fetch(
        `${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}/scenes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneIndex: nextIndex,
            slugline: `INT. NEW SCENE ${nextIndex} - DAY`,
            userId: authUser.id,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to add scene", { status: res.status, body });
        return;
      }

      const newScene: ScreenplayScene = body;
      setScenes((prev) => [...prev, newScene]);

      // Best-effort: create an initial empty action block so the user can type
      // directly into the new scene.
      const initialBlockIndex = (getMaxBlockIndex() || 0) + 1;
      try {
        const blockRes = await fetch(
          `${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}/blocks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sceneId: newScene.scene_id,
              blockIndex: initialBlockIndex,
              blockType: "action",
              text: " ",
              userId: authUser.id,
            }),
          },
        );
        const blockBody = await blockRes.json().catch(() => ({}));
        if (!blockRes.ok) {
          console.error("[ScreenplayEditor] Failed to create initial block", blockBody);
          return;
        }
        setBlocks((prev) => [...prev, blockBody as ScreenplayBlock]);
      } catch (err) {
        console.error("[ScreenplayEditor] Error creating initial block", err);
      }
    } catch (err) {
      console.error("[ScreenplayEditor] Error adding scene", err);
    }
  };

  const handleDeleteScene = async (scene: ScreenplayScene) => {
    if (!scene.scene_id || !canEdit) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Delete this scene and all of its blocks? This cannot be undone.",
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/screenplay-scenes/${encodeURIComponent(scene.scene_id)}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error("[ScreenplayEditor] Failed to delete scene", {
          status: res.status,
          body,
        });
        return;
      }

      setScenes((prev) => prev.filter((s) => s.scene_id !== scene.scene_id));
      setBlocks((prev) => prev.filter((b) => b.scene_id !== scene.scene_id));
    } catch (err) {
      console.error("[ScreenplayEditor] Error deleting scene", err);
    }
  };

  const handleCloneScene = async (scene: ScreenplayScene) => {
    if (!screenplayId || !authUser || !scene.scene_id || !canEdit) return;

    const nextIndex = (getMaxSceneIndex() || 0) + 1;

    try {
      const res = await fetch(
        `${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}/scenes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneIndex: nextIndex,
            slugline: `${scene.slugline} (copy)`.trim(),
            userId: authUser.id,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to clone scene", {
          status: res.status,
          body,
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
            `${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}/blocks`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sceneId: newScene.scene_id,
                blockIndex: currentIndex,
                blockType: block.block_type,
                text: block.text,
                metadata: block.metadata ?? null,
                userId: authUser.id,
              }),
            },
          );
          const blockBody = await blockRes.json().catch(() => ({}));
          if (!blockRes.ok) {
            console.error("[ScreenplayEditor] Failed to clone block", blockBody);
            break;
          }
          createdBlocks.push(blockBody as ScreenplayBlock);
        } catch (err) {
          console.error("[ScreenplayEditor] Error cloning block", err);
          break;
        }
      }

      if (createdBlocks.length > 0) {
        setBlocks((prev) => [...prev, ...createdBlocks]);
      }
    } catch (err) {
      console.error("[ScreenplayEditor] Error cloning scene", err);
    }
  };

  const handleAddBlockToScene = async (scene: ScreenplayScene) => {
    if (!screenplayId || !authUser || !scene.scene_id || !canEdit) return;

    const sceneBlocks = blocks.filter((b) => b.scene_id === scene.scene_id);
    const nextIndex =
      sceneBlocks.reduce((max, b) => Math.max(max, b.block_index ?? 0), 0) + 1;

    try {
      const res = await fetch(
        `${API_BASE}/screenplays/${encodeURIComponent(screenplayId)}/blocks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: scene.scene_id,
            blockIndex: nextIndex,
            blockType: "action",
            text: " ",
            userId: authUser.id,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[ScreenplayEditor] Failed to add block", { status: res.status, body });
        return;
      }
      setBlocks((prev) => [...prev, body as ScreenplayBlock]);
    } catch (err) {
      console.error("[ScreenplayEditor] Error adding block", err);
    }
  };

  const handleDeleteBlock = async (block: ScreenplayBlock) => {
    if (!block.block_id || !canEdit) return;

    try {
      const res = await fetch(
        `${API_BASE}/screenplay-blocks/${encodeURIComponent(block.block_id)}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error("[ScreenplayEditor] Failed to delete block", {
          status: res.status,
          body,
        });
        return;
      }
      setBlocks((prev) => prev.filter((b) => b.block_id !== block.block_id));
    } catch (err) {
      console.error("[ScreenplayEditor] Error deleting block", err);
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

  if (!screenplayId) {
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
        <div className="empty-state">
          <p>Screenplay not found.</p>
          <p>
            Open via
            {" "}
            <code>http://localhost:5173/screenplay/&lt;id&gt;</code>
            {" "}
            or use the "Go" box on the main page.
          </p>
        </div>
      </div>
    );
  }

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

      <main className="flex-1 p-4">
        <div className="container mx-auto space-y-6">
          <div className="border rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex-1">
                <h1
                  id={elementIdForTitle()}
                  className={
                    canEdit
                      ? "aloha-editable border-b border-dashed border-blue-300 px-1 py-0.5 text-2xl font-bold focus:outline-none"
                      : "border-b border-dashed border-blue-300 px-1 py-0.5 text-2xl font-bold"
                  }
                  suppressContentEditableWarning={true as any}
                  dangerouslySetInnerHTML={{ __html: title.replace(/</g, "&lt;") }}
                  onPointerDown={(e) => {
                    if (!canEdit) return;
                    e.stopPropagation();
                    activateEditing(elementIdForTitle());
                  }}
                />
              </div>
              {screenplayId && (
                <div className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap ml-2">
                  <span className="font-mono">Screenplay ID {screenplayId}</span>
                </div>
              )}
            </div>
            {creatorId && (
              <div className="mt-1 text-xs text-gray-500">
                Owner user id:
                {" "}
                <code>{creatorId}</code>
              </div>
            )}
          </div>

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
                          <div
                            id={elementIdForScene(scene.scene_id)}
                            className={
                              canEdit
                                ? "aloha-editable font-bold bg-transparent border-b border-dashed border-gray-300 px-0.5 py-0.5 focus:outline-none text-sm"
                                : "font-bold bg-transparent border-b border-dashed border-gray-300 px-0.5 py-0.5 text-sm"
                            }
                            suppressContentEditableWarning={true as any}
                            dangerouslySetInnerHTML={{
                              __html: (scene.slugline || "INT. LOCATION - TIME").replace(/</g, "&lt;"),
                            }}
                            onPointerDown={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              activateEditing(elementIdForScene(scene.scene_id));
                            }}
                          />
                        </div>
                        <div className="flex gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleCloneScene(scene)}
                            disabled={!canEdit}
                            className="px-2 py-0.5 border border-dashed border-gray-300 rounded-full hover:bg-gray-50 disabled:opacity-50"
                          >
                            Clone
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScene(scene)}
                            disabled={!canEdit}
                            className="px-2 py-0.5 border border-dashed border-red-300 text-red-600 rounded-full hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 mt-2">
                        {sceneBlocks.map((block) => {
                          const typeDef =
                            BLOCK_TYPE_LABELS.find((t) => t.value === block.block_type) ??
                            BLOCK_TYPE_LABELS.find((t) => t.value === "action");
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
                                  disabled={!canEdit}
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
                              <div
                                id={elementIdForBlock(block.block_id)}
                                className={
                                  canEdit
                                    ? "aloha-editable w-full border-none bg-transparent focus:outline-none leading-relaxed"
                                    : "w-full border-none bg-transparent leading-relaxed"
                                }
                                suppressContentEditableWarning={true as any}
                                dangerouslySetInnerHTML={{
                                  __html: (block.text || "").replace(/</g, "&lt;"),
                                }}
                                onPointerDown={(e) => {
                                  if (!canEdit) return;
                                  e.stopPropagation();
                                  activateEditing(elementIdForBlock(block.block_id));
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
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {!canEdit && (
            <div className="border rounded-lg bg-yellow-50 text-xs text-yellow-900 px-3 py-2">
              You are viewing this screenplay in read-only mode. Only the screenplay owner
              can edit it.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ScreenplayEditor;
