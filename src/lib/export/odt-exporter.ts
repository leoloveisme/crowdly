/**
 * ODT (OpenDocument Text) format exporter
 * Uses JSZip to generate ODT files (which are ZIP archives)
 */

import JSZip from 'jszip';
import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { extractTitle } from './markdown-to-html';

/**
 * Exports content to ODT format
 */
export async function exportToOdt(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const { title = extractTitle(content) || 'Document', author, language = 'en', filename } = options;

    // Create a new ZIP archive (ODT is a ZIP file)
    const zip = new JSZip();

    // Add mimetype file (must be first and uncompressed)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });

    // Add manifest
    zip.file(
      'META-INF/manifest.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
</manifest:manifest>`
    );

    // Add meta.xml
    const now = new Date().toISOString();
    zip.file(
      'meta.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">
  <office:meta>
    <dc:title>${escapeXml(title)}</dc:title>
    ${author ? `<dc:creator>${escapeXml(author)}</dc:creator>` : ''}
    <dc:language>${language}</dc:language>
    <meta:creation-date>${now}</meta:creation-date>
    <meta:generator>Crowdly</meta:generator>
  </office:meta>
</office:document-meta>`
    );

    // Add styles.xml
    zip.file('styles.xml', generateStyles());

    // Add content.xml
    const contentXml = generateContentXml(content);
    zip.file('content.xml', contentXml);

    // Generate the ZIP file
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.oasis.opendocument.text',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const exportFilename = filename || sanitizeFilename(title) + '.odt';

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    console.error('ODT export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to ODT format',
    };
  }
}

/**
 * Generates the styles.xml content
 */
function generateStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:styles>
    <style:style style:name="Heading_1" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.25cm"/>
      <style:text-properties fo:font-size="24pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Heading_2" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm"/>
      <style:text-properties fo:font-size="20pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Heading_3" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm"/>
      <style:text-properties fo:font-size="16pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Heading_4" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.25cm" fo:margin-bottom="0.1cm"/>
      <style:text-properties fo:font-size="14pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Text_body" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm"/>
      <style:text-properties fo:font-size="12pt"/>
    </style:style>
    <style:style style:name="Quotation" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-left="1cm" fo:margin-top="0.1cm" fo:margin-bottom="0.1cm"/>
      <style:text-properties fo:font-size="12pt" fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Preformatted_Text" style:family="paragraph" style:class="text">
      <style:text-properties fo:font-family="Courier New" fo:font-size="10pt"/>
    </style:style>
    <style:style style:name="Bold" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Italic" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
  </office:styles>
</office:document-styles>`;
}

/**
 * Generates the content.xml from markdown
 */
function generateContentXml(markdown: string): string {
  const lines = markdown.split('\n');
  const paragraphs: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      paragraphs.push('<text:p text:style-name="Text_body"/>');
      continue;
    }

    // Headings
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      paragraphs.push(
        `<text:h text:style-name="Heading_1" text:outline-level="1">${escapeXml(h1Match[1])}</text:h>`
      );
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      paragraphs.push(
        `<text:h text:style-name="Heading_2" text:outline-level="2">${escapeXml(h2Match[1])}</text:h>`
      );
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      paragraphs.push(
        `<text:h text:style-name="Heading_3" text:outline-level="3">${escapeXml(h3Match[1])}</text:h>`
      );
      continue;
    }

    const h4Match = trimmed.match(/^####\s+(.+)$/);
    if (h4Match) {
      paragraphs.push(
        `<text:h text:style-name="Heading_4" text:outline-level="4">${escapeXml(h4Match[1])}</text:h>`
      );
      continue;
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      paragraphs.push(
        `<text:p text:style-name="Quotation">${formatInlineText(quoteMatch[1])}</text:p>`
      );
      continue;
    }

    // Regular paragraph
    paragraphs.push(`<text:p text:style-name="Text_body">${formatInlineText(trimmed)}</text:p>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:body>
    <office:text>
      ${paragraphs.join('\n      ')}
    </office:text>
  </office:body>
</office:document-content>`;
}

/**
 * Formats inline markdown (bold, italic) to ODT XML
 */
function formatInlineText(text: string): string {
  let result = escapeXml(text);

  // Bold
  result = result.replace(
    /\*\*(.+?)\*\*/g,
    '<text:span text:style-name="Bold">$1</text:span>'
  );
  result = result.replace(
    /__(.+?)__/g,
    '<text:span text:style-name="Bold">$1</text:span>'
  );

  // Italic
  result = result.replace(
    /\*(.+?)\*/g,
    '<text:span text:style-name="Italic">$1</text:span>'
  );
  result = result.replace(
    /_(.+?)_/g,
    '<text:span text:style-name="Italic">$1</text:span>'
  );

  return result;
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
