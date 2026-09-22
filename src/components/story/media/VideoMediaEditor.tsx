import React, { useState } from "react";
import { Link2, Upload } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import { addVideoEmbed, uploadVideoFile, type ChapterMediaList } from "@/lib/mediaApi";
import MediaItemControls, { ProgressBar } from "./MediaItemControls";
import { VideoEmbed } from "./VideoPanel";
import { AiVideoGenerator } from "./AiGenerators";

const VideoMediaEditor: React.FC<{
  chapterId: string;
  chapterParagraphs: string[];
  list: ChapterMediaList;
  onChanged: () => void;
  onAiJobQueued?: () => void;
}> = ({ chapterId, chapterParagraphs, list, onChanged, onAiJobQueued }) => {
  const { toast } = useToast();
  const videos = list.media.filter((m) => m.kind === "video");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const maxMb = Math.round((list.max_video_bytes ?? 0) / (1024 * 1024));

  const uploadFile = async (file: File) => {
    if (list.max_video_bytes && file.size > list.max_video_bytes) {
      toast({ title: "File is too large", description: `Videos can be up to ${maxMb} MB.`, variant: "destructive" });
      return;
    }
    setProgress(0);
    try {
      const created = await uploadVideoFile(chapterId, file, label || undefined, setProgress);
      setLabel("");
      toast({ title: created.status === "pending" ? "Video submitted for review" : "Video added" });
      onChanged();
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
    } finally {
      setProgress(null);
    }
  };

  const add = async () => {
    setSaving(true);
    try {
      const created = await addVideoEmbed(chapterId, url, label);
      setUrl("");
      setLabel("");
      toast({ title: created.status === "pending" ? "Video submitted for review" : "Video added" });
      onChanged();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add video", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {videos.map((m) => (
        <div key={m.id} className="border rounded p-2 bg-white space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{m.label || "Video"}</span>
              {m.creator_name && <span className="text-gray-500"> · {m.creator_name}</span>}
            </span>
            <MediaItemControls media={m} canModerate={list.can_moderate} onChanged={onChanged} />
          </div>
          <VideoEmbed media={m} />
        </div>
      ))}

      <div className="border rounded p-3 bg-gray-50 space-y-2">
        <div className="text-sm font-medium">
          <EditableText id="story-video-add-heading">Add a video</EditableText>
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…  or  https://vimeo.com/…"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Title (optional)"
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!url.trim() || saving}
            onClick={add}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" />
            <EditableText id="story-video-add-btn">Add YouTube / Vimeo link</EditableText>
          </button>
          {list.direct_upload ? (
            <label
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 cursor-pointer ${
                progress !== null ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <EditableText id="story-video-upload-file">Upload video file</EditableText>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadFile(file);
                }}
              />
            </label>
          ) : (
            <button
              type="button"
              disabled
              title="Needs object storage on the server"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border bg-white opacity-50 cursor-not-allowed"
            >
              <Upload className="h-3.5 w-3.5" />
              <EditableText id="story-video-upload-file">Upload video file</EditableText>
              <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-500">
                <EditableText id="story-coming-soon">Coming soon</EditableText>
              </span>
            </button>
          )}
        </div>
        <ProgressBar value={progress} />
        {list.direct_upload && (
          <p className="text-[11px] text-gray-500">
            <EditableText id="story-video-file-formats">MP4, WEBM or MOV, up to</EditableText> {maxMb} MB.
          </p>
        )}
      </div>

      <AiVideoGenerator chapterId={chapterId} paragraphs={chapterParagraphs} onQueued={onAiJobQueued} />
    </div>
  );
};

export default VideoMediaEditor;
