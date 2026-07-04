/**
 * ExportMenu component - dropdown menu for export options
 */

import { useState, useCallback, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { ExportModal } from './ExportModal';
import { useExport } from '@/hooks/useExport';
import { ExportFormat, SUPPORTED_EXPORT_TYPES } from '@/types/import-export';
import { FileTypeIcon, getFileTypeColor } from '@/components/import/FileTypeIcon';
import { cn } from '@/lib/utils';

interface ExportMenuProps {
  content: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}

export function ExportMenu({ content, title, disabled = false, className }: ExportMenuProps) {
  const { exportDocument } = useExport();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Group formats by category
  const documentFormats = SUPPORTED_EXPORT_TYPES.filter((t) => t.category === 'document');
  const screenplayFormats = SUPPORTED_EXPORT_TYPES.filter((t) => t.category === 'screenplay');

  // Handle format selection
  const handleFormatSelect = useCallback((format: ExportFormat) => {
    // For formats with options (PDF), show modal
    if (format === ExportFormat.PDF) {
      setSelectedFormat(format);
      setShowModal(true);
    } else {
      // For simple formats, export directly
      exportDocument(content, format, { title });
    }
  }, [content, title, exportDocument]);

  // Keyboard shortcut: Ctrl+Shift+E
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        // Default to PDF export
        setSelectedFormat(ExportFormat.PDF);
        setShowModal(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isEmpty = !content || content.trim().length === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || isEmpty}
            className={cn('gap-2', className)}
            title={isEmpty ? 'Add content to export' : 'Export document (Ctrl+Shift+E)'}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Export as...</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Document formats */}
          {documentFormats.map((type) => (
            <DropdownMenuItem
              key={type.format}
              onClick={() => handleFormatSelect(type.format)}
              className="gap-2"
            >
              <FileTypeIcon
                format={type.format}
                className={getFileTypeColor(type.format)}
                size={16}
              />
              {type.displayName}
            </DropdownMenuItem>
          ))}

          {/* Screenplay formats */}
          {screenplayFormats.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Screenplay Formats
              </DropdownMenuLabel>
              {screenplayFormats.map((type) => (
                <DropdownMenuItem
                  key={type.format}
                  onClick={() => handleFormatSelect(type.format)}
                  className="gap-2"
                >
                  <FileTypeIcon
                    format={type.format}
                    className={getFileTypeColor(type.format)}
                    size={16}
                  />
                  {type.displayName}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export Modal */}
      {selectedFormat && (
        <ExportModal
          open={showModal}
          onOpenChange={setShowModal}
          content={content}
          format={selectedFormat}
          defaultTitle={title}
        />
      )}
    </>
  );
}
