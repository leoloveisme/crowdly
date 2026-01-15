import React from "react";

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
    </header>
  );
};

export default Header;
