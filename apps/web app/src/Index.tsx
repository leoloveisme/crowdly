import React, { useEffect, useState } from "react";
import StoryTemplate from "./story template";
import Header, { InterfaceLanguage } from "./Header";
import { ImportPopup } from "../modules/import-export";

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
// Prefer VITE_API_BASE_URL if provided; otherwise fall back to using
// the current hostname on port 4000 so it works from both desktop and
// mobile devices on the same LAN.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

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

  const [storyIdInput, setStoryIdInput] = useState("");
  const [showImportPopup, setShowImportPopup] = useState(false);

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

  const handleGoToStory = async () => {
    const raw = storyIdInput.trim();
    if (!raw) return;

    let id: string | null = null;
    let explicitKind: StoryKind | null = null;

    try {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        const url = new URL(raw);
        const path = url.pathname;
        const screenplayMatch = path.match(/\/screenplay\/([^/]+)/);
        const storyMatch = path.match(/\/story\/([^/]+)/);
        if (screenplayMatch) {
          explicitKind = "screenplay";
          id = screenplayMatch[1];
        } else if (storyMatch) {
          explicitKind = "story";
          id = storyMatch[1];
        }
      } else {
        const screenplayMatch = raw.match(/\/screenplay\/([^/]+)/);
        const storyMatch = raw.match(/\/story\/([^/]+)/);
        if (screenplayMatch) {
          explicitKind = "screenplay";
          id = screenplayMatch[1];
        } else if (storyMatch) {
          explicitKind = "story";
          id = storyMatch[1];
        } else {
          // Plain ID, let backend determine whether it's a screenplay or story.
          id = raw;
        }
      }
    } catch {
      // If URL parsing fails, fall back to treating the raw input as an ID.
      id = raw;
    }

    if (!id) return;

    // If the kind is explicit from the URL, just route there.
    if (explicitKind === "screenplay") {
      window.location.href = `/screenplay/${encodeURIComponent(id)}`;
      return;
    }
    if (explicitKind === "story") {
      window.location.href = `/story/${encodeURIComponent(id)}`;
      return;
    }

    // Ambiguous plain IDs: first try screenplay, then fall back to story.
    try {
      const res = await fetch(`${API_BASE}/screenplays/${encodeURIComponent(id)}`);
      if (res.ok) {
        window.location.href = `/screenplay/${encodeURIComponent(id)}`;
        return;
      }
    } catch {
      // Ignore network errors here; we'll still try story as a fallback.
    }

    window.location.href = `/story/${encodeURIComponent(id)}`;
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
        // and then open the canonical /screenplay/:id route in this web app.
        void (async () => {
          const screenplayId = await createScreenplayFromTemplate({
            title: "Untitled Screenplay",
            userId: authUser.id,
            formatType: "feature_film",
          });
          if (screenplayId) {
            window.location.href = `/screenplay/${encodeURIComponent(screenplayId)}`;
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
          window.location.href = `/screenplay/${encodeURIComponent(screenplayId)}`;
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
        onCreateClick={() => setIsOpen(true)}
        onImportClick={() => setShowImportPopup(true)}
        onExportClick={() => {}}
        isExportEnabled={false}
      />

      <div className="landing-body">
        {/* Hero section */}
        <div className="landing-hero">
          <h1 className="landing-hero-title">Crowdly Web App</h1>
          <p className="landing-hero-subtitle">
            Create, edit and collaborate on stories and screenplays
          </p>
        </div>

        <p className="landing-hint">
          Right-click (desktop) or tap and hold (mobile) anywhere on the page to
          choose what kind of story you would like to create.
        </p>

        {/* Go to story / screenplay card */}
        <div className="landing-goto-card">
          <div className="landing-goto-card-title">
            Go to story or screenplay
          </div>
          <div className="landing-goto-row">
            <input
              type="text"
              className="landing-goto-input"
              placeholder="Paste story or screenplay ID / URL here"
              value={storyIdInput}
              onChange={(e) => setStoryIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGoToStory();
              }}
            />
            <button
              type="button"
              className="landing-goto-btn"
              onClick={handleGoToStory}
            >
              Go
            </button>
          </div>
          <div className="landing-goto-hint">
            Accepted formats:
            <ul>
              <li>
                Story or screenplay ID:{" "}
                <code>055b3e41-4f7d-490f-9b29-128b908c3552</code>
              </li>
              <li>
                Crowdly URL:{" "}
                <code>http://localhost:8080/story/&lt;id&gt;</code>{" "}
                or{" "}
                <code>http://localhost:8080/screenplay/&lt;id&gt;</code>
              </li>
              <li>
                Web app URL:{" "}
                <code>http://localhost:5173/story/&lt;id&gt;</code>{" "}
                or{" "}
                <code>http://localhost:5173/screenplay/&lt;id&gt;</code>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* "What kind of story" popup */}
      {isOpen && (
        <div className="landing-popup-overlay" onClick={closePopup}>
          <div
            className="landing-popup-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="landing-popup-title">
              What kind of story would you like to create?
            </p>
            <div className="landing-popup-options">
              <a
                href="#"
                className="landing-popup-option"
                onClick={(e) => {
                  e.preventDefault();
                  handleChooseKind("story");
                }}
              >
                Regular (novel) story
              </a>
              <a
                href="#"
                className="landing-popup-option"
                onClick={(e) => {
                  e.preventDefault();
                  handleChooseKind("screenplay");
                }}
              >
                Screenplay
              </a>
            </div>
            <button
              type="button"
              className="landing-popup-close"
              onClick={closePopup}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Auth popup */}
      {authOpen && (
        <div
          className="auth-popup-overlay"
          onClick={() => setAuthOpen(false)}
        >
          <div
            className="auth-popup-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="auth-popup-title">
              You have to be logged in before you can create a story
            </p>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={`auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => setAuthMode("register")}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <div style={{ marginBottom: 10 }}>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="auth-password-wrapper" style={{ marginBottom: 14 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {authError && (
                <div className="auth-error">{authError}</div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={authLoading}
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

      <ImportPopup
        open={showImportPopup}
        onClose={() => setShowImportPopup(false)}
      />
    </div>
  );
};

export default Index;
