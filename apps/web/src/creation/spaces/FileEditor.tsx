import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { countWords } from "@web/lib/text";
import { contentUrl, getItem, joinPath, listItems, parentOf, readText, writeText, type SpaceItem } from "@web/lib/spaces";
import { parseStory, storyToHtml } from "@web/formats/story";
import { parseScreenplay, screenplayToHtml } from "@web/formats/screenplay";
import { comicToHtml, parseComic } from "@web/formats/comic";
import { createComicFromDoc, createScreenplayFromDoc, createStoryFromDoc } from "../io";
import { DualPaneEditor, type DualPaneHandle } from "../DualPaneEditor";
import { mdToPlain, splitParagraphs } from "../markdown";

// A text file inside a Space (desktop: a file opened in a tab). Markdown-ish
// files get the two-pane editor; other text files a plain source pane.
// Saved back to the Space 2 s after typing, which also triggers the Space's
// GitHub / Google Drive push.

const MARKDOWN_LIKE = /\.(md|markdown|txt)$/i;
const CROWDLY_FORMAT = /\.(story|screenplay|comic)$/i;

/** Resolve a path written inside a Space file (relative to its folder) to the file's bytes. */
async function spaceBlob(spaceId: string, folder: string, src: string, userId?: string): Promise<Blob | null> {
  if (/^(https?:|data:|blob:)/.test(src)) return null;
  const full = src.startsWith("/") ? src.slice(1) : joinPath(folder, src);
  const parts = full.split("/").filter((p) => p && p !== ".");
  const norm: string[] = [];
  for (const p of parts) (p === ".." ? norm.pop() : norm.push(p));
  const name = norm.pop();
  const { items } = await listItems(spaceId, norm.join("/"), userId);
  const it = items.find((i) => i.kind === "file" && i.name === name);
  if (!it) return null;
  const r = await fetch(contentUrl(spaceId, it.id, userId), { credentials: "include" });
  return r.ok ? r.blob() : null;
}

const FileEditor: React.FC = () => {
  const { spaceId = "", itemId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { setStatus, prefs } = useWorkspace();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [converting, setConverting] = useState(false);
  const [item, setItem] = useState<(SpaceItem & { can_write?: boolean }) | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<DualPaneHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<string | null>(null);

  useTabTitle(location.pathname, item?.name);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const it = await getItem(spaceId, itemId, user?.id);
        const t = await readText(spaceId, itemId, user?.id);
        if (off) return;
        setItem(it);
        setText(t);
      } catch (err) {
        if (!off) setError((err as Error).message);
      }
    })();
    return () => {
      off = true;
    };
  }, [spaceId, itemId, user?.id]);

  const flush = useCallback(async () => {
    const t = pending.current;
    if (t === null || !user) return;
    pending.current = null;
    setStatus({ sync: "saving" });
    try {
      await writeText(spaceId, itemId, t, user.id);
      setStatus({ sync: "saved" });
    } catch (err) {
      setStatus({ sync: "error" });
      toast({ title: "Couldn't save the file", description: (err as Error).message, variant: "destructive" });
    }
  }, [spaceId, itemId, user, setStatus]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const canWrite = !!item?.can_write;
  const onChange = (t: string) => {
    if (!canWrite) return;
    setText(t);
    pending.current = t;
    setStatus({ sync: "queued" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 2000);
  };

  useEffect(() => {
    if (text === null) return;
    setStatus({ words: countWords(mdToPlain(text)), paragraphs: splitParagraphs(text).filter((p) => p.trim()).length });
  }, [text, setStatus]);

  useDocActions(
    {
      kind: "markdown",
      find: () => editorRef.current?.openFind(false),
      replace: canWrite ? () => editorRef.current?.openFind(true) : undefined,
    },
    [canWrite],
  );

  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  if (!item || text === null) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  const folder = parentOf(item.relative_path ?? "");
  const header = (
    <div className="flex items-center gap-2 border-b px-3 py-1.5 text-sm">
      <Link to={`/space/${spaceId}/${folder}`} className="text-muted-foreground hover:underline">
        ← {folder || <EditableText id="webapp-file-space-root">Space</EditableText>}
      </Link>
      <span className="font-medium">{item.name}</span>
      {!canWrite && (
        <EditableText id="webapp-file-readonly" className="ml-auto text-xs text-muted-foreground">
          Read only
        </EditableText>
      )}
    </div>
  );

  const fmt = item.name.match(CROWDLY_FORMAT)?.[1].toLowerCase() as "story" | "screenplay" | "comic" | undefined;
  if (fmt) {
    const html = DOMPurify.sanitize(fmt === "story" ? storyToHtml(text) : fmt === "screenplay" ? screenplayToHtml(text) : comicToHtml(text));
    const convert = async () => {
      if (!user) return;
      setConverting(true);
      try {
        if (fmt === "story") navigate(`/story/${await createStoryFromDoc(parseStory(text), user.id, spaceId)}`);
        else if (fmt === "screenplay") navigate(`/screenplay/${await createScreenplayFromDoc(parseScreenplay(text))}`);
        else {
          const r = await createComicFromDoc(parseComic(text), (src) => spaceBlob(spaceId, folder, src, user.id));
          if (r.skipped) toast({ title: `${r.skipped} page(s) couldn't be found` });
          navigate(`/comic/${r.id}`);
        }
      } catch (err) {
        toast({ title: "Couldn't create it", description: (err as Error).message, variant: "destructive" });
      } finally {
        setConverting(false);
      }
    };
    const source = (
      <textarea value={text} readOnly={!canWrite} onChange={(e) => onChange(e.target.value)} spellCheck className="h-full w-full resize-none bg-muted/20 p-3 font-mono text-sm outline-none" aria-label={item.name} />
    );
    const preview = <div className="wa-prose h-full overflow-auto px-6 py-4 font-serif" dangerouslySetInnerHTML={{ __html: html }} />;
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center">
          <div className="flex-1">{header}</div>
          {user && (
            <Button size="sm" variant="outline" className="mr-2 h-7" onClick={convert} disabled={converting}>
              {fmt === "story" ? (
                <EditableText id="webapp-file-to-story">Make it a Crowdly story</EditableText>
              ) : fmt === "screenplay" ? (
                <EditableText id="webapp-file-to-screenplay">Make it a Crowdly screenplay</EditableText>
              ) : (
                <EditableText id="webapp-file-to-comic">Make it a Crowdly comic</EditableText>
              )}
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {isMobile || !prefs.showVisual ? (
            source
          ) : !prefs.showSource ? (
            preview
          ) : (
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={50}>{source}</ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>{preview}</ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    );
  }

  if (!MARKDOWN_LIKE.test(item.name)) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <textarea
          value={text}
          readOnly={!canWrite}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
          className="min-h-0 flex-1 resize-none bg-muted/20 p-3 font-mono text-sm outline-none"
          aria-label={item.name}
        />
      </div>
    );
  }
  return <DualPaneEditor ref={editorRef} markdown={text} onChange={onChange} readOnly={!canWrite} header={header} />;
};

export default FileEditor;
