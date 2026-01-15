import React, { useCallback, useEffect, useState } from "react";
import "./app.css";
import Header, { InterfaceLanguage } from "./Header";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type ChapterRow = {
  chapter_id: string;
  chapter_title: string;
  paragraphs: string[] | null;
};

type StoryTitleRow = {
  story_title_id: string;
  title: string;
  creator_id?: string;
};

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

const StoryViewer: React.FC = () => {
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>("english");

  const [greeting, setGreeting] = useState<string>(() =>
    pickRandom(greetingsByLanguage["english"], "Welcome"),
  );

  const [wish, setWish] = useState<string>(() =>
    pickRandom(wishesByLanguage["english"], "Have a great day"),
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
    },
  );

  const [creatorId, setCreatorId] = useState<string | null>(null);

  const [activeEditableId, setActiveEditableId] = useState<string | null>(null);

  const isLoggedIn = !!authUser;
  const username = authUser?.email || "username";
  const isOwner = !!authUser && !!creatorId && authUser.id === creatorId;

  const [storyId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/story\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState<string>("");
  const [chapters, setChapters] = useState<ChapterRow[]>([]);

  useEffect(() => {
    const greetings = greetingsByLanguage[interfaceLanguage] ?? greetingsByLanguage["english"];
    const wishes = wishesByLanguage[interfaceLanguage] ?? wishesByLanguage["english"];

    setGreeting(pickRandom(greetings, greeting || "Welcome"));
    setWish(pickRandom(wishes, wish || "Have a great day"));
  }, [interfaceLanguage]);

  useEffect(() => {
    if (!storyId) {
      setError("No story ID in URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch story title
        const titleRes = await fetch(`${API_BASE}/story-titles/${encodeURIComponent(storyId)}`);
        if (!titleRes.ok) {
          let body: any = {};
          try {
            body = await titleRes.json();
          } catch {
            body = {};
          }
          if (!cancelled) {
            setError(
              body?.error || `Failed to load story title (status ${titleRes.status}).`,
            );
            setLoading(false);
          }
          return;
        }
        const titleRow = (await titleRes.json()) as StoryTitleRow;
        if (!cancelled) {
          setStoryTitle(titleRow.title);
          setCreatorId(titleRow.creator_id ?? null);
        }

        // Fetch chapters
        const params = new URLSearchParams({ storyTitleId: storyId });
        const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
        if (!chaptersRes.ok) {
          let body: any = {};
          try {
            body = await chaptersRes.json();
          } catch {
            body = {};
          }
          if (!cancelled) {
            setError(body?.error || "Failed to load chapters.");
            setLoading(false);
          }
          return;
        }
        const chapterRows = (await chaptersRes.json()) as ChapterRow[];
        if (!cancelled) {
          setChapters(Array.isArray(chapterRows) ? chapterRows : []);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unexpected error while loading story.");
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const handleLanguageChange = (language: InterfaceLanguage) => {
    setInterfaceLanguage(language);
  };

  // Bootstrap Aloha editor once for inline editing (similar to story template).
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

        // Default to reading mode until user activates a field.
        $(".aloha-editable").contentEditable(false);
      });
    };

    bootstrapAlohaOnce();

    return () => {
      cancelled = true;
    };
  }, []);

  // When chapters or ownership status changes, ensure newly-rendered
  // .aloha-editable elements are bootstrapped as well. The first
  // bootstrap above runs before async data loads, so this is needed
  // to attach Aloha to title + paragraphs after they appear.
  useEffect(() => {
    if (!isOwner) return;
    const Aloha = (window as any).Aloha;
    if (!Aloha?.ready || !Aloha?.jQuery) return;

    Aloha.ready(() => {
      const $ = Aloha.jQuery;
      const $editables = $(".aloha-editable:not([data-aloha-bootstrapped])");
      if ($editables.length === 0) return;
      $editables.attr("data-aloha-bootstrapped", "true");
      $editables.aloha();
      $(".aloha-editable").contentEditable(false);
    });
  }, [isOwner, chapters.length]);

  const saveAllChangesForOwner = async () => {
    if (!isOwner || !storyId) return;

    // 1) Title
    const titleEl = document.getElementById("storyviewer-title");
    const newTitle = titleEl?.textContent?.trim() ?? "";
    const updates: Promise<void>[] = [];

    if (newTitle && newTitle !== storyTitle) {
      updates.push(
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/story-titles/${encodeURIComponent(storyId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle, userId: authUser?.id }),
            });
            if (!res.ok) {
              try {
                const body = await res.json();
                // eslint-disable-next-line no-console
                console.error("[StoryViewer] Failed to update story title", {
                  status: res.status,
                  body,
                });
              } catch {
                // ignore
              }
              return;
            }
            const updated = (await res.json()) as StoryTitleRow;
            setStoryTitle(updated.title);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[StoryViewer] Error while updating story title", err);
          }
        })(),
      );
    }

    // 2) Chapters
    chapters.forEach((ch) => {
      const paraEls = Array.from(
        document.querySelectorAll<HTMLParagraphElement>(
          `.storyviewer-paragraph[data-chapter-id="${ch.chapter_id}"]`,
        ),
      );
      const newParagraphs = paraEls
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0);

      const original = Array.isArray(ch.paragraphs) ? ch.paragraphs : [];
      const changed =
        newParagraphs.length !== original.length ||
        newParagraphs.some((p, idx) => p !== original[idx]);

      if (!changed) return;

      updates.push(
        (async () => {
          try {
            const res = await fetch(
              `${API_BASE}/chapters/${encodeURIComponent(ch.chapter_id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chapterTitle: ch.chapter_title,
                  paragraphs: newParagraphs,
                  userId: authUser?.id,
                }),
              },
            );
            if (!res.ok) {
              try {
                const body = await res.json();
                // eslint-disable-next-line no-console
                console.error("[StoryViewer] Failed to update chapter", {
                  status: res.status,
                  body,
                });
              } catch {
                // ignore
              }
              return;
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[StoryViewer] Error while updating chapter", err);
          }
        })(),
      );
    });

    if (updates.length > 0) {
      await Promise.all(updates);
      // Refresh chapters from backend so local state matches saved values.
      try {
        const params = new URLSearchParams({ storyTitleId: storyId });
        const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
        if (chaptersRes.ok) {
          const chapterRows = (await chaptersRes.json()) as ChapterRow[];
          setChapters(Array.isArray(chapterRows) ? chapterRows : []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[StoryViewer] Failed to refresh chapters after save", err);
      }
    }
  };

  const deactivateEditing = useCallback(
    async (opts?: { skipSave?: boolean }) => {
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
        // ignore Aloha errors
      }

      setActiveEditableId(null);

      if (!opts?.skipSave && isOwner) {
        await saveAllChangesForOwner();
      }
    },
    [isOwner, saveAllChangesForOwner],
  );

  const activateEditing = useCallback(
    (fieldId: string) => {
      if (!isOwner) return;
      const Aloha = (window as any).Aloha;
      if (!Aloha?.ready || !Aloha?.jQuery) return;

      Aloha.ready(() => {
        const $ = Aloha.jQuery;

        // Only one active at a time.
        $(".aloha-editable").contentEditable(false);

        const $el = $(`#${fieldId}`);
        $el.contentEditable(true);

        const node = document.getElementById(fieldId);
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
          typeof Aloha.getEditableById === "function" ? Aloha.getEditableById(fieldId) : null;
        if (editable && typeof editable.activate === "function") {
          editable.activate();
        }

        setActiveEditableId(fieldId);
      });
    },
    [isOwner],
  );

  // Click-away: when there is an active editable and the user clicks
  // outside of it, deactivate and save (for owner).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!activeEditableId) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const activeEl = document.getElementById(activeEditableId);
      if (activeEl && !activeEl.contains(target)) {
        void deactivateEditing();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [activeEditableId, deactivateEditing]);

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

  const renderBody = () => {
    if (!storyId) {
      return (
        <div className="flex justify-center items-center h-32 text-sm text-gray-600">
          No story ID in URL.
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex justify-center items-center h-32 text-sm text-gray-600">
          Loading story...
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col gap-2 justify-center items-center h-32 text-sm text-gray-700">
          <div>{error}</div>
          <div>
            You can also try opening it on the main Crowdly platform:{" "}
            <a
              href={`http://localhost:8080/story/${encodeURIComponent(storyId)}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              http://localhost:8080/story/{storyId}
            </a>
          </div>
        </div>
      );
    }

    return (
      <main className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <header className="space-y-2">
            {isOwner ? (
              <h1
                id="storyviewer-title"
                className="text-3xl font-bold aloha-editable"
                suppressContentEditableWarning
                onPointerDown={(e) => {
                  if (!isOwner) return;
                  e.stopPropagation();
                  activateEditing("storyviewer-title");
                }}
              >
                {storyTitle || "Untitled story"}
              </h1>
            ) : (
              <h1 className="text-3xl font-bold">{storyTitle || "Untitled story"}</h1>
            )}
            <div className="text-xs text-gray-500">
              Loaded from Crowdly backend (read-only view).
            </div>
          </header>

          {chapters.length === 0 ? (
            <p className="text-sm text-gray-600">No chapters found for this story.</p>
          ) : (
            <div className="space-y-8">
              {chapters.map((ch) => (
                <section key={ch.chapter_id} id={`chapter-${ch.chapter_id}`} className="space-y-3">
                  <h2 className="text-xl font-semibold">{ch.chapter_title}</h2>
                  {Array.isArray(ch.paragraphs) && ch.paragraphs.length > 0 ? (
                    ch.paragraphs.map((p, idx) => {
                      const fieldId = `storyviewer-paragraph-${ch.chapter_id}-${idx}`;
                      return (
                        <p
                          key={idx}
                          id={fieldId}
                          className={
                            isOwner
                              ? "text-sm leading-relaxed whitespace-pre-line aloha-editable storyviewer-paragraph"
                              : "text-sm leading-relaxed whitespace-pre-line"
                          }
                          data-chapter-id={ch.chapter_id}
                          data-paragraph-index={idx}
                          suppressContentEditableWarning
                          onPointerDown={(e) => {
                            if (!isOwner) return;
                            e.stopPropagation();
                            activateEditing(fieldId);
                          }}
                        >
                          {p}
                        </p>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-500">(No text in this chapter yet.)</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="story-id-footer">
          Story ID {storyId ? storyId : "(unknown)"}
        </div>
      </main>
    );
  };

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

      {renderBody()}
    </div>
  );
};

export default StoryViewer;
