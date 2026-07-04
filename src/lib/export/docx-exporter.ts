/**
 * DOCX format exporter
 * Uses docx.js library to generate Word documents
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { extractTitle } from './markdown-to-html';

/**
 * Exports content to DOCX format
 */
export async function exportToDocx(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const { title = extractTitle(content) || 'Document', author, filename } = options;

    // Parse markdown into document elements
    const elements = parseMarkdownToDocxElements(content);

    // Create the document
    const doc = new Document({
      creator: author || 'Crowdly',
      title: title,
      description: 'Exported from Crowdly',
      sections: [
        {
          properties: {},
          children: elements,
        },
      ],
    });

    // Generate the document
    const blob = await Packer.toBlob(doc);

    const exportFilename = filename || sanitizeFilename(title) + '.docx';

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    console.error('DOCX export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to DOCX format',
    };
  }
}

/**
 * Parses markdown content into docx.js Paragraph elements
 */
function parseMarkdownToDocxElements(markdown: string): Paragraph[] {
  const lines = markdown.split('\n');
  const elements: Paragraph[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeBlockContent.join('\n'),
                font: 'Courier New',
                size: 20, // 10pt
              }),
            ],
            border: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
            shading: { fill: 'F5F5F5' },
          })
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(new Paragraph({ children: [] }));
      continue;
    }

    // Headers
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      elements.push(
        new Paragraph({
          text: h1Match[1],
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      elements.push(
        new Paragraph({
          text: h2Match[1],
          heading: HeadingLevel.HEADING_2,
        })
      );
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      elements.push(
        new Paragraph({
          text: h3Match[1],
          heading: HeadingLevel.HEADING_3,
        })
      );
      continue;
    }

    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      elements.push(
        new Paragraph({
          text: h4Match[1],
          heading: HeadingLevel.HEADING_4,
        })
      );
      continue;
    }

    // Blockquotes
    const quoteMatch = line.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      elements.push(
        new Paragraph({
          children: parseInlineFormatting(quoteMatch[1]),
          indent: { left: 720 }, // 0.5 inch
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC' },
          },
        })
      );
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(
        new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' },
          },
        })
      );
      continue;
    }

    // Regular paragraph with inline formatting
    elements.push(
      new Paragraph({
        children: parseInlineFormatting(line),
      })
    );
  }

  return elements;
}

/**
 * Parses inline markdown formatting into TextRun elements
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;

  // Simple regex-based parsing for bold, italic, and code
  const patterns = [
    { regex: /\*\*\*(.+?)\*\*\*/, bold: true, italic: true },
    { regex: /\*\*(.+?)\*\*/, bold: true, italic: false },
    { regex: /\*(.+?)\*/, bold: false, italic: true },
    { regex: /___(.+?)___/, bold: true, italic: true },
    { regex: /__(.+?)__/, bold: true, italic: false },
    { regex: /_(.+?)_/, bold: false, italic: true },
    { regex: /`(.+?)`/, code: true },
    { regex: /~~(.+?)~~/, strike: true },
  ];

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; text: string; format: object } | null =
      null;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            length: match[0].length,
            text: match[1],
            format: pattern,
          };
        }
      }
    }

    if (earliestMatch) {
      // Add text before the match
      if (earliestMatch.index > 0) {
        runs.push(new TextRun({ text: remaining.slice(0, earliestMatch.index) }));
      }

      // Add the formatted text
      const format = earliestMatch.format as {
        bold?: boolean;
        italic?: boolean;
        code?: boolean;
        strike?: boolean;
      };
      runs.push(
        new TextRun({
          text: earliestMatch.text,
          bold: format.bold,
          italics: format.italic,
          font: format.code ? 'Courier New' : undefined,
          strike: format.strike,
          shading: format.code ? { fill: 'F5F5F5' } : undefined,
        })
      );

      remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
    } else {
      // No more formatting, add the rest as plain text
      runs.push(new TextRun({ text: remaining }));
      break;
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}
