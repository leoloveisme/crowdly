import React, { useState } from "react";
import { Link2, Upload } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import { addVideoEmbed, type ChapterMediaList } from "@/lib/mediaApi";
import MediaItemControls from "./MediaItemControls";
import { VideoEmbed } from "./VideoPanel";

const VideoMediaEditor: React.FC<{ chapterId: string; list: ChapterMediaList; onChanged: () => void }> = ({
  chapterId,
  list,
  onChanged,
}) => {
  const { toast } = useToast();
  const videos = list.media.filter((m) => m.kind === "video");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

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
          <button
            type="button"
            disabled
            title="Coming soon"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border bg-white opacity-50 cursor-not-allowed"
          >
            <Upload className="h-3.5 w-3.5" />
            <EditableText id="story-video-upload-file">Upload video file</EditableText>
            <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-500">
              <EditableText id="story-coming-soon">Coming soon</EditableText>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoMediaEditor;
