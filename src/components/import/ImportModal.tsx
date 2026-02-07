/**
 * ImportModal component - main import dialog
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ImportDropZone } from './ImportDropZone';
import { ImportProgress } from './ImportProgress';
import { ImportPreview } from './ImportPreview';
import { useImport } from '@/hooks/useImport';
import { ImportedDocument } from '@/types/import-export';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (content: string, replaceContent: boolean) => void;
  hasExistingContent?: boolean;
}

type ImportStep = 'select' | 'importing' | 'preview';

export function ImportModal({
  open,
  onOpenChange,
  onImport,
  hasExistingContent = false,
}: ImportModalProps) {
  const { isImporting, progress, importFile, reset, importedDocument } = useImport();

  const [step, setStep] = useState<ImportStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replaceContent, setReplaceContent] = useState(!hasExistingContent);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setStep('select');
      setSelectedFile(null);
      setReplaceContent(!hasExistingContent);
      reset();
    }
  }, [open, hasExistingContent, reset]);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setStep('importing');

    const doc = await importFile(file);
    if (doc) {
      setStep('preview');
    } else {
      setStep('select');
    }
  }, [importFile]);

  // Handle confirm import
  const handleConfirm = useCallback(() => {
    if (importedDocument) {
      onImport(importedDocument.content, replaceContent);
      onOpenChange(false);
    }
  }, [importedDocument, replaceContent, onImport, onOpenChange]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (step === 'importing') {
      // Cancel import (not fully implemented - would need AbortController)
      reset();
      setStep('select');
    } else {
      onOpenChange(false);
    }
  }, [step, reset, onOpenChange]);

  // Handle discard (go back to select)
  const handleDiscard = useCallback(() => {
    setStep('select');
    setSelectedFile(null);
    reset();
  }, [reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px]"
        aria-describedby="import-dialog-description"
      >
        <DialogHeader>
          <DialogTitle>
            {step === 'select' && 'Import Document'}
            {step === 'importing' && 'Importing...'}
            {step === 'preview' && 'Import Preview'}
          </DialogTitle>
          <DialogDescription id="import-dialog-description">
            {step === 'select' && 'Select a file to import into the editor.'}
            {step === 'importing' && 'Please wait while your document is being imported.'}
            {step === 'preview' && 'Review the imported content before confirming.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Step: Select file */}
          {step === 'select' && (
            <div className="space-y-4">
              <ImportDropZone onFileSelect={handleFileSelect} />

              {hasExistingContent && (
                <div className="pt-2">
                  <RadioGroup
                    value={replaceContent ? 'replace' : 'new'}
                    onValueChange={(v) => setReplaceContent(v === 'replace')}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id="import-new" />
                      <Label htmlFor="import-new" className="font-normal cursor-pointer">
                        Create new document
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="replace" id="import-replace" />
                      <Label htmlFor="import-replace" className="font-normal cursor-pointer">
                        Replace current content
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && progress && (
            <ImportProgress progress={progress} filename={selectedFile?.name} />
          )}

          {/* Step: Preview */}
          {step === 'preview' && importedDocument && selectedFile && (
            <ImportPreview
              document={importedDocument}
              filename={selectedFile.name}
              maxHeight="300px"
            />
          )}
        </div>

        <DialogFooter>
          {step === 'select' && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}

          {step === 'importing' && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleDiscard}>
                Discard
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>Confirm</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
