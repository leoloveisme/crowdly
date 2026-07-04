/**
 * ODT (OpenDocument Text) format importer
 * Parses ODT files (ZIP archives with XML content)
 */

import JSZip from 'jszip';
import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';
import { simpleHtmlToMarkdown } from './html-to-markdown';

/**
 * Imports an ODT file and converts to markdown
 */
export async function importOdt(file: File): Promise<ImportResult> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load the ZIP archive
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Get content.xml
    const contentXml = await zip.file('content.xml')?.async('string');
    if (!contentXml) {
      return {
        success: false,
        error: 'This file appears to be damaged and cannot be opened.',
        errorType: 'corrupt_file',
      };
    }

    // Get meta.xml for metadata
    const metaXml = await zip.file('meta.xml')?.async('string');
    const metadata = parseOdtMeta(metaXml || '');

    // Parse content to HTML
    const html = parseOdtContent(contentXml);

    if (!html || html.trim().length === 0) {
      return {
        success: false,
        error: 'No text content was found in this file.',
        errorType: 'empty_content',
      };
    }

    // Convert HTML to Markdown
    const markdown = simpleHtmlToMarkdown(html);

    const document: ImportedDocument = {
      content: markdown,
      html,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        language: metadata.language,
        originalFormat: ImportFormat.ODT,
        importedAt: new Date(),
        wordCount: countWords(markdown),
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    console.error('ODT import error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not a valid zip') || error.message.includes('Corrupted')) {
        return {
          success: false,
          error: 'This file appears to be damaged and cannot be opened.',
          errorType: 'corrupt_file',
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import ODT file',
      errorType: 'unknown_error',
    };
  }
}

/**
 * Parses ODT meta.xml for metadata
 */
function parseOdtMeta(xml: string): { title?: string; author?: string; language?: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const metadata: { title?: string; author?: string; language?: string } = {};

  // Extract title
  const titleEl = doc.querySelector('title');
  if (titleEl?.textContent) {
    metadata.title = titleEl.textContent.trim();
  }

  // Extract creator/author
  const creatorEl = doc.querySelector('creator');
  if (creatorEl?.textContent) {
    metadata.author = creatorEl.textContent.trim();
  }

  // Extract language
  const languageEl = doc.querySelector('language');
  if (languageEl?.textContent) {
    metadata.language = languageEl.textContent.trim();
  }

  return metadata;
}

/**
 * Parses ODT content.xml to HTML
 */
function parseOdtContent(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const result: string[] = [];

  // Find the office:text element
  const textBody =
    doc.querySelector('text') || doc.querySelector('body') || doc.documentElement;

  // Process all child elements
  processOdtElements(textBody, result);

  return result.join('\n');
}

/**
 * Recursively processes ODT elements into HTML
 */
function processOdtElements(element: Element, result: string[]): void {
  const children = Array.from(element.children);

  for (const child of children) {
    const tagName = child.tagName.toLowerCase();

    // Handle headings (text:h)
    if (tagName === 'text:h' || tagName.endsWith(':h')) {
      const level = child.getAttribute('text:outline-level') || '1';
      const text = getTextContent(child);
      if (text.trim()) {
        result.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
      }
      continue;
    }

    // Handle paragraphs (text:p)
    if (tagName === 'text:p' || tagName.endsWith(':p')) {
      const text = getTextContent(child);
      if (text.trim()) {
        result.push(`<p>${escapeHtml(text)}</p>`);
      } else {
        result.push('<p></p>');
      }
      continue;
    }

    // Handle lists (text:list)
    if (tagName === 'text:list' || tagName.endsWith(':list')) {
      result.push('<ul>');
      processOdtElements(child, result);
      result.push('</ul>');
      continue;
    }

    // Handle list items (text:list-item)
    if (tagName === 'text:list-item' || tagName.endsWith(':list-item')) {
      result.push('<li>');
      processOdtElements(child, result);
      result.push('</li>');
      continue;
    }

    // Handle sections (text:section)
    if (tagName === 'text:section' || tagName.endsWith(':section')) {
      processOdtElements(child, result);
      continue;
    }

    // Recurse into other container elements
    if (child.children.length > 0) {
      processOdtElements(child, result);
    }
  }
}

/**
 * Gets the text content of an element, handling text:span and text:s (spaces)
 */
function getTextContent(element: Element): string {
  let text = '';

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      // Handle spaces (text:s)
      if (tagName === 'text:s' || tagName.endsWith(':s')) {
        const count = parseInt(el.getAttribute('text:c') || '1', 10);
        text += ' '.repeat(count);
      }
      // Handle tabs (text:tab)
      else if (tagName === 'text:tab' || tagName.endsWith(':tab')) {
        text += '\t';
      }
      // Handle line breaks (text:line-break)
      else if (tagName === 'text:line-break' || tagName.endsWith(':line-break')) {
        text += '\n';
      }
      // Handle spans and other elements
      else {
        text += getTextContent(el);
      }
    }
  }

  return text;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
