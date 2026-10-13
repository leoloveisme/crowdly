import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useDocActions, useTabTitle, useWorkspace } from "@web/shell/workspace";
import { countWords } from "@web/lib/text";
import { getItem, parentOf, readText, writeText, type SpaceItem } from "@web/lib/spaces";
import { DualPaneEditor, type DualPaneHandle } from "../DualPaneEditor";
import { mdToPlain, splitParagraphs } from "../markdown";

// A text file inside a Space (desktop: a file opened in a tab). Markdown-ish
// files get the two-pane editor; other text files a plain source pane.
// Saved back to the Space 2 s after typing, which also triggers the Space's
// GitHub / Google Drive push.

const MARKDOWN_LIKE = /\.(md|markdown|story|txt)$/i;

const FileEditor: React.FC = () => {
  const { spaceId = "", itemId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { setStatus } = useWorkspace();
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
