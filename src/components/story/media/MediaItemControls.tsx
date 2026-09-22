import React from "react";
import { Check, Star, Trash2, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { deleteMedia, updateMedia, type ChapterMedia } from "@/lib/mediaApi";

export const StatusBadge: React.FC<{ status: ChapterMedia["status"] }> = ({ status }) =>
  status === "approved" ? null : (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide",
        status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700",
      )}
    >
      {status === "pending" ? (
        <EditableText id="story-media-pending">Pending review</EditableText>
      ) : (
        <EditableText id="story-media-rejected">Rejected</EditableText>
      )}
    </span>
  );

/** Primary / approve / reject / delete for one media item. */
const MediaItemControls: React.FC<{
  media: ChapterMedia;
  canModerate: boolean;
  onChanged: () => void;
  children?: React.ReactNode;
}> = ({ media, canModerate, onChanged, children }) => {
  const { toast } = useToast();
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      onChanged();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    }
  };
  const canDelete = canModerate || media.is_mine;

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <StatusBadge status={media.status} />
      {children}
      {canModerate && media.status === "approved" && (
        <button
          type="button"
          title={media.is_primary ? "Primary (played by default)" : "Make primary"}
          onClick={() => run(() => updateMedia(media.id, { isPrimary: !media.is_primary }))}
          className="p-1 rounded hover:bg-gray-100"
        >
          <Star className={cn("h-3.5 w-3.5", media.is_primary ? "fill-amber-400 text-amber-500" : "text-gray-400")} />
        </button>
      )}
      {canModerate && media.status !== "approved" && (
        <button
          type="button"
          onClick={() => run(() => updateMedia(media.id, { status: "approved" }))}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50"
        >
          <Check className="h-3 w-3" />
          <EditableText id="story-media-approve">Approve</EditableText>
        </button>
      )}
      {canModerate && media.status === "pending" && (
        <button
          type="button"
          onClick={() => run(() => updateMedia(media.id, { status: "rejected" }))}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
        >
          <X className="h-3 w-3" />
          <EditableText id="story-media-reject">Reject</EditableText>
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          title="Delete"
          onClick={() => {
            if (window.confirm("Delete this permanently?")) run(() => deleteMedia(media.id));
          }}
          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default MediaItemControls;

/** Footer shown under every media editor: where files live. */
export const StorageNote: React.FC<{ objectStorage?: boolean }> = ({ objectStorage }) => (
  <p className="text-[11px] text-gray-400 pt-2 border-t">
    {objectStorage ? (
      <EditableText id="story-media-storage-cloud">Stored in Crowdly's media storage; large files upload directly.</EditableText>
    ) : (
      <>
        <EditableText id="story-media-storage-note">Stored on Crowdly servers.</EditableText>{" "}
        <span className="text-gray-400">
          <EditableText id="story-media-object-storage">Object storage (S3/R2)</EditableText> —{" "}
          <EditableText id="story-coming-soon">Coming soon</EditableText>
        </span>
      </>
    )}
  </p>
);

/** Thin upload progress bar. */
export const ProgressBar: React.FC<{ value: number | null }> = ({ value }) =>
  value === null ? null : (
    <div className="h-1.5 w-full rounded bg-gray-200 overflow-hidden">
      <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
