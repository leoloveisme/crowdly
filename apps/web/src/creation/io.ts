import { exportDocument } from "@/lib/export";
import { importDocument } from "@/lib/import";
import { ExportFormat as PlatformExportFormat } from "@/types/import-export";
import { downloadBlob, safeFileName } from "@web/lib/text";
import { createComic, createScreenplay, createStory } from "@web/lib/docs";
import { createBranch, createChapter, getChapters, getStory, listBranches } from "@web/lib/story";
import { createBlock, createScene, deleteScene, getScenes, getScreenplay } from "@web/lib/screenplay";
import { getComic, updateComicSettings, uploadPages, createIssue } from "@web/lib/comic";
import { mediaUrl } from "@web/lib/api";
import type { ExportFormat, SaveAsFormat } from "@web/shell/workspace";
import { parseStory, storyFromMarkdown, storyToDsl, storyToHtml, storyToMarkdown, type StoryDoc } from "@web/formats/story";
import { parseScreenplay, screenplayFromMarkdown, screenplayToDsl, screenplayToHtml, screenplayToMarkdown, type ScreenplayDoc } from "@web/formats/screenplay";
import { comicToDsl, comicToHtml, parseComic, type ComicDoc } from "@web/formats/comic";

// Import / Export / Save as for every work type (desktop: Import, Export
// and Save as menus). Crowdly works are turned into the shared format docs
// (formats/*.ts), which then become .story/.screenplay/.comic files,
// Markdown for the platform's exporters (PDF, EPUB, DOCX, ODT, FDX,
// Fountain), or HTML / plain text.

export type WorkKind = "story" | "screenplay" | "comic";

export async function loadStoryDoc(storyId: string, userId?: string): Promise<StoryDoc> {
  const [s, chapters, branches] = await Promise.all([getStory(storyId, userId), getChapters(storyId, userId), listBranches(storyId).catch(() => [])]);
  return {
    title: s.title,
    chapters: chapters.map((c) => {
      const br: StoryDoc["chapters"][number]["branches"] = {};
      for (const b of branches.filter((x) => x.chapter_id === c.chapter_id)) (br[String(b.parent_paragraph_index)] ??= []).push({ name: b.branch_name ?? "", text: b.branch_text ?? "" });
      return { title: c.chapter_title ?? "", paragraphs: c.paragraphs ?? [], branches: br };
    }),
  };
}

export async function loadScreenplayDoc(id: string): Promise<ScreenplayDoc> {
  const [sp, { scenes, blocks }] = await Promise.all([getScreenplay(id), getScenes(id)]);
  return {
    title: sp.title,
    scenes: scenes.map((sc) => ({
      slugline: sc.slugline,
      blocks: blocks
        .filter((b) => b.scene_id === sc.scene_id)
        .sort((a, b) => a.block_index - b.block_index)
        .filter((b) => b.block_type !== "scene_heading")
        .map((b) => ({ type: (b.block_type as ScreenplayDoc["scenes"][number]["blocks"][number]["type"]) ?? "action", text: b.text.trim() })),
    })),
  };
}

export async function loadComicDoc(id: string): Promise<ComicDoc> {
  const c = await getComic(id);
  const issues = (c.issues ?? []).length ? c.issues! : [{ issue_id: "", title: "Issue 1" }];
  return {
    title: c.title,
    direction: c.reading_direction,
    issues: issues.map((i) => ({
      title: i.title,
      pages: c.pages
        .filter((p) => !i.issue_id || p.issue_id === i.issue_id)
        .sort((a, b) => a.page_index - b.page_index)
        .map((p) => ({ src: mediaUrl(p.image_url), alt: p.alt_text ?? "" })),
    })),
  };
}

export async function loadWorkDoc(kind: WorkKind, id: string, userId?: string) {
  return kind === "story" ? loadStoryDoc(id, userId) : kind === "screenplay" ? loadScreenplayDoc(id) : loadComicDoc(id);
}

/** The work as a file in one of the desktop's native formats. */
export function toNativeFile(kind: WorkKind, doc: StoryDoc | ScreenplayDoc | ComicDoc, format: SaveAsFormat): { name: string; content: string; mime: string } {
  const base = safeFileName(doc.title);
  if (format === "story") return { name: `${base}.story`, content: storyToDsl(doc as StoryDoc), mime: "text/plain" };
  if (format === "screenplay") return { name: `${base}.screenplay`, content: screenplayToDsl(doc as ScreenplayDoc), mime: "text/plain" };
  if (format === "comic") return { name: `${base}.comic`, content: comicToDsl(doc as ComicDoc), mime: "text/plain" };
  const md = kind === "story" ? storyToMarkdown(doc as StoryDoc) : kind === "screenplay" ? screenplayToMarkdown(doc as ScreenplayDoc) : comicMarkdown(doc as ComicDoc);
  return { name: `${base}.md`, content: md, mime: "text/markdown" };
}

const comicMarkdown = (doc: ComicDoc) => [`# ${doc.title}`, ...doc.issues.flatMap((i) => [`## ${i.title}`, ...i.pages.map((p) => `![${p.alt}](${p.src})`)])].join("\n\n") + "\n";

export function saveAsDownload(kind: WorkKind, doc: StoryDoc | ScreenplayDoc | ComicDoc, format: SaveAsFormat) {
  const f = toNativeFile(kind, doc, format);
  downloadBlob(new Blob([f.content], { type: `${f.mime};charset=utf-8` }), f.name);
}

const PLATFORM_FORMAT: Partial<Record<ExportFormat, PlatformExportFormat>> = {
  pdf: PlatformExportFormat.PDF,
  epub: PlatformExportFormat.EPUB,
  docx: PlatformExportFormat.DOCX,
  odt: PlatformExportFormat.ODT,
  fdx: PlatformExportFormat.FDX,
  fountain: PlatformExportFormat.FOUNTAIN,
};

export async function exportWork(kind: WorkKind, doc: StoryDoc | ScreenplayDoc | ComicDoc, format: ExportFormat): Promise<void> {
  const base = safeFileName(doc.title);
  const md = toNativeFile(kind, doc, "md").content;
  if (format === "md") return downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
  if (format === "txt") return downloadBlob(new Blob([md.replace(/^#+\s*/gm, "").replace(/[*_~`]/g, "")], { type: "text/plain;charset=utf-8" }), `${base}.txt`);
  if (format === "html") {
    const body = kind === "story" ? storyToHtml(storyToDsl(doc as StoryDoc)) : kind === "screenplay" ? screenplayToHtml(screenplayToDsl(doc as ScreenplayDoc)) : comicToHtml(comicToDsl(doc as ComicDoc));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${base}</title><style>body{max-width:42rem;margin:2rem auto;font:18px/1.6 Georgia,serif;padding:0 1rem}aside.branch{border-left:3px solid #ccc;padding-left:.8em;color:#555;font-size:.95em}</style></head><body>${body}</body></html>`;
    return downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${base}.html`);
  }
  const platform = PLATFORM_FORMAT[format];
  if (!platform) throw new Error(`Can't export as ${format}`);
  const r = await exportDocument({ content: md, format: platform, options: { title: doc.title, filename: base } });
  if (!r.success || !r.blob) throw new Error(r.error || "Export failed");
  downloadBlob(r.blob, r.filename ?? `${base}.${format}`);
}

// ---- import ------------------------------------------------------------------------

export const IMPORT_ACCEPT = ".story,.screenplay,.comic,.md,.markdown,.txt,.html,.htm,.docx,.odt,.pdf,.epub,.fdx,.fountain";

export async function createStoryFromDoc(doc: StoryDoc, userId: string, spaceId?: string | null): Promise<string> {
  const [first, ...rest] = doc.chapters;
  const r = await createStory(userId, doc.title, { spaceId, chapterTitle: first?.title || "Chapter 1", paragraphs: first?.paragraphs.length ? first.paragraphs : [""] });
  const chapterIds = [r.chapterId];
  for (const [i, ch] of rest.entries()) {
    const c = await createChapter(r.storyTitleId, ch.title || `Chapter ${i + 2}`, ch.paragraphs.length ? ch.paragraphs : [""], i + 2);
    chapterIds.push(c.chapter_id);
  }
  for (const [ci, ch] of doc.chapters.entries())
    for (const [idx, list] of Object.entries(ch.branches ?? {}))
      for (const b of list)
        await createBranch({ chapterId: chapterIds[ci], parentParagraphIndex: Number(idx), parentParagraphText: ch.paragraphs[Number(idx)] ?? "", branchText: b.text, branchName: b.name || undefined }).catch(() => {});
  return r.storyTitleId;
}

export async function createScreenplayFromDoc(doc: ScreenplayDoc): Promise<string> {
  const { screenplayId } = await createScreenplay(doc.title);
  // The template comes with a sample scene; replace it with the imported ones.
  const existing = await getScenes(screenplayId);
  for (const s of existing.scenes) await deleteScene(s.scene_id).catch(() => {});
  for (const [i, sc] of doc.scenes.entries()) {
    const scene = await createScene(screenplayId, i + 1, sc.slugline || `SCENE ${i + 1}`);
    let after: string | undefined;
    for (const b of sc.blocks) {
      const created = await createBlock(screenplayId, { sceneId: scene.scene_id, blockType: b.type, text: b.text, afterBlockId: after });
      after = created.block_id;
    }
  }
  return screenplayId;
}

/** Pages are fetched from their source (URL, or a resolver for Space-relative paths) and uploaded. */
export async function createComicFromDoc(doc: ComicDoc, resolve?: (src: string) => Promise<Blob | null>): Promise<{ id: string; skipped: number }> {
  const { comicId } = await createComic(doc.title);
  if (doc.direction === "rtl") await updateComicSettings(comicId, { reading_direction: "rtl" }).catch(() => {});
  const comic = await getComic(comicId);
  let skipped = 0;
  for (const [i, issue] of doc.issues.entries()) {
    const issueId = i === 0 ? comic.issues?.[0]?.issue_id : (await createIssue(comicId, issue.title || `Issue ${i + 1}`).catch(() => null))?.issue_id;
    const files: File[] = [];
    for (const [n, p] of issue.pages.entries()) {
      let blob: Blob | null = null;
      try {
        blob = resolve ? await resolve(p.src) : null;
        if (!blob && /^https?:|^\//.test(p.src)) blob = await fetch(p.src, { credentials: "include" }).then((r) => (r.ok ? r.blob() : null));
      } catch {
        blob = null;
      }
      if (blob) files.push(new File([blob], `${String(n + 1).padStart(3, "0")}.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: blob.type || "image/png" }));
      else skipped++;
    }
    if (files.length) await uploadPages(comicId, files, issueId);
  }
  return { id: comicId, skipped };
}

/** Imports a file from the device; returns the editor path of what it created. */
export async function importFile(file: File, userId: string, spaceId?: string | null): Promise<{ path: string; note?: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const base = file.name.replace(/\.[^.]+$/, "");
  if (ext === "story") return { path: `/story/${await createStoryFromDoc(withTitle(parseStory(await file.text()), base), userId, spaceId)}` };
  if (ext === "screenplay") return { path: `/screenplay/${await createScreenplayFromDoc(withTitle(parseScreenplay(await file.text()), base))}` };
  if (ext === "comic") {
    const r = await createComicFromDoc(withTitle(parseComic(await file.text()), base));
    return { path: `/comic/${r.id}`, note: r.skipped ? `${r.skipped} page(s) couldn't be fetched — add them in the editor.` : undefined };
  }
  let markdown: string;
  if (["md", "markdown", "txt"].includes(ext)) markdown = await file.text();
  else if (ext === "html" || ext === "htm") {
    const { htmlToMarkdown } = await import("@/lib/import/html-to-markdown");
    markdown = htmlToMarkdown(await file.text());
  } else {
    const r = await importDocument(file);
    if (!r.success || !r.document) throw new Error(r.error || "Import failed");
    markdown = r.document.content;
    if (ext === "fdx" || ext === "fountain") return { path: `/screenplay/${await createScreenplayFromDoc(screenplayFromMarkdown(markdown, r.document.metadata.title || base))}` };
    return { path: `/story/${await createStoryFromDoc(storyFromMarkdown(markdown, r.document.metadata.title || base), userId, spaceId)}` };
  }
  return { path: `/story/${await createStoryFromDoc(storyFromMarkdown(markdown, base), userId, spaceId)}` };
}

function withTitle<T extends { title: string }>(doc: T, fallback: string): T {
  return doc.title ? doc : { ...doc, title: fallback };
}
