/**
 * Self-contained import module for the Crowdly web app.
 * Supports: PDF, DOCX, EPUB, ODT, FDX, Fountain
 *
 * Each importer converts a File into markdown text.
 * No platform path-aliases are used — everything is local.
 */

import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";
import TurndownService from "turndown";

// ---------------------------------------------------------------------------
// pdfjs-dist worker setup
// ---------------------------------------------------------------------------
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ---------------------------------------------------------------------------
// Turndown (HTML → Markdown) instance
// ---------------------------------------------------------------------------
const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("strikethrough", {
  filter: ["del", "s", "strike"] as any,
  replacement: (content) => `~~${content}~~`,
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface ImportResult {
  success: boolean;
  content?: string; // markdown
  error?: string;
}

export type ImportFormatType = "pdf" | "docx" | "epub" | "odt" | "fdx" | "fountain";

export const IMPORT_EXTENSIONS: Record<string, ImportFormatType> = {
  pdf: "pdf",
  docx: "docx",
  epub: "epub",
  odt: "odt",
  fdx: "fdx",
  fountain: "fountain",
};

export const IMPORT_ACCEPT =
  ".txt,.html,.htm,.pdf,.docx,.epub,.odt,.fdx,.fountain";

export const ALL_IMPORT_EXTENSIONS = [
  "txt", "html", "htm", "pdf", "docx", "epub", "odt", "fdx", "fountain",
];

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

/**
 * Import a file and return its content as markdown.
 * Only handles the new formats (not txt/html — those are handled by the caller).
 */
export async function importFile(file: File): Promise<ImportResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const format = IMPORT_EXTENSIONS[ext];
  if (!format) {
    return { success: false, error: `Unsupported import format: .${ext}` };
  }

  if (file.size > 50 * 1024 * 1024) {
    return { success: false, error: "File is too large (max 50 MB)." };
  }

  try {
    switch (format) {
      case "docx":
        return await importDocx(file);
      case "pdf":
        return await importPdf(file);
      case "epub":
        return await importEpub(file);
      case "odt":
        return await importOdt(file);
      case "fdx":
        return await importFdx(file);
      case "fountain":
        return await importFountain(file);
      default:
        return { success: false, error: `Unsupported format: ${format}` };
    }
  } catch (err) {
    console.error("[import-formats] error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}

// ---------------------------------------------------------------------------
// HTML → Markdown helpers
// ---------------------------------------------------------------------------

function htmlToMarkdown(html: string): string {
  let cleaned = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ");

  let md = turndown.turndown(cleaned);
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

function simpleHtmlToMarkdown(html: string): string {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  text = text.replace(/<(del|s|strike)[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~");
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<\/?[uo]l[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

// ---------------------------------------------------------------------------
// DOCX importer (mammoth)
// ---------------------------------------------------------------------------

async function importDocx(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "b => strong",
        "i => em",
      ],
    }
  );

  const html = result.value;
  if (!html || !html.trim()) {
    return { success: false, error: "No text content found in this DOCX file." };
  }

  const markdown = htmlToMarkdown(html);
  return { success: true, content: markdown };
}

// ---------------------------------------------------------------------------
// PDF importer (pdfjs-dist)
// ---------------------------------------------------------------------------

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function importPdf(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = processPdfPageText(content.items as PdfTextItem[]);
    if (pageText.trim()) parts.push(pageText);
  }

  const markdown = parts.join("\n\n---\n\n");
  if (!markdown.trim()) {
    return {
      success: false,
      error: "This PDF appears to be image-only. No text could be extracted.",
    };
  }
  return { success: true, content: markdown };
}

function processPdfPageText(items: PdfTextItem[]): string {
  if (!items.length) return "";

  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    let line = lines.find((l) => Math.abs(l.y - y) < 5);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  lines.sort((a, b) => b.y - a.y);

  const result: string[] = [];
  let lastY = Infinity;
  let currentParagraph: string[] = [];

  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let lineText = "";
    let lastX = -Infinity;
    for (const item of line.items) {
      const x = item.transform[4];
      if (lineText && x - lastX > 10) lineText += " ";
      lineText += item.str;
      lastX = x + item.width;
    }
    lineText = lineText.trim();
    if (!lineText) continue;

    if (lastY - line.y > 20 && currentParagraph.length > 0) {
      result.push(currentParagraph.join(" "));
      currentParagraph = [];
    }

    const isHeading =
      lineText.length < 80 &&
      (lineText === lineText.toUpperCase() ||
        /^(Chapter|Section|\d+\.)\s/i.test(lineText) ||
        (lastY - line.y > 30 && currentParagraph.length === 0));

    if (isHeading && currentParagraph.length > 0) {
      result.push(currentParagraph.join(" "));
      currentParagraph = [];
      result.push("");
      result.push(`## ${lineText}`);
      result.push("");
    } else {
      currentParagraph.push(lineText);
    }
    lastY = line.y;
  }
  if (currentParagraph.length > 0) result.push(currentParagraph.join(" "));
  return result.join("\n");
}

// ---------------------------------------------------------------------------
// EPUB importer (jszip)
// ---------------------------------------------------------------------------

async function importEpub(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) {
    return { success: false, error: "Invalid EPUB structure." };
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) {
    return { success: false, error: "Invalid EPUB structure." };
  }

  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) {
    return { success: false, error: "Invalid EPUB structure." };
  }

  const opfDoc = parser.parseFromString(opfXml, "application/xml");

  // Metadata
  const titleEl = opfDoc.querySelector("title");
  const epubTitle = titleEl?.textContent?.trim() || "";

  // Manifest map
  const manifestMap = new Map<string, string>();
  opfDoc.querySelectorAll("manifest item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifestMap.set(id, href);
  });

  // Spine items
  const spineHrefs: string[] = [];
  opfDoc.querySelectorAll("spine itemref").forEach((itemref) => {
    const idref = itemref.getAttribute("idref");
    if (idref) {
      const href = manifestMap.get(idref);
      if (href && /\.(xhtml|html|htm)$/i.test(href)) spineHrefs.push(href);
    }
  });

  const contentParts: string[] = [];
  for (const href of spineHrefs) {
    const content = await zip.file(opfDir + href)?.async("string");
    if (content) {
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const body = bodyMatch ? bodyMatch[1] : content;
      try {
        const md = htmlToMarkdown(body);
        if (md.trim()) contentParts.push(md);
      } catch {
        const md = simpleHtmlToMarkdown(body);
        if (md.trim()) contentParts.push(md);
      }
    }
  }

  let markdown = contentParts.join("\n\n---\n\n");
  if (!markdown.trim()) {
    return { success: false, error: "No text content found in this EPUB." };
  }

  if (epubTitle && !markdown.startsWith("# ")) {
    markdown = `# ${epubTitle}\n\n${markdown}`;
  }

  return { success: true, content: markdown };
}

// ---------------------------------------------------------------------------
// ODT importer (jszip)
// ---------------------------------------------------------------------------

async function importOdt(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const contentXml = await zip.file("content.xml")?.async("string");
  if (!contentXml) {
    return { success: false, error: "Invalid ODT structure." };
  }

  const html = parseOdtContent(contentXml);
  if (!html.trim()) {
    return { success: false, error: "No text content found in this ODT." };
  }

  const markdown = simpleHtmlToMarkdown(html);
  return { success: true, content: markdown };
}

function parseOdtContent(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const result: string[] = [];
  const textBody = doc.querySelector("text") || doc.querySelector("body") || doc.documentElement;
  processOdtElements(textBody, result);
  return result.join("\n");
}

function processOdtElements(element: Element, result: string[]): void {
  for (const child of Array.from(element.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "text:h" || tag.endsWith(":h")) {
      const level = child.getAttribute("text:outline-level") || "1";
      const text = getOdtTextContent(child);
      if (text.trim()) result.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
      continue;
    }
    if (tag === "text:p" || tag.endsWith(":p")) {
      const text = getOdtTextContent(child);
      if (text.trim()) result.push(`<p>${escapeHtml(text)}</p>`);
      continue;
    }
    if (tag === "text:list" || tag.endsWith(":list")) {
      result.push("<ul>");
      processOdtElements(child, result);
      result.push("</ul>");
      continue;
    }
    if (tag === "text:list-item" || tag.endsWith(":list-item")) {
      result.push("<li>");
      processOdtElements(child, result);
      result.push("</li>");
      continue;
    }
    if (child.children.length > 0) processOdtElements(child, result);
  }
}

function getOdtTextContent(element: Element): string {
  let text = "";
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "text:s" || tag.endsWith(":s")) {
        const count = parseInt(el.getAttribute("text:c") || "1", 10);
        text += " ".repeat(count);
      } else if (tag === "text:tab" || tag.endsWith(":tab")) {
        text += "\t";
      } else if (tag === "text:line-break" || tag.endsWith(":line-break")) {
        text += "\n";
      } else {
        text += getOdtTextContent(el);
      }
    }
  }
  return text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// FDX (Final Draft) importer
// ---------------------------------------------------------------------------

async function importFdx(file: File): Promise<ImportResult> {
  const text = await file.text();
  if (!text.trim()) {
    return { success: false, error: "No content found in this FDX file." };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    return { success: false, error: "This FDX file appears to be damaged." };
  }

  const result: string[] = [];
  let title = "";

  // Title page
  const titlePage = doc.querySelector("TitlePage");
  if (titlePage) {
    const content = titlePage.querySelector("Content");
    if (content) {
      const paragraphs = content.querySelectorAll("Paragraph");
      paragraphs.forEach((p) => {
        const t = p.querySelector("Text")?.textContent?.trim();
        if (t && !title) title = t;
      });
    }
  }

  if (title) {
    result.push(`# ${title}`, "");
  }

  // Content paragraphs
  const contentEl = doc.querySelector("Content");
  if (contentEl) {
    const paragraphs = contentEl.querySelectorAll(":scope > Paragraph");
    let lastType = "";
    paragraphs.forEach((p) => {
      const type = p.getAttribute("Type") || "Action";
      const t = p.querySelector("Text")?.textContent?.trim() || "";
      if (!t) { result.push(""); return; }

      switch (type) {
        case "Scene Heading":
          result.push("", `## ${t}`);
          break;
        case "Action":
          if (lastType !== "Action") result.push("");
          result.push(t);
          break;
        case "Character":
          result.push("", `**${t}**`);
          break;
        case "Parenthetical":
          result.push(`*(${t.replace(/^\(/, "").replace(/\)$/, "")})*`);
          break;
        case "Dialogue":
          result.push(t);
          break;
        case "Transition":
          result.push("", `*${t}*`);
          break;
        case "Shot":
          result.push("", `### ${t}`);
          break;
        default:
          result.push("", t);
          break;
      }
      lastType = type;
    });
  }

  const markdown = result.join("\n").trim();
  if (!markdown) {
    return { success: false, error: "No text content found in this FDX file." };
  }
  return { success: true, content: markdown };
}

// ---------------------------------------------------------------------------
// Fountain importer
// ---------------------------------------------------------------------------

async function importFountain(file: File): Promise<ImportResult> {
  const text = await file.text();
  if (!text.trim()) {
    return { success: false, error: "No content found in this Fountain file." };
  }

  const lines = text.split("\n");
  const result: string[] = [];
  let title = "";
  let inTitlePage = true;
  let inBoneyard = false;
  let currentElement = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("/*")) { inBoneyard = true; continue; }
    if (trimmed.endsWith("*/")) { inBoneyard = false; continue; }
    if (inBoneyard) continue;
    if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) continue;

    if (inTitlePage) {
      if (trimmed === "===" || trimmed === "---") { inTitlePage = false; continue; }
      const metaMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (metaMatch) {
        if (metaMatch[1].toLowerCase() === "title") title = metaMatch[2];
        continue;
      }
      if (trimmed === "") {
        if (i + 1 < lines.length && lines[i + 1].trim() !== "" && !lines[i + 1].trim().match(/^\w+:/)) {
          inTitlePage = false;
        }
        continue;
      }
      if (!trimmed.match(/^\w+:\s*/)) {
        inTitlePage = false;
      } else {
        continue;
      }
    }

    if (trimmed === "") { result.push(""); currentElement = ""; continue; }
    if (trimmed === "===") { result.push("", "---", ""); continue; }

    // Forced scene heading
    if (trimmed.startsWith(".") && !trimmed.startsWith("..")) {
      result.push(`## ${trimmed.slice(1).trim()}`);
      currentElement = "scene";
      continue;
    }
    // Forced action
    if (trimmed.startsWith("!")) {
      result.push(trimmed.slice(1));
      currentElement = "action";
      continue;
    }
    // Forced character
    if (trimmed.startsWith("@")) {
      result.push("", `**${trimmed.slice(1).trim()}**`);
      currentElement = "character";
      continue;
    }
    // Centered text
    if (trimmed.startsWith(">") && trimmed.endsWith("<")) {
      result.push(`> ${trimmed.slice(1, -1).trim()}`);
      continue;
    }
    // Scene heading
    if (/^(INT\.|EXT\.|EST\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.)/i.test(trimmed)) {
      result.push(`## ${trimmed}`);
      currentElement = "scene";
      continue;
    }
    // Transition
    if (/TO:$/i.test(trimmed) || (trimmed.startsWith(">") && !trimmed.endsWith("<"))) {
      const t = trimmed.startsWith(">") ? trimmed.slice(1).trim().toUpperCase() : trimmed.toUpperCase();
      result.push(`*${t}*`);
      currentElement = "transition";
      continue;
    }
    // Character (all caps)
    if (trimmed === trimmed.toUpperCase() && /^[A-Z][A-Z\s.'()\-]+$/.test(trimmed)) {
      if (i + 1 < lines.length && lines[i + 1].trim() !== "") {
        result.push("", `**${trimmed}**`);
        currentElement = "character";
        continue;
      }
    }
    // Parenthetical
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      result.push(`*(${trimmed.slice(1, -1)})*`);
      currentElement = "parenthetical";
      continue;
    }
    // Dialogue
    if (currentElement === "character" || currentElement === "parenthetical") {
      result.push(trimmed);
      currentElement = "dialogue";
      continue;
    }
    // Default: action
    result.push(trimmed);
    currentElement = "action";
  }

  let markdown = result.join("\n").trim();
  if (title) markdown = `# ${title}\n\n${markdown}`;

  if (!markdown) {
    return { success: false, error: "No text content found in this Fountain file." };
  }
  return { success: true, content: markdown };
}
