// Shared block parser for the .story, .screenplay and .comic formats — the
// TypeScript twin of apps/desktop/src/editor/format/dsl.py. Both are checked
// against apps/desktop/tests/fixtures/formats (scripts/test-formats.ts and
// tests/test_formats.py). Spec:
// Documentation/Crowdly_file_formats_story_screenplay_comic.md
//
//   [tag attr key=value key="quoted value"]body[/tag]
//
// Dependency-free on purpose, so Node can run the fixture test directly.

export interface Block {
  tag: string;
  attrs: Record<string, string>;
  body: string;
}

const ALIGN = new Set(["left", "center", "right", "justify"]);
const TOKEN = /([\w-]+)="([^"]*)"|(\S+)/g;
const OPEN = /^\[([a-z_]+)(\s[^\]]*)?\]/;

export function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of (text ?? "").matchAll(TOKEN)) {
    if (m[1]) {
      attrs[m[1]] = m[2];
      continue;
    }
    const token = m[3];
    if (token.includes("=")) {
      const at = token.indexOf("=");
      attrs[token.slice(0, at).trim()] = token.slice(at + 1).trim();
    } else if (ALIGN.has(token) && !("align" in attrs)) attrs.align = token;
    else attrs[token] = "1";
  }
  return attrs;
}

export function formatAttrs(attrs: Record<string, string>): string {
  const parts: string[] = [];
  if (attrs.align) parts.push(attrs.align);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "align" || v === undefined || v === null || v === "") continue;
    if (v === "1") parts.push(k);
    else if (/[\s"\]]/.test(v)) parts.push(`${k}="${v.replace(/"/g, "'")}"`);
    else parts.push(`${k}=${v}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function parseBlocks(text: string): Block[] {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const raw: string[] = [];
  const flushRaw = () => {
    if (raw.length) {
      const body = raw.join("\n").replace(/^\n+|\n+$/g, "");
      if (body.trim()) blocks.push({ tag: "raw", attrs: {}, body });
      raw.length = 0;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    const m = stripped.match(OPEN);
    if (!m) {
      if (stripped) raw.push(line);
      else flushRaw();
      i++;
      continue;
    }
    const tag = m[1];
    const close = `[/${tag}]`;
    const rest = stripped.slice(m[0].length);
    // "[sic]" and other bracketed prose without a closing tag is text.
    if (!rest.includes(close) && !lines.slice(i + 1).some((l) => l.includes(close))) {
      raw.push(line);
      i++;
      continue;
    }
    flushRaw();
    const attrs = parseAttrs(m[2] ?? "");
    const body: string[] = [];
    if (rest.includes(close)) body.push(rest.slice(0, rest.indexOf(close)));
    else {
      body.push(rest);
      i++;
      while (i < lines.length && !lines[i].includes(close)) body.push(lines[i++]);
      if (i < lines.length) body.push(lines[i].slice(0, lines[i].indexOf(close)));
    }
    blocks.push({ tag, attrs, body: body.join("\n").replace(/^\n+|\n+$/g, "") });
    i++;
  }
  flushRaw();
  return blocks;
}

export function imageSource(body: string): string {
  const b = body.trim();
  return b.startsWith("(") && b.endsWith(")") ? b.slice(1, -1).trim() : b;
}

export const block = (tag: string, body: string, attrs: Record<string, string> = {}) => `[${tag}${formatAttrs(attrs)}]${body}[/${tag}]`;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!);
