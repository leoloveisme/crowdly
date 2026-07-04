/**
 * useImport hook - manages import state and operations
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ImportProgress,
  ImportedDocument,
  ImportOptions,
} from '@/types/import-export';
import { importDocument, validateFile } from '@/lib/import';

interface UseImportState {
  isImporting: boolean;
  progress: ImportProgress | null;
  error: string | null;
  importedDocument: ImportedDocument | null;
}

interface UseImportReturn extends UseImportState {
  importFile: (file: File, options?: ImportOptions) => Promise<ImportedDocument | null>;
  validateImportFile: (file: File) => { valid: boolean; error?: string };
  reset: () => void;
  clearImportedDocument: () => void;
}

export function useImport(): UseImportReturn {
  const [state, setState] = useState<UseImportState>({
    isImporting: false,
    progress: null,
    error: null,
    importedDocument: null,
  });

  const handleProgress = useCallback((progress: ImportProgress) => {
    setState((prev) => ({ ...prev, progress }));
  }, []);

  const importFile = useCallback(
    async (file: File, options?: ImportOptions): Promise<ImportedDocument | null> => {
      setState({
        isImporting: true,
        progress: null,
        error: null,
        importedDocument: null,
      });

      try {
        const result = await importDocument(file, options, handleProgress);

        if (result.success && result.document) {
          toast.success('Import complete', {
            description: `Imported ${result.document.metadata.wordCount?.toLocaleString() || 'document'} words from ${file.name}.`,
          });
          setState({
            isImporting: false,
            progress: null,
            error: null,
            importedDocument: result.document,
          });
          return result.document;
        } else {
          const error = result.error || 'Import failed';
          toast.error('Import failed', { description: error });
          setState({
            isImporting: false,
            progress: null,
            error,
            importedDocument: null,
          });
          return null;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Import failed';
        toast.error('Import failed', { description: error });
        setState({
          isImporting: false,
          progress: null,
          error,
          importedDocument: null,
        });
        return null;
      }
    },
    [handleProgress]
  );

  const validateImportFile = useCallback((file: File) => {
    return validateFile(file);
  }, []);

  const reset = useCallback(() => {
    setState({
      isImporting: false,
      progress: null,
      error: null,
      importedDocument: null,
    });
  }, []);

  const clearImportedDocument = useCallback(() => {
    setState((prev) => ({ ...prev, importedDocument: null }));
  }, []);

  return {
    ...state,
    importFile,
    validateImportFile,
    reset,
    clearImportedDocument,
  };
}
