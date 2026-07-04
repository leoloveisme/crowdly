/**
 * Export module - main entry point
 * Provides a unified API for exporting content to various formats
 */

import { saveAs } from 'file-saver';
import {
  ExportFormat,
  ExportRequest,
  ExportResult,
  ExportOptions,
  ExportProgress,
  SaveFormat,
  sanitizeFilename,
} from '@/types/import-export';
import { exportToPdf } from './pdf-exporter';
import { exportToDocx } from './docx-exporter';
import { exportToOdt } from './odt-exporter';
import { exportToEpub } from './epub-exporter';
import { exportToFdx } from './fdx-exporter';
import { exportToFountain } from './fountain-exporter';

export type { ExportOptions, ExportResult, ExportProgress };
export { ExportFormat, SaveFormat };

/**
 * Export content to a specific format
 */
export async function exportDocument(
  request: ExportRequest,
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportResult> {
  const { content, format, options = {} } = request;

  // Validate content
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      error: 'Your document is empty. Add some content before exporting.',
    };
  }

  onProgress?.({ stage: 'preparing', progress: 10, message: 'Preparing document...' });

  try {
    let result: ExportResult;

    onProgress?.({ stage: 'converting', progress: 30, message: 'Converting content...' });

    switch (format) {
      case ExportFormat.PDF:
        result = await exportToPdf(content, options);
        break;
      case ExportFormat.DOCX:
        result = await exportToDocx(content, options);
        break;
      case ExportFormat.ODT:
        result = await exportToOdt(content, options);
        break;
      case ExportFormat.EPUB:
        result = await exportToEpub(content, options);
        break;
      case ExportFormat.FDX:
        result = await exportToFdx(content, options);
        break;
      case ExportFormat.FOUNTAIN:
        result = await exportToFountain(content, options);
        break;
      default:
        return {
          success: false,
          error: `Unsupported export format: ${format}`,
        };
    }

    if (result.success) {
      onProgress?.({ stage: 'complete', progress: 100, message: 'Export complete!' });
    } else {
      onProgress?.({ stage: 'error', progress: 0, message: result.error });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Export failed';
    onProgress?.({ stage: 'error', progress: 0, message: errorMessage });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Export and download a document
 */
export async function exportAndDownload(
  request: ExportRequest,
  onProgress?: (progress: ExportProgress) => void
): Promise<boolean> {
  const result = await exportDocument(request, onProgress);

  if (result.success && result.blob && result.filename) {
    saveAs(result.blob, result.filename);
    return true;
  }

  return false;
}

/**
 * Save content to Crowdly native formats
 */
export function saveAsFormat(
  content: string,
  format: SaveFormat,
  title?: string
): { blob: Blob; filename: string } {
  const filename = sanitizeFilename(title || 'document') + '.' + format;

  let finalContent = content;

  // For story and screenplay formats, we could add metadata headers
  // but for now, just save as-is
  if (format === SaveFormat.STORY) {
    // Could add story_id or other metadata
    finalContent = content;
  } else if (format === SaveFormat.SCREENPLAY) {
    // Could add screenplay metadata
    finalContent = content;
  }

  const blob = new Blob([finalContent], { type: 'text/plain;charset=utf-8' });

  return { blob, filename };
}

/**
 * Save and download in native format
 */
export function saveAndDownload(content: string, format: SaveFormat, title?: string): void {
  const { blob, filename } = saveAsFormat(content, format, title);
  saveAs(blob, filename);
}

// Re-export individual exporters for direct use
export { exportToPdf } from './pdf-exporter';
export { exportToDocx } from './docx-exporter';
export { exportToOdt } from './odt-exporter';
export { exportToEpub } from './epub-exporter';
export { exportToFdx } from './fdx-exporter';
export { exportToFountain } from './fountain-exporter';
export { markdownToHtml, extractTitle, countWords } from './markdown-to-html';
