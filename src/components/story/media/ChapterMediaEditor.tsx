import React from "react";
import { Loader2 } from "lucide-react";
import type { ChapterMediaList, MediaKind } from "@/lib/mediaApi";
import AudioMediaEditor from "./AudioMediaEditor";
import VisualMediaEditor from "./VisualMediaEditor";
import VideoMediaEditor from "./VideoMediaEditor";
import { StorageNote } from "./MediaItemControls";

interface ChapterMediaEditorProps {
  kind: MediaKind;
  storyTitleId: string;
  chapterId: string;
  chapterParagraphs: string[];
  chapters: { chapter_id: string; chapter_title: string }[];
  list: ChapterMediaList | null;
  onChanged: () => void;
  onAiJobQueued?: () => void;
}

/**
 * Create / manage one format of a chapter. Used by the Audio / Cartoon /
 * Video tabs of the chapter editor, and by readers' "Contribute" dialogs
 * (their submissions go to the owner for review).
 */
const ChapterMediaEditor: React.FC<ChapterMediaEditorProps> = ({
  kind,
  storyTitleId,
  chapterId,
  chapterParagraphs,
  chapters,
  list,
  onChanged,
  onAiJobQueued,
}) => {
  if (!list) {
    return (
      <div className="py-6 text-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin inline" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {kind === "audio" && (
        <AudioMediaEditor
          storyTitleId={storyTitleId}
          chapterId={chapterId}
          chapterParagraphs={chapterParagraphs}
          chapters={chapters}
          list={list}
          onChanged={onChanged}
          onAiJobQueued={onAiJobQueued}
        />
      )}
      {kind === "visual" && (
        <VisualMediaEditor
          chapterId={chapterId}
          chapterParagraphs={chapterParagraphs}
          list={list}
          onChanged={onChanged}
          onAiJobQueued={onAiJobQueued}
        />
      )}
      {kind === "video" && (
        <VideoMediaEditor
          chapterId={chapterId}
          chapterParagraphs={chapterParagraphs}
          list={list}
          onChanged={onChanged}
          onAiJobQueued={onAiJobQueued}
        />
      )}
      <StorageNote objectStorage={list.direct_upload} />
    </div>
  );
};

export default ChapterMediaEditor;
