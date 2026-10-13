import { block, escapeHtml, imageSource, parseBlocks } from "./dsl.ts";

// .comic ⇄ comic issues and pages. Twin of format/comic_markup.py.

/** A speech bubble / caption box at x/y percent of the image. */
export interface ComicLayerDoc {
  text: string;
  x: number;
  y: number;
  style: "bubble" | "box";
}
/** An alternative version of a page (branch), with its own layers. */
export interface ComicAlternativeDoc {
  src: string;
  name: string;
  id?: string;
  layers?: ComicLayerDoc[];
}
export interface ComicPageDoc {
  src: string;
  alt: string;
  id?: string;
  layers?: ComicLayerDoc[];
  alternatives?: ComicAlternativeDoc[];
}
export interface ComicDoc {
  title: string;
  direction: "ltr" | "rtl";
  issues: { title: string; id?: string; pages: ComicPageDoc[] }[];
}

const pct = (v: string | undefined) => Math.min(100, Math.max(0, Number(v) || 0));
const layerOf = (attrs: Record<string, string>, body: string): ComicLayerDoc => ({
  text: body,
  x: pct(attrs.x),
  y: pct(attrs.y),
  style: attrs.style === "box" ? "box" : "bubble",
});
const layerBlock = (l: ComicLayerDoc) => block("layer", l.text, { x: String(l.x), y: String(l.y), style: l.style || "bubble" });

export function parseComic(text: string): ComicDoc {
  let title = "";
  let direction: "ltr" | "rtl" = "ltr";
  const issues: ComicDoc["issues"] = [];
  const current = () => {
    if (!issues.length) issues.push({ title: "Issue 1", pages: [] });
    return issues[issues.length - 1];
  };
  // A [layer] belongs to the page or alternative just before it.
  let layerTarget: { layers?: ComicLayerDoc[] } | null = null;
  for (const b of parseBlocks(text)) {
    if (b.tag === "comic_title") {
      title = b.body.trim();
      direction = b.attrs.direction === "rtl" ? "rtl" : "ltr";
    } else if (b.tag === "issue") {
      issues.push({ title: b.body.trim(), ...(b.attrs.id ? { id: b.attrs.id } : {}), pages: [] });
      layerTarget = null;
    } else if (b.tag === "page") {
      const page: ComicPageDoc = { src: imageSource(b.body), alt: b.attrs.alt ?? "", ...(b.attrs.id ? { id: b.attrs.id } : {}) };
      current().pages.push(page);
      layerTarget = page;
    } else if (b.tag === "alt") {
      const pages = current().pages;
      if (!pages.length) continue;
      const alt: ComicAlternativeDoc = { src: imageSource(b.body), name: b.attrs.name ?? "", ...(b.attrs.id ? { id: b.attrs.id } : {}) };
      (pages[pages.length - 1].alternatives ??= []).push(alt);
      layerTarget = alt;
    } else if (b.tag === "layer" && layerTarget) (layerTarget.layers ??= []).push(layerOf(b.attrs, b.body));
  }
  return { title, direction, issues };
}

export function comicToDsl(doc: ComicDoc): string {
  const lines = [block("comic_title", doc.title || "Untitled comic", { align: "center", direction: doc.direction || "ltr" }), ""];
  for (const issue of doc.issues) {
    lines.push(block("issue", issue.title || "", { id: issue.id ?? "" }), "");
    for (const p of issue.pages) {
      lines.push(block("page", `(${p.src})`, { alt: p.alt, id: p.id ?? "" }), "");
      for (const l of p.layers ?? []) lines.push(layerBlock(l), "");
      for (const a of p.alternatives ?? []) {
        lines.push(block("alt", `(${a.src})`, { name: a.name, id: a.id ?? "" }), "");
        for (const l of a.layers ?? []) lines.push(layerBlock(l), "");
      }
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function comicToHtml(text: string): string {
  const doc = parseComic(text);
  const out = [`<h1 style="text-align:center">${escapeHtml(doc.title)}</h1>`];
  for (const issue of doc.issues) {
    out.push(`<h2>${escapeHtml(issue.title)}</h2><div style="display:flex;flex-wrap:wrap;gap:8px" dir="${doc.direction}">`);
    const layers = (ls?: ComicLayerDoc[]) =>
      ls?.length ? `<ul class="layers">${ls.map((l) => `<li class="${l.style}">${escapeHtml(l.text)}</li>`).join("")}</ul>` : "";
    issue.pages.forEach((p, i) =>
      out.push(
        `<figure style="width:160px"><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt || `Page ${i + 1}`)}" style="width:100%" /><figcaption>${i + 1}</figcaption>${layers(p.layers)}` +
          (p.alternatives ?? [])
            .map((a) => `<aside class="alternative"><img src="${escapeHtml(a.src)}" alt="${escapeHtml(a.name || "Alternative")}" style="width:100%" /><em>${escapeHtml(a.name || "Alternative")}</em>${layers(a.layers)}</aside>`)
            .join("") +
          "</figure>",
      ),
    );
    out.push("</div>");
  }
  return out.join("\n");
}
