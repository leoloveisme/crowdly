import DOMPurify from "dompurify";

import { getChapters, getStory } from "@web/lib/story";
import { getScenes, getScreenplay } from "@web/lib/screenplay";
import { getComic } from "@web/lib/comic";
import { libraryFileUrl, libraryItem } from "@web/lib/discovery";
import { mdToHtml } from "@web/creation/markdown";
import { mediaUrl } from "@web/lib/api";

// Turns anything readable into a flat list of blocks the reader can lay
// out, locate positions in, and anchor highlights to.

export type Block =
  | { kind: "heading"; html: string; level: 1 | 2 | 3 }
  | { kind: "html"; html: string }
  | { kind: "image"; src: string; alt: string };

export type Loaded =
  | { mode: "blocks"; title: string; author?: string; blocks: Block[]; rtl?: boolean; comic?: boolean }
  | { mode: "pdf"; title: string; url: string }
  | { mode: "audio"; title: string; url: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clean = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

async function loadStory(id: string, userId?: string): Promise<Loaded> {
  const [s, chapters] = await Promise.all([getStory(id, userId), getChapters(id, userId)]);
  const blocks: Block[] = [];
  for (const c of chapters) {
    blocks.push({ kind: "heading", level: 2, html: esc(c.chapter_title || "") });
    for (const p of c.paragraphs ?? []) if (p.trim()) blocks.push({ kind: "html", html: clean(mdToHtml(p)) });
  }
  return { mode: "blocks", title: s.title, blocks };
}

const SP_STYLE: Record<string, string> = {
  scene_heading: "font-weight:700;text-transform:uppercase",
  character: "text-align:center;text-transform:uppercase;margin-bottom:0",
  dialogue: "margin:0 15%",
  parenthetical: "margin:0 25%;font-style:italic",
  transition: "text-align:right;text-transform:uppercase",
  shot: "text-transform:uppercase",
};

async function loadScreenplay(id: string): Promise<Loaded> {
  const [sp, { scenes, blocks }] = await Promise.all([getScreenplay(id), getScenes(id)]);
  const out: Block[] = [];
  for (const sc of scenes) {
    out.push({ kind: "heading", level: 3, html: esc(sc.slugline) });
    for (const b of blocks.filter((x) => x.scene_id === sc.scene_id).sort((a, b) => a.block_index - b.block_index)) {
      if (!b.text.trim()) continue;
      out.push({ kind: "html", html: `<p style="font-family:ui-monospace,monospace;${SP_STYLE[b.block_type] ?? ""}">${esc(b.text)}</p>` });
    }
  }
  return { mode: "blocks", title: sp.title, blocks: out };
}

async function loadComic(id: string): Promise<Loaded> {
  const c = await getComic(id);
  const pages = [...c.pages].sort((a, b) => a.page_index - b.page_index);
  return { mode: "blocks", title: c.title, rtl: c.reading_direction === "rtl", comic: true, blocks: pages.map((p, i) => ({ kind: "image", src: mediaUrl(p.image_url), alt: p.alt_text ?? `Page ${i + 1}` })) };
}

async function fetchFile(id: string) {
  const res = await fetch(libraryFileUrl(id), { credentials: "include" });
  if (!res.ok) throw new Error(`Couldn't open the book (${res.status})`);
  return res;
}

/** Minimal EPUB reader: spine order, chapter bodies, images as blob URLs. */
async function loadEpub(buf: ArrayBuffer): Promise<{ title: string; author?: string; blocks: Block[] }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const parser = new DOMParser();
  const container = parser.parseFromString(await zip.file("META-INF/container.xml")!.async("string"), "application/xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path") ?? "";
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = parser.parseFromString(await zip.file(opfPath)!.async("string"), "application/xml");
  const title = opf.getElementsByTagName("dc:title")[0]?.textContent ?? "";
  const author = opf.getElementsByTagName("dc:creator")[0]?.textContent ?? undefined;
  const manifest = new Map<string, { href: string; type: string }>();
  opf.querySelectorAll("manifest > item").forEach((it) => manifest.set(it.getAttribute("id")!, { href: it.getAttribute("href")!, type: it.getAttribute("media-type") ?? "" }));

  const resolve = (from: string, href: string) => {
    const parts = (from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "").concat(decodeURIComponent(href.split("#")[0])).split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    return out.join("/");
  };
  const blobCache = new Map<string, string>();
  const imageUrl = async (path: string) => {
    if (blobCache.has(path)) return blobCache.get(path)!;
    const f = zip.file(path);
    if (!f) return "";
    const url = URL.createObjectURL(new Blob([await f.async("arraybuffer")]));
    blobCache.set(path, url);
    return url;
  };

  const blocks: Block[] = [];
  for (const ref of Array.from(opf.querySelectorAll("spine > itemref"))) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (!item) continue;
    const path = base + item.href;
    const f = zip.file(decodeURIComponent(path));
    if (!f) continue;
    const doc = parser.parseFromString(await f.async("string"), "application/xhtml+xml");
    const body = doc.body ?? doc.getElementsByTagName("body")[0];
    if (!body) continue;
    for (const img of Array.from(body.querySelectorAll("img, image"))) {
      const attr = img.tagName.toLowerCase() === "image" ? "xlink:href" : "src";
      const src = img.getAttribute(attr) ?? img.getAttribute("href") ?? "";
      if (src && !/^(data:|https?:)/.test(src)) img.setAttribute(attr === "xlink:href" ? "href" : "src", await imageUrl(resolve(decodeURIComponent(path), src)));
    }
    // One block per top-level element keeps positions and highlights fine-grained.
    const kids = Array.from(body.children);
    const flat = kids.length === 1 && kids[0].tagName.toLowerCase() === "div" ? Array.from(kids[0].children) : kids;
    for (const el of flat) {
      const tag = el.tagName.toLowerCase();
      const html = clean(el.outerHTML);
      if (!el.textContent?.trim() && !el.querySelector("img,image,svg")) continue;
      if (/^h[1-3]$/.test(tag)) blocks.push({ kind: "heading", level: Number(tag[1]) as 1 | 2 | 3, html: clean(el.innerHTML) });
      else blocks.push({ kind: "html", html });
    }
  }
  return { title, author, blocks };
}

export async function loadReadable(kind: string, id: string, userId?: string): Promise<Loaded & { libraryItemId?: string }> {
  if (kind === "story") return loadStory(id, userId);
  if (kind === "screenplay") return loadScreenplay(id);
  if (kind === "comic") return loadComic(id);
  const item = await libraryItem(id);
  if (!item) throw new Error("This book isn't in your library.");
  if (item.kind === "crowdly_story" && item.story_title_id) return { ...(await loadStory(item.story_title_id, userId)), libraryItemId: item.id };
  if (item.format === "pdf") {
    const blob = await (await fetchFile(id)).blob();
    return { mode: "pdf", title: item.title, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })), libraryItemId: item.id };
  }
  if (item.format === "audio") {
    const blob = await (await fetchFile(id)).blob();
    return { mode: "audio", title: item.title, url: URL.createObjectURL(blob), libraryItemId: item.id };
  }
  if (item.format === "epub") {
    const e = await loadEpub(await (await fetchFile(id)).arrayBuffer());
    return { mode: "blocks", title: item.title || e.title, author: item.author ?? e.author, blocks: e.blocks, libraryItemId: item.id };
  }
  const text = await (await fetchFile(id)).text();
  const blocks: Block[] = text
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => (/^#{1,3}\s/.test(p) ? { kind: "heading" as const, level: Math.min(3, p.match(/^#+/)![0].length) as 1 | 2 | 3, html: esc(p.replace(/^#+\s*/, "")) } : { kind: "html" as const, html: clean(mdToHtml(p)) }));
  return { mode: "blocks", title: item.title, author: item.author ?? undefined, blocks, libraryItemId: item.id };
}


