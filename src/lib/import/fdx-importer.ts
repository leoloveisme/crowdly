/**
 * FDX (Final Draft) format importer
 * Parses Final Draft XML screenplay format into markdown
 */

import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';

/**
 * Imports an FDX file and converts to markdown
 */
export async function importFdx(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'No content was found in this file.',
        errorType: 'empty_content',
      };
    }

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return {
        success: false,
        error: 'This file appears to be damaged and cannot be opened.',
        errorType: 'corrupt_file',
      };
    }

    const { content, metadata } = parseFdxDocument(doc);

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: 'No text content was found in this file.',
        errorType: 'empty_content',
      };
    }

    const document: ImportedDocument = {
      content,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        originalFormat: ImportFormat.FDX,
        importedAt: new Date(),
        wordCount: countWords(content),
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import FDX file',
      errorType: 'unknown_error',
    };
  }
}

interface FdxMetadata {
  title?: string;
  author?: string;
}

/**
 * Parses an FDX document into markdown content and metadata
 */
function parseFdxDocument(doc: Document): { content: string; metadata: FdxMetadata } {
  const result: string[] = [];
  const metadata: FdxMetadata = {};

  // Extract title page metadata
  const titlePage = doc.querySelector('TitlePage');
  if (titlePage) {
    const content = titlePage.querySelector('Content');
    if (content) {
      const paragraphs = content.querySelectorAll('Paragraph');
      let foundTitle = false;
      let foundBy = false;

      paragraphs.forEach((p) => {
        const textNode = p.querySelector('Text');
        const text = textNode?.textContent?.trim();

        if (text) {
          if (!foundTitle) {
            metadata.title = text;
            foundTitle = true;
          } else if (text.toLowerCase() === 'by') {
            foundBy = true;
          } else if (foundBy && !metadata.author) {
            metadata.author = text;
          }
        }
      });
    }
  }

  // Add title as heading
  if (metadata.title) {
    result.push(`# ${metadata.title}`);
    result.push('');
  }

  // Process content paragraphs
  const contentElement = doc.querySelector('Content');
  if (contentElement) {
    const paragraphs = contentElement.querySelectorAll(':scope > Paragraph');
    let lastType = '';

    paragraphs.forEach((p) => {
      const type = p.getAttribute('Type') || 'Action';
      const textNode = p.querySelector('Text');
      const text = textNode?.textContent?.trim() || '';

      if (!text) {
        result.push('');
        return;
      }

      switch (type) {
        case 'Scene Heading':
          result.push('');
          result.push(`## ${text}`);
          break;

        case 'Action':
          if (lastType !== 'Action') {
            result.push('');
          }
          result.push(text);
          break;

        case 'Character':
          result.push('');
          result.push(`**${text}**`);
          break;

        case 'Parenthetical':
          result.push(`*(${text.replace(/^\(/, '').replace(/\)$/, '')})*`);
          break;

        case 'Dialogue':
          result.push(text);
          break;

        case 'Transition':
          result.push('');
          result.push(`*${text}*`);
          break;

        case 'Shot':
          result.push('');
          result.push(`### ${text}`);
          break;

        case 'General':
        default:
          result.push('');
          result.push(text);
          break;
      }

      lastType = type;
    });
  }

  return {
    content: result.join('\n').trim(),
    metadata,
  };
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
