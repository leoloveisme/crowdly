/**
 * PDF format importer
 * Uses pdf.js for PDF parsing
 */

import * as pdfjsLib from 'pdfjs-dist';
import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';

// Set up the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Imports a PDF file and extracts text as markdown
 */
export async function importPdf(file: File): Promise<ImportResult> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const numPages = pdf.numPages;
    const textContent: string[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      // Process text items
      const pageText = processPageText(content.items);
      if (pageText.trim()) {
        textContent.push(pageText);
      }
    }

    const markdown = textContent.join('\n\n---\n\n');

    if (!markdown.trim()) {
      return {
        success: false,
        error:
          'This PDF appears to be image-only. Text extraction failed. Try a different format or ensure the file contains text.',
        errorType: 'empty_content',
      };
    }

    // Try to extract title from first line
    const lines = markdown.split('\n');
    let title: string | undefined;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('---')) {
        title = trimmed;
        break;
      }
    }

    const document: ImportedDocument = {
      content: markdown,
      metadata: {
        title,
        originalFormat: ImportFormat.PDF,
        importedAt: new Date(),
        wordCount: countWords(markdown),
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    console.error('PDF import error:', error);

    if (error instanceof Error) {
      if (
        error.message.includes('Invalid PDF') ||
        error.message.includes('Missing PDF')
      ) {
        return {
          success: false,
          error: 'This file appears to be damaged and cannot be opened.',
          errorType: 'corrupt_file',
        };
      }
      if (error.message.includes('password')) {
        return {
          success: false,
          error: 'This PDF is password-protected. Please remove the password and try again.',
          errorType: 'corrupt_file',
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import PDF file',
      errorType: 'unknown_error',
    };
  }
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
  fontName: string;
}

/**
 * Processes PDF page text items into readable text
 */
function processPageText(items: unknown[]): string {
  if (items.length === 0) return '';

  const textItems = items as TextItem[];
  const lines: { y: number; items: TextItem[] }[] = [];

  // Group items by Y position (line)
  for (const item of textItems) {
    if (!item.str) continue;

    const y = Math.round(item.transform[5]); // Y position

    // Find existing line or create new one
    let line = lines.find((l) => Math.abs(l.y - y) < 5);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  // Sort lines by Y position (top to bottom = descending Y)
  lines.sort((a, b) => b.y - a.y);

  // Build text from lines
  const result: string[] = [];
  let lastY = Infinity;
  let currentParagraph: string[] = [];

  for (const line of lines) {
    // Sort items in line by X position (left to right)
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);

    // Build line text with proper spacing
    let lineText = '';
    let lastX = -Infinity;

    for (const item of line.items) {
      const x = item.transform[4];

      // Add space if there's a gap
      if (lineText && x - lastX > 10) {
        lineText += ' ';
      }

      lineText += item.str;
      lastX = x + item.width;
    }

    lineText = lineText.trim();
    if (!lineText) continue;

    // Check for paragraph break (large Y gap)
    if (lastY - line.y > 20 && currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
    }

    // Check if this looks like a heading (short, possibly all caps or ends with colon)
    const isHeading =
      lineText.length < 80 &&
      (lineText === lineText.toUpperCase() ||
        /^(Chapter|Section|\d+\.)\s/i.test(lineText) ||
        (lastY - line.y > 30 && currentParagraph.length === 0));

    if (isHeading && currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
      result.push('');
      result.push(`## ${lineText}`);
      result.push('');
    } else {
      currentParagraph.push(lineText);
    }

    lastY = line.y;
  }

  // Add remaining paragraph
  if (currentParagraph.length > 0) {
    result.push(currentParagraph.join(' '));
  }

  return result.join('\n');
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
