import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";

// The desktop app ships as two downloads of the same app - "Crowdly
// Discovery" and "Crowdly Creation" - that differ only in the mode they open
// in the first time (see apps/desktop/src/editor/app_modes.py). The builds
// are uploaded to /var/www/crowdly-downloads on the VPS (nginx: /downloads/)
// by apps/desktop/upload-downloads.sh; these stable names always point at the
// latest version. null = the button shows "coming soon".
const DESKTOP_DOWNLOADS: Record<"discovery" | "creation", string | null> = {
  discovery: "/downloads/desktop/crowdly-discovery-macos-arm64.zip",
  creation: "/downloads/desktop/crowdly-creation-macos-arm64.zip",
};

// The standalone browser editor (apps/web). Not deployed yet; set its URL
// here once it is, and the hero button becomes a link.
const WEB_APP_URL: string | null = null;

const GITHUB_URL = "https://github.com/leoloveisme/crowdly";

const BookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
  </svg>
);

const PenIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7 6-2M4 14l5 5" />
  </svg>
);

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-3 rounded-lg px-5 py-3 text-[15px] font-semibold transition " +
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-pink-600";
const BUTTON_ACTIVE = "bg-indigo-800 text-white hover:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500";
const BUTTON_DISABLED = "bg-gray-400 text-white cursor-not-allowed dark:bg-gray-600";

const DESKTOP_MODES = [
  {
    mode: "discovery" as const,
    icon: <BookIcon />,
    chip: "bg-indigo-50 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    tagline: "text-indigo-800 dark:text-indigo-200",
  },
  {
    mode: "creation" as const,
    icon: <PenIcon />,
    chip: "bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300",
    tagline: "text-pink-600 dark:text-pink-300",
  },
];

const CrowdlySoftware = () => {
  const { user, hasRole } = useAuth();
  const location = useLocation();

  // Footer links point at /software#discovery and /software#creation.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  const isAdmin = user && hasRole("platform_admin");

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />

      <main className="flex-grow bg-gray-50 text-gray-900 dark:bg-background dark:text-gray-100">
        <div className="mx-auto w-full max-w-5xl px-5 md:px-6">
          {isAdmin && (
            <h2 className="pt-6 text-2xl font-bold text-red-600">
              <EditableText id="admin-message">You are logged in as platform admin</EditableText>
            </h2>
          )}

          {/* Hero */}
          <section className="max-w-3xl pt-12 pb-12 md:pt-20 md:pb-16" aria-labelledby="software-page-title">
            <EditableText id="software-eyebrow" as="p" className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-800 dark:text-indigo-200">
              Write · Read · Listen · Watch
            </EditableText>
            <h1
              id="software-page-title"
              className="mt-3 mb-5 pb-1 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08] bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent dark:from-indigo-200 dark:via-pink-300 dark:to-indigo-300"
            >
              <EditableText id="software-title">Crowdly apps</EditableText>
            </h1>
            <EditableText id="software-intro" as="p" className="max-w-2xl text-lg md:text-xl leading-relaxed text-gray-600 dark:text-gray-300">
              Write, read, listen and watch with Crowdly. Download the desktop app now - the web app and mobile apps are on the way.
            </EditableText>
            {WEB_APP_URL ? (
              <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer" className={`mt-7 ${PRIMARY_BUTTON} ${BUTTON_ACTIVE}`}>
                <EditableText id="software-web-app-btn">Open Crowdly web app</EditableText>
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <span role="link" aria-disabled="true" className={`mt-7 ${PRIMARY_BUTTON} ${BUTTON_DISABLED}`}>
                <EditableText id="software-web-app-soon">Crowdly web app - coming soon</EditableText>
              </span>
            )}
          </section>

          {/* Desktop app */}
          <section aria-labelledby="software-desktop-heading">
            <h2 id="software-desktop-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              <EditableText id="software-desktop-heading">One desktop app. Two ways to use it.</EditableText>
            </h2>
            <EditableText id="software-desktop-intro" as="p" className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
              Discover your next story or work on your own. Start in Discovery or Creation mode and switch whenever you like.
            </EditableText>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {DESKTOP_MODES.map(({ mode, icon, chip, tagline }) => {
                const url = DESKTOP_DOWNLOADS[mode];
                return (
                  <article
                    key={mode}
                    id={mode}
                    className="scroll-mt-24 flex flex-col items-start rounded-2xl border border-indigo-100 bg-white p-7 md:p-8 shadow-sm dark:border-indigo-900/60 dark:bg-gray-900"
                  >
                    <div className={`mb-7 grid h-12 w-12 place-items-center rounded-xl ${chip}`}>{icon}</div>
                    {mode === "discovery" ? (
                      <>
                        <EditableText id="software-discovery-title" as="h3" className="text-2xl font-bold tracking-tight">
                          Crowdly Discovery
                        </EditableText>
                        <EditableText id="software-discovery-tagline" as="p" className={`mt-2 mb-4 font-semibold ${tagline}`}>
                          Your space to read and listen.
                        </EditableText>
                        <EditableText id="software-discovery-desc" as="p" className="flex-grow text-gray-600 dark:text-gray-300">
                          Enjoy your private library of books and audiobooks alongside Crowdly stories. Keep your reading progress, highlights and notes in sync across your devices.
                        </EditableText>
                      </>
                    ) : (
                      <>
                        <EditableText id="software-creation-title" as="h3" className="text-2xl font-bold tracking-tight">
                          Crowdly Creation
                        </EditableText>
                        <EditableText id="software-creation-tagline" as="p" className={`mt-2 mb-4 font-semibold ${tagline}`}>
                          Your space to write.
                        </EditableText>
                        <EditableText id="software-creation-desc" as="p" className="flex-grow text-gray-600 dark:text-gray-300">
                          Focus on your stories and screenplays in a distraction-free editor. Sync your work with Crowdly, your creative Spaces, GitHub and Google Drive.
                        </EditableText>
                      </>
                    )}
                    {url ? (
                      <a href={url} download className={`mt-7 w-full ${PRIMARY_BUTTON} ${BUTTON_ACTIVE}`}>
                        <EditableText id={`software-download-${mode}`}>Download</EditableText>
                      </a>
                    ) : (
                      <span aria-disabled="true" className={`mt-7 w-full ${PRIMARY_BUTTON} ${BUTTON_DISABLED}`}>
                        <EditableText id="software-download-soon">Download - coming soon</EditableText>
                      </span>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="border-b border-indigo-100 px-1 pt-6 pb-9 dark:border-indigo-900/60">
              <p className="inline-flex items-center gap-2.5 text-sm font-semibold">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-pink-600" aria-hidden="true" />
                <EditableText id="software-desktop-platforms-mac">
                  macOS on Apple Silicon (M1 or newer). Windows and Linux will follow.
                </EditableText>
              </p>
              <EditableText id="software-desktop-mac-open-note" as="p" className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                On a Mac, unzip the download and move the app to Applications. The first time, right-click the app and choose Open - the app isn't notarized by Apple yet.
              </EditableText>
            </div>
          </section>

          {/* Mobile and alpha access */}
          <div className="grid gap-7 py-10 md:grid-cols-2 md:gap-12">
            <section aria-labelledby="software-mobile-title">
              <h2 id="software-mobile-title" className="mb-2 text-xl font-bold tracking-tight">
                <EditableText id="software-mobile-title">Mobile apps are on the way</EditableText>
              </h2>
              <EditableText id="software-mobile-soon" as="p" className="text-[15px] text-gray-600 dark:text-gray-300">
                Crowdly Discovery and Crowdly Creation for Android, iPhone and iPad will follow.
              </EditableText>
            </section>
            <section aria-labelledby="software-alpha-title">
              <h2 id="software-alpha-title" className="mb-2 text-xl font-bold tracking-tight">
                <EditableText id="software-alpha-title">Access during the alpha</EditableText>
              </h2>
              <EditableText id="software-desktop-alpha-note" as="p" className="text-[15px] text-gray-600 dark:text-gray-300">
                Crowdly is currently invite-only. You'll need a Crowdly account to sign in.
              </EditableText>
            </section>
          </div>

          {/* Contribute */}
          <section
            aria-labelledby="software-contribute-title"
            className="mb-14 flex flex-col items-start gap-5 rounded-2xl bg-gradient-to-r from-pink-50 via-white to-indigo-50 px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8 dark:from-indigo-900/60 dark:via-gray-900 dark:to-pink-900/40"
          >
            <div>
              <h2 id="software-contribute-title" className="mb-1.5 text-xl font-bold tracking-tight">
                <EditableText id="software-contribute-title">Help build Crowdly</EditableText>
              </h2>
              <EditableText id="software-contribute-text" as="p" className="text-[15px] text-gray-600 dark:text-gray-300">
                Crowdly is open source. Explore the code and contribute on GitHub.
              </EditableText>
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-indigo-800 hover:text-pink-600 dark:text-indigo-200 dark:hover:text-pink-300 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-pink-600 rounded"
            >
              <EditableText id="software-github-link">View Crowdly on GitHub</EditableText>
              <span aria-hidden="true">↗</span>
            </a>
          </section>
        </div>
      </main>

      <CrowdlyFooter />
    </div>
  );
};

export default CrowdlySoftware;
