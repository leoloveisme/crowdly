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

  return (
    <header className="crowdly-header" onPointerDown={(e) => e.stopPropagation()}>
      {/* Desktop and landscape layout: table-based */}
      <div className="crowdly-header-desktop">
        <table width="100%">
          <tbody>
            <tr>
              <td className="crowdly-header-cell" align="left">
                <img
                  src="/images/crowdly-app.png"
                  title="Crowdly logo"
                  alt="Crowdly logo"
                  className="crowdly-header-logo"
                />
              </td>
              <td className="crowdly-header-cell" align="left">
                <strong>
                  <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
                    Crowdly web app
                  </a>
                </strong>
              </td>
              <td className="crowdly-header-cell" align="center">
                Path: Space | directory | file name
              </td>
              <td className="crowdly-header-cell" align="right">
                <select
                  name="interface_language"
                  id="language"
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
              </td>
              <td className="crowdly-header-cell" align="right">
                {greetingLine}
              </td>
              <td className="crowdly-header-cell" align="right">
                {isLoggedIn ? (
                  <>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onLogoutClick();
                      }}
                    >
                      Log out
                    </a>
                  </>
                ) : (
                  <>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onLoginClick();
                      }}
                    >
                      Login
                    </a>{" "}
                    |{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onRegisterClick();
                      }}
                    >
                      Register
                    </a>
                  </>
                )}
              </td>
              <td className="crowdly-header-cell" align="right">
                <button
                  type="button"
                  aria-label="Open menu"
                  className="crowdly-header-burger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(true);
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile portrait layout: div-based */}
      <div className="crowdly-header-mobile">
        <div className="crowdly-header-mobile-row crowdly-header-mobile-row-top">
          <img
            src=""
            title="Crowdly logo"
            alt="Crowdly logo"
            className="crowdly-header-logo"
          />
          <strong>
            <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
              Crowdly web app
            </a>
          </strong>
          <button
            type="button"
            aria-label="Open menu"
            className="crowdly-header-burger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsMenuOpen(true);
            }}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <div className="crowdly-header-mobile-row crowdly-header-mobile-row-path">
          Path: Space | directory | file name
        </div>
        <div className="crowdly-header-mobile-row crowdly-header-mobile-row-bottom">
          <div className="crowdly-header-mobile-language-and-greeting">
            <select
              name="interface_language"
              id="language-mobile"
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

            {greetingLine}{" "}
            {isLoggedIn ? (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onLogoutClick();
                }}
              >
                Log out
              </a>
            ) : (
              <>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onLoginClick();
                  }}
                >
                  Login
                </a>{" "}
                |{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onRegisterClick();
                  }}
                >
                  Register
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Global header burger menu */}
      {isMenuOpen && (
        <div
          onClick={() => {
            setIsMenuOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "flex-start",
            zIndex: 1500,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: 56,
              marginRight: 12,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: "12px 16px",
              minWidth: 180,
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              fontSize: 13,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsSpacesOpen(true);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 4px",
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Space(s)
            </button>
          </div>
        </div>
      )}

      {/* Spaces popup using CreativeSpacesModule */}
      {isSpacesOpen && (
        <div
          onClick={() => {
            setIsSpacesOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1550,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: "100%",
              margin: 12,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: 16,
              boxSizing: "border-box",
              boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Space(s)</h2>
              <button
                type="button"
                onClick={() => setIsSpacesOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
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
