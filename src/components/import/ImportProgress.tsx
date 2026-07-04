/**
 * ImportProgress component - shows import progress
 */

import { Progress } from '@/components/ui/progress';
import { ImportProgress as ImportProgressType } from '@/types/import-export';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ImportProgressProps {
  progress: ImportProgressType;
  filename?: string;
}

export function ImportProgress({ progress, filename }: ImportProgressProps) {
  const getStageIcon = () => {
    switch (progress.stage) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    }
  };

  const getStageText = () => {
    if (progress.message) return progress.message;

    switch (progress.stage) {
      case 'reading':
        return 'Reading file...';
      case 'parsing':
        return 'Parsing content...';
      case 'converting':
        return 'Converting to markdown...';
      case 'complete':
        return 'Import complete!';
      case 'error':
        return 'Import failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {filename && (
        <p className="text-sm font-medium truncate">{filename}</p>
      )}

      <div className="flex items-center gap-3">
        {getStageIcon()}
        <div className="flex-1 space-y-1">
          <Progress
            value={progress.progress}
            className="h-2"
            aria-label={`Import progress: ${progress.progress}%`}
          />
          <p className="text-xs text-muted-foreground">{getStageText()}</p>
        </div>
        <span className="text-sm font-medium tabular-nums">{progress.progress}%</span>
      </div>
    </div>
  );
}
