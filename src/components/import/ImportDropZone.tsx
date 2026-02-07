/**
 * ImportDropZone component - drag and drop area for file import
 */

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupportedExtensions, validateFile } from '@/lib/import';
import { SUPPORTED_IMPORT_TYPES } from '@/types/import-export';

interface ImportDropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function ImportDropZone({ onFileSelect, disabled = false, className }: ImportDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
      setError(null);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const file = files[0];
      const validation = validateFile(file);

      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        return;
      }

      setError(null);
      onFileSelect(file);
    },
    [disabled, onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const validation = validateFile(file);

      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        return;
      }

      setError(null);
      onFileSelect(file);

      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onFileSelect]
  );

  const supportedFormats = SUPPORTED_IMPORT_TYPES.map((t) =>
    t.extension.replace('.', '').toUpperCase()
  ).join(', ');

  return (
    <div className={cn('relative', className)}>
      <label
        className={cn(
          'flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
          isDragOver && !disabled && 'border-primary bg-primary/5',
          !isDragOver && !disabled && 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-destructive'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
          <Upload
            className={cn(
              'w-10 h-10 mb-3',
              isDragOver ? 'text-primary' : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
          <p className="mb-2 text-sm">
            <span className="font-semibold">Drag and drop a file here</span>
          </p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Supported: {supportedFormats}
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          accept={getSupportedExtensions()}
          onChange={handleFileInput}
          disabled={disabled}
          aria-label="Select file to import"
        />
      </label>

      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
