import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EditableText from "@/components/EditableText";
import ChapterInteractions from "@/components/ChapterInteractions";
import type { StoryContentTypes } from "@/components/StoryContentTypeSelector";
import type { GalleryImage } from "@/lib/galleryApi";
import type { StoryChapter, StoryProposal } from "./types";

/**
 * Chapter title plus "Chapter N:" prefix, unless the stored title already
 * starts with one (older imports did that).
 */
export function formatChapterHeading(chapter: StoryChapter, index: number) {
  const rawTitle = String(chapter.chapter_title ?? "");
  return /^\s*chapter\s+\d+/i.test(rawTitle) ? rawTitle : `Chapter ${index + 1}: ${rawTitle}`;
}

interface ChapterNavProps {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

/** "‹ Previous · Chapter X of N · Next ›" — shared by the reader and the editor. */
export const ChapterNav: React.FC<ChapterNavProps> = ({ index, total, onPrevious, onNext }) => {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 shrink-0">
      <button
        type="button"
        onClick={onPrevious}
        disabled={index <= 0}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <EditableText id="story-chapter-prev">Previous chapter</EditableText>
      </button>
      <span className="whitespace-nowrap">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={index >= total - 1}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
      >
        <EditableText id="story-chapter-next">Next chapter</EditableText>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

interface ChapterReaderProps {
  chapter: StoryChapter;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  contentTypes: StoryContentTypes;
  proposals: StoryProposal[];
  illustrations: GalleryImage[];
  /** Rendered next to the heading (e.g. the mobile "Chapters" button). */
  headerExtra?: React.ReactNode;
}

const Illustration: React.FC<{ img: GalleryImage }> = ({ img }) => (
  <figure className="my-4">
    <img
      src={img.image_url}
      alt={img.caption ?? ""}
      className="max-w-full max-h-[32rem] rounded-md object-contain mx-auto"
    />
    {img.caption && (
      <figcaption className="text-xs text-gray-500 text-center mt-1">{img.caption}</figcaption>
    )}
  </figure>
);

/**
 * The single, read-only rendering of the active chapter: text (with pending
 * proposals and anchored illustrations) and the Audio / Cartoon / Video
 * panels, driven by the content-type checkboxes.
 */
const ChapterReader: React.FC<ChapterReaderProps> = ({
  chapter,
  index,
  total,
  onPrevious,
  onNext,
  contentTypes,
  proposals,
  illustrations,
  headerExtra,
}) => {
  const paragraphs = Array.isArray(chapter.paragraphs) ? chapter.paragraphs : [];
  const chapterIllustrations = illustrations.filter((g) => g.chapter_id === chapter.chapter_id);
  const overflowIllustrations = chapterIllustrations.filter(
    (g) => g.anchor_index === null || g.anchor_index >= paragraphs.length,
  );

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold" style={{ wordBreak: "break-word" }}>
            {formatChapterHeading(chapter, index)}
          </h2>
          {headerExtra}
        </div>
        <ChapterNav index={index} total={total} onPrevious={onPrevious} onNext={onNext} />
      </div>

      {/* TEXT */}
      {contentTypes.text && (
        <div className="mb-4">
          {paragraphs.map((paragraph, idx) => {
            // Support legacy data where a single string may contain newlines
            const lines = paragraph.split(/\n+/).filter((line) => line.trim().length > 0);
            const paragraphProposals = proposals.filter(
              (p) =>
                p.target_type === "paragraph" &&
                p.target_chapter_id === chapter.chapter_id &&
                (p.target_path ?? "") === String(idx),
            );
            // Illustrations anchor to a paragraph index at insertion time; there
            // are no stable paragraph IDs in this data model, so an illustration
            // can drift if paragraphs are later inserted/removed above it.
            const illustrationsHere = chapterIllustrations.filter((g) => g.anchor_index === idx);

            return (
              <React.Fragment key={idx}>
                <div className="mb-3 leading-relaxed">
                  {lines.map((line, lineIdx) => (
                    <p key={`${idx}-${lineIdx}`} className="mb-1">
                      {line}
                    </p>
                  ))}

                  {paragraphProposals.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {paragraphProposals.map((p) => (
                        <div
                          key={p.id}
                          className="text-xs text-purple-900 bg-purple-50 border border-dashed border-purple-200 rounded px-2 py-1"
                        >
                          <div className="whitespace-pre-wrap">
                            {p.proposed_text || (
                              <span className="italic text-purple-500">
                                <EditableText id="story-proposal-deletion">
                                  (Proposed deletion of this paragraph)
                                </EditableText>
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-purple-500">
                            <EditableText id="story-proposal-by">Proposed by</EditableText>{" "}
                            {p.author_email || "—"} · {new Date(p.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {illustrationsHere.map((img) => (
                  <Illustration key={img.id} img={img} />
                ))}
              </React.Fragment>
            );
          })}
          {overflowIllustrations.map((img) => (
            <Illustration key={img.id} img={img} />
          ))}
          <ChapterInteractions chapterId={chapter.chapter_id} />
        </div>
      )}

      {/* AUDIO (placeholder for demo) */}
      {contentTypes.audio && (
        <div className="mb-4">
          <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
            <audio controls className="w-full max-w-lg mb-2">
              <source src="/placeholder-audio.mp3" type="audio/mpeg" />
            </audio>
            <div className="text-xs text-gray-500 mb-1">
              <EditableText id="story-demo-audio">Demo audio (replace with real story audio)</EditableText>
            </div>
            <ChapterInteractions chapterId={chapter.chapter_id} />
          </div>
        </div>
      )}
      {/* CARTOON/PRESENTATION (image placeholder) */}
      {contentTypes.cartoon && (
        <div className="mb-4">
          <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
            <img src="/placeholder.svg" alt="" className="h-56 object-contain mb-2" />
            <div className="text-xs text-gray-500 mb-1">
              <EditableText id="story-demo-cartoon">Demo cartoon/presentation image</EditableText>
            </div>
            <ChapterInteractions chapterId={chapter.chapter_id} />
          </div>
        </div>
      )}
      {/* VIDEO (placeholder) */}
      {contentTypes.video && (
        <div className="mb-4">
          <div className="w-full bg-gray-50 rounded p-4 border flex flex-col items-center">
            <video controls className="w-full max-w-lg mb-2">
              <source src="/placeholder-video.mp4" type="video/mp4" />
            </video>
            <div className="text-xs text-gray-500 mb-1">
              <EditableText id="story-demo-video">Demo video (replace with real story video)</EditableText>
            </div>
            <ChapterInteractions chapterId={chapter.chapter_id} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterReader;
