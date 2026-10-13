// The desktop's `.master` format (ui/master_document_window.py
// _serialise_to_text / _load_from_master_file): include containers separated
// by a bare `---` line, each with an optional `[label](link)` line pointing
// at its source file, an optional `## Title` (+ `<!-- title-edited: ts -->`)
// and the container's content. Content lines that are exactly `---`, or a
// first line starting with `## `, are escaped with a backslash. The web app
// writes Space-relative links (relative to the .master file's folder), which
// the desktop resolves the same way it resolves its own relative labels.

export interface MasterContainer {
  label: string | null;
  title: string;
  titleEditedAt: number | null;
  content: string;
}

export function parseMaster(text: string): MasterContainer[] {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: MasterContainer[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;
    let label: string | null = null;
    const link = lines[i].trim().match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (link) {
      label = link[1];
      i++;
    }
    let title = "";
    let titleEditedAt: number | null = null;
    if (i < lines.length && lines[i].trimStart().startsWith("## ")) {
      title = lines[i].trimStart().slice(3).trim();
      i++;
      const meta = i < lines.length ? lines[i].trim().match(/^<!--\s*title-edited:\s*([0-9.]+)\s*-->$/) : null;
      if (meta) {
        titleEditedAt = Number(meta[1]);
        i++;
      }
    }
    const content: string[] = [];
    while (i < lines.length && lines[i].trim() !== "---") content.push(lines[i++]);
    i++; // the separator
    while (content.length && !content[0].trim()) content.shift();
    const unescaped = content.map((l) => (l === "\\---" ? "---" : l));
    if (unescaped[0]?.startsWith("\\## ")) unescaped[0] = unescaped[0].slice(1);
    if (label === null && !title && !unescaped.join("").trim()) continue;
    out.push({ label, title, titleEditedAt, content: unescaped.join("\n").replace(/\n+$/, "") });
  }
  return out;
}

export function serializeMaster(containers: MasterContainer[]): string {
  const parts: string[] = [];
  for (const c of containers) {
    if (c.label) parts.push(`[${c.label}](${c.label})`);
    if (c.title.trim()) {
      parts.push(`## ${c.title.trim()}`);
      if (c.titleEditedAt) parts.push(`<!-- title-edited: ${c.titleEditedAt} -->`);
    }
    if (c.content) {
      const lines = c.content.replace(/\s+$/, "").split("\n").map((l) => (l.trim() === "---" ? "\\---" : l));
      if (lines[0]?.startsWith("## ")) lines[0] = `\\${lines[0]}`;
      parts.push("", lines.join("\n"));
    }
    parts.push("", "---", "");
  }
  return parts.join("\n").trimEnd() + "\n";
}

/** The whole book as one Markdown document (for preview and export). */
export function combineMaster(containers: MasterContainer[], title: string): string {
  return [`# ${title}`, ...containers.map((c) => (c.title ? `## ${c.title}\n\n${c.content}` : c.content))].join("\n\n") + "\n";
}
