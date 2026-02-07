/**
 * useExport hook - manages export state and operations
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ExportFormat,
  ExportOptions,
  ExportProgress,
  SaveFormat,
} from '@/types/import-export';
import { exportAndDownload, saveAndDownload } from '@/lib/export';

interface UseExportState {
  isExporting: boolean;
  progress: ExportProgress | null;
  error: string | null;
}

interface UseExportReturn extends UseExportState {
  exportDocument: (content: string, format: ExportFormat, options?: ExportOptions) => Promise<boolean>;
  saveDocument: (content: string, format: SaveFormat, title?: string) => void;
  reset: () => void;
}

export function useExport(): UseExportReturn {
  const [state, setState] = useState<UseExportState>({
    isExporting: false,
    progress: null,
    error: null,
  });

  const handleProgress = useCallback((progress: ExportProgress) => {
    setState((prev) => ({ ...prev, progress }));
  }, []);

  const exportDocument = useCallback(
    async (content: string, format: ExportFormat, options?: ExportOptions): Promise<boolean> => {
      setState({ isExporting: true, progress: null, error: null });

      try {
        const success = await exportAndDownload(
          { content, format, options },
          handleProgress
        );

        if (success) {
          toast.success('Export complete', {
            description: `Your document has been exported as ${format.toUpperCase()}.`,
          });
          setState({ isExporting: false, progress: null, error: null });
          return true;
        } else {
          const error = 'Export failed. Please try again.';
          toast.error('Export failed', { description: error });
          setState({ isExporting: false, progress: null, error });
          return false;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Export failed';
        toast.error('Export failed', { description: error });
        setState({ isExporting: false, progress: null, error });
        return false;
      }
    },
    [handleProgress]
  );

  const saveDocument = useCallback((content: string, format: SaveFormat, title?: string) => {
    try {
      saveAndDownload(content, format, title);
      toast.success('File saved', {
        description: `Your document has been saved as ${format.toUpperCase()}.`,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Save failed';
      toast.error('Save failed', { description: error });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isExporting: false, progress: null, error: null });
  }, []);

  return {
    ...state,
    exportDocument,
    saveDocument,
    reset,
  };
}
