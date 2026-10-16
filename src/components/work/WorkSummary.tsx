import React from "react";
import { BookOpen } from "lucide-react";
import EditableText from "@/components/EditableText";
import TagBadge from "@/components/TagBadge";

interface WorkSummaryProps {
  kind: "screenplay" | "comic";
  coverUrl?: string | null;
  description?: string | null;
  tags?: string[] | null;
  /** Owner in Editing mode: clicking the cover opens Settings. */
  onEditCover?: () => void;
}

/** Cover, description and tags — the card under a story's title, for other kinds. */
const WorkSummary: React.FC<WorkSummaryProps> = ({ kind, coverUrl, description, tags, onEditCover }) => {
  if (!coverUrl && !description && !(tags && tags.length) && !onEditCover) return null;
  return (
    <div className="mt-3 mb-3 flex items-start gap-3">
      <button
        type="button"
        disabled={!onEditCover}
        onClick={onEditCover}
        title={onEditCover ? "Change the cover" : undefined}
        className="relative w-28 h-40 shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-blue-200 via-sky-200 to-purple-200 disabled:cursor-default"
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/90 text-[11px]">
            <BookOpen className="h-8 w-8" />
            {onEditCover && <EditableText id={`${kind}-cover-add`}>Add cover</EditableText>}
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-2">
        {description && <p className="text-sm text-gray-700 whitespace-pre-wrap">{description}</p>}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkSummary;
