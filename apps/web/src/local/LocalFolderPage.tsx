import React, { useCallback, useEffect, useRef, useState } from "react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen, FileText, RefreshCw, X, HardDriveDownload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { askConfirm } from "@web/shell/ask";
import { listSpaces, listSharedSpaces } from "@web/lib/docs";
import { countWords } from "@web/lib/text";
import {
  ensurePermission,
  forgetFolder,
  listFolders,
  listTree,
  localFoldersSupported,
  pickFolder,
  readLocalText,
  saveFolder,
  syncFolder,
  writeLocal,
  type LocalEntry,
  type LocalFolder,
} from "@web/lib/localfs";
import { DualPaneEditor, type DualPaneHandle } from "@web/creation/DualPaneEditor";
import { mdToPlain } from "@web/creation/markdown";

// A folder on this computer, opened in the browser (Chrome / Edge): browse
// it, edit text files in place, and sync it with a Crowdly Space — the web
// equivalent of the desktop app's local Spaces.

const TEXT = /\.(md|markdown|txt|story|screenplay|comic|master|fountain|json|html?|css|csv|ya?ml)$/i;

const LocalFolderPage: React.FC = () => {
  const { user } = useAuth();
  const { setStatus } = useWorkspace();
  const isMobile = useIsMobile();
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [current, setCurrent] = useState<LocalFolder | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [open, setOpen] = useState<LocalEntry | null>(null);
  const [text, setText] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<DualPaneHandle>(null);
  useTabTitle("/local", current ? current.name : "Local folder");

  const spaces = useQuery({
    queryKey: ["spaces", user?.id],
    queryFn: async () => {
      const [mine, shared] = await Promise.all([listSpaces(user!.id), listSharedSpaces()]);
      return [...mine, ...shared.filter((s) => !mine.some((m) => m.id === s.id))];
    },
    enabled: !!user,
  });

  useEffect(() => {
    listFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  const openFolder = useCallback(async (f: LocalFolder) => {
    if (!(await ensurePermission(f))) return toast({ title: "Permission to the folder was not given", variant: "destructive" });
    setCurrent(f);
    setOpen(null);
    setEntries(await listTree(f.handle));
  }, []);

  const openFile = async (e: LocalEntry) => {
    if (e.kind === "folder" || !TEXT.test(e.name)) return;
    setOpen(e);
    setText(await readLocalText(e.handle));
  };

  const onChange = (t: string) => {
    setText(t);
    if (!current || !open) return;
    setStatus({ sync: "queued" });
    if (timer.current) clearTimeout(timer.current);
    const target = open;
    timer.current = setTimeout(async () => {
      try {
        await writeLocal(current.handle, target.path, t);
        setStatus({ sync: "saved" });
      } catch (err) {
        setStatus({ sync: "error" });
        toast({ title: "Couldn't save to the folder", description: (err as Error).message, variant: "destructive" });
      }
    }, 800);
  };

  useEffect(() => {
    if (open) setStatus({ words: countWords(mdToPlain(text)), message: open.path });
  }, [text, open, setStatus]);

  useDocActions({ kind: "markdown", find: open ? () => editorRef.current?.openFind(false) : undefined, replace: open ? () => editorRef.current?.openFind(true) : undefined }, [open]);

  const sync = async () => {
    if (!current || !user || !current.spaceId) return;
    setSyncing("…");
    try {
      const r = await syncFolder(current, current.spaceId, user.id, setSyncing);
      setEntries(await listTree(current.handle));
      toast({
        title: "Synced",
        description: `${r.uploaded.length} sent, ${r.downloaded.length} received${r.conflicts.length ? `, ${r.conflicts.length} kept both` : ""}${r.errors.length ? `, ${r.errors.length} failed` : ""}.`,
        variant: r.errors.length ? "destructive" : undefined,
      });
      setFolders(await listFolders());
    } catch (err) {
      toast({ title: "Sync failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  };

  if (!localFoldersSupported) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EditableText id="webapp-local-unsupported" as="p">
          Opening folders from your computer needs Chrome or Edge on a desktop computer. In this browser, use Spaces — or the desktop app.
        </EditableText>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-6">
        <EditableText id="webapp-local-title" as="h1" className="text-2xl font-semibold">
          Local folders
        </EditableText>
        <EditableText id="webapp-local-desc" as="p" className="text-muted-foreground">
          Work on a folder on this computer and keep it in sync with a Crowdly Space. Files starting with a dot and anything in .gitignore stay private.
        </EditableText>
        <Button
          className="gap-1"
          onClick={async () => {
            try {
              const f = await pickFolder();
              setFolders(await listFolders());
              openFolder(f);
            } catch {
              /* picker cancelled */
            }
          }}
        >
          <FolderOpen className="h-4 w-4" />
          <EditableText id="webapp-local-open">Open a folder…</EditableText>
        </Button>
        {folders.length > 0 && (
          <ul className="divide-y rounded-md border">
            {folders.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Folder className="h-4 w-4 text-amber-600" />
                <button className="flex-1 text-left font-medium" onClick={() => openFolder(f)}>
                  {f.name}
                </button>
                {f.lastSyncedAt && <span className="text-xs text-muted-foreground">{new Date(f.lastSyncedAt).toLocaleString()}</span>}
                <button
                  aria-label="Forget this folder"
                  onClick={async () => {
                    if (await askConfirm(`Forget “${f.name}”? The folder itself is not touched.`, false)) {
                      await forgetFolder(f.id);
                      setFolders(await listFolders());
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const tree = (
    <ul className="h-full overflow-auto p-1 text-sm">
      {entries.map((e) => (
        <li key={e.path} style={{ paddingLeft: `${(e.path.split("/").length - 1) * 12}px` }}>
          <button
            onClick={() => openFile(e)}
            disabled={e.kind === "file" && !TEXT.test(e.name)}
            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted disabled:opacity-40 ${open?.path === e.path ? "bg-primary/10" : ""}`}
          >
            {e.kind === "folder" ? <Folder className="h-3.5 w-3.5 text-amber-600" /> : <FileText className="h-3.5 w-3.5" />}
            <span className="truncate">{e.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <button className="text-sm text-muted-foreground hover:underline" onClick={() => setCurrent(null)}>
          ← <EditableText id="webapp-local-folders">Folders</EditableText>
        </button>
        <span className="mr-auto font-semibold">{current.name}</span>
        {user && (
          <>
            <select
              value={current.spaceId ?? ""}
              onChange={async (e) => {
                const next = { ...current, spaceId: e.target.value || null };
                await saveFolder(next);
                setCurrent(next);
              }}
              className="h-8 rounded border bg-background px-2 text-sm"
              aria-label="Sync with Space"
            >
              <option value="">— Sync with a Space —</option>
              {spaces.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="gap-1" onClick={sync} disabled={!current.spaceId || !!syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              <EditableText id="webapp-local-sync">Sync now</EditableText>
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="gap-1" onClick={async () => setEntries(await listTree(current.handle))}>
          <HardDriveDownload className="h-4 w-4" />
          <EditableText id="webapp-local-refresh">Refresh</EditableText>
        </Button>
      </div>
      {syncing && <div className="border-b bg-muted/40 px-3 py-1 text-xs">{syncing}</div>}
      <div className="flex min-h-0 flex-1">
        {(!isMobile || !open) && <aside className={`${isMobile ? "flex-1" : "w-64 border-r"} shrink-0`}>{tree}</aside>}
        {open && (
          <section className="min-w-0 flex-1">
            {/\.(md|markdown|txt)$/i.test(open.name) ? (
              <DualPaneEditor
                key={open.path}
                ref={editorRef}
                markdown={text}
                onChange={onChange}
                header={
                  <div className="border-b px-3 py-1 text-sm">
                    {isMobile && (
                      <button className="mr-2 text-muted-foreground" onClick={() => setOpen(null)}>
                        ←
                      </button>
                    )}
                    {open.path}
                  </div>
                }
              />
            ) : (
              <textarea value={text} onChange={(e) => onChange(e.target.value)} className="h-full w-full resize-none bg-muted/20 p-3 font-mono text-sm outline-none" aria-label={open.path} />
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default LocalFolderPage;
