/**
 * FDX (Final Draft) format exporter
 * Generates Final Draft XML screenplay format
 */

import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { extractTitle } from './markdown-to-html';

/**
 * Exports content to FDX (Final Draft) format
 */
export async function exportToFdx(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const { title = extractTitle(content) || 'Screenplay', author, filename } = options;

    // Generate FDX XML
    const fdxContent = generateFdxXml(content, title, author);

    // Create blob
    const blob = new Blob([fdxContent], { type: 'application/xml;charset=utf-8' });

    const exportFilename = filename || sanitizeFilename(title) + '.fdx';

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    console.error('FDX export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to FDX format',
    };
  }
}

/**
 * Generates Final Draft XML from markdown content
 */
function generateFdxXml(markdown: string, title: string, author?: string): string {
  const paragraphs = parseToScreenplayElements(markdown);

  // Build title page if we have title/author
  let titlePage = '';
  if (title || author) {
    titlePage = `
    <TitlePage>
      <Content>
        <Paragraph>
          <Text>${escapeXml(title)}</Text>
        </Paragraph>
        ${author ? `<Paragraph><Text>by</Text></Paragraph><Paragraph><Text>${escapeXml(author)}</Text></Paragraph>` : ''}
      </Content>
    </TitlePage>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>${titlePage}
    ${paragraphs.join('\n    ')}
  </Content>
</FinalDraft>`;
}

/**
 * Parses markdown into screenplay element objects
 */
function parseToScreenplayElements(markdown: string): string[] {
  const lines = markdown.split('\n');
  const elements: string[] = [];
  let lastType = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty lines - skip but reset context
    if (trimmed === '') {
      lastType = '';
      continue;
    }

    // Headings become scene headings
    if (trimmed.startsWith('#')) {
      const text = trimmed.replace(/^#+\s*/, '').toUpperCase();
      elements.push(createParagraph('Scene Heading', text));
      lastType = 'Scene Heading';
      continue;
    }

    // Check if this looks like a scene heading (INT./EXT.)
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i.test(trimmed)) {
      elements.push(createParagraph('Scene Heading', trimmed.toUpperCase()));
      lastType = 'Scene Heading';
      continue;
    }

    // Check if this looks like a character cue (all caps, centered)
    if (
      trimmed === trimmed.toUpperCase() &&
      /^[A-Z][A-Z\s.'()-]+$/.test(trimmed) &&
      trimmed.length < 40
    ) {
      elements.push(createParagraph('Character', trimmed));
      lastType = 'Character';
      continue;
    }

    // Parentheticals
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      elements.push(createParagraph('Parenthetical', trimmed));
      lastType = 'Parenthetical';
      continue;
    }

    // If previous was character or parenthetical, this is dialogue
    if (lastType === 'Character' || lastType === 'Parenthetical') {
      elements.push(createParagraph('Dialogue', stripMarkdownFormatting(trimmed)));
      lastType = 'Dialogue';
      continue;
    }

    // Check for transition (ends with TO:)
    if (/TO:$/i.test(trimmed)) {
      elements.push(createParagraph('Transition', trimmed.toUpperCase()));
      lastType = 'Transition';
      continue;
    }

    // Default to action
    elements.push(createParagraph('Action', stripMarkdownFormatting(trimmed)));
    lastType = 'Action';
  }

  return elements;
}

/**
 * Creates an FDX Paragraph element
 */
function createParagraph(type: string, text: string): string {
  return `<Paragraph Type="${type}">
      <Text>${escapeXml(text)}</Text>
    </Paragraph>`;
}

/**
 * Strips markdown formatting from text
 */
function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1');
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
