/**
 * Fountain format exporter
 * Converts markdown/content to Fountain screenplay format
 */

import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';

/**
 * Exports content to Fountain format
 * Fountain is a plain text markup language for screenwriting
 */
export async function exportToFountain(
  content: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const { title, author, filename } = options;

    // Build Fountain document
    let fountain = '';

    // Title page metadata (if provided)
    if (title || author) {
      if (title) {
        fountain += `Title: ${title}\n`;
      }
      if (author) {
        fountain += `Author: ${author}\n`;
      }
      fountain += '\n===\n\n'; // Page break after title page
    }

    // Convert markdown content to Fountain
    fountain += convertToFountain(content);

    // Create blob
    const blob = new Blob([fountain], { type: 'text/plain;charset=utf-8' });

    const exportFilename = filename || sanitizeFilename(title || 'screenplay') + '.fountain';

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to Fountain format',
    };
  }
}

/**
 * Converts markdown content to Fountain format
 */
function convertToFountain(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty lines pass through
    if (trimmed === '') {
      result.push('');
      continue;
    }

    // Headings become scene headings (INT./EXT.)
    if (trimmed.startsWith('#')) {
      const headingText = trimmed.replace(/^#+\s*/, '').toUpperCase();

      // If it already looks like a scene heading, use it
      if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/.test(headingText)) {
        result.push(headingText);
      } else {
        // Otherwise, prefix with period to force as scene heading
        result.push(`.${headingText}`);
      }
      result.push('');
      continue;
    }

    // Check if line looks like character cue (all caps)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 0 && /^[A-Z\s]+$/.test(trimmed)) {
      result.push('');
      result.push(trimmed);
      continue;
    }

    // Check for parentheticals
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      result.push(trimmed);
      continue;
    }

    // Regular text becomes action
    // Remove markdown formatting
    let text = trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.+?)\*/g, '$1') // Remove italic
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1');

    result.push(text);
  }

  return result.join('\n');
}
