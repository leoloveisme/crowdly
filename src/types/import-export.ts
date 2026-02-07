// Import/Export Type Definitions

// ============================================================================
// Export Types
// ============================================================================

export enum ExportFormat {
  PDF = 'pdf',
  EPUB = 'epub',
  DOCX = 'docx',
  ODT = 'odt',
  FDX = 'fdx',
  FOUNTAIN = 'fountain',
}

export enum SaveFormat {
  MARKDOWN = 'md',
  STORY = 'story',
  SCREENPLAY = 'screenplay',
}

export interface ExportOptions {
  filename?: string;
  title?: string;
  author?: string;
  language?: string;
  // PDF-specific options
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  includeTitlePage?: boolean;
  includeTableOfContents?: boolean;
  // EPUB-specific options
  coverImage?: string;
}

export interface ExportRequest {
  content: string;
  format: ExportFormat;
  options?: ExportOptions;
  metadata?: Record<string, unknown>;
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  error?: string;
}

export type ExportProgress = {
  stage: 'preparing' | 'converting' | 'generating' | 'complete' | 'error';
  progress: number; // 0-100
  message?: string;
};

// ============================================================================
// Import Types
// ============================================================================

export enum ImportFormat {
  DOCX = 'docx',
  PDF = 'pdf',
  EPUB = 'epub',
  ODT = 'odt',
  FDX = 'fdx',
  FOUNTAIN = 'fountain',
}

export interface ImportedDocument {
  content: string; // Markdown content
  html?: string; // Original HTML if available
  metadata: ImportMetadata;
}

export interface ImportMetadata {
  title?: string;
  author?: string;
  language?: string;
  wordCount?: number;
  chapterCount?: number;
  originalFormat: ImportFormat;
  importedAt: Date;
}

export interface ImportResult {
  success: boolean;
  document?: ImportedDocument;
  error?: string;
  errorType?: ImportErrorType;
}

export type ImportErrorType =
  | 'invalid_file_type'
  | 'file_too_large'
  | 'corrupt_file'
  | 'empty_content'
  | 'encoding_error'
  | 'unknown_error';

export type ImportProgress = {
  stage: 'reading' | 'parsing' | 'converting' | 'complete' | 'error';
  progress: number; // 0-100
  message?: string;
};

export interface ImportOptions {
  maxFileSize?: number; // in bytes, default 50MB
  replaceContent?: boolean;
  onProgress?: (progress: ImportProgress) => void;
}

// ============================================================================
// File Type Detection
// ============================================================================

export interface FileTypeInfo {
  extension: string;
  mimeTypes: string[];
  format: ImportFormat | null;
  displayName: string;
  icon: string;
}

export const SUPPORTED_IMPORT_TYPES: FileTypeInfo[] = [
  {
    extension: '.docx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    format: ImportFormat.DOCX,
    displayName: 'Word Document',
    icon: 'FileText',
  },
  {
    extension: '.pdf',
    mimeTypes: ['application/pdf'],
    format: ImportFormat.PDF,
    displayName: 'PDF Document',
    icon: 'FileText',
  },
  {
    extension: '.epub',
    mimeTypes: ['application/epub+zip'],
    format: ImportFormat.EPUB,
    displayName: 'EPUB eBook',
    icon: 'BookOpen',
  },
  {
    extension: '.odt',
    mimeTypes: ['application/vnd.oasis.opendocument.text'],
    format: ImportFormat.ODT,
    displayName: 'OpenDocument',
    icon: 'FileText',
  },
  {
    extension: '.fdx',
    mimeTypes: ['application/xml', 'text/xml'],
    format: ImportFormat.FDX,
    displayName: 'Final Draft',
    icon: 'Film',
  },
  {
    extension: '.fountain',
    mimeTypes: ['text/plain'],
    format: ImportFormat.FOUNTAIN,
    displayName: 'Fountain',
    icon: 'Film',
  },
];

export const SUPPORTED_EXPORT_TYPES: { format: ExportFormat; displayName: string; extension: string; icon: string; category: 'document' | 'screenplay' }[] = [
  { format: ExportFormat.PDF, displayName: 'PDF', extension: '.pdf', icon: 'FileText', category: 'document' },
  { format: ExportFormat.EPUB, displayName: 'EPUB', extension: '.epub', icon: 'BookOpen', category: 'document' },
  { format: ExportFormat.DOCX, displayName: 'Word Document', extension: '.docx', icon: 'FileText', category: 'document' },
  { format: ExportFormat.ODT, displayName: 'OpenDocument', extension: '.odt', icon: 'FileText', category: 'document' },
  { format: ExportFormat.FDX, displayName: 'Final Draft', extension: '.fdx', icon: 'Film', category: 'screenplay' },
  { format: ExportFormat.FOUNTAIN, displayName: 'Fountain', extension: '.fountain', icon: 'Film', category: 'screenplay' },
];

export const SUPPORTED_SAVE_TYPES: { format: SaveFormat; displayName: string; extension: string }[] = [
  { format: SaveFormat.MARKDOWN, displayName: 'Markdown', extension: '.md' },
  { format: SaveFormat.STORY, displayName: 'Story file', extension: '.story' },
  { format: SaveFormat.SCREENPLAY, displayName: 'Screenplay file', extension: '.screenplay' },
];

// ============================================================================
// Utility Types
// ============================================================================

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
}

export function detectFileFormat(file: File): ImportFormat | null {
  const extension = getFileExtension(file.name);
  const typeInfo = SUPPORTED_IMPORT_TYPES.find(t => t.extension === extension);
  return typeInfo?.format ?? null;
}

export function sanitizeFilename(title: string, maxLength = 80): string {
  // Remove unsafe characters, keep alphanumeric, hyphens, underscores
  let sanitized = title.replace(/[^a-zA-Z0-9\s\-_]/g, '');
  // Collapse whitespace to underscores
  sanitized = sanitized.replace(/\s+/g, '_');
  // Trim to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  return sanitized || 'untitled';
}
