import { block, escapeHtml, parseBlocks } from "./dsl.ts";

// .screenplay ⇄ the backend's scene/block model. Twin of
// format/screenplay_markup.py; element names match screenplay_block.block_type.

export const SCREENPLAY_ELEMENTS = ["action", "character", "dialogue", "parenthetical", "transition", "shot", "general"] as const;
export type ScreenplayElement = (typeof SCREENPLAY_ELEMENTS)[number];
export interface ScreenplayDoc {
  title: string;
  scenes: { slugline: string; blocks: { type: ScreenplayElement; text: string }[] }[];
}

const isElement = (t: string): t is ScreenplayElement => (SCREENPLAY_ELEMENTS as readonly string[]).includes(t);

export function parseScreenplay(text: string): ScreenplayDoc {
  let title = "";
  const scenes: ScreenplayDoc["scenes"] = [];
  const current = () => {
    if (!scenes.length) scenes.push({ slugline: "", blocks: [] });
    return scenes[scenes.length - 1];
  };
  for (const b of parseBlocks(text)) {
    if (b.tag === "screenplay_title") title = b.body.trim();
    else if (b.tag === "scene_slugline" || b.tag === "scene_heading") scenes.push({ slugline: b.body.trim(), blocks: [] });
    else current().blocks.push({ type: isElement(b.tag) ? b.tag : "action", text: b.body });
  }
  return { title, scenes };
}

export function screenplayToDsl(doc: ScreenplayDoc): string {
  const lines = [block("screenplay_title", doc.title || "Untitled Screenplay", { align: "center" }), ""];
  for (const sc of doc.scenes) {
    lines.push(block("scene_slugline", sc.slugline || "", { align: "left" }), "");
    for (const b of sc.blocks) lines.push(block(isElement(b.type) ? b.type : "action", b.text), "");
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
    for (const b of sc.blocks) out.push(`<p class="${b.type}" style="font-family:ui-monospace,monospace;${STYLE[b.type] ?? ""}">${escapeHtml(b.text).replace(/\n/g, "<br />")}</p>`);
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
