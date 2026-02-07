/**
 * DOCX format importer
 * Uses mammoth.js for Word document parsing
 */

import mammoth from 'mammoth';
import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';
import { htmlToMarkdown } from './html-to-markdown';

/**
 * Imports a DOCX file and converts to markdown
 */
export async function importDocx(file: File): Promise<ImportResult> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Convert to HTML using mammoth
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "b => strong",
          "i => em",
          "u => u",
          "strike => del",
        ],
      }
    );

    const html = result.value;

    if (!html || html.trim().length === 0) {
      return {
        success: false,
        error: 'No text content was found in this file.',
        errorType: 'empty_content',
      };
    }

    // Log any warnings (for debugging)
    if (result.messages.length > 0) {
      console.log('DOCX import messages:', result.messages);
    }

    // Convert HTML to Markdown
    const markdown = htmlToMarkdown(html);

    // Extract title from first heading
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : undefined;

    const document: ImportedDocument = {
      content: markdown,
      html,
      metadata: {
        title,
        originalFormat: ImportFormat.DOCX,
        importedAt: new Date(),
        wordCount: countWords(markdown),
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    console.error('DOCX import error:', error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('Could not find')) {
        return {
          success: false,
          error: 'This file appears to be damaged and cannot be opened.',
          errorType: 'corrupt_file',
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import Word document',
      errorType: 'unknown_error',
    };
  }
}

/**
 * Counts words in text
 */
function countWords(text: string): number {
  return text
    .replace(/[#*_~`\[\]()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
