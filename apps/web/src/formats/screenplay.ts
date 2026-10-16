import { block, escapeHtml, parseBlocks } from "./dsl.ts";

// .screenplay ⇄ the backend's scene/block model. Twin of
// format/screenplay_markup.py; element names match screenplay_block.block_type.

export const SCREENPLAY_ELEMENTS = ["action", "character", "dialogue", "parenthetical", "transition", "shot", "general"] as const;
export type ScreenplayElement = (typeof SCREENPLAY_ELEMENTS)[number];
/** An alternative version of one element; ids are present on files synced with Crowdly. */
export interface ScreenplayBranchDoc {
  name: string;
  text: string;
  id?: string;
}
export interface ScreenplayBlockDoc {
  type: ScreenplayElement;
  text: string;
  id?: string;
  branches?: ScreenplayBranchDoc[];
}
export interface ScreenplayDoc {
  title: string;
  scenes: { slugline: string; id?: string; blocks: ScreenplayBlockDoc[] }[];
}

const isElement = (t: string): t is ScreenplayElement => (SCREENPLAY_ELEMENTS as readonly string[]).includes(t);

export function parseScreenplay(text: string): ScreenplayDoc {
  let title = "";
  const scenes: ScreenplayDoc["scenes"] = [];
  const current = () => {
    if (!scenes.length) scenes.push({ slugline: "", blocks: [] });
    return scenes[scenes.length - 1];
  };
  const withId = <T extends object>(entry: T, id?: string) => (id ? { ...entry, id } : entry);
  for (const b of parseBlocks(text)) {
    if (b.tag === "screenplay_title") title = b.body.trim();
    else if (b.tag === "scene_slugline" || b.tag === "scene_heading")
      scenes.push(withId({ slugline: b.body.trim(), blocks: [] as ScreenplayBlockDoc[] }, b.attrs.id));
    else if (b.tag === "branch") {
      // An alternative for the element just before it.
      const blocks = current().blocks;
      if (!blocks.length) blocks.push({ type: "action", text: "" });
      (blocks[blocks.length - 1].branches ??= []).push(withId({ name: b.attrs.name ?? "", text: b.body }, b.attrs.id));
    } else current().blocks.push(withId({ type: isElement(b.tag) ? b.tag : ("action" as ScreenplayElement), text: b.body }, b.attrs.id));
  }
  return { title, scenes };
}

export function screenplayToDsl(doc: ScreenplayDoc): string {
  const lines = [block("screenplay_title", doc.title || "Untitled Screenplay", { align: "center" }), ""];
  for (const sc of doc.scenes) {
    lines.push(block("scene_slugline", sc.slugline || "", { align: "left", id: sc.id ?? "" }), "");
    for (const b of sc.blocks) {
      lines.push(block(isElement(b.type) ? b.type : "action", b.text, { id: b.id ?? "" }), "");
      for (const br of b.branches ?? []) lines.push(block("branch", br.text, { name: br.name, id: br.id ?? "" }), "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

const STYLE: Record<string, string> = {
  character: "text-align:center;text-transform:uppercase;margin:1em 0 0",
  dialogue: "margin:0 15%",
  parenthetical: "margin:0 25%;font-style:italic",
  transition: "text-align:right;text-transform:uppercase",
  shot: "text-transform:uppercase",
};

export function screenplayToHtml(text: string): string {
  const doc = parseScreenplay(text);
  const out = [`<h1 style="text-align:center">${escapeHtml(doc.title)}</h1>`];
  for (const sc of doc.scenes) {
    out.push(`<h2 class="scene-slugline" style="text-transform:uppercase">${escapeHtml(sc.slugline)}</h2>`);
    for (const b of sc.blocks) {
      out.push(`<p class="${b.type}" style="font-family:ui-monospace,monospace;${STYLE[b.type] ?? ""}">${escapeHtml(b.text).replace(/\n/g, "<br />")}</p>`);
      for (const br of b.branches ?? [])
        out.push(`<aside class="branch">${br.name ? `<strong>${escapeHtml(br.name)}</strong> ` : ""}${escapeHtml(br.text).replace(/\n/g, "<br />")}</aside>`);
    }
  }
  return out.join("\n");
}

/** Fountain-style guess for one plain line, given the element before it (same rules as the desktop). */
export function guessElement(text: string, previous: ScreenplayElement | null): ScreenplayElement {
  const t = text.trim();
  const upper = t === t.toUpperCase() && /[A-Za-z]/.test(t);
  if (t.startsWith("(") && t.endsWith(")") && (previous === "character" || previous === "dialogue")) return "parenthetical";
  if (previous === "character" || previous === "parenthetical") return "dialogue";
  if (upper && t.endsWith("TO:")) return "transition";
  if (upper && t.length <= 40 && !t.includes("\n")) return "character";
  return "action";
}

/** Markdown (# title, ## sluglines, paragraphs) → screenplay doc. */
export function screenplayFromMarkdown(md: string, fallbackTitle = ""): ScreenplayDoc {
  let title = fallbackTitle;
  const scenes: ScreenplayDoc["scenes"] = [];
  let prev: ScreenplayElement | null = null;
  for (const para of md.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    const h = p.match(/^(#{1,3})\s+(.*)$/);
    if (h && h[1].length === 1 && !title) title = h[2].trim();
    else if (h || /^(INT|EXT|INT\.\/EXT|I\/E)[. ]/i.test(p)) {
      scenes.push({ slugline: (h ? h[2] : p).trim(), blocks: [] });
      prev = null;
    } else {
      if (!scenes.length) scenes.push({ slugline: "", blocks: [] });
      const type = guessElement(p, prev);
      scenes[scenes.length - 1].blocks.push({ type, text: p });
      prev = type;
    }
  }
  return { title: title || "Untitled Screenplay", scenes };
}

/** Screenplay doc → Markdown for the shared exporters (PDF/DOCX/FDX/Fountain…). */
export function screenplayToMarkdown(doc: ScreenplayDoc): string {
  const out = [`# ${doc.title}`];
  for (const sc of doc.scenes) {
    out.push(`## ${sc.slugline}`);
    for (const b of sc.blocks) out.push(b.type === "character" || b.type === "transition" ? b.text.toUpperCase() : b.text);
  }
  return out.join("\n\n") + "\n";
}
