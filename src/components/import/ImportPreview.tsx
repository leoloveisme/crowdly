/**
 * ImportPreview component - shows a preview of imported content
 */

import { ImportedDocument } from '@/types/import-export';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileTypeIcon, getFileTypeColor } from './FileTypeIcon';
import { cn } from '@/lib/utils';

interface ImportPreviewProps {
  document: ImportedDocument;
  filename: string;
  maxHeight?: string;
}

export function ImportPreview({ document, filename, maxHeight = '300px' }: ImportPreviewProps) {
  const { content, metadata } = document;

  // Get first few lines for preview
  const previewLines = content.split('\n').slice(0, 50);
  const previewContent = previewLines.join('\n');
  const isTruncated = content.split('\n').length > 50;

  return (
    <div className="space-y-3">
      {/* File info header */}
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
        <FileTypeIcon
          format={metadata.originalFormat}
          className={cn(getFileTypeColor(metadata.originalFormat), 'flex-shrink-0')}
          size={20}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{filename}</p>
          <p className="text-sm text-muted-foreground">
            {metadata.wordCount?.toLocaleString()} words
            {metadata.chapterCount ? ` | ${metadata.chapterCount} chapters` : ''}
          </p>
        </div>
      </div>

      {/* Content preview */}
      <ScrollArea className="border rounded-lg" style={{ maxHeight }}>
        <div className="p-4 font-mono text-sm whitespace-pre-wrap">
          {previewContent}
          {isTruncated && (
            <span className="text-muted-foreground">
              {'\n\n'}... (preview truncated)
            </span>
          )}
        </div>
      </ScrollArea>

      {/* Metadata summary */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {metadata.title && (
          <span className="px-2 py-1 bg-muted rounded">
            Title: {metadata.title}
          </span>
        )}
        {metadata.author && (
          <span className="px-2 py-1 bg-muted rounded">
            Author: {metadata.author}
          </span>
        )}
        {metadata.language && (
          <span className="px-2 py-1 bg-muted rounded">
            Language: {metadata.language.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
