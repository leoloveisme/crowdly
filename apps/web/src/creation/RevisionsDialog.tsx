import React from "react";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CompareRevisionsContainer from "@/modules/compare revisions";

// Story settings → Compare revisions (desktop ui/compare_revisions.py: 2–4
// revisions side by side with layout presets). Reuses the platform's
// CRDT-backed revision browser, so restore works the same everywhere.
export const RevisionsDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chapterId?: string;
  screenplayId?: string;
  sceneId?: string;
  title?: string;
  onRestored?: () => void;
}> = ({ open, onOpenChange, chapterId, screenplayId, sceneId, title, onRestored }) => (
  <Dialog
    open={open}
    onOpenChange={(o) => {
      onOpenChange(o);
      // A restore writes a new forward change server-side; reload on close.
      if (!o) onRestored?.();
    }}
  >
    <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col">
      <DialogHeader>
        <DialogTitle>
          <EditableText id="webapp-revisions-title">Compare revisions</EditableText>
          {title ? <span className="font-normal text-muted-foreground"> — {title}</span> : null}
        </DialogTitle>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        {chapterId ? (
          <CompareRevisionsContainer chapterId={chapterId} contentType="story" />
        ) : screenplayId ? (
          <CompareRevisionsContainer screenplayTitleId={screenplayId} sceneId={sceneId} contentType="screenplay" />
        ) : null}
      </div>
    </DialogContent>
  </Dialog>
);
