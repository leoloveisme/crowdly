import React from "react";
import { Video } from "lucide-react";
import EditableText from "@/components/EditableText";
import type { ChapterMedia } from "@/lib/mediaApi";

/** Responsive YouTube / Vimeo embed. The URL was normalised server-side. */
export const VideoEmbed: React.FC<{ media: ChapterMedia }> = ({ media }) => (
  <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black">
    <iframe
      src={media.url ?? undefined}
      title={media.label || "Video"}
      className="absolute inset-0 w-full h-full"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    />
  </div>
);

const VideoPanel: React.FC<{ videos: ChapterMedia[]; footer?: React.ReactNode }> = ({ videos, footer }) => {
  const approved = videos.filter((m) => m.status === "approved");
  return (
    <div className="w-full bg-gray-50 rounded p-4 border space-y-4">
      {approved.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Video className="h-4 w-4" />
          <EditableText id="story-video-none">No video for this chapter yet.</EditableText>
        </div>
      ) : (
        approved.map((m) => (
          <div key={m.id} className="space-y-1">
            <VideoEmbed media={m} />
            {(m.label || m.creator_name) && (
              <div className="text-xs text-gray-600">
                {m.label}
                {m.label && m.creator_name && " · "}
                {m.creator_name}
              </div>
            )}
          </div>
        ))
      )}
      {footer}
    </div>
  );
};

export default VideoPanel;
