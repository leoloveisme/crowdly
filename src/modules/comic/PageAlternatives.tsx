import React, { useState } from "react";
import { GitBranch, Loader2, Trash2, Type } from "lucide-react";
import EditableText from "@/components/EditableText";
import FrameView from "@/components/story/media/FrameView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ComicPageBranch } from "@/lib/comicsApi";

interface PageAlternativesProps {
  branches: ComicPageBranch[];
  /** Signed-in readers may add an alternative image for the page. */
  canCreate: boolean;
  canEdit: (branch: ComicPageBranch) => boolean;
  onCreate: (file: File) => Promise<void>;
  onDelete: (branch: ComicPageBranch) => void;
  onEditLayers: (branch: ComicPageBranch) => void;
}

/** Alternative versions of one comic page (branches), as thumbnails. */
const PageAlternatives: React.FC<PageAlternativesProps> = ({
  branches,
  canCreate,
  canEdit,
  onCreate,
  onDelete,
  onEditLayers,
}) => {
  const [viewing, setViewing] = useState<ComicPageBranch | null>(null);
  const [uploading, setUploading] = useState(false);

  if (branches.length === 0 && !canCreate) return null;

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-1 text-emerald-700">
        <GitBranch className="h-3 w-3" />
        <EditableText id="comic-alternatives-label">Alternatives</EditableText>
        {branches.length > 0 && <span>({branches.length})</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setViewing(b)}
            title={b.name ?? b.author_email ?? undefined}
            className="h-12 w-9 overflow-hidden rounded ring-1 ring-emerald-300 hover:ring-2"
          >
            <img src={b.image_url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {canCreate && (
          <label className="inline-flex h-12 w-9 cursor-pointer items-center justify-center rounded border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : "+"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploading(true);
                try {
                  await onCreate(file);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewing?.name || <EditableText id="comic-alternative-title">Page alternative</EditableText>}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <FrameView frame={{ image_url: viewing.image_url, caption: null, overlays: viewing.overlays }} />
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{viewing.author_email}</span>
                {canEdit(viewing) && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onEditLayers(viewing);
                        setViewing(null);
                      }}
                      className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                    >
                      <Type className="h-3 w-3" />
                      <EditableText id="comic-alternative-edit-text">Edit text</EditableText>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(viewing);
                        setViewing(null);
                      }}
                      className="inline-flex items-center gap-1 text-red-600 hover:underline"
                    >
                      <Trash2 className="h-3 w-3" />
                      <EditableText id="comic-alternative-delete">Delete</EditableText>
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PageAlternatives;
