import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor, Extension, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import EditableText from "@/components/EditableText";
import { Bold, Italic, Underline as UIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, Quote, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import { htmlToMd, mdToHtml } from "./markdown";
import type { FindOptions } from "./FindBar";

// The WYSIWYG pane (desktop: ui/preview_widget.py) — TipTap/ProseMirror in
// place of the retired Aloha editor. Edits round-trip through Markdown so
// the source pane, the backend's paragraphs[] and the desktop app all see
// the same text.

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: { fontSize?: string | null }) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
});

const COLORS = ["#000000", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];
const FONTS = [
  { label: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, Menlo, monospace" },
];
const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "32px"];

export interface VisualEditorHandle {
  find: (query: string, opts: FindOptions, direction: 1 | -1) => number;
  insertImage: (src: string, alt?: string) => void;
  focus: () => void;
}

interface Props {
  markdown: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Show the block style "Chapter title" etc. — stories only. */
  className?: string;
}

const Btn: React.FC<{ on?: boolean; onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }> = ({ on, onClick, label, children, disabled }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={on}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`rounded p-1.5 hover:bg-muted disabled:opacity-40 ${on ? "bg-muted text-primary" : ""}`}
  >
    {children}
  </button>
);

const Toolbar: React.FC<{ editor: Editor }> = ({ editor }) => {
  const block = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-1 py-1 backdrop-blur">
      <select
        aria-label="Block style"
        className="h-7 rounded border bg-background px-1 text-xs"
        value={block}
        onChange={(e) => {
          const v = e.target.value;
          const c = editor.chain().focus();
          if (v === "p") c.setParagraph().run();
          else c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Paragraph</option>
        <option value="h1">Story title</option>
        <option value="h2">Chapter title</option>
        <option value="h3">Heading</option>
      </select>
      <Btn label="Bold" on={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn label="Italic" on={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </Btn>
      <Btn label="Underline" on={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UIcon className="h-4 w-4" />
      </Btn>
      <Btn label="Strikethrough" on={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn label="Align left" on={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="h-4 w-4" />
      </Btn>
      <Btn label="Centre" on={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="h-4 w-4" />
      </Btn>
      <Btn label="Align right" on={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="h-4 w-4" />
      </Btn>
      <Btn label="Justify" on={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
        <AlignJustify className="h-4 w-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn label="Quote" on={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </Btn>
      <Btn label="Bulleted list" on={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </Btn>
      <Btn label="Numbered list" on={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <select
        aria-label="Font"
        className="h-7 rounded border bg-background px-1 text-xs"
        value={(editor.getAttributes("textStyle").fontFamily as string) || ""}
        onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())}
      >
        <option value="">Font</option>
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Font size"
        className="h-7 rounded border bg-background px-1 text-xs"
        value={(editor.getAttributes("textStyle").fontSize as string) || ""}
        onChange={(e) => editor.chain().focus().setMark("textStyle", { fontSize: e.target.value || null }).run()}
      >
        <option value="">Size</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s.replace("px", "")}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-0.5 px-1" role="group" aria-label="Text colour">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (c === "#000000" ? editor.chain().focus().unsetColor().run() : editor.chain().focus().setColor(c).run())}
            className="h-4 w-4 rounded-full border"
            style={{ background: c }}
          />
        ))}
      </div>
      <span className="flex-1" />
      <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </Btn>
      <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </Btn>
    </div>
  );
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const VisualEditor = forwardRef<VisualEditorHandle, Props>(({ markdown, onChange, readOnly, placeholder, className }, ref) => {
  // The last Markdown we emitted or loaded — lets us tell our own echo from
  // a real outside change (source pane edit, remote collaborator, reload).
  const lastMd = useRef(markdown);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Start writing…" }),
    ],
    content: mdToHtml(markdown),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const md = htmlToMd(editor.getHTML());
      if (md === lastMd.current) return;
      lastMd.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (markdown === lastMd.current) return;
    lastMd.current = markdown;
    // Keep the caret roughly where it was when content changes underneath.
    const { from } = editor.state.selection;
    editor.commands.setContent(mdToHtml(markdown), false);
    const pos = Math.min(from, editor.state.doc.content.size);
    try {
      editor.commands.setTextSelection(pos);
    } catch {
      /* position no longer valid */
    }
  }, [markdown, editor]);

  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [readOnly, editor]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      insertImage: (src, alt) => editor?.chain().focus().setImage({ src, alt }).run(),
      find: (query, opts, direction) => {
        if (!editor || !query) return 0;
        const flags = opts.matchCase ? "g" : "gi";
        const pattern = opts.wholeWord ? `\\b${escapeRe(query)}\\b` : escapeRe(query);
        const hits: { from: number; to: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          const re = new RegExp(pattern, flags);
          let m: RegExpExecArray | null;
          while ((m = re.exec(node.text))) hits.push({ from: pos + m.index, to: pos + m.index + m[0].length });
        });
        if (!hits.length) return 0;
        const { from, to } = editor.state.selection;
        let idx = -1;
        if (direction === 1) idx = hits.findIndex((h) => h.from >= to);
        else for (let i = hits.length - 1; i >= 0 && idx === -1; i--) if (hits[i].to <= from) idx = i;
        if (idx === -1) {
          if (!opts.wrap) return hits.length;
          idx = direction === 1 ? 0 : hits.length - 1;
        }
        const h = hits[idx];
        const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, h.from, h.to)).scrollIntoView();
        editor.view.dispatch(tr);
        editor.view.focus();
        return hits.length;
      },
    }),
    [editor],
  );

  if (!editor) return null;
  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {!readOnly && <Toolbar editor={editor} />}
      <div className="wa-prose min-h-0 flex-1 overflow-auto px-4 py-3 font-serif text-[17px] leading-relaxed sm:px-8">
        <EditorContent editor={editor} />
      </div>
      {readOnly && (
        <div className="border-t px-3 py-1 text-xs text-muted-foreground">
          <EditableText id="webapp-editor-readonly">Read only — you can't edit this document.</EditableText>
        </div>
      )}
    </div>
  );
});
VisualEditor.displayName = "VisualEditor";
