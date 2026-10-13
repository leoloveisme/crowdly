import React, { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { EditableContentProvider } from "@/contexts/EditableContentContext";
import { getEditorPageKey } from "@web/lib/pageKey";
import { WorkspaceProvider, useWorkspace } from "@web/shell/workspace";
import { AppShell } from "@web/shell/AppShell";
import CreationHome from "@web/creation/CreationHome";
import NotFound from "@web/shell/NotFound";
import { AskHost } from "@web/shell/ask";

// Routes — keep in sync with EDITOR_ROUTE_PATTERNS in lib/pageKey.ts.
const DiscoveryHome = lazy(() => import("@web/discovery/DiscoveryHome"));
const StoryEditor = lazy(() => import("@web/creation/story/StoryEditor"));
const ScreenplayEditor = lazy(() => import("@web/creation/screenplay/ScreenplayEditor"));
const ComicEditor = lazy(() => import("@web/creation/comic/ComicEditor"));
const SpacePage = lazy(() => import("@web/creation/spaces/SpacePage"));
const FileEditor = lazy(() => import("@web/creation/spaces/FileEditor"));
const LibraryPage = lazy(() => import("@web/discovery/LibraryPage"));
const ShelvesPage = lazy(() => import("@web/discovery/ShelvesPage"));
const ReaderPage = lazy(() => import("@web/discovery/reader/ReaderPage"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/** "Start where I left off": reopen the last document on a fresh visit to the start page. */
const RestoreSession: React.FC = () => {
  const { prefs, lastPath, mode } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (location.pathname !== "/") return;
    if (prefs.launch === "restore" && lastPath && lastPath !== "/") navigate(lastPath, { replace: true });
    else if (mode === "discovery") navigate("/discover", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const Loading = () => <div className="p-6 text-sm text-muted-foreground">…</div>;

const App: React.FC = () => (
  <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EditableContentProvider pageKeyFor={getEditorPageKey}>
          <TooltipProvider>
            <WorkspaceProvider>
              <RestoreSession />
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<CreationHome />} />
                    <Route path="/discover" element={<DiscoveryHome />} />
                    <Route path="/story/:id" element={<StoryEditor />} />
                    <Route path="/screenplay/:id" element={<ScreenplayEditor />} />
                    <Route path="/comic/:id" element={<ComicEditor />} />
                    <Route path="/space/:spaceId/*" element={<SpacePage />} />
                    <Route path="/file/:spaceId/:itemId" element={<FileEditor />} />
                    <Route path="/library" element={<LibraryPage />} />
                    <Route path="/shelves" element={<ShelvesPage />} />
                    <Route path="/read/:kind/:id" element={<ReaderPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
              <AskHost />
              <Toaster />
              <Sonner />
            </WorkspaceProvider>
          </TooltipProvider>
        </EditableContentProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
