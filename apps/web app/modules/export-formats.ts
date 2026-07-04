/**
 * Self-contained export format module for the web app.
 * Supports PDF, DOCX, EPUB, ODT, FDX, and Fountain exports.
 * Adapted from the platform's src/lib/export/ exporters.
 */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  BorderStyle,
} from "docx";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(title: string, maxLength = 80): string {
  return (
    title
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, maxLength) || "crowdly-export"
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Markdown → HTML (for PDF/EPUB)
// ---------------------------------------------------------------------------

function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Preserve code blocks
  const codeBlocks: string[] = [];
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  const inlineCode: string[] = [];
  html = html.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINE_CODE_${inlineCode.length - 1}__`;
  });

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  // Horizontal rules
  html = html.replace(/^[-*_]{3,}$/gm, "<hr />");

  // Paragraphs
  const lines = html.split("\n");
  const processed = lines.map((line) => {
    const t = line.trim();
    if (t === "") return "";
    if (
      t.match(
        /^<(h[1-6]|ul|ol|li|blockquote|hr|p|div|pre|code|table)/
      )
    )
      return line;
    if (t.startsWith("<") && !t.startsWith("<a") && !t.startsWith("<em") && !t.startsWith("<strong"))
      return line;
    return `<p>${t}</p>`;
  });
  html = processed.join("\n");

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    const content = block.replace(
      /```(\w+)?\n?([\s\S]*?)```/,
      (_, lang, code) => {
        const escaped = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<pre><code class="language-${lang || "text"}">${escaped}</code></pre>`;
      }
    );
    html = html.replace(`__CODE_BLOCK_${i}__`, content);
  });
  inlineCode.forEach((code, i) => {
    const content = code
      .slice(1, -1)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = html.replace(`__INLINE_CODE_${i}__`, `<code>${content}</code>`);
  });

  // Clean up
  html = html.replace(/<p>(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)<\/p>/g, "$1");
  html = html.replace(/<p>(<hr \/>)<\/p>/g, "$1");
  html = html.replace(/<p><\/p>/g, "");

  return html;
}

// ---------------------------------------------------------------------------
// Export result type
// ---------------------------------------------------------------------------

interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  error?: string;
}

interface ExportOptions {
  title?: string;
  author?: string;
  filename?: string;
}

// ---------------------------------------------------------------------------
// PDF Exporter
// ---------------------------------------------------------------------------

async function exportToPdf(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title || extractTitle(content) || "Document";
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margins = { top: 20, right: 20, bottom: 20, left: 20 };
    const contentWidth = pageWidth - margins.left - margins.right;

    const html = markdownToHtml(content);
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${contentWidth * 3.78}px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt; line-height: 1.6; color: #000; background: #fff; padding: 20px;
    `;
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      h1 { font-size: 24pt; margin: 20px 0 10px 0; }
      h2 { font-size: 20pt; margin: 18px 0 8px 0; }
      h3 { font-size: 16pt; margin: 16px 0 6px 0; }
      p { margin: 10px 0; }
      blockquote { border-left: 3px solid #ccc; padding-left: 15px; margin-left: 0; color: #555; }
    `;
    container.appendChild(styleSheet);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageContentHeight = pageHeight - margins.top - margins.bottom;
      let heightLeft = imgHeight;
      let pageNumber = 0;
      const imgData = canvas.toDataURL("image/png");

      while (heightLeft > 0) {
        if (pageNumber > 0) pdf.addPage();
        pdf.addImage(
          imgData, "PNG",
          margins.left,
          margins.top - pageNumber * pageContentHeight,
          imgWidth, imgHeight
        );
        heightLeft -= pageContentHeight;
        pageNumber++;
      }
    } finally {
      document.body.removeChild(container);
    }

    const blob = pdf.output("blob");
    return { success: true, blob, filename: (options.filename || sanitizeFilename(title)) + ".pdf" };
  } catch (error) {
    console.error("PDF export error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to export PDF" };
  }
}

// ---------------------------------------------------------------------------
// DOCX Exporter
// ---------------------------------------------------------------------------

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;
  const patterns = [
    { regex: /\*\*\*(.+?)\*\*\*/, bold: true, italic: true },
    { regex: /\*\*(.+?)\*\*/, bold: true, italic: false },
    { regex: /\*(.+?)\*/, bold: false, italic: true },
    { regex: /__(.+?)__/, bold: true, italic: false },
    { regex: /_(.+?)_/, bold: false, italic: true },
    { regex: /~~(.+?)~~/, strike: true },
  ];

  while (remaining.length > 0) {
    let earliest: { index: number; length: number; text: string; format: Record<string, unknown> } | null = null;
    for (const p of patterns) {
      const m = remaining.match(p.regex);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.index) {
          earliest = { index: m.index, length: m[0].length, text: m[1], format: p as Record<string, unknown> };
        }
      }
    }
    if (earliest) {
      if (earliest.index > 0) runs.push(new TextRun({ text: remaining.slice(0, earliest.index) }));
      const fmt = earliest.format as { bold?: boolean; italic?: boolean; strike?: boolean };
      runs.push(new TextRun({ text: earliest.text, bold: fmt.bold, italics: fmt.italic, strike: fmt.strike }));
      remaining = remaining.slice(earliest.index + earliest.length);
    } else {
      runs.push(new TextRun({ text: remaining }));
      break;
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

async function exportToDocx(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title || extractTitle(content) || "Document";
    const lines = content.split("\n");
    const elements: Paragraph[] = [];

    for (const line of lines) {
      if (line.trim() === "") { elements.push(new Paragraph({ children: [] })); continue; }
      const h1 = line.match(/^#\s+(.+)$/);
      if (h1) { elements.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 })); continue; }
      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) { elements.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 })); continue; }
      const h3 = line.match(/^###\s+(.+)$/);
      if (h3) { elements.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 })); continue; }
      const quote = line.match(/^>\s+(.+)$/);
      if (quote) {
        elements.push(new Paragraph({
          children: parseInlineFormatting(quote[1]),
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "CCCCCC" } },
        }));
        continue;
      }
      elements.push(new Paragraph({ children: parseInlineFormatting(line) }));
    }

    const doc = new Document({
      creator: options.author || "Crowdly",
      title,
      description: "Exported from Crowdly",
      sections: [{ properties: {}, children: elements }],
    });

    const blob = await Packer.toBlob(doc);
    return { success: true, blob, filename: (options.filename || sanitizeFilename(title)) + ".docx" };
  } catch (error) {
    console.error("DOCX export error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to export DOCX" };
  }
}

// ---------------------------------------------------------------------------
// EPUB Exporter
// ---------------------------------------------------------------------------

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function exportToEpub(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title || extractTitle(content) || "Document";
    const author = options.author || "Unknown";
    const uuid = generateUUID();
    const zip = new JSZip();

    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    // Split content into chapters by H1
    const lines = content.split("\n");
    const chapters: { title: string; lines: string[] }[] = [];
    let cur: { title: string; lines: string[] } | null = null;
    for (const line of lines) {
      const h1 = line.match(/^#\s+(.+)$/);
      if (h1) {
        if (cur) chapters.push(cur);
        cur = { title: h1[1], lines: [line] };
      } else if (cur) {
        cur.lines.push(line);
      } else {
        cur = { title: "Introduction", lines: [line] };
      }
    }
    if (cur) chapters.push(cur);
    if (chapters.length === 0) chapters.push({ title: "Content", lines: content.split("\n") });

    const chapterFiles: { id: string; href: string; title: string }[] = [];
    chapters.forEach((ch, i) => {
      const id = `chapter${i + 1}`;
      const href = `${id}.xhtml`;
      const html = markdownToHtml(ch.lines.join("\n"));
      zip.file(
        `OEBPS/${href}`,
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(ch.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${html}</body>
</html>`
      );
      chapterFiles.push({ id, href, title: ch.title });
    });

    zip.file(
      "OEBPS/styles.css",
      `body { font-family: Georgia, serif; line-height: 1.6; margin: 1em; }
h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
p { margin: 1em 0; text-indent: 1.5em; }
p:first-of-type { text-indent: 0; }`
    );

    const manifest = chapterFiles
      .map((c) => `    <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
      .join("\n");
    const spine = chapterFiles.map((c) => `    <itemref idref="${c.id}"/>`).join("\n");

    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav"/>
${spine}
  </spine>
</package>`
    );

    const navPoints = chapterFiles
      .map(
        (c, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`
      )
      .join("\n");

    zip.file(
      "OEBPS/toc.ncx",
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`
    );

    const navItems = chapterFiles
      .map((c) => `        <li><a href="${c.href}">${escapeXml(c.title)}</a></li>`)
      .join("\n");

    zip.file(
      "OEBPS/nav.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`
    );

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    return { success: true, blob, filename: (options.filename || sanitizeFilename(title)) + ".epub" };
  } catch (error) {
    console.error("EPUB export error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to export EPUB" };
  }
}

// ---------------------------------------------------------------------------
// ODT Exporter
// ---------------------------------------------------------------------------

function formatInlineTextOdt(text: string): string {
  let result = escapeXml(text);
  result = result.replace(/\*\*(.+?)\*\*/g, '<text:span text:style-name="Bold">$1</text:span>');
  result = result.replace(/__(.+?)__/g, '<text:span text:style-name="Bold">$1</text:span>');
  result = result.replace(/\*(.+?)\*/g, '<text:span text:style-name="Italic">$1</text:span>');
  result = result.replace(/_(.+?)_/g, '<text:span text:style-name="Italic">$1</text:span>');
  return result;
}

async function exportToOdt(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title || extractTitle(content) || "Document";
    const zip = new JSZip();

    zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });

    zip.file(
      "META-INF/manifest.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
</manifest:manifest>`
    );

    zip.file(
      "meta.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">
  <office:meta>
    <dc:title>${escapeXml(title)}</dc:title>
    ${options.author ? `<dc:creator>${escapeXml(options.author)}</dc:creator>` : ""}
    <dc:language>en</dc:language>
    <meta:creation-date>${new Date().toISOString()}</meta:creation-date>
    <meta:generator>Crowdly</meta:generator>
  </office:meta>
</office:document-meta>`
    );

    zip.file(
      "styles.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:styles>
    <style:style style:name="Heading_1" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.25cm"/><style:text-properties fo:font-size="24pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_2" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="20pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Heading_3" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
    <style:style style:name="Text_body" style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm"/><style:text-properties fo:font-size="12pt"/></style:style>
    <style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
    <style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
  </office:styles>
</office:document-styles>`
    );

    // Generate content.xml from markdown
    const lines = content.split("\n");
    const paragraphs: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === "") { paragraphs.push('<text:p text:style-name="Text_body"/>'); continue; }
      const h1 = t.match(/^#\s+(.+)$/);
      if (h1) { paragraphs.push(`<text:h text:style-name="Heading_1" text:outline-level="1">${escapeXml(h1[1])}</text:h>`); continue; }
      const h2 = t.match(/^##\s+(.+)$/);
      if (h2) { paragraphs.push(`<text:h text:style-name="Heading_2" text:outline-level="2">${escapeXml(h2[1])}</text:h>`); continue; }
      const h3 = t.match(/^###\s+(.+)$/);
      if (h3) { paragraphs.push(`<text:h text:style-name="Heading_3" text:outline-level="3">${escapeXml(h3[1])}</text:h>`); continue; }
      paragraphs.push(`<text:p text:style-name="Text_body">${formatInlineTextOdt(t)}</text:p>`);
    }

    zip.file(
      "content.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:body>
    <office:text>
      ${paragraphs.join("\n      ")}
    </office:text>
  </office:body>
</office:document-content>`
    );

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.oasis.opendocument.text",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    return { success: true, blob, filename: (options.filename || sanitizeFilename(title)) + ".odt" };
  } catch (error) {
    console.error("ODT export error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to export ODT" };
  }
}

// ---------------------------------------------------------------------------
// FDX (Final Draft) Exporter
// ---------------------------------------------------------------------------

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/___(.+?)___/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

function createFdxParagraph(type: string, text: string): string {
  return `<Paragraph Type="${type}">
      <Text>${escapeXml(text)}</Text>
    </Paragraph>`;
}

async function exportToFdx(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title || extractTitle(content) || "Screenplay";
    const lines = content.split("\n");
    const elements: string[] = [];
    let lastType = "";

    for (const line of lines) {
      const t = line.trim();
      if (t === "") { lastType = ""; continue; }
      if (t.startsWith("#")) {
        const text = t.replace(/^#+\s*/, "").toUpperCase();
        elements.push(createFdxParagraph("Scene Heading", text));
        lastType = "Scene Heading";
        continue;
      }
      if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i.test(t)) {
        elements.push(createFdxParagraph("Scene Heading", t.toUpperCase()));
        lastType = "Scene Heading";
        continue;
      }
      if (t === t.toUpperCase() && /^[A-Z][A-Z\s.'()-]+$/.test(t) && t.length < 40) {
        elements.push(createFdxParagraph("Character", t));
        lastType = "Character";
        continue;
      }
      if (t.startsWith("(") && t.endsWith(")")) {
        elements.push(createFdxParagraph("Parenthetical", t));
        lastType = "Parenthetical";
        continue;
      }
      if (lastType === "Character" || lastType === "Parenthetical") {
        elements.push(createFdxParagraph("Dialogue", stripMarkdownFormatting(t)));
        lastType = "Dialogue";
        continue;
      }
      if (/TO:$/i.test(t)) {
        elements.push(createFdxParagraph("Transition", t.toUpperCase()));
        lastType = "Transition";
        continue;
      }
      elements.push(createFdxParagraph("Action", stripMarkdownFormatting(t)));
      lastType = "Action";
    }

    let titlePage = "";
    if (title || options.author) {
      titlePage = `
    <TitlePage>
      <Content>
        <Paragraph><Text>${escapeXml(title)}</Text></Paragraph>
        ${options.author ? `<Paragraph><Text>by</Text></Paragraph><Paragraph><Text>${escapeXml(options.author)}</Text></Paragraph>` : ""}
      </Content>
    </TitlePage>`;
    }

    const fdxContent = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>${titlePage}
    ${elements.join("\n    ")}
  </Content>
</FinalDraft>`;

    const blob = new Blob([fdxContent], { type: "application/xml;charset=utf-8" });
    return { success: true, blob, filename: (options.filename || sanitizeFilename(title)) + ".fdx" };
  } catch (error) {
    console.error("FDX export error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to export FDX" };
  }
}

// ---------------------------------------------------------------------------
// Fountain Exporter
// ---------------------------------------------------------------------------

async function exportToFountain(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const title = options.title;
    let fountain = "";

    if (title || options.author) {
      if (title) fountain += `Title: ${title}\n`;
      if (options.author) fountain += `Author: ${options.author}\n`;
      fountain += "\n===\n\n";
    }

    const lines = content.split("\n");
    const result: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === "") { result.push(""); continue; }
      if (t.startsWith("#")) {
        const headingText = t.replace(/^#+\s*/, "").toUpperCase();
        if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/.test(headingText)) {
          result.push(headingText);
        } else {
          result.push(`.${headingText}`);
        }
        result.push("");
        continue;
      }
      if (t === t.toUpperCase() && t.length > 0 && /^[A-Z\s]+$/.test(t)) {
        result.push("");
        result.push(t);
        continue;
      }
      if (t.startsWith("(") && t.endsWith(")")) {
        result.push(t);
        continue;
      }
      const text = t
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/_(.+?)_/g, "$1");
      result.push(text);
    }
    fountain += result.join("\n");

    const blob = new Blob([fountain], { type: "text/plain;charset=utf-8" });
    return {
      success: true,
      blob,
      filename: (options.filename || sanitizeFilename(title || "screenplay")) + ".fountain",
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to export Fountain" };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExportFormatType = "pdf" | "docx" | "epub" | "odt" | "fdx" | "fountain";

export async function exportAndDownload(
  markdown: string,
  format: ExportFormatType,
  options: ExportOptions = {}
): Promise<{ success: boolean; error?: string }> {
  let result: ExportResult;

  switch (format) {
    case "pdf":
      result = await exportToPdf(markdown, options);
      break;
    case "docx":
      result = await exportToDocx(markdown, options);
      break;
    case "epub":
      result = await exportToEpub(markdown, options);
      break;
    case "odt":
      result = await exportToOdt(markdown, options);
      break;
    case "fdx":
      result = await exportToFdx(markdown, options);
      break;
    case "fountain":
      result = await exportToFountain(markdown, options);
      break;
    default:
      return { success: false, error: `Unsupported format: ${format}` };
  }

  if (result.success && result.blob && result.filename) {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  }

  return { success: false, error: result.error || "Export failed" };
}
