import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { exportDocument } from "@/lib/export";
import { ExportFormat as PlatformExportFormat } from "@/types/import-export";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, FilePlus, Folder, FileText, RefreshCw, Trash2, ExternalLink, Lock, Unlock } from "lucide-react";
import { useDocActions, useTabTitle, useWorkspace, type ExportFormat } from "@web/shell/workspace";
import { askConfirm } from "@web/shell/ask";
import { downloadBlob, safeFileName, countWords } from "@web/lib/text";
import { getItem, isTextFile, joinPath, listItems, parentOf, readText, saveFileToSpace, writeText, type SpaceItem } from "@web/lib/spaces";
import { combineMaster, parseMaster, serializeMaster, type MasterContainer } from "@web/formats/master";
import { mdToPlain } from "../markdown";

// Master document (desktop: ui/master_document_window.py): assemble a book
// from files in the Space. Each include container shows a file's text;
// "live" containers write edits straight back to their file, read-only ones
// keep a frozen copy. Reorder, collapse, clone, re-pull from the file, and
// export the whole book. Saved in the desktop's own `.master` format.

interface Container extends MasterContainer {
  key: string;
  live: boolean;
  open: boolean;
}

const keyOf = () => Math.random().toString(36).slice(2);

/** Resolve a container label (relative to the .master file's folder) to a Space path. */
function resolveLabel(folder: string, label: string) {
  const parts = joinPath(folder, label).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function relativeTo(folder: string, path: string) {
  const a = folder ? folder.split("/") : [];
  const b = path.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

const FilePicker: React.FC<{ spaceId: string; onPick: (path: string, item: SpaceItem) => void }> = ({ spaceId, onPick }) => {
  const { user } = useAuth();
  const [path, setPath] = useState("");
  const [items, setItems] = useState<SpaceItem[]>([]);
  useEffect(() => {
    listItems(spaceId, path, user?.id).then((r) => setItems(r.items.sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === "folder" ? -1 : 1))));
  }, [spaceId, path, user?.id]);
  return (
    <div className="space-y-1 text-sm">
      <div className="text-xs text-muted-foreground">
        /{path}{" "}
        {path && (
          <button className="underline" onClick={() => setPath(parentOf(path))}>
            <EditableText id="webapp-master-up">up</EditableText>
          </button>
        )}
      </div>
      <ul className="max-h-[60vh] overflow-auto">
        {items.map((it) => (
          <li key={it.id}>
            <button
              draggable={it.kind === "file"}
              onDragStart={(e) => e.dataTransfer.setData("text/x-crowdly-path", joinPath(path, it.name))}
              onClick={() => (it.kind === "folder" ? setPath(joinPath(path, it.name)) : isTextFile(it) && onPick(joinPath(path, it.name), it))}
              disabled={it.kind === "file" && !isTextFile(it)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted disabled:opacity-40"
            >
              {it.kind === "folder" ? <Folder className="h-4 w-4 text-amber-600" /> : <FileText className="h-4 w-4" />}
              <span className="truncate">{it.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const MasterEditor: React.FC = () => {
  const { spaceId = "", itemId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { setStatus } = useWorkspace();
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [containers, setContainers] = useState<Container[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fileTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loaded = useRef(false);
  const savedText = useRef("");

  useTabTitle(location.pathname, name || undefined);

  useEffect(() => {
    (async () => {
      try {
        const it = await getItem(spaceId, itemId, user?.id);
        setName(it.name);
        setFolder(parentOf(it.relative_path ?? ""));
        const text = await readText(spaceId, itemId, user?.id);
        const parsed = parseMaster(text);
        savedText.current = serializeMaster(parsed);
        setContainers(parsed.map((c) => ({ ...c, key: keyOf(), live: true, open: true })));
        loaded.current = true;
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [spaceId, itemId, user?.id]);

  // Autosave the .master file 2 s after any change.
  useEffect(() => {
    const words = containers.reduce((n, c) => n + countWords(mdToPlain(c.content)), 0);
    setStatus({ words, paragraphs: undefined, chapters: containers.length });
    if (!loaded.current || !user) return;
    const text = serializeMaster(containers);
    if (text === savedText.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus({ sync: "queued" });
    timer.current = setTimeout(async () => {
      setStatus({ sync: "saving" });
      try {
        await writeText(spaceId, itemId, text, user.id);
        savedText.current = text;
        setStatus({ sync: "saved" });
      } catch {
        setStatus({ sync: "error" });
      }
    }, 2000);
  }, [containers, spaceId, itemId, user, setStatus]);

  const update = (key: string, patch: Partial<Container>) => setContainers((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const editContent = (c: Container, content: string) => {
    update(c.key, { content });
    // Live containers write through to their file (debounced per file).
    if (c.live && c.label && user) {
      const path = resolveLabel(folder, c.label);
      clearTimeout(fileTimers.current[c.key]);
      fileTimers.current[c.key] = setTimeout(async () => {
        try {
          await saveFileToSpace(spaceId, parentOf(path), path.split("/").pop()!, content, user.id, "text/markdown");
        } catch (err) {
          toast({ title: `Couldn't update ${path}`, description: (err as Error).message, variant: "destructive" });
        }
      }, 2000);
    }
  };

  const addFile = useCallback(
    async (path: string, item?: SpaceItem) => {
      try {
        const text = item ? await readText(spaceId, item.id, user?.id) : "";
        const heading = text.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? path.split("/").pop()!.replace(/\.[^.]+$/, "");
        setContainers((cs) => [...cs, { key: keyOf(), label: relativeTo(folder, path), title: heading, titleEditedAt: null, content: text, live: true, open: true }]);
        setPickerOpen(false);
      } catch (err) {
        toast({ title: "Couldn't add the file", description: (err as Error).message, variant: "destructive" });
      }
    },
    [spaceId, user?.id, folder],
  );

  const pull = async (c: Container) => {
    if (!c.label) return;
    const path = resolveLabel(folder, c.label);
    const { items } = await listItems(spaceId, parentOf(path), user?.id);
    const it = items.find((i) => i.name === path.split("/").pop());
    if (!it) return toast({ title: `${path} wasn't found — use Locate to re-link it`, variant: "destructive" });
    update(c.key, { content: await readText(spaceId, it.id, user?.id) });
  };

  const relink = (c: Container) => {
    setPickerOpen(true);
    relinkTarget.current = c.key;
  };
  const relinkTarget = useRef<string | null>(null);

  const move = (i: number, j: number) =>
    setContainers((cs) => {
      if (j < 0 || j >= cs.length) return cs;
      const n = cs.slice();
      const [x] = n.splice(i, 1);
      n.splice(j, 0, x);
      return n;
    });

  const exportBook = async (format: ExportFormat) => {
    const title = name.replace(/\.master$/i, "");
    const md = combineMaster(containers, title);
    const base = safeFileName(title);
    if (format === "md") return downloadBlob(new Blob([md], { type: "text/markdown" }), `${base}.md`);
    const map: Partial<Record<ExportFormat, PlatformExportFormat>> = { pdf: PlatformExportFormat.PDF, epub: PlatformExportFormat.EPUB, docx: PlatformExportFormat.DOCX, odt: PlatformExportFormat.ODT };
    const r = await exportDocument({ content: md, format: map[format]!, options: { title } });
    if (r.success && r.blob) downloadBlob(r.blob, r.filename ?? `${base}.${format}`);
    else toast({ title: "Export failed", description: r.error, variant: "destructive" });
  };

  useDocActions(
    {
      kind: "master",
      exportFormats: ["pdf", "epub", "docx", "odt", "md"],
      exportAs: exportBook,
      saveAsFormats: ["md"],
      saveAs: () => exportBook("md"),
    },
    [containers, name],
  );

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/space/${spaceId}/${folder}`} className="text-sm text-muted-foreground hover:underline">
          ← {folder || "Space"}
        </Link>
        <h1 className="mr-auto text-xl font-semibold">{name}</h1>
        <Button size="sm" className="gap-1" onClick={() => setPickerOpen(true)}>
          <FilePlus className="h-4 w-4" />
          <EditableText id="webapp-master-add">Add a file</EditableText>
        </Button>
      </div>
      <EditableText id="webapp-master-hint" as="p" className="text-sm text-muted-foreground">
        Build a book from files in this Space. Live parts write your edits back to their file; locked parts keep their own copy.
      </EditableText>

      <ol
        className="space-y-3"
        onDragOver={(e) => e.dataTransfer.types.includes("text/x-crowdly-path") && e.preventDefault()}
        onDrop={(e) => {
          const p = e.dataTransfer.getData("text/x-crowdly-path");
          if (p) {
            e.preventDefault();
            addFile(p);
          }
        }}
      >
        {containers.length === 0 && (
          <li className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <EditableText id="webapp-master-empty">No parts yet — add files from the Space.</EditableText>
          </li>
        )}
        {containers.map((c, i) => (
          <li
            key={c.key}
            className="rounded-md border"
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => dragFrom !== null && e.preventDefault()}
            onDrop={(e) => {
              if (dragFrom === null) return;
              e.stopPropagation();
              move(dragFrom, i);
              setDragFrom(null);
            }}
          >
            <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1">
              <button onClick={() => update(c.key, { open: !c.open })} aria-label={c.open ? "Collapse" : "Expand"}>
                {c.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Input value={c.title} onChange={(e) => update(c.key, { title: e.target.value, titleEditedAt: Date.now() / 1000 })} className="h-7 flex-1 border-0 bg-transparent font-medium shadow-none" placeholder="Part title" />
              <span className="hidden truncate text-xs text-muted-foreground sm:inline" title={c.label ?? ""}>
                {c.label}
              </span>
              <button onClick={() => update(c.key, { live: !c.live })} title={c.live ? "Live: edits go to the file" : "Locked: a frozen copy"} className="p-1">
                {c.live ? <Unlock className="h-3.5 w-3.5 text-emerald-600" /> : <Lock className="h-3.5 w-3.5" />}
              </button>
              {c.label && (
                <button onClick={() => pull(c)} title="Reload from the file" className="p-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => relink(c)} title="Locate / re-link the file" className="p-1">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setContainers((cs) => [...cs.slice(0, i + 1), { ...c, key: keyOf(), live: false }, ...cs.slice(i + 1)])} title="Clone this part" className="p-1">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => move(i, i - 1)} disabled={i === 0} className="p-1 disabled:opacity-30" aria-label="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => move(i, i + 1)} disabled={i === containers.length - 1} className="p-1 disabled:opacity-30" aria-label="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={async () => (await askConfirm("Remove this part from the master document? The file itself stays.")) && setContainers((cs) => cs.filter((x) => x.key !== c.key))}
                className="p-1 text-destructive"
                aria-label="Remove part"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {c.open && (
              <textarea
                value={c.content}
                onChange={(e) => editContent(c, e.target.value)}
                rows={Math.min(30, Math.max(4, c.content.split("\n").length + 1))}
                className="block w-full resize-y bg-transparent p-3 font-serif text-[15px] leading-relaxed outline-none"
              />
            )}
          </li>
        ))}
      </ol>

      <Sheet open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) relinkTarget.current = null; }}>
        <SheetContent side="right" className="w-[90vw] max-w-sm">
          <SheetHeader>
            <SheetTitle>
              <EditableText id="webapp-master-pick">Pick a file</EditableText>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <FilePicker
              spaceId={spaceId}
              onPick={(path, item) => {
                if (relinkTarget.current) {
                  update(relinkTarget.current, { label: relativeTo(folder, path) });
                  relinkTarget.current = null;
                  setPickerOpen(false);
                } else addFile(path, item);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MasterEditor;
