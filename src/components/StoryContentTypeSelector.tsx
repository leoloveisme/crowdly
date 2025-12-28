
import React, { useState } from "react";
import ChapterInteractions from "@/components/ChapterInteractions";
import { FileAudio, Video, Image } from "lucide-react";

/**
 * Modular UI for selecting which content type(s) to show for the **currently
 * active chapter** of a story.
 *
 * Props:
 *  - chapters: Array of story chapters as loaded by story page.
 *  - currentChapterIndex: Index of the active chapter (computed by Story page).
 *  - onSelectChapter: Callback to switch the active chapter when user clicks
 *    Previous / Next or picks a chapter from the list.
 */
interface StoryContentTypeSelectorProps {
  chapters: any[];
  currentChapterIndex: number;
  onSelectChapter: (index: number) => void;
}

const StoryContentTypeSelector: React.FC<StoryContentTypeSelectorProps> = ({
  chapters,
  currentChapterIndex,
  onSelectChapter,
}) => {
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

  const hasChapters = Array.isArray(chapters) && chapters.length > 0;
  const safeIndex = hasChapters
    ? Math.max(0, Math.min(currentChapterIndex, chapters.length - 1))
    : -1;
  const currentChapter =
    hasChapters && safeIndex >= 0 ? chapters[safeIndex] : null;

  const handlePrevious = () => {
    if (!hasChapters) return;
    const nextIndex = Math.max(0, safeIndex - 1);
    if (nextIndex !== safeIndex) onSelectChapter(nextIndex);
  };

  const handleNext = () => {
    if (!hasChapters) return;
    const nextIndex = Math.min(chapters.length - 1, safeIndex + 1);
    if (nextIndex !== safeIndex) onSelectChapter(nextIndex);
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

      {/* Active chapter content */}
      {currentChapter && (
        <div key={currentChapter.chapter_id} className="mb-8">
          <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-semibold text-lg">
              Chapter {safeIndex + 1}: {currentChapter.chapter_title}
            </div>
            {hasChapters && chapters.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={safeIndex <= 0}
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  1 Previous chapter
                </button>
                <span>
                  Chapter {safeIndex + 1} of {chapters.length}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={safeIndex >= chapters.length - 1}
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  Next chapter 7
                </button>
              </div>
            )}
          </div>

          {/* TEXT */}
          {selectedTypes.text && Array.isArray(currentChapter.paragraphs) && (
            <div className="mb-4">
              <div className="prose max-w-none">
                {currentChapter.paragraphs.map((paragraph: string, idx: number) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
              <ChapterInteractions chapterId={currentChapter.chapter_id} />
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
                <ChapterInteractions chapterId={currentChapter.chapter_id} />
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
                <ChapterInteractions chapterId={currentChapter.chapter_id} />
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
                <ChapterInteractions chapterId={currentChapter.chapter_id} />
              </div>
            </div>
          )}
        </div>
      )}

      {!currentChapter && !hasChapters && (
        <p className="text-sm text-gray-500">No chapters have been added yet.</p>
      )}

      {hasChapters && (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold mb-2">Chapters</h3>
          <div className="space-y-1">
            {chapters.map((chapter, index) => {
              const isActive = index === safeIndex;
              return (
                <button
                  key={chapter.chapter_id}
                  type="button"
                  onClick={() => onSelectChapter(index)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded border text-left transition ${
                    isActive
                      ? "border-blue-400 bg-blue-50 text-blue-800"
                      : "border-transparent hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{index + 1}.</span>
                    <span>{chapter.chapter_title}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryContentTypeSelector;

