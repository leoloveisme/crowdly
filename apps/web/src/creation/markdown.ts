import { marked } from "marked";
import TurndownService from "turndown";

// Chapters are stored as paragraphs[] (stories.paragraphs). In the editor a
// chapter is one Markdown text — paragraphs separated by a blank line — the
// same model as the desktop app's Markdown pane. Formatting Markdown can't
// express (colour, font, alignment) is kept as inline HTML, like the
// desktop's "Markdown (MD) / HTML" pane.

marked.setOptions({ gfm: true, breaks: true });

export function splitParagraphs(markdown: string): string[] {
  const parts = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""));
  const nonEmpty = parts.filter((p) => p.trim().length > 0);
  return nonEmpty.length ? nonEmpty : [""];
}

export const joinParagraphs = (paragraphs: string[]) => paragraphs.filter((p, i) => p.trim() || i === 0).join("\n\n");

export function mdToHtml(markdown: string): string {
  return marked.parse(markdown || "", { async: false }) as string;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  bulletListMarker: "-",
});
// Keep what Markdown can't say as HTML.
turndown.addRule("underline", { filter: ["u"], replacement: (c) => `<u>${c}</u>` });
turndown.addRule("strike", { filter: ["s", "del", "strike"], replacement: (c) => `~~${c}~~` });
turndown.addRule("styledSpan", {
  filter: (node) => node.nodeName === "SPAN" && !!(node as HTMLElement).getAttribute("style"),
  replacement: (content, node) => `<span style="${(node as HTMLElement).getAttribute("style")}">${content}</span>`,
});
turndown.addRule("alignedBlock", {
  filter: (node) => ["P", "H1", "H2", "H3"].includes(node.nodeName) && /text-align:\s*(center|right|justify)/.test((node as HTMLElement).getAttribute("style") || ""),
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const tag = el.nodeName.toLowerCase();
    return `\n\n<${tag} style="${el.getAttribute("style")}">${content}</${tag}>\n\n`;
  },
});
turndown.keep(["sup", "sub", "mark"]);

export function htmlToMd(html: string): string {
  return turndown
    .turndown(html || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text of a Markdown string, for word counts and search. */
export function mdToPlain(markdown: string): string {
  return markdown
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~`#>]+/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}
