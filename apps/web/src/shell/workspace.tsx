import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import { flushOutbox, onOutboxChange } from "@web/lib/offline";

// Desktop-style workspace state: Creation/Discovery mode, open tabs, pane
// visibility, status-bar info and the "document actions" the active editor
// exposes to the menu bar (Find, Export, Save as, Insert image, ...).
// Persisted to localStorage so "Start where I left off" works like the
// desktop app's session_store.py.

export type Mode = "creation" | "discovery";
export type SyncState = "idle" | "saving" | "saved" | "offline" | "error" | "live" | "queued";

export interface Tab {
  path: string;
  title: string;
  kind: string;
}

export interface StatusInfo {
  words?: number;
  paragraphs?: number;
  chapters?: number;
  sync?: SyncState;
  message?: string;
  peers?: number;
}

export type ExportFormat = "pdf" | "epub" | "docx" | "odt" | "fdx" | "fountain" | "html" | "txt" | "md";
export type SaveAsFormat = "md" | "story" | "screenplay" | "comic";

/** What the active document lets the menu bar do. Unset = menu item disabled. */
export interface DocActions {
  kind?: "story" | "screenplay" | "comic" | "markdown" | "master";
  find?: () => void;
  replace?: () => void;
  exportAs?: (format: ExportFormat) => void;
  exportFormats?: ExportFormat[];
  saveAs?: (format: SaveAsFormat) => void;
  saveAsFormats?: SaveAsFormat[];
  saveToSpace?: () => void;
  insertImage?: () => void;
  metadata?: () => void;
  revisions?: () => void;
  importInto?: () => void;
  /** "I want to change this" — for readers and contributors. */
  change?: () => void;
}

export type StartMode = "creation" | "discovery";
export type LaunchMode = "restore" | "default";

export interface Prefs {
  startMode: StartMode;
  launch: LaunchMode;
  showSource: boolean;
  showVisual: boolean;
  activeSpaceId: string | null;
  syncWeb: boolean;
  liveCollab: boolean;
  readerFontSize: number;
  readerTheme: "light" | "sepia" | "dark";
}

interface Persisted {
  mode: Mode;
  tabs: Tab[];
  lastPath: string | null;
  prefs: Prefs;
}

const STORAGE_KEY = "crowdly_webapp_workspace_v1";

const DEFAULT_PREFS: Prefs = {
  startMode: "creation",
  launch: "restore",
  showSource: true,
  showVisual: true,
  activeSpaceId: null,
  syncWeb: true,
  liveCollab: true,
  readerFontSize: 18,
  readerTheme: "light",
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      const prefs = { ...DEFAULT_PREFS, ...(p.prefs ?? {}) };
      // At least one editor pane is always visible.
      if (!prefs.showSource && !prefs.showVisual) prefs.showVisual = true;
      return {
        mode: prefs.launch === "restore" ? (p.mode ?? prefs.startMode) : prefs.startMode,
        tabs: prefs.launch === "restore" ? (p.tabs ?? []) : [],
        lastPath: prefs.launch === "restore" ? (p.lastPath ?? null) : null,
        prefs,
      };
    }
  } catch {
    /* corrupted state — start fresh */
  }
  return { mode: "creation", tabs: [], lastPath: null, prefs: DEFAULT_PREFS };
}

interface WorkspaceValue {
  mode: Mode;
  setMode: (m: Mode) => void;
  tabs: Tab[];
  openTab: (tab: Tab) => void;
  closeTab: (path: string) => string | null;
  renameTab: (path: string, title: string) => void;
  moveTab: (from: number, to: number) => void;
  setTabTitle: (path: string, title: string) => void;
  lastPath: string | null;
  setLastPath: (p: string) => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  status: StatusInfo;
  setStatus: (patch: StatusInfo, replace?: boolean) => void;
  actions: DocActions;
  setActions: (a: DocActions) => void;
  distractionFree: boolean;
  setDistractionFree: (on: boolean) => void;
  online: boolean;
  /** Writes waiting in the offline outbox. */
  outbox: number;
}

const Ctx = createContext<WorkspaceValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = useRef(load()).current;
  const [mode, setModeState] = useState<Mode>(initial.mode);
  const [tabs, setTabs] = useState<Tab[]>(initial.tabs);
  const [lastPath, setLastPathState] = useState<string | null>(initial.lastPath);
  const [prefs, setPrefsState] = useState<Prefs>(initial.prefs);
  const [status, setStatusState] = useState<StatusInfo>({});
  const [actions, setActions] = useState<DocActions>({});
  const [distractionFree, setDF] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [outbox, setOutbox] = useState(0);

  // Replay offline writes on start and whenever the connection comes back.
  useEffect(() => {
    const off = onOutboxChange(setOutbox);
    flushOutbox(API_BASE);
    const again = () => flushOutbox(API_BASE);
    window.addEventListener("online", again);
    const timer = setInterval(again, 30_000);
    return () => {
      off();
      window.removeEventListener("online", again);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const save: Persisted = { mode, tabs, lastPath, prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  }, [mode, tabs, lastPath, prefs]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Distraction-free = browser fullscreen with all chrome hidden (desktop:
  // native fullscreen with only the active pane). Leaving fullscreen with
  // Esc turns it off too.
  const setDistractionFree = useCallback((on: boolean) => {
    setDF(on);
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const h = () => {
      if (!document.fullscreenElement) setDF(false);
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const openTab = useCallback((tab: Tab) => {
    setTabs((prev) => (prev.some((t) => t.path === tab.path) ? prev : [...prev, tab]));
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      const idx = tabs.findIndex((t) => t.path === path);
      const next = tabs.filter((t) => t.path !== path);
      setTabs(next);
      if (next.length === 0) return null;
      return next[Math.min(Math.max(idx, 0), next.length - 1)].path;
    },
    [tabs],
  );

  const renameTab = useCallback((path: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, title } : t)));
  }, []);
  const setTabTitle = renameTab;

  const moveTab = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      const next = prev.slice();
      const [t] = next.splice(from, 1);
      next.splice(to, 0, t);
      return next;
    });
  }, []);

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) =>
      setPrefsState((p) => {
        const next = { ...p, ...patch };
        // Like the desktop's pane checkboxes: refuse to hide the last visible pane.
        if (!next.showSource && !next.showVisual) {
          next.showSource = p.showSource;
          next.showVisual = p.showVisual;
        }
        return next;
      }),
    [],
  );
  const setStatus = useCallback(
    (patch: StatusInfo, replace = false) => setStatusState((s) => (replace ? patch : { ...s, ...patch })),
    [],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      mode,
      setMode: setModeState,
      tabs,
      openTab,
      closeTab,
      renameTab,
      moveTab,
      setTabTitle,
      lastPath,
      setLastPath: setLastPathState,
      prefs,
      setPrefs,
      status,
      setStatus,
      actions,
      setActions,
      distractionFree,
      setDistractionFree,
      online,
      outbox,
    }),
    [mode, tabs, openTab, closeTab, renameTab, moveTab, setTabTitle, lastPath, prefs, setPrefs, status, setStatus, actions, distractionFree, setDistractionFree, online, outbox],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}

/** Registers the active editor's menu actions for as long as it's mounted. */
export function useDocActions(actions: DocActions, deps: React.DependencyList) {
  const { setActions } = useWorkspace();
  useEffect(() => {
    setActions(actions);
    return () => setActions({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Sets this page's tab title and resets status-bar info on unmount. */
export function useTabTitle(path: string, title: string | undefined) {
  const { setTabTitle, setStatus } = useWorkspace();
  useEffect(() => {
    if (title) setTabTitle(path, title);
  }, [path, title, setTabTitle]);
  useEffect(() => () => setStatus({}, true), [path, setStatus]);
}
