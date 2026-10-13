import { block, escapeHtml, imageSource, parseBlocks } from "./dsl.ts";

// .story ⇄ the backend's chapter model (title + paragraphs[] + branches by
// paragraph index). Twin of format/story_markup.py.

export interface StoryBranch {
  name: string;
  text: string;
  /** Crowdly id, on synced files (Documentation/branching-api.md). */
  id?: string;
}
export interface StoryChapterDoc {
  title: string;
  paragraphs: string[];
  branches: Record<string, StoryBranch[]>;
  id?: string;
}

const branchEntry = (attrs: Record<string, string>, body: string): StoryBranch =>
  attrs.id ? { name: attrs.name ?? "", text: body, id: attrs.id } : { name: attrs.name ?? "", text: body };
export interface StoryDoc {
  title: string;
  chapters: StoryChapterDoc[];
}

export function parseStory(text: string): StoryDoc {
  let title = "";
  const chapters: StoryChapterDoc[] = [];
  const current = () => {
    if (!chapters.length) chapters.push({ title: "", paragraphs: [], branches: {} });
    return chapters[chapters.length - 1];
  };
  for (const b of parseBlocks(text)) {
    if (b.tag === "story_title") title = b.body.trim();
    else if (b.tag === "chapter_title")
      chapters.push({ title: b.body.trim(), paragraphs: [], branches: {}, ...(b.attrs.id ? { id: b.attrs.id } : {}) });
    else if (b.tag === "branch") {
      const ch = current();
      if (!ch.paragraphs.length) ch.paragraphs.push("");
      const key = String(ch.paragraphs.length - 1);
      (ch.branches[key] ??= []).push(branchEntry(b.attrs, b.body));
    } else if (b.tag === "image") current().paragraphs.push(`![${b.attrs.alt ?? ""}](${imageSource(b.body)})`);
    else current().paragraphs.push(b.body);
  }
  return { title, chapters };
}

export function storyToDsl(doc: StoryDoc): string {
  const lines = [block("story_title", doc.title || "Untitled", { align: "center" }), ""];
  for (const ch of doc.chapters) {
    lines.push(block("chapter_title", ch.title || "", { align: "left", id: ch.id ?? "" }), "");
    ch.paragraphs.forEach((p, i) => {
      lines.push(block("paragraph", p, { align: "left" }), "");
      for (const br of ch.branches?.[String(i)] ?? []) lines.push(block("branch", br.text, { name: br.name, id: br.id ?? "" }), "");
    });
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function storyToHtml(text: string): string {
  const out: string[] = [];
  for (const b of parseBlocks(text)) {
    const align = b.attrs.align ? ` style="text-align:${b.attrs.align}"` : "";
    if (b.tag === "story_title") out.push(`<h1 style="text-align:${b.attrs.align ?? "center"}">${escapeHtml(b.body.trim())}</h1>`);
    else if (b.tag === "chapter_title") out.push(`<h2${align}>${escapeHtml(b.body.trim())}</h2>`);
    else if (b.tag === "branch")
      out.push(`<aside class="branch">${b.attrs.name ? `<strong>${escapeHtml(b.attrs.name)}</strong> ` : ""}${escapeHtml(b.body).replace(/\n/g, "<br />")}</aside>`);
    else if (b.tag === "image") out.push(`<p><img src="${escapeHtml(imageSource(b.body))}" alt="${escapeHtml(b.attrs.alt ?? "")}" /></p>`);
    else out.push(`<p${b.tag === "paragraph" ? align : ""}>${escapeHtml(b.body).replace(/\n/g, "<br />")}</p>`);
  }
  return out.join("\n");
}

/** Markdown with # / ## headings → story doc (chapters split at the chapter-level heading). */
export function storyFromMarkdown(md: string, fallbackTitle = ""): StoryDoc {
  const text = md.replace(/\r\n/g, "\n");
  const h1 = [...text.matchAll(/^# (.+)$/gm)];
  const h2 = [...text.matchAll(/^## (.+)$/gm)];
  // One "#" + several "##" → # is the title; several "#" → each is a chapter.
  const chapterMark = h2.length ? "## " : h1.length > 1 ? "# " : null;
  let title = fallbackTitle;
  if (chapterMark === "## " && h1.length) title = h1[0][1].trim();
  const chapters: StoryChapterDoc[] = [];
  let cur: StoryChapterDoc | null = null;
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (chapterMark && p.startsWith(chapterMark) && !p.includes("\n")) {
      cur = { title: p.slice(chapterMark.length).trim(), paragraphs: [], branches: {} };
      chapters.push(cur);
    } else if (p.startsWith("# ") && !p.includes("\n") && chapterMark === "## ") {
      continue; // the story title
    } else {
      if (!cur) {
        cur = { title: "Chapter 1", paragraphs: [], branches: {} };
        chapters.push(cur);
      }
      cur.paragraphs.push(p);
    }
  }
  if (!chapters.length) chapters.push({ title: "Chapter 1", paragraphs: [""], branches: {} });
  return { title: title || "Untitled", chapters };
}

export function storyToMarkdown(doc: StoryDoc): string {
  const out = [`# ${doc.title}`];
  for (const ch of doc.chapters) {
    out.push(`## ${ch.title}`);
    for (const p of ch.paragraphs) if (p.trim()) out.push(p);
  }
  return out.join("\n\n") + "\n";
}
