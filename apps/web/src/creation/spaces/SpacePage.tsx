import React, { useCallback, useEffect, useRef, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BookText, Clapperboard, ExternalLink, File, FileText, Folder, FolderPlus, Image as ImageIcon, Images, Link2, MoreHorizontal, Music, Plus, Upload } from "lucide-react";
import { useTabTitle, useWorkspace } from "@web/shell/workspace";
import { platformLink } from "@web/lib/api";
import { getSpace, type Space } from "@web/lib/docs";
import {
  contentUrl,
  createFile,
  createFolder,
  deleteItem,
  isAudioFile,
  isImageFile,
  isTextFile,
  joinPath,
  listContentItems,
  listItems,
  moveItem,
  renameItem,
  updateSpace,
  uploadContent,
  writeText,
  type SpaceContentItems,
  type SpaceItem,
} from "@web/lib/spaces";

// A Space's file tree (desktop: local Space folder; platform:
// CreativeSpacePage). Folders, files, upload, rename, move, delete, and
// opening files — text files in the editor, linked files in their story /
// screenplay / comic.

const NEW_FILE_TEMPLATES: Record<string, string> = {
  md: "# Untitled\n\n",
  story: "# Story title\n\n## Chapter 1\n\n",
  screenplay: "Title: Untitled\n\nINT. LOCATION - DAY\n\n",
  comic: "Title: Untitled\nDirection: ltr\n\n",
};

const SpacePage: React.FC = () => {
  const params = useParams();
  const spaceId = params.spaceId ?? "";
  const path = (params["*"] ?? "").replace(/^\/+|\/+$/g, "");
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { setPrefs, setStatus } = useWorkspace();

  const [space, setSpace] = useState<Space | null>(null);
  const [items, setItems] = useState<SpaceItem[]>([]);
  const [crumbs, setCrumbs] = useState<{ name: string; path: string }[]>([]);
  const [content, setContent] = useState<SpaceContentItems>({ stories: [], screenplays: [] });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SpaceItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const isOwner = !!user && space?.user_id === user.id;
  const canWrite = !!user; // backend enforces Space write access per item

  useTabTitle(location.pathname, space ? (path ? `${space.name}/${path}` : space.name) : undefined);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, list, ci] = await Promise.all([getSpace(spaceId, user?.id), listItems(spaceId, path, user?.id), listContentItems(spaceId, user?.id)]);
      setSpace(s);
      setItems(list.items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1)));
      setCrumbs(list.breadcrumbs ?? []);
      setContent(ci);
      setStatus({ message: `${list.items.length} items` });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [spaceId, path, user?.id, setStatus]);

  useEffect(() => {
    load();
    setPrefs({ activeSpaceId: spaceId });
  }, [load, setPrefs, spaceId]);

  const run = async (fn: () => Promise<unknown>, failTitle: string) => {
    try {
      await fn();
      await load();
    } catch (err) {
      toast({ title: failTitle, description: (err as Error).message, variant: "destructive" });
    }
  };

  const newFolder = async () => {
    const name = await askText("Folder name");
    if (name?.trim() && user) run(() => createFolder(spaceId, path, name.trim(), user.id), "Couldn't create the folder");
  };

  const newFile = async (ext: string) => {
    const name = await askText("File name", `untitled.${ext}`);
    if (!name?.trim() || !user) return;
    run(async () => {
      const it = await createFile(spaceId, path, name.trim(), user.id, ext === "md" ? "text/markdown" : "text/plain", 0);
      await writeText(spaceId, it.id, NEW_FILE_TEMPLATES[ext] ?? "", user.id);
      navigate(`/file/${spaceId}/${it.id}`);
    }, "Couldn't create the file");
  };

  const upload = async (files: FileList | File[]) => {
    if (!user) return;
    setStatus({ sync: "saving" });
    for (const f of Array.from(files)) {
      try {
        const it = await createFile(spaceId, path, f.name, user.id, f.type || undefined, f.size);
        await uploadContent(spaceId, it.id, f, user.id, f.name);
      } catch (err) {
        toast({ title: `Couldn't upload ${f.name}`, description: (err as Error).message, variant: "destructive" });
      }
    }
    setStatus({ sync: "saved" });
    load();
  };

  const open = (it: SpaceItem) => {
    if (it.kind === "folder") return navigate(`/space/${spaceId}/${joinPath(path, it.name)}`);
    if (it.linked_parent_id && it.linked_type) {
      const kind = it.linked_type === "chapter" ? "story" : it.linked_type === "scene" ? "screenplay" : "comic";
      return navigate(`/${kind}/${it.linked_parent_id}`);
    }
    if (/\.master$/i.test(it.name)) return navigate(`/master/${spaceId}/${it.id}`);
    if (isTextFile(it)) return navigate(`/file/${spaceId}/${it.id}`);
    setPreview(it);
  };

  const rename = async (it: SpaceItem) => {
    const n = await askText("New name", it.name);
    if (n?.trim() && n !== it.name && user) run(() => renameItem(it.id, n.trim(), user.id), "Couldn't rename");
  };
  const move = async (it: SpaceItem) => {
    const to = await askText("Move to folder (path inside the Space, empty = top level)", path);
    if (to !== null && user) run(() => moveItem(it.id, to.replace(/^\/+|\/+$/g, ""), user.id), "Couldn't move");
  };
  const remove = async (it: SpaceItem) => {
    if (await askConfirm(`Delete "${it.name}"?`) && user) run(() => deleteItem(it.id, user.id), "Couldn't delete");
  };

  const icon = (it: SpaceItem) =>
    it.kind === "folder" ? <Folder className="h-4 w-4 text-amber-600" /> : it.linked_type ? <Link2 className="h-4 w-4 text-primary" /> : isImageFile(it) ? <ImageIcon className="h-4 w-4" /> : isAudioFile(it) ? <Music className="h-4 w-4" /> : isTextFile(it) ? <FileText className="h-4 w-4" /> : <File className="h-4 w-4" />;

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!space) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  return (
    <div
      className="mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-6"
      onDragOver={(e) => canWrite && e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (canWrite && e.dataTransfer.files.length) {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{space.name}</h1>
        {isOwner && (
          <select
            value={space.visibility ?? "private"}
            onChange={async (e) => {
              const visibility = e.target.value;
              await updateSpace(spaceId, { userId: user!.id, visibility }).catch((err) => toast({ title: (err as Error).message, variant: "destructive" }));
              setSpace({ ...space, visibility });
              qc.invalidateQueries({ queryKey: ["spaces"] });
            }}
            className="h-8 rounded border bg-background px-2 text-sm"
            aria-label="Who can see this Space"
          >
            <option value="private">Only me</option>
            <option value="selected">Selected people</option>
            <option value="public">Everyone</option>
          </select>
        )}
        <span className="flex-1" />
        <a href={platformLink(`/creative_space/${spaceId}`)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline">
          <ExternalLink className="h-4 w-4" />
          <EditableText id="webapp-space-platform">On the platform</EditableText>
        </a>
      </div>

      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumbs">
        <Link to={`/space/${spaceId}`} className="hover:underline">
          {space.name}
        </Link>
        {(crumbs.length ? crumbs : path.split("/").filter(Boolean).map((n, i, a) => ({ name: n, path: a.slice(0, i + 1).join("/") }))).map((c) => (
          <React.Fragment key={c.path}>
            <span className="text-muted-foreground">/</span>
            <Link to={`/space/${spaceId}/${c.path}`} className="hover:underline">
              {c.name}
            </Link>
          </React.Fragment>
        ))}
      </nav>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={newFolder} className="gap-1">
            <FolderPlus className="h-4 w-4" />
            <EditableText id="webapp-space-new-folder">New folder</EditableText>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" />
                <EditableText id="webapp-space-new-file">New file</EditableText>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(["md", "story", "screenplay", "comic", "master"] as const).map((x) => (
                <DropdownMenuItem key={x} onSelect={() => newFile(x)}>
                  .{x}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} className="gap-1">
            <Upload className="h-4 w-4" />
            <EditableText id="webapp-space-upload">Upload</EditableText>
          </Button>
        </div>
      )}

      <ul className="divide-y rounded-md border">
        {items.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            <EditableText id="webapp-space-empty">This folder is empty. Drop files here to upload them.</EditableText>
          </li>
        )}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
            {icon(it)}
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => open(it)}>
              {it.name}
              {it.linked_title && (
                <span className="ml-2 text-xs text-muted-foreground">
                  → {it.linked_parent_title}: {it.linked_title}
                </span>
              )}
            </button>
            {it.updated_at && <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(it.updated_at).toLocaleString()}</span>}
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded p-1 hover:bg-muted" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => open(it)}>
                    <EditableText id="webapp-space-open">Open</EditableText>
                  </DropdownMenuItem>
                  {it.kind === "file" && (
                    <DropdownMenuItem onSelect={() => window.open(contentUrl(spaceId, it.id, user?.id), "_blank")}>
                      <EditableText id="webapp-space-download">Download</EditableText>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => rename(it)}>
                    <EditableText id="webapp-space-rename">Rename</EditableText>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => move(it)}>
                    <EditableText id="webapp-space-move">Move to…</EditableText>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onSelect={() => remove(it)}>
                    <EditableText id="webapp-space-delete">Delete</EditableText>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      {preview && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{preview.name}</span>
            <button className="underline" onClick={() => setPreview(null)}>
              <EditableText id="webapp-space-close-preview">Close</EditableText>
            </button>
          </div>
          {isImageFile(preview) ? (
            <img src={contentUrl(spaceId, preview.id, user?.id)} alt={preview.name} className="max-h-[60vh] rounded" />
          ) : isAudioFile(preview) ? (
            <audio controls src={contentUrl(spaceId, preview.id, user?.id)} className="w-full" />
          ) : (
            <a className="underline" href={contentUrl(spaceId, preview.id, user?.id)} target="_blank" rel="noreferrer">
              <EditableText id="webapp-space-download-file">Download this file</EditableText>
            </a>
          )}
        </div>
      )}

      {path === "" && (content.stories.length > 0 || content.screenplays.length > 0 || (content.comics?.length ?? 0) > 0) && (
        <section>
          <EditableText id="webapp-space-works" as="h2" className="mb-2 text-lg font-medium">
            Stories in this Space
          </EditableText>
          <ul className="grid gap-1 sm:grid-cols-2">
            {content.stories.map((s) => (
              <li key={s.story_title_id}>
                <Link to={`/story/${s.story_title_id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <BookText className="h-4 w-4" /> {s.title}
                </Link>
              </li>
            ))}
            {content.screenplays.map((s) => (
              <li key={s.screenplay_id}>
                <Link to={`/screenplay/${s.screenplay_id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Clapperboard className="h-4 w-4" /> {s.title}
                </Link>
              </li>
            ))}
            {content.comics?.map((s) => (
              <li key={s.comic_id}>
                <Link to={`/comic/${s.comic_id}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Images className="h-4 w-4" /> {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
};

export default SpacePage;
