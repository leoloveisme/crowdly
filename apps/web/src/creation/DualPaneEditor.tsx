import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import EditableText from "@/components/EditableText";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useWorkspace } from "@web/shell/workspace";
import { VisualEditor, type VisualEditorHandle } from "./VisualEditor";
import { FindBar, buildFindRegex, type FindOptions } from "./FindBar";

// Desktop main window body: a Markdown/HTML source pane and a WYSIWYG pane
// side by side (either can be hidden from View), kept in sync. On phones the
// two become tabs. Owns Find/Replace for whatever document it shows.

export interface DualPaneHandle {
  openFind: (replace: boolean) => void;
  insertImage: (src: string, alt?: string) => void;
}

interface Props {
  markdown: string;
  onChange: (md: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  header?: React.ReactNode;
}

export const DualPaneEditor = forwardRef<DualPaneHandle, Props>(({ markdown, onChange, readOnly, placeholder, header }, ref) => {
  const { prefs } = useWorkspace();
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<"visual" | "source">("visual");
  const [find, setFind] = useState<null | "find" | "replace">(null);
  const visualRef = useRef<VisualEditorHandle>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  const showSource = isMobile ? mobilePane === "source" : prefs.showSource;
  const showVisual = isMobile ? mobilePane === "visual" : prefs.showVisual || !prefs.showSource;

  useImperativeHandle(ref, () => ({
    openFind: (replace) => setFind(replace ? "replace" : "find"),
    insertImage: (src, alt) => {
      if (showVisual && visualRef.current) visualRef.current.insertImage(src, alt);
      else onChange(`${markdown}\n\n![${alt ?? ""}](${src})`);
    },
  }));

  const findInSource = (query: string, opts: FindOptions, dir: 1 | -1) => {
    const ta = sourceRef.current;
    if (!ta || !query) return 0;
    const re = buildFindRegex(query, opts);
    const hits = [...markdown.matchAll(re)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }));
    if (!hits.length) return 0;
    let h = dir === 1 ? hits.find((x) => x.from >= ta.selectionEnd) : [...hits].reverse().find((x) => x.to <= ta.selectionStart);
    if (!h && opts.wrap) h = dir === 1 ? hits[0] : hits[hits.length - 1];
    if (h) {
      ta.focus();
      ta.setSelectionRange(h.from, h.to);
      // Scroll the match into view.
      const line = markdown.slice(0, h.from).split("\n").length;
      ta.scrollTop = Math.max(0, (line - 5) * 22);
    }
    return hits.length;
  };

  const onFind = (q: string, o: FindOptions, d: 1 | -1) => (showSource ? findInSource(q, o, d) : (visualRef.current?.find(q, o, d) ?? 0));

  const onReplace = (q: string, r: string, o: FindOptions) => {
    const ta = sourceRef.current;
    const re = buildFindRegex(q, o);
    re.lastIndex = 0;
    if (showSource && ta && ta.selectionStart !== ta.selectionEnd) {
      const sel = markdown.slice(ta.selectionStart, ta.selectionEnd);
      if (new RegExp(`^(?:${re.source})$`, re.flags.replace("g", "")).test(sel)) {
        onChange(markdown.slice(0, ta.selectionStart) + r + markdown.slice(ta.selectionEnd));
        return;
      }
    }
    // Replace the next occurrence.
    const m = re.exec(markdown);
    if (m) onChange(markdown.slice(0, m.index) + r + markdown.slice(m.index + m[0].length));
  };

  const onReplaceAll = (q: string, r: string, o: FindOptions) => {
    const re = buildFindRegex(q, o);
    const n = [...markdown.matchAll(re)].length;
    if (n) onChange(markdown.replace(re, () => r));
    return n;
  };

  const source = (
    <textarea
      ref={sourceRef}
      value={markdown}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      spellCheck
      aria-label="Markdown source"
      className="h-full min-h-[50vh] w-full resize-none bg-muted/20 p-3 font-mono text-sm leading-[22px] outline-none"
    />
  );
  const visual = <VisualEditor ref={visualRef} markdown={markdown} onChange={onChange} readOnly={readOnly} placeholder={placeholder} className="h-full" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {find && <FindBar showReplace={find === "replace" && !readOnly} onClose={() => setFind(null)} onFind={onFind} onReplace={onReplace} onReplaceAll={onReplaceAll} />}
      {header}
      {isMobile && (
        <div className="flex border-b text-sm">
          {(["visual", "source"] as const).map((p) => (
            <button key={p} onClick={() => setMobilePane(p)} className={`flex-1 py-1.5 ${mobilePane === p ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>
              {p === "visual" ? <EditableText id="webapp-pane-visual">Visual</EditableText> : <EditableText id="webapp-pane-source">Markdown</EditableText>}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {showSource && showVisual ? (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={42} minSize={20}>
              {source}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={58} minSize={25}>
              {visual}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : showSource ? (
          source
        ) : (
          visual
        )}
      </div>
    </div>
  );
});
DualPaneEditor.displayName = "DualPaneEditor";
