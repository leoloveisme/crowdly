/**
 * SaveAsMenu component - dropdown menu for save as options
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
import { Save, Upload } from 'lucide-react';
import { useExport } from '@/hooks/useExport';
import { SaveFormat, SUPPORTED_SAVE_TYPES } from '@/types/import-export';
import { FileTypeIcon, getFileTypeColor } from '@/components/import/FileTypeIcon';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ImportModal } from '@/components/import/ImportModal';
import { cn } from '@/lib/utils';

interface SaveAsMenuProps {
  content: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}

export function SaveAsMenu({ content, title, disabled = false, className }: SaveAsMenuProps) {
  const { saveDocument } = useExport();

  // Handle format selection
  const handleFormatSelect = useCallback(
    (format: SaveFormat) => {
      saveDocument(content, format, title);
    },
    [content, title, saveDocument]
  );

  const isEmpty = !content || content.trim().length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isEmpty}
          className={cn('gap-2', className)}
          title={isEmpty ? 'Add content to save' : 'Save document'}
        >
          <Save className="h-4 w-4" />
          Save As
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Save as...</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {SUPPORTED_SAVE_TYPES.map((type) => (
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
            {type.displayName} ({type.extension})
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Combined Import/Export/SaveAs Toolbar component
 */
interface FileToolbarProps {
  content: string;
  title?: string;
  onImport: (content: string, replaceContent: boolean) => void;
  hasExistingContent?: boolean;
  className?: string;
}

export function FileToolbar({
  content,
  title,
  onImport,
  hasExistingContent = false,
  className,
}: FileToolbarProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Keyboard shortcut: Ctrl+Shift+I for import
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setImportModalOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setImportModalOpen(true)}
        className="gap-2"
        title="Import document (Ctrl+Shift+I)"
      >
        <Upload className="h-4 w-4" />
        Import
      </Button>

      <ExportMenu content={content} title={title} />

      <SaveAsMenu content={content} title={title} />

      <ImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImport={onImport}
        hasExistingContent={hasExistingContent}
      />
    </div>
  );
}
