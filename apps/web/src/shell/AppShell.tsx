import React, { useEffect, useMemo, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PenLine, BookOpen, LogIn, LogOut } from "lucide-react";
import { UI_LANGUAGES } from "@web/lib/languages";
import { createSpace, listSharedSpaces, listSpaces, deleteSpace } from "@web/lib/docs";
import { platformLink } from "@web/lib/api";
import { useWorkspace, type ExportFormat, type SaveAsFormat } from "./workspace";
import { DesktopMenuBar, MobileMenu, type MenuEntry, type MenuGroup } from "./MenuBar";
import { LoginDialog, NewDocumentDialog, OpenWorkDialog, ReportBugDialog, ShowTabsDialog, type NewKind } from "./dialogs";
import { TabsBar } from "./TabsBar";
import { StatusBar } from "./StatusBar";

const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: "as PDF",
  epub: "as EPUB",
  docx: "as docx",
  odt: "as odt",
  fdx: "as FDX",
  fountain: "as FOUNTAIN",
  html: "as HTML",
  txt: "as plain text",
  md: "as Markdown",
};
const SAVE_AS_LABELS: Record<SaveAsFormat, string> = {
  md: ".md",
  story: ".story",
  screenplay: ".screenplay",
  comic: ".comic",
};

/** Routes → tab kind and default title, until the page sets a real title. */
function tabFor(pathname: string): { kind: string; title: string } | null {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return null;
  const kinds: Record<string, string> = {
    story: "Story",
    screenplay: "Screenplay",
    comic: "Comic",
    space: "Space",
    file: "File",
    master: "Master document",
    read: "Reading",
    library: "My library",
    shelves: "Shelves",
    discover: "Discover",
    settings: "Settings",
    local: "Local folder",
  };
  const k = kinds[seg[0]];
  return k ? { kind: seg[0], title: k } : null;
}

export const AppShell: React.FC = () => {
  const ws = useWorkspace();
  const { user, signOut } = useAuth();
  const { currentLanguage, setCurrentLanguage, isAdmin, isEditingEnabled, toggleEditingMode } = useEditableContent();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const [loginOpen, setLoginOpen] = useState(false);
  const [newOpen, setNewOpen] = useState<NewKind | null>(null);
  const [openOpen, setOpenOpen] = useState<null | "here" | "window">(null);
  const [bugOpen, setBugOpen] = useState(false);
  const [tabsOpen, setTabsOpen] = useState(false);

  // Every visited document becomes a tab; remember the location for
  // "Start where I left off".
  useEffect(() => {
    const t = tabFor(location.pathname);
    if (t) ws.openTab({ path: location.pathname, title: t.title, kind: t.kind });
    ws.setLastPath(location.pathname + location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Desktop-like keyboard shortcuts (the browser keeps Ctrl/Cmd+N and +T).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f" && ws.actions.find) {
        e.preventDefault();
        ws.actions.find();
      } else if (mod && e.key.toLowerCase() === "h" && ws.actions.replace) {
        e.preventDefault();
        ws.actions.replace();
      } else if (mod && e.key.toLowerCase() === "s") {
        // Everything autosaves; swallow the browser's "save page" dialog.
        e.preventDefault();
        toast({ title: "Saved automatically", duration: 1500 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws.actions]);

  const { data: spaces = [] } = useQuery({
    queryKey: ["spaces", user?.id],
    queryFn: async () => {
      const [mine, shared] = await Promise.all([listSpaces(user!.id), listSharedSpaces()]);
      return [...mine, ...shared.filter((s) => !mine.some((m) => m.id === s.id))];
    },
    enabled: !!user,
  });

  const activeSpace = spaces.find((s) => s.id === ws.prefs.activeSpaceId) ?? null;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const inCreation = ws.mode === "creation";
  const a = ws.actions;

  const groups: MenuGroup[] = useMemo(() => {
    const needUser = (fn: () => void) => () => (user ? fn() : setLoginOpen(true));

    const g: MenuGroup[] = [
      {
        id: "webapp-menu-discovery-add",
        label: "Add books…",
        hidden: inCreation,
        items: [{ id: "webapp-menu-discovery-add-books", label: "Add books to my library…", onSelect: needUser(() => navigate("/library")) }],
      },
      {
        id: "webapp-menu-new",
        label: "New",
        hidden: !inCreation,
        items: [
          { id: "webapp-menu-new-story", label: "Story", onSelect: needUser(() => setNewOpen("story")) },
          { id: "webapp-menu-new-screenplay", label: "Screenplay", onSelect: needUser(() => setNewOpen("screenplay")) },
          { id: "webapp-menu-new-comic", label: "Comic / manga", onSelect: needUser(() => setNewOpen("comic")) },
          { id: "webapp-menu-new-tab", label: "Tab", separatorBefore: true, onSelect: () => navigate("/") },
          { id: "webapp-menu-new-window", label: "Window", onSelect: () => window.open(`${base}/`, "_blank") },
        ],
      },
      {
        id: "webapp-menu-open",
        label: "Open",
        items: [
          { id: "webapp-menu-open-web", label: "Story on the web", onSelect: () => setOpenOpen("here") },
          { id: "webapp-menu-open-web-window", label: "Story on the web in a new window", onSelect: () => setOpenOpen("window") },
          { id: "webapp-menu-open-library", label: "My library", separatorBefore: true, onSelect: () => navigate("/library") },
          { id: "webapp-menu-open-shelves", label: "Shelves", onSelect: () => navigate("/shelves") },
        ],
      },
      {
        id: "webapp-menu-spaces",
        label: "Spaces",
        hidden: !inCreation,
        items: [
          {
            id: "webapp-menu-spaces-add",
            label: "Add",
            onSelect: needUser(async () => {
              const name = await askText("Name of the new Space");
              if (!name?.trim()) return;
              try {
                const s = await createSpace(user!.id, name.trim());
                await qc.invalidateQueries({ queryKey: ["spaces"] });
                ws.setPrefs({ activeSpaceId: s.id });
                navigate(`/space/${s.id}`);
              } catch (err) {
                toast({ title: "Couldn't create the Space", description: (err as Error).message, variant: "destructive" });
              }
            }),
          },
          ...spaces.map<MenuEntry>((s, i) => ({
            id: `space-${s.id}`,
            label: s.name,
            raw: true,
            separatorBefore: i === 0,
            checked: s.id === ws.prefs.activeSpaceId,
            onSelect: () => {
              ws.setPrefs({ activeSpaceId: s.id });
              navigate(`/space/${s.id}`);
            },
          })),
          {
            id: "webapp-menu-spaces-remove",
            label: "Remove current Space",
            separatorBefore: true,
            disabled: !activeSpace || activeSpace.user_id !== user?.id,
            onSelect: async () => {
              if (!activeSpace || !user) return;
              if (!await askConfirm(`Delete the Space "${activeSpace.name}" and everything in it?`)) return;
              try {
                await deleteSpace(activeSpace.id, user.id);
                ws.setPrefs({ activeSpaceId: null });
                await qc.invalidateQueries({ queryKey: ["spaces"] });
                navigate("/");
              } catch (err) {
                toast({ title: "Couldn't remove the Space", description: (err as Error).message, variant: "destructive" });
              }
            },
          },
        ],
      },
      {
        id: "webapp-menu-view",
        label: "View",
        items: [
          { id: "webapp-menu-view-windows", label: "Show windows", onSelect: () => setTabsOpen(true) },
          { id: "webapp-menu-view-source", label: "Markdown (MD) / HTML pane", hidden: !inCreation, checked: ws.prefs.showSource, onSelect: () => ws.setPrefs({ showSource: !ws.prefs.showSource || !ws.prefs.showVisual ? !ws.prefs.showSource : false }) },
          { id: "webapp-menu-view-visual", label: "WYSIWYG pane", hidden: !inCreation, checked: ws.prefs.showVisual, onSelect: () => ws.setPrefs({ showVisual: !ws.prefs.showVisual || !ws.prefs.showSource ? !ws.prefs.showVisual : false }) },
          { id: "webapp-menu-view-focus", label: "Distraction-free mode", checked: ws.distractionFree, onSelect: () => ws.setDistractionFree(!ws.distractionFree) },
        ],
      },
      {
        id: "webapp-menu-import",
        label: "Import",
        hidden: !inCreation,
        items: [{ id: "webapp-menu-import-file", label: "Import from file…", onSelect: a.importInto }],
      },
      {
        id: "webapp-menu-export",
        label: "Export",
        hidden: !inCreation,
        items: [
          ...(a.exportFormats ?? []).map<MenuEntry>((f) => ({ id: `webapp-menu-export-${f}`, label: EXPORT_LABELS[f], onSelect: () => a.exportAs?.(f) })),
          ...(a.exportFormats?.length ? [] : [{ id: "webapp-menu-export-none", label: "Open a document to export it", disabled: true }]),
        ],
      },
      {
        id: "webapp-menu-saveas",
        label: "Save as",
        hidden: !inCreation,
        items: [
          ...(a.saveAsFormats ?? []).map<MenuEntry>((f) => ({ id: `webapp-menu-saveas-${f}`, label: SAVE_AS_LABELS[f], raw: true, onSelect: () => a.saveAs?.(f) })),
          { id: "webapp-menu-saveas-space", label: "Save to a Space", separatorBefore: !!a.saveAsFormats?.length, onSelect: a.saveToSpace },
        ],
      },
      {
        id: "webapp-menu-settings",
        label: "Settings",
        items: [
          {
            id: "webapp-menu-settings-language",
            label: "Change interface language",
            children: UI_LANGUAGES.map((l) => ({ id: `lang-${l.value}`, label: l.label, raw: true, checked: currentLanguage === l.value, onSelect: () => setCurrentLanguage(l.value) })),
          },
          {
            id: "webapp-menu-settings-startup",
            label: "Startup",
            children: [
              { id: "webapp-menu-start-creation", label: "Start in Creation", checked: ws.prefs.startMode === "creation", onSelect: () => ws.setPrefs({ startMode: "creation" }) },
              { id: "webapp-menu-start-discovery", label: "Start in Discovery", checked: ws.prefs.startMode === "discovery", onSelect: () => ws.setPrefs({ startMode: "discovery" }) },
              { id: "webapp-menu-launch-restore", label: "Start where I left off", separatorBefore: true, checked: ws.prefs.launch === "restore", onSelect: () => ws.setPrefs({ launch: "restore" }) },
              { id: "webapp-menu-launch-default", label: "Start with default settings", checked: ws.prefs.launch === "default", onSelect: () => ws.setPrefs({ launch: "default" }) },
            ],
          },
          { id: "webapp-menu-settings-translate", label: "Translate the interface", hidden: !isAdmin, checked: isEditingEnabled, onSelect: toggleEditingMode },
        ],
      },
      {
        id: "webapp-menu-search",
        label: "Search",
        hidden: !inCreation,
        items: [
          { id: "webapp-menu-search-find", label: "Find", shortcut: "⌘F", onSelect: a.find },
          { id: "webapp-menu-search-replace", label: "Replace", shortcut: "⌘H", onSelect: a.replace },
        ],
      },
      {
        id: "webapp-menu-insert",
        label: "Insert",
        hidden: !inCreation,
        items: [{ id: "webapp-menu-insert-image", label: "Image…", onSelect: a.insertImage }],
      },
      {
        id: "webapp-menu-story",
        label: "Story settings",
        hidden: !inCreation,
        items: [
          { id: "webapp-menu-story-metadata", label: "Story metadata, genre and description", onSelect: a.metadata },
          { id: "webapp-menu-story-revisions", label: "Compare revisions", onSelect: a.revisions },
          { id: "webapp-menu-story-change", label: "I want to change this…", separatorBefore: true, onSelect: a.change },
        ],
      },
      {
        id: "webapp-menu-help",
        label: "Help",
        items: [
          { id: "webapp-menu-help-bug", label: "Report a bug…", onSelect: () => setBugOpen(true) },
          { id: "webapp-menu-help-feedback", label: "Send feedback", onSelect: () => window.open(platformLink("/feedback"), "_blank") },
          { id: "webapp-menu-help-platform", label: "Go to the Crowdly platform", onSelect: () => window.open(platformLink("/"), "_blank") },
          { id: "webapp-menu-help-desktop", label: "Get the desktop app", onSelect: () => window.open(platformLink("/software"), "_blank") },
        ],
      },
    ];
    return g;
  }, [user, a, inCreation, spaces, activeSpace, ws, currentLanguage, isAdmin, isEditingEnabled, navigate, qc, base, setCurrentLanguage, toggleEditingMode]);

  if (ws.distractionFree) {
    return (
      <div className="h-[100dvh] overflow-hidden bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b px-2 py-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
        {isMobile && <MobileMenu groups={groups} />}
        <Link to="/" className="flex shrink-0 items-center gap-1.5 px-1 font-semibold">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-6 w-6" />
          <span className="hidden sm:inline">Crowdly</span>
        </Link>
        {!isMobile && (
          <div className="min-w-0 flex-1 overflow-x-auto">
            <DesktopMenuBar groups={groups} />
          </div>
        )}
        {isMobile && <div className="flex-1" />}
        <ToggleGroup
          type="single"
          size="sm"
          value={ws.mode}
          onValueChange={(v) => {
            if (!v) return;
            ws.setMode(v as "creation" | "discovery");
            navigate(v === "discovery" ? "/discover" : "/");
          }}
          className="shrink-0"
        >
          <ToggleGroupItem value="creation" aria-label="Creation" className="gap-1 px-2">
            <PenLine className="h-4 w-4" />
            <span className="hidden md:inline">
              <EditableText id="webapp-mode-creation">Creation</EditableText>
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem value="discovery" aria-label="Discovery" className="gap-1 px-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">
              <EditableText id="webapp-mode-discovery">Discovery</EditableText>
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        {user ? (
          <Button variant="ghost" size="sm" onClick={() => signOut()} className="shrink-0 gap-1" title={user.email}>
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">
              <EditableText id="webapp-logout">Logout</EditableText>
            </span>
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={() => setLoginOpen(true)} className="shrink-0 gap-1">
            <LogIn className="h-4 w-4" />
            <EditableText id="webapp-login">Login</EditableText>
          </Button>
        )}
      </header>
      <TabsBar />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <StatusBar spaceName={activeSpace?.name} />

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <NewDocumentDialog open={!!newOpen} initialKind={newOpen ?? "story"} onOpenChange={(o) => !o && setNewOpen(null)} spaceId={ws.prefs.activeSpaceId} />
      <OpenWorkDialog open={!!openOpen} newWindow={openOpen === "window"} onOpenChange={(o) => !o && setOpenOpen(null)} />
      <ReportBugDialog open={bugOpen} onOpenChange={setBugOpen} />
      <ShowTabsDialog open={tabsOpen} onOpenChange={setTabsOpen} />
    </div>
  );
};
