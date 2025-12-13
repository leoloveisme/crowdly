
import React, { useState } from "react";
import ChapterInteractions from "@/components/ChapterInteractions";
import { FileAudio, Video, Image } from "lucide-react";

/**
 * Modular UI for selecting which content type(s) to show per story:
 * - Text
 * - Audio
 * - Cartoon/Presentation (image placeholder)
 * - Video
 * Each section has its own like/dislike/comments using ChapterInteractions.
 * This does NOT mutate story data, just UI presentation.
 *
 * Props:
 *  - chapters: Array of story chapters as loaded by story page.
 */
const StoryContentTypeSelector: React.FC<{ chapters: any[] }> = ({ chapters }) => {
  // Default enabled content types: text
  const [selectedTypes, setSelectedTypes] = useState<{
    text: boolean;
    audio: boolean;
    cartoon: boolean;
    video: boolean;
  }>({
    text: true,
    audio: false,
    cartoon: false,
    video: false,
  });

  const handleTypeToggle = (type: keyof typeof selectedTypes) => {
    setSelectedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <div className="mb-8">
      {/* Content Type Selector */}
      <div className="flex flex-wrap -mx-2 gap-3 items-center mb-4">
        <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedTypes.text}
            onChange={() => handleTypeToggle("text")}
            className="accent-blue-500"
          />
          <span>Text</span>
        </label>
        <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedTypes.audio}
            onChange={() => handleTypeToggle("audio")}
            className="accent-blue-500"
          />
          <FileAudio size={16} className="text-blue-300" />
          <span>Audio</span>
        </label>
        <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedTypes.cartoon}
            onChange={() => handleTypeToggle("cartoon")}
            className="accent-blue-500"
          />
          <Image size={16} className="text-pink-400" />
          <span>Cartoon/Presentation</span>
        </label>
        <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selectedTypes.video}
            onChange={() => handleTypeToggle("video")}
            className="accent-blue-500"
          />
          <Video size={16} className="text-green-400" />
          <span>Video</span>
        </label>
      </div>

      {/* For each loaded chapter, render the selected content type(s) */}
      {chapters.map((chapter) => (
        <div key={chapter.chapter_id} className="mb-8">
          <div className="font-semibold text-lg mb-2">{chapter.chapter_title}</div>
          {/* TEXT */}
          {selectedTypes.text && Array.isArray(chapter.paragraphs) && (
            <div className="mb-4">
              <div className="prose max-w-none">
                {chapter.paragraphs.map((paragraph: string, idx: number) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
              <ChapterInteractions chapterId={chapter.chapter_id} />
            </div>
          )}
          {/* AUDIO (placeholder for demo) */}
          {selectedTypes.audio && (
            <div className="mb-4">
              <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
                <audio controls className="w-full max-w-lg mb-2">
                  <source src="/placeholder-audio.mp3" type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
                <div className="text-xs text-gray-500 mb-1">Demo audio (replace with real story audio)</div>
                <ChapterInteractions chapterId={chapter.chapter_id} />
              </div>
            </div>
          )}
          {/* CARTOON/PRESENTATION (image placeholder) */}
          {selectedTypes.cartoon && (
            <div className="mb-4">
              <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
                <img
                  src="/placeholder.svg"
                  alt="Cartoon/Presentation"
                  className="h-56 object-contain mb-2"
                />
                <div className="text-xs text-gray-500 mb-1">Demo cartoon/presentation image</div>
                <ChapterInteractions chapterId={chapter.chapter_id} />
              </div>
            </div>
          )}
          {/* VIDEO (placeholder) */}
          {selectedTypes.video && (
            <div className="mb-4">
              <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
                <video controls className="w-full max-w-lg mb-2">
                  <source src="/placeholder-video.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="text-xs text-gray-500 mb-1">Demo video (replace with real story video)</div>
                <ChapterInteractions chapterId={chapter.chapter_id} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StoryContentTypeSelector;

