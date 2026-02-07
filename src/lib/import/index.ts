/**
 * Import module - main entry point
 * Provides a unified API for importing content from various formats
 */

import {
  ImportFormat,
  ImportResult,
  ImportOptions,
  ImportProgress,
  ImportedDocument,
  MAX_FILE_SIZE,
  detectFileFormat,
  getFileExtension,
  SUPPORTED_IMPORT_TYPES,
} from '@/types/import-export';
import { importDocx } from './docx-importer';
import { importPdf } from './pdf-importer';
import { importEpub } from './epub-importer';
import { importOdt } from './odt-importer';
import { importFdx } from './fdx-importer';
import { importFountain } from './fountain-importer';

export type { ImportOptions, ImportResult, ImportProgress, ImportedDocument };
export { ImportFormat, SUPPORTED_IMPORT_TYPES, detectFileFormat, getFileExtension };

/**
 * Import a file and convert to markdown
 */
export async function importDocument(
  file: File,
  options: ImportOptions = {},
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const { maxFileSize = MAX_FILE_SIZE } = options;

  // Validate file size
  if (file.size > maxFileSize) {
    const sizeMB = Math.round(maxFileSize / (1024 * 1024));
    return {
      success: false,
      error: `This file exceeds the ${sizeMB}MB limit. Please use a smaller file.`,
      errorType: 'file_too_large',
    };
  }

  // Detect file format
  const format = detectFileFormat(file);
  if (!format) {
    const supportedFormats = SUPPORTED_IMPORT_TYPES.map((t) => t.extension.toUpperCase()).join(
      ', '
    );
    return {
      success: false,
      error: `This file type is not supported. Please use ${supportedFormats} files.`,
      errorType: 'invalid_file_type',
    };
  }

  onProgress?.({ stage: 'reading', progress: 10, message: 'Reading file...' });

  try {
    let result: ImportResult;

    onProgress?.({ stage: 'parsing', progress: 30, message: 'Parsing content...' });

    switch (format) {
      case ImportFormat.DOCX:
        result = await importDocx(file);
        break;
      case ImportFormat.PDF:
        result = await importPdf(file);
        break;
      case ImportFormat.EPUB:
        result = await importEpub(file);
        break;
      case ImportFormat.ODT:
        result = await importOdt(file);
        break;
      case ImportFormat.FDX:
        result = await importFdx(file);
        break;
      case ImportFormat.FOUNTAIN:
        result = await importFountain(file);
        break;
      default:
        return {
          success: false,
          error: `Unsupported import format: ${format}`,
          errorType: 'invalid_file_type',
        };
    }

    if (result.success) {
      onProgress?.({
        stage: 'converting',
        progress: 80,
        message: 'Converting to markdown...',
      });
      onProgress?.({ stage: 'complete', progress: 100, message: 'Import complete!' });
    } else {
      onProgress?.({ stage: 'error', progress: 0, message: result.error });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Import failed';
    onProgress?.({ stage: 'error', progress: 0, message: errorMessage });
    return {
      success: false,
      error: errorMessage,
      errorType: 'unknown_error',
    };
  }
}

/**
 * Validates a file before import
 */
export function validateFile(file: File, maxFileSize = MAX_FILE_SIZE): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > maxFileSize) {
    const sizeMB = Math.round(maxFileSize / (1024 * 1024));
    return {
      valid: false,
      error: `This file exceeds the ${sizeMB}MB limit.`,
    };
  }

  // Check file type
  const format = detectFileFormat(file);
  if (!format) {
    return {
      valid: false,
      error: 'This file type is not supported.',
    };
  }

  return { valid: true };
}

/**
 * Gets the supported file extensions for file input accept attribute
 */
export function getSupportedExtensions(): string {
  return SUPPORTED_IMPORT_TYPES.map((t) => t.extension).join(',');
}

/**
 * Gets the supported MIME types for file input accept attribute
 */
export function getSupportedMimeTypes(): string {
  const mimeTypes = SUPPORTED_IMPORT_TYPES.flatMap((t) => t.mimeTypes);
  return [...new Set(mimeTypes)].join(',');
}

// Re-export individual importers for direct use
export { importDocx } from './docx-importer';
export { importPdf } from './pdf-importer';
export { importEpub } from './epub-importer';
export { importOdt } from './odt-importer';
export { importFdx } from './fdx-importer';
export { importFountain } from './fountain-importer';
export { htmlToMarkdown, simpleHtmlToMarkdown, htmlToPlainText } from './html-to-markdown';
