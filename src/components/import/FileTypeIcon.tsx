/**
 * FileTypeIcon component - displays icons for different file types
 */

import { FileText, BookOpen, Film, File } from 'lucide-react';
import { ImportFormat, ExportFormat } from '@/types/import-export';

interface FileTypeIconProps {
  format: ImportFormat | ExportFormat | string;
  className?: string;
  size?: number;
}

export function FileTypeIcon({ format, className = '', size = 16 }: FileTypeIconProps) {
  const formatLower = format.toLowerCase();

  // Screenplay formats
  if (formatLower === 'fdx' || formatLower === 'fountain') {
    return <Film className={className} size={size} aria-hidden="true" />;
  }

  // eBook format
  if (formatLower === 'epub') {
    return <BookOpen className={className} size={size} aria-hidden="true" />;
  }

  // Document formats (pdf, docx, odt, md)
  if (['pdf', 'docx', 'odt', 'md', 'story', 'screenplay'].includes(formatLower)) {
    return <FileText className={className} size={size} aria-hidden="true" />;
  }

  // Default
  return <File className={className} size={size} aria-hidden="true" />;
}

/**
 * Get color class for file type
 */
export function getFileTypeColor(format: string): string {
  const formatLower = format.toLowerCase();

  switch (formatLower) {
    case 'pdf':
      return 'text-red-500';
    case 'docx':
      return 'text-blue-500';
    case 'odt':
      return 'text-orange-500';
    case 'epub':
      return 'text-green-500';
    case 'fdx':
    case 'fountain':
      return 'text-purple-500';
    case 'md':
      return 'text-gray-500';
    default:
      return 'text-muted-foreground';
  }
}
