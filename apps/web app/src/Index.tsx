import React, { useEffect, useState } from "react";
import StoryTemplate from "./story template";
import ScreenplayTemplate from "./screenplay template";
import Header, { InterfaceLanguage } from "./Header";

type StoryKind = "story" | "screenplay";

type AuthMode = "login" | "register";

type AuthUser = {
  id: string;
  email: string;
  roles?: string[];
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

// In this standalone editor, talk directly to the Crowdly backend.
// Prefer VITE_API_BASE_URL if provided; otherwise fall back to the
// default local backend port used by the main app.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function createScreenplayFromTemplate(params: { title: string; userId: string; formatType?: string | null }) {
  const { title, userId, formatType } = params;

  try {
    const res = await fetch(`${API_BASE}/screenplays/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        formatType: formatType ?? "feature_film",
        userId,
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[web-editor] Failed to create screenplay from template", {
        status: res.status,
        body,
      });
      if (typeof window !== "undefined") {
        window.alert(
          (body && (body.error || body.message)) ||
            "Failed to create screenplay. Please try again in a moment.",
        );
      }
      return null;
    }

    const screenplayId = (body as any).screenplayId as string | undefined;
    if (!screenplayId) {
      console.error("[web-editor] /screenplays/template response missing screenplayId", body);
      return null;
    }

    try {
      localStorage.setItem("web-editor:last-screenplay-id", screenplayId);
    } catch (err) {
      console.error("[web-editor] Failed to persist last screenplay id", err);
    }

    return screenplayId;
  } catch (err) {
    console.error("[web-editor] Error while creating screenplay from template", err);
    if (typeof window !== "undefined") {
      window.alert("Unexpected error while creating screenplay. Please try again.");
    }
    return null;
  }
}

const Index: React.FC = () => {
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>("english");

  const [greeting, setGreeting] = useState<string>(() =>
    pickRandom(greetingsByLanguage["english"], "Welcome")
  );

  const [wish, setWish] = useState<string>(() =>
    pickRandom(wishesByLanguage["english"], "Have a great day")
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

  const [isOpen, setIsOpen] = useState(false); // initial "what kind of story" popup
  const [authOpen, setAuthOpen] = useState(false); // login/register popup
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeView, setActiveView] = useState<"landing" | "story" | "screenplay">("landing");
  const [pendingKind, setPendingKind] = useState<StoryKind | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [currentScreenplayId, setCurrentScreenplayId] = useState<string | null>(null);

  const [storyIdInput, setStoryIdInput] = useState("");

  const isLoggedIn = !!authUser;
  const usernameForHeader = authUser?.email || username || "Guest";

  useEffect(() => {
    // Only attach listeners on the landing page so we don't interfere
    // with the existing templates' pointer / context menu behavior.
    if (activeView !== "landing") return;

    const body = document.body;
    if (!body) return;

    let longPressTimer: number | null = null;

    const openPopup = (e: Event) => {
      e.preventDefault();
      setIsOpen(true);
    };

    const handleContextMenu = (e: MouseEvent) => {
      openPopup(e);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
      }
      longPressTimer = window.setTimeout(() => {
        openPopup(e);
      }, 600);
    };

    const clearLongPress = () => {
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    body.addEventListener("contextmenu", handleContextMenu);
    body.addEventListener("touchstart", handleTouchStart);
    body.addEventListener("touchend", clearLongPress);
    body.addEventListener("touchcancel", clearLongPress);

    return () => {
      body.removeEventListener("contextmenu", handleContextMenu);
      body.removeEventListener("touchstart", handleTouchStart);
      body.removeEventListener("touchend", clearLongPress);
      body.removeEventListener("touchcancel", clearLongPress);
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
      }
    };
  }, [activeView]);

  useEffect(() => {
    const greetings = greetingsByLanguage[interfaceLanguage] ?? greetingsByLanguage["english"];
    const wishes = wishesByLanguage[interfaceLanguage] ?? wishesByLanguage["english"];

    setGreeting(pickRandom(greetings, greeting || "Welcome"));
    setWish(pickRandom(wishes, wish || "Have a great day"));
  }, [interfaceLanguage]);

  const handleLanguageChange = (language: InterfaceLanguage) => {
    setInterfaceLanguage(language);
  };

  const handleGoToStory = () => {
    const raw = storyIdInput.trim();
    if (!raw) return;

    // Accept plain ID, or full URLs for 8080 or 5173 and extract the ID.
    let id = raw;
    try {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        const url = new URL(raw);
        const match = url.pathname.match(/\/story\/([^/]+)/);
        if (match) {
          id = match[1];
        }
      } else {
        const match = raw.match(/\/story\/([^/]+)/);
        if (match) {
          id = match[1];
        }
      }
    } catch {
      // If URL parsing fails, fall back to raw input.
    }

    if (!id) return;
    window.location.href = `/story/${id}`;
  };

  const openLoginFromHeader = () => {
    setAuthMode("login");
    setAuthOpen(true);
  };

  const openRegisterFromHeader = () => {
    setAuthMode("register");
    setAuthOpen(true);
  };

  const handleLogoutFromHeader = () => {
    setAuthUser(null);
    try {
      localStorage.removeItem("crowdly_auth_user");
    } catch {
      // ignore storage errors
    }
    setActiveView("landing");
    setPendingKind(null);
    setAuthOpen(false);
    setIsOpen(false);
  };

  const closePopup = () => setIsOpen(false);

  const handleChooseKind = (kind: StoryKind) => {
    setPendingKind(kind);
    setIsOpen(false);

    // If the user is already logged in, go straight to the chosen editor.
    if (isLoggedIn && authUser?.id) {
      if (kind === "story") {
        setActiveView("story");
      } else if (kind === "screenplay") {
        // Mirror the Crowdly platform: create a new screenplay on the backend
        // before opening the screenplay editor.
        void (async () => {
          const screenplayId = await createScreenplayFromTemplate({
            title: "Untitled Screenplay",
            userId: authUser.id,
            formatType: "feature_film",
          });
          if (screenplayId) {
            setCurrentScreenplayId(screenplayId);
            setActiveView("screenplay");
          }
        })();
      }
      return;
    }

    // Otherwise, ask them to log in or register first.
    setAuthMode("login");
    setAuthOpen(true);
  };

  const handleAuthSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();

    // Require credentials, but allow login even if no pending story kind was chosen.
    if (!username || !password) {
      return;
    }

    setAuthError(null);
    setAuthLoading(true);

    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/register";
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          (body && (body.error || body.message)) ||
          (authMode === "login"
            ? "Invalid username or password"
            : "Registration failed");
        setAuthError(message);
        return;
      }

      // Successful login / registration; persist user similar to Crowdly platform.
      const authResp = body as { id?: string; email?: string; roles?: string[] };
      if (authResp && authResp.id && authResp.email) {
        const next: AuthUser = {
          id: authResp.id,
          email: authResp.email,
          roles: authResp.roles,
        };
        setAuthUser(next);
        try {
          localStorage.setItem("crowdly_auth_user", JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
      }

      // Proceed to the chosen template (if one was selected).
      setAuthOpen(false);
      setIsOpen(false);
      setUsername("");
      setPassword("");

      if (pendingKind === "story") {
        setActiveView("story");
      } else if (pendingKind === "screenplay" && authResp?.id) {
        const screenplayId = await createScreenplayFromTemplate({
          title: "Untitled Screenplay",
          userId: authResp.id,
          formatType: "feature_film",
        });
        if (screenplayId) {
          setCurrentScreenplayId(screenplayId);
          setActiveView("screenplay");
        }
      }
    } catch (err: any) {
      console.error("Auth error", err);
      setAuthError(
        err?.message || "Something went wrong. Please try again in a moment."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  if (activeView === "story") {
    return <StoryTemplate />;
  }

  if (activeView === "screenplay") {
    return <ScreenplayTemplate />;
  }

  return (
    <div className="page">
      <Header
        language={interfaceLanguage}
        onLanguageChange={handleLanguageChange}
        greeting={greeting}
        username={usernameForHeader}
        wish={wish}
        isLoggedIn={isLoggedIn}
        onLoginClick={openLoginFromHeader}
        onLogoutClick={handleLogoutFromHeader}
        onRegisterClick={openRegisterFromHeader}
      />

      <div
        style={{
          minHeight: "calc(100vh - 80px)",
          backgroundColor: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {/* Minimal hint content so the page is not literally empty, but still white and clean */}
        <div style={{ maxWidth: 480, width: "100%" }}>
          <p style={{ color: "#666", fontSize: "14px", textAlign: "center", marginBottom: 12 }}>
            Right-click (desktop) or tap and hold (mobile) anywhere on the page to
            choose what kind of story you would like to create.
          </p>

          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              backgroundColor: "#fafafa",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>
              Go to the story / Open story
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Paste story ID or story URL here"
                value={storyIdInput}
                onChange={(e) => setStoryIdInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.2)",
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={handleGoToStory}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Go
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>
              Accepted formats:
              <br />
               b7 Story ID: <code>afc0ca9b-5a67-46a0-b01c-9da9d27ae642</code>
              <br />
               b7 Crowdly URL: <code>http://localhost:8080/story/&lt;id&gt;</code>
              <br />
               b7 Web app URL: <code>http://localhost:5173/story/&lt;id&gt;</code>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          onClick={closePopup}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px 32px",
              maxWidth: "420px",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "center",
              boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
            }}
          >
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "18px",
                fontWeight: 500,
                color: "#111",
              }}
            >
              What kind of story would you like to create?
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginTop: "8px",
              }}
            >
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleChooseKind("story");
                }}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  textDecoration: "none",
                  color: "#111",
                  fontSize: "14px",
                }}
              >
                Regular (novel) story
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleChooseKind("screenplay");
                }}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  textDecoration: "none",
                  color: "#111",
                  fontSize: "14px",
                }}
              >
                Screenplay
              </a>
            </div>
            <button
              type="button"
              onClick={closePopup}
              style={{
                marginTop: "20px",
                padding: "6px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(0,0,0,0.2)",
                backgroundColor: "#f5f5f5",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {authOpen && (
        <div
          onClick={() => setAuthOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px 28px",
              maxWidth: "420px",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "center",
              boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
            }}
          >
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "18px",
                fontWeight: 500,
                color: "#111",
              }}
            >
              You have to be logged in before you can create a story
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "16px",
                marginBottom: "16px",
              }}
            >
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border:
                    authMode === "login"
                      ? "1px solid #111"
                      : "1px solid rgba(0,0,0,0.25)",
                  backgroundColor: authMode === "login" ? "#111" : "#f5f5f5",
                  color: authMode === "login" ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: "13px",
                  minWidth: "80px",
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border:
                    authMode === "register"
                      ? "1px solid #111"
                      : "1px solid rgba(0,0,0,0.25)",
                  backgroundColor:
                    authMode === "register" ? "#111" : "#f5f5f5",
                  color: authMode === "register" ? "#fff" : "#111",
                  cursor: "pointer",
                  fontSize: "13px",
                  minWidth: "80px",
                }}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ textAlign: "center" }}>
              <div style={{ marginBottom: "10px" }}>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.2)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  marginBottom: "14px",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  style={{
                    width: "100%",
                    padding: "8px 34px 8px 10px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.2)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: "6px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "12px",
                    padding: "2px 4px",
                    color: "#555",
                  }}
                >
                  {showPassword ? "Hide" : "Eye"}
                </button>
              </div>

              {authError && (
                <div
                  style={{
                    marginBottom: "10px",
                    color: "#b00020",
                    fontSize: "13px",
                  }}
                >
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "999px",
                  border: "1px solid #111",
                  backgroundColor: authLoading ? "#555" : "#111",
                  color: "#fff",
                  cursor: authLoading ? "default" : "pointer",
                  fontSize: "14px",
                  minWidth: "120px",
                  opacity: authLoading ? 0.9 : 1,
                }}
              >
                {authLoading
                  ? authMode === "login"
                    ? "Logging in..."
                    : "Registering..."
                  : authMode === "login"
                    ? "Login"
                    : "Register & Login"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
