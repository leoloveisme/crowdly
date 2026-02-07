import React, { useEffect, useState } from "react";
import CreativeSpacesModule, { CreativeSpace } from "../modules/spaces";

// Prefer VITE_API_BASE_URL if provided; otherwise fall back to using
// the current hostname on port 4000 so it works from both desktop and
// mobile devices on the same LAN.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

export type InterfaceLanguage =
  | "english"
  | "russian"
  | "chinese_simpl"
  | "chinese_trad"
  | "portuguese"
  | "arabic"
  | "korean"
  | "japanese";

export interface HeaderProps {
  language: InterfaceLanguage;
  onLanguageChange: (language: InterfaceLanguage) => void;
  greeting: string;
  username: string;
  wish: string;
  isLoggedIn: boolean;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onRegisterClick: () => void;
  onCreateClick?: () => void;
  onImportClick?: () => void;
  onExportClick?: () => void;
  isExportEnabled?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  language,
  onLanguageChange,
  greeting,
  username,
  wish,
  isLoggedIn,
  onLoginClick,
  onLogoutClick,
  onRegisterClick,
  onCreateClick,
  onImportClick,
  onExportClick,
  isExportEnabled = false,
}) => {
  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onLanguageChange(event.target.value as InterfaceLanguage);
  };

  const greetingLine = `${greeting} ${username}. ${wish}`;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSpacesOpen, setIsSpacesOpen] = useState(false);
  const [spaces, setSpaces] = useState<CreativeSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState<string | null>(null);

  // Load creative spaces from the Crowdly backend when the Spaces popup opens.
  useEffect(() => {
    const loadSpaces = async () => {
      if (!isSpacesOpen) return;

      setSpacesError(null);
      setSpaces([]);

      let userId: string | null = null;
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("crowdly_auth_user") : null;
        if (raw) {
          const parsed = JSON.parse(raw) as { id?: string };
          if (parsed && typeof parsed.id === "string") {
            userId = parsed.id;
          }
        }
      } catch {
        // ignore parse errors
      }

      if (!userId) {
        setSpacesError("You have to be logged in to see your spaces.");
        return;
      }

      setSpacesLoading(true);
      try {
        const url = `${API_BASE}/creative-spaces?userId=${encodeURIComponent(userId)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[Header] Failed to load creative spaces", {
            status: res.status,
            body,
          });
          setSpacesError(body.error || "Failed to load spaces.");
          setSpaces([]);
          return;
        }
        const data = await res.json().catch(() => []);
        setSpaces(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("[Header] Error while loading creative spaces", err);
        setSpacesError("Failed to load spaces.");
        setSpaces([]);
      } finally {
        setSpacesLoading(false);
      }
    };

    void loadSpaces();
  }, [isSpacesOpen]);

  const languageSelect = (
    <div className="crowdly-header-language">
      <select
        name="interface_language"
        value={language}
        onChange={handleLanguageChange}
      >
        <option value="english">English</option>
        <option value="russian">Russian</option>
        <option value="chinese_simpl">Chinese simpl</option>
        <option value="chinese_trad">Chinese trad</option>
        <option value="portuguese">Portuguese</option>
        <option value="arabic">Arabic</option>
        <option value="korean">Korean</option>
        <option value="japanese">Japanese</option>
      </select>
    </div>
  );

  return (
    <header className="crowdly-header" onPointerDown={(e) => e.stopPropagation()}>
      <div className="crowdly-header-bar">
        <div className="crowdly-header-inner">
          {/* Logo & title */}
          <div className="crowdly-header-logo-area">
            <a
              href="http://crowdly.platform"
              target="_blank"
              className="crowdly-header-logo-box"
              rel="noreferrer"
            >
              <img
                src="/images/crowdly-app.png"
                title="Crowdly logo"
                alt="Crowdly logo"
                className="crowdly-header-logo"
              />
            </a>
            <span className="crowdly-header-title">
              <a href="/">Crowdly web app</a>
            </span>
          </div>

          {/* Desktop-only: center area with path and language */}
          <div className="crowdly-header-center crowdly-header-desktop-items">
            <span className="crowdly-header-path">
              Space | directory | file name
            </span>
            {languageSelect}
          </div>

          {/* Desktop-only: greeting + auth */}
          <div className="crowdly-header-right">
            <div className="crowdly-header-desktop-items">
              <span className="crowdly-header-greeting">{greetingLine}</span>
              <div className="crowdly-header-auth-links">
                {isLoggedIn ? (
                  <button type="button" onClick={onLogoutClick}>
                    Log out
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={onLoginClick}>
                      Login
                    </button>
                    <span className="auth-separator">|</span>
                    <button type="button" onClick={onRegisterClick}>
                      Register
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Burger button – always visible */}
            <button
              type="button"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              className="crowdly-header-burger"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMenuOpen((prev) => !prev);
              }}
            >
              <div className={`crowdly-burger-icon ${isMenuOpen ? "is-open" : ""}`}>
                <span />
                <span />
                <span />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile panel (visible at <=768px when menu is open) */}
        {isMenuOpen && (
          <div className="crowdly-mobile-panel crowdly-header-mobile-only">
            {languageSelect}
            <div className="crowdly-header-greeting">{greetingLine}</div>
            <div className="crowdly-header-auth-links">
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onLogoutClick();
                  }}
                >
                  Log out
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onLoginClick();
                    }}
                  >
                    Login
                  </button>
                  <span className="auth-separator">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onRegisterClick();
                    }}
                  >
                    Register
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dropdown menu (burger) */}
      {isMenuOpen && (
        <>
          <div
            className="crowdly-menu-overlay"
            onClick={() => setIsMenuOpen(false)}
          />
          <div
            className="crowdly-menu-dropdown"
            onClick={(e) => e.stopPropagation()}
          >
            {onCreateClick && (
              <button
                type="button"
                className="crowdly-menu-item"
                onClick={() => {
                  setIsMenuOpen(false);
                  onCreateClick();
                }}
              >
                Create
              </button>
            )}
            {onImportClick && (
              <button
                type="button"
                className="crowdly-menu-item"
                onClick={() => {
                  setIsMenuOpen(false);
                  onImportClick();
                }}
              >
                Import
              </button>
            )}
            {onExportClick && (
              <button
                type="button"
                className={`crowdly-menu-item ${!isExportEnabled ? "disabled" : ""}`}
                onClick={() => {
                  if (!isExportEnabled) return;
                  setIsMenuOpen(false);
                  onExportClick();
                }}
                title={
                  isExportEnabled
                    ? "Export current story or screenplay"
                    : "Export is only available on a story or screenplay page"
                }
              >
                Export{!isExportEnabled ? " (open a story first)" : ""}
              </button>
            )}

            {(onCreateClick || onImportClick || onExportClick) && (
              <hr className="crowdly-menu-separator" />
            )}

            <button
              type="button"
              className="crowdly-menu-item"
              onClick={() => {
                setIsMenuOpen(false);
                setIsSpacesOpen(true);
              }}
            >
              Space(s)
            </button>
          </div>
        </>
      )}

      {/* Spaces popup */}
      {isSpacesOpen && (
        <div
          className="crowdly-spaces-overlay"
          onClick={() => setIsSpacesOpen(false)}
        >
          <div
            className="crowdly-spaces-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crowdly-spaces-header">
              <h2>Space(s)</h2>
              <button
                type="button"
                className="crowdly-spaces-close"
                onClick={() => setIsSpacesOpen(false)}
              >
                ×
              </button>
            </div>

            {spacesError ? (
              <div className="border rounded-lg bg-white p-4 text-sm text-red-600">
                {spacesError}
              </div>
            ) : (
              <CreativeSpacesModule spaces={spaces} isLoading={spacesLoading} />
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
