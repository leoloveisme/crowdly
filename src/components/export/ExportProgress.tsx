/**
 * ExportProgress component - shows export progress
 */

import { Progress } from '@/components/ui/progress';
import { ExportProgress as ExportProgressType } from '@/types/import-export';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ExportProgressProps {
  progress: ExportProgressType;
  format?: string;
}

export function ExportProgress({ progress, format }: ExportProgressProps) {
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
      case 'preparing':
        return 'Preparing document...';
      case 'converting':
        return 'Converting content...';
      case 'generating':
        return `Generating ${format?.toUpperCase() || 'file'}...`;
      case 'complete':
        return 'Export complete!';
      case 'error':
        return 'Export failed';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        {getStageIcon()}
        <div className="flex-1 space-y-1">
          <Progress
            value={progress.progress}
            className="h-2"
            aria-label={`Export progress: ${progress.progress}%`}
          />
          <p className="text-xs text-muted-foreground">{getStageText()}</p>
        </div>
        <span className="text-sm font-medium tabular-nums">{progress.progress}%</span>
      </div>
    </div>
  );
}
