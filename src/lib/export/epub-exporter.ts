/**
 * EPUB format exporter
 * Uses JSZip to generate EPUB files (which are ZIP archives)
 */

import JSZip from 'jszip';
import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { markdownToHtml, extractTitle } from './markdown-to-html';

/**
 * Exports content to EPUB format
 */
export async function exportToEpub(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const {
      title = extractTitle(content) || 'Document',
      author = 'Unknown',
      language = 'en',
      filename,
    } = options;

    // Create a unique identifier
    const uuid = generateUUID();

    // Create a new ZIP archive (EPUB is a ZIP file)
    const zip = new JSZip();

    // Add mimetype file (must be first and uncompressed)
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // Add container.xml
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    // Convert markdown to HTML chapters
    const chapters = splitIntoChapters(content);
    const chapterFiles: { id: string; href: string; title: string }[] = [];

    // Add chapter files
    chapters.forEach((chapter, index) => {
      const chapterId = `chapter${index + 1}`;
      const chapterHref = `${chapterId}.xhtml`;
      const chapterHtml = createChapterXhtml(chapter.content, chapter.title);

      zip.file(`OEBPS/${chapterHref}`, chapterHtml);
      chapterFiles.push({
        id: chapterId,
        href: chapterHref,
        title: chapter.title || `Chapter ${index + 1}`,
      });
    });

    // Add stylesheet
    zip.file(
      'OEBPS/styles.css',
      `body {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.6;
  margin: 1em;
  text-align: justify;
}
h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  text-align: left;
}
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p { margin: 1em 0; text-indent: 1.5em; }
p:first-of-type { text-indent: 0; }
blockquote {
  border-left: 3px solid #ccc;
  margin-left: 0;
  padding-left: 1em;
  font-style: italic;
}
code {
  font-family: 'Courier New', Courier, monospace;
  background: #f5f5f5;
  padding: 0.2em 0.4em;
}
pre {
  background: #f5f5f5;
  padding: 1em;
  overflow-x: auto;
  white-space: pre-wrap;
}
`
    );

    // Add content.opf
    const manifest = chapterFiles
      .map((c) => `    <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
      .join('\n');
    const spine = chapterFiles.map((c) => `    <itemref idref="${c.id}"/>`).join('\n');

    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
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

    // Add NCX (for older readers)
    const navPoints = chapterFiles
      .map(
        (c, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`
      )
      .join('\n');

    zip.file(
      'OEBPS/toc.ncx',
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

    // Add navigation document (EPUB3)
    const navItems = chapterFiles
      .map((c) => `        <li><a href="${c.href}">${escapeXml(c.title)}</a></li>`)
      .join('\n');

    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
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

    // Generate the EPUB file
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const exportFilename = filename || sanitizeFilename(title) + '.epub';

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    console.error('EPUB export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to EPUB format',
    };
  }
}

/**
 * Splits markdown content into chapters based on H1 headings
 */
function splitIntoChapters(markdown: string): { title: string; content: string }[] {
  const lines = markdown.split('\n');
  const chapters: { title: string; content: string }[] = [];
  let currentChapter: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);

    if (h1Match) {
      // Save previous chapter
      if (currentChapter) {
        chapters.push({
          title: currentChapter.title,
          content: currentChapter.lines.join('\n'),
        });
      }
      // Start new chapter
      currentChapter = { title: h1Match[1], lines: [line] };
    } else if (currentChapter) {
      currentChapter.lines.push(line);
    } else {
      // Content before first heading - create untitled chapter
      currentChapter = { title: 'Introduction', lines: [line] };
    }
  }

  // Save last chapter
  if (currentChapter) {
    chapters.push({
      title: currentChapter.title,
      content: currentChapter.lines.join('\n'),
    });
  }

  // If no chapters, create one with all content
  if (chapters.length === 0) {
    chapters.push({ title: 'Content', content: markdown });
  }

  return chapters;
}

/**
 * Creates XHTML for a chapter
 */
function createChapterXhtml(markdown: string, title: string): string {
  const html = markdownToHtml(markdown, { wrapInDocument: false, includeStyles: false });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Escapes special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
