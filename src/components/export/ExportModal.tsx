/**
 * ExportModal component - export options dialog
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { ExportProgress } from './ExportProgress';
import { useExport } from '@/hooks/useExport';
import { ExportFormat, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { extractTitle } from '@/lib/export';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  format: ExportFormat;
  defaultTitle?: string;
}

export function ExportModal({
  open,
  onOpenChange,
  content,
  format,
  defaultTitle,
}: ExportModalProps) {
  const { isExporting, progress, exportDocument, reset } = useExport();

  const [filename, setFilename] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // PDF options
  const [pageSize, setPageSize] = useState<'A4' | 'Letter' | 'Legal'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [includeTitlePage, setIncludeTitlePage] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      const extractedTitle = extractTitle(content);
      const title = defaultTitle || extractedTitle || 'document';
      setFilename(sanitizeFilename(title));
      setShowAdvanced(false);
      reset();
    }
  }, [open, content, defaultTitle, reset]);

  // Handle export
  const handleExport = useCallback(async () => {
    const options: ExportOptions = {
      filename: `${filename}.${format}`,
      title: filename,
      pageSize,
      orientation,
      includeTitlePage,
    };

    const success = await exportDocument(content, format, options);
    if (success) {
      onOpenChange(false);
    }
  }, [content, format, filename, pageSize, orientation, includeTitlePage, exportDocument, onOpenChange]);

  const formatName = format.toUpperCase();
  const showPdfOptions = format === ExportFormat.PDF;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export as {formatName}</DialogTitle>
          <DialogDescription>
            Configure your export settings and download the file.
          </DialogDescription>
        </DialogHeader>

        {isExporting && progress ? (
          <div className="py-6">
            <ExportProgress progress={progress} format={format} />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Filename */}
            <div className="space-y-2">
              <Label htmlFor="export-filename">Filename</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="export-filename"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="document"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">.{format}</span>
              </div>
            </div>

            {/* Advanced Options (PDF only for now) */}
            {showPdfOptions && (
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-2 px-0">
                    <ChevronRight
                      className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-90')}
                    />
                    Advanced Options
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  {/* Page Size */}
                  <div className="space-y-2">
                    <Label htmlFor="page-size">Page size</Label>
                    <Select value={pageSize} onValueChange={(v) => setPageSize(v as typeof pageSize)}>
                      <SelectTrigger id="page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="Letter">Letter</SelectItem>
                        <SelectItem value="Legal">Legal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Orientation */}
                  <div className="space-y-2">
                    <Label>Orientation</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="orientation"
                          value="portrait"
                          checked={orientation === 'portrait'}
                          onChange={() => setOrientation('portrait')}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Portrait</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="orientation"
                          value="landscape"
                          checked={orientation === 'landscape'}
                          onChange={() => setOrientation('landscape')}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Landscape</span>
                      </label>
                    </div>
                  </div>

                  {/* Title Page */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="title-page"
                      checked={includeTitlePage}
                      onCheckedChange={(checked) => setIncludeTitlePage(checked === true)}
                    />
                    <Label htmlFor="title-page" className="font-normal cursor-pointer">
                      Include title page
                    </Label>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !filename.trim()}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
