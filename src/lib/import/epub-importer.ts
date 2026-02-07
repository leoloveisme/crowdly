/**
 * EPUB format importer
 * Parses EPUB files (ZIP archives with XHTML content)
 */

import JSZip from 'jszip';
import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';
import { htmlToMarkdown, simpleHtmlToMarkdown } from './html-to-markdown';

/**
 * Imports an EPUB file and converts to markdown
 */
export async function importEpub(file: File): Promise<ImportResult> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load the ZIP archive
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Parse container.xml to find the OPF file
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) {
      return {
        success: false,
        error: 'This file appears to be damaged and cannot be opened.',
        errorType: 'corrupt_file',
      };
    }

    const opfPath = getOpfPath(containerXml);
    if (!opfPath) {
      return {
        success: false,
        error: 'This EPUB file has an invalid structure.',
        errorType: 'corrupt_file',
      };
    }

    // Get the directory containing the OPF file
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // Parse the OPF file
    const opfXml = await zip.file(opfPath)?.async('string');
    if (!opfXml) {
      return {
        success: false,
        error: 'This EPUB file has an invalid structure.',
        errorType: 'corrupt_file',
      };
    }

    const { metadata, spineItems } = parseOpf(opfXml);

    // Read content files in spine order
    const contentParts: string[] = [];

    for (const item of spineItems) {
      const itemPath = opfDir + item.href;
      const content = await zip.file(itemPath)?.async('string');

      if (content) {
        // Convert XHTML to markdown
        const markdown = convertEpubContent(content);
        if (markdown.trim()) {
          contentParts.push(markdown);
        }
      }
    }

    const fullContent = contentParts.join('\n\n---\n\n');

    if (!fullContent.trim()) {
      return {
        success: false,
        error: 'No text content was found in this file.',
        errorType: 'empty_content',
      };
    }

    // Add title as heading if not already present
    let markdown = fullContent;
    if (metadata.title && !markdown.startsWith('# ')) {
      markdown = `# ${metadata.title}\n\n${markdown}`;
    }

    // Count chapters (h1 or h2 headings)
    const chapterCount = (markdown.match(/^##?\s+/gm) || []).length;

    const document: ImportedDocument = {
      content: markdown,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        language: metadata.language,
        originalFormat: ImportFormat.EPUB,
        importedAt: new Date(),
        wordCount: countWords(markdown),
        chapterCount,
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    console.error('EPUB import error:', error);

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
      error: error instanceof Error ? error.message : 'Failed to import EPUB file',
      errorType: 'unknown_error',
    };
  }
}

/**
 * Gets the OPF file path from container.xml
 */
function getOpfPath(containerXml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(containerXml, 'application/xml');

  const rootfile = doc.querySelector('rootfile');
  return rootfile?.getAttribute('full-path') || null;
}

interface SpineItem {
  id: string;
  href: string;
}

interface EpubMetadata {
  title?: string;
  author?: string;
  language?: string;
}

/**
 * Parses the OPF file for metadata and spine
 */
function parseOpf(opfXml: string): { metadata: EpubMetadata; spineItems: SpineItem[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfXml, 'application/xml');

  const metadata: EpubMetadata = {};

  // Extract metadata
  const titleEl = doc.querySelector('title');
  if (titleEl?.textContent) {
    metadata.title = titleEl.textContent.trim();
  }

  const creatorEl = doc.querySelector('creator');
  if (creatorEl?.textContent) {
    metadata.author = creatorEl.textContent.trim();
  }

  const languageEl = doc.querySelector('language');
  if (languageEl?.textContent) {
    metadata.language = languageEl.textContent.trim();
  }

  // Build manifest map (id -> href)
  const manifestMap = new Map<string, string>();
  const manifestItems = doc.querySelectorAll('manifest item');
  manifestItems.forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifestMap.set(id, href);
    }
  });

  // Build spine order
  const spineItems: SpineItem[] = [];
  const spineItemRefs = doc.querySelectorAll('spine itemref');
  spineItemRefs.forEach((itemref) => {
    const idref = itemref.getAttribute('idref');
    if (idref) {
      const href = manifestMap.get(idref);
      if (href && (href.endsWith('.xhtml') || href.endsWith('.html') || href.endsWith('.htm'))) {
        spineItems.push({ id: idref, href });
      }
    }
  });

  return { metadata, spineItems };
}

/**
 * Converts EPUB XHTML content to markdown
 */
function convertEpubContent(xhtml: string): string {
  // Extract body content
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : xhtml;

  // Try turndown first, fall back to simple conversion
  try {
    return htmlToMarkdown(bodyContent);
  } catch {
    return simpleHtmlToMarkdown(bodyContent);
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
