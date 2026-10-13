import { block, escapeHtml, imageSource, parseBlocks } from "./dsl.ts";

// .comic ⇄ comic issues and pages. Twin of format/comic_markup.py.

export interface ComicDoc {
  title: string;
  direction: "ltr" | "rtl";
  issues: { title: string; pages: { src: string; alt: string }[] }[];
}

export function parseComic(text: string): ComicDoc {
  let title = "";
  let direction: "ltr" | "rtl" = "ltr";
  const issues: ComicDoc["issues"] = [];
  const current = () => {
    if (!issues.length) issues.push({ title: "Issue 1", pages: [] });
    return issues[issues.length - 1];
  };
  for (const b of parseBlocks(text)) {
    if (b.tag === "comic_title") {
      title = b.body.trim();
      direction = b.attrs.direction === "rtl" ? "rtl" : "ltr";
    } else if (b.tag === "issue") issues.push({ title: b.body.trim(), pages: [] });
    else if (b.tag === "page") current().pages.push({ src: imageSource(b.body), alt: b.attrs.alt ?? "" });
  }
  return { title, direction, issues };
}

export function comicToDsl(doc: ComicDoc): string {
  const lines = [block("comic_title", doc.title || "Untitled comic", { align: "center", direction: doc.direction || "ltr" }), ""];
  for (const issue of doc.issues) {
    lines.push(block("issue", issue.title || ""), "");
    for (const p of issue.pages) lines.push(block("page", `(${p.src})`, { alt: p.alt }), "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function comicToHtml(text: string): string {
  const doc = parseComic(text);
  const out = [`<h1 style="text-align:center">${escapeHtml(doc.title)}</h1>`];
  for (const issue of doc.issues) {
    out.push(`<h2>${escapeHtml(issue.title)}</h2><div style="display:flex;flex-wrap:wrap;gap:8px" dir="${doc.direction}">`);
    issue.pages.forEach((p, i) => out.push(`<figure style="width:160px"><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt || `Page ${i + 1}`)}" style="width:100%" /><figcaption>${i + 1}</figcaption></figure>`));
    out.push("</div>");
  }
  return out.join("\n");
}
