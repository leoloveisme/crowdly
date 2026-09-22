import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import EditableText from "@/components/EditableText";
import ChapterInteractions from "@/components/ChapterInteractions";
import type { StoryContentTypes } from "@/components/StoryContentTypeSelector";
import { cn } from "@/lib/utils";
import type { GalleryImage } from "@/lib/galleryApi";
import { getEdition, type ChapterMedia, type ChapterMediaList, type Edition, type MediaKind } from "@/lib/mediaApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AudioPanel from "./media/AudioPanel";
import VisualPanel from "./media/VisualPanel";
import VideoPanel from "./media/VideoPanel";
import ChapterMediaEditor from "./media/ChapterMediaEditor";
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
  storyTitleId: string;
  chapter: StoryChapter;
  /** All chapters (titles), for the audiobook uploader in "Contribute". */
  chapters: StoryChapter[];
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  contentTypes: StoryContentTypes;
  proposals: StoryProposal[];
  illustrations: GalleryImage[];
  /** The edition being read (null = the story's current text). */
  edition: Edition | null;
  media: ChapterMediaList | null;
  onMediaChanged: () => void;
  /** Signed-in readers may submit media (reviewed by the owner). */
  canContributeMedia: boolean;
  onAiJobQueued?: () => void;
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

const CONTRIBUTE_LABELS: Record<MediaKind, React.ReactNode> = {
  audio: <EditableText id="story-contribute-audio">narration</EditableText>,
  visual: <EditableText id="story-contribute-visual">cartoon / presentation</EditableText>,
  video: <EditableText id="story-contribute-video">video</EditableText>,
};

/** Which paragraph is at the top of the viewport while reading. */
function useVisibleParagraph(container: React.RefObject<HTMLElement>, deps: unknown[]) {
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    const root = container.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const shown = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.paragraphIndex);
          if (e.isIntersecting) shown.add(i);
          else shown.delete(i);
        }
        setVisible(shown.size ? Math.min(...shown) : null);
      },
      { rootMargin: "-20% 0px -50% 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-paragraph-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return visible;
}

/**
 * The single, read-only rendering of the active chapter: its text (current
 * text, a chosen edition, or — while following a narration — the exact
 * edition the narrator read) and the Audio / Cartoon / Video panels, driven
 * by the content-type checkboxes.
 */
const ChapterReader: React.FC<ChapterReaderProps> = ({
  storyTitleId,
  chapter,
  chapters,
  index,
  total,
  onPrevious,
  onNext,
  contentTypes,
  proposals,
  illustrations,
  edition,
  media,
  onMediaChanged,
  canContributeMedia,
  onAiJobQueued,
  headerExtra,
}) => {
  const textRef = useRef<HTMLDivElement | null>(null);
  const [contributeKind, setContributeKind] = useState<MediaKind | null>(null);

  // Read-along: while following a narration, show the edition it was read
  // from and highlight the paragraph being read.
  const [followNarration, setFollowNarration] = useState<ChapterMedia | null>(null);
  const [followEdition, setFollowEdition] = useState<Edition | null>(null);
  const [narratedParagraph, setNarratedParagraph] = useState<number | null>(null);
  useEffect(() => {
    const id = followNarration?.edition_id;
    if (!id) return setFollowEdition(null);
    if (followEdition?.id === id) return;
    getEdition(id)
      .then(setFollowEdition)
      .catch(() => setFollowEdition(null));
  }, [followNarration, followEdition]);
  useEffect(() => {
    setFollowNarration(null);
    setNarratedParagraph(null);
  }, [chapter.chapter_id]);

  const shownEdition = followNarration ? followEdition : edition;
  const editionChapter = shownEdition?.chapters.find((c) => c.chapter_id === chapter.chapter_id) ?? null;
  const usingEdition = Boolean(editionChapter);
  const liveParagraphs = Array.isArray(chapter.paragraphs) ? chapter.paragraphs : [];
  const paragraphs = editionChapter ? editionChapter.snapshot_paragraphs : liveParagraphs;

  const chapterIllustrations = illustrations.filter((g) => g.chapter_id === chapter.chapter_id);
  const overflowIllustrations = chapterIllustrations.filter(
    (g) => g.anchor_index === null || g.anchor_index >= paragraphs.length,
  );

  const visibleParagraph = useVisibleParagraph(textRef, [chapter.chapter_id, paragraphs.length, contentTypes.text]);
  const activeParagraph = followNarration ? narratedParagraph : contentTypes.text ? visibleParagraph : null;

  // Keep the paragraph being narrated in view.
  useEffect(() => {
    if (!followNarration || narratedParagraph === null) return;
    textRef.current
      ?.querySelector(`[data-paragraph-index="${narratedParagraph}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [followNarration, narratedParagraph]);

  const byKind = (kind: MediaKind) => (media?.media ?? []).filter((m) => m.kind === kind);
  // Readers (not the story team — they use Editing mode) can submit their own
  // media for the owner to review, even when a chapter has none yet.
  const showContribute = canContributeMedia && media !== null && !media.can_moderate;

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold" style={{ wordBreak: "break-word" }}>
            {formatChapterHeading(editionChapter ? { ...chapter, chapter_title: editionChapter.chapter_title } : chapter, index)}
          </h2>
          {headerExtra}
        </div>
        <ChapterNav index={index} total={total} onPrevious={onPrevious} onNext={onNext} />
      </div>

      {showContribute && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <Plus className="h-3 w-3" />
          <EditableText id="story-contribute-add-own">Add your own:</EditableText>
          {(["audio", "visual", "video"] as MediaKind[]).map((kind, i) => (
            <React.Fragment key={kind}>
              {i > 0 && <span>·</span>}
              <button type="button" onClick={() => setContributeKind(kind)} className="text-blue-700 hover:underline">
                {CONTRIBUTE_LABELS[kind]}
              </button>
            </React.Fragment>
          ))}
        </p>
      )}

      {shownEdition && (
        <p className="mb-3 text-xs text-gray-500">
          {editionChapter ? (
            <>
              <EditableText id="story-reading-edition">Reading the edition</EditableText> “
              {shownEdition.is_auto_snapshot ? `Original · ${new Date(shownEdition.snapshot_at).toLocaleDateString()}` : shownEdition.name}”
            </>
          ) : (
            <EditableText id="story-edition-missing-chapter">
              This chapter isn't part of the selected edition — showing the current text.
            </EditableText>
          )}
        </p>
      )}

      {/* AUDIO — above the text so it's at hand while reading along */}
      {contentTypes.audio && (
        <div className="mb-4">
          <AudioPanel
            narrations={byKind("audio")}
            following={Boolean(followNarration)}
            onFollowingChange={(following, narration) => setFollowNarration(following ? narration : null)}
            onParagraphChange={setNarratedParagraph}
          />
        </div>
      )}

      {/* CARTOON/PRESENTATION */}
      {contentTypes.cartoon && (
        <div className="mb-4">
          <VisualPanel presentations={byKind("visual")} activeParagraph={activeParagraph} />
        </div>
      )}

      {/* TEXT */}
      {contentTypes.text && (
        <div className="mb-4" ref={textRef}>
          {paragraphs.map((paragraph, idx) => {
            // Support legacy data where a single string may contain newlines
            const lines = paragraph.split(/\n+/).filter((line) => line.trim().length > 0);
            // Proposals and illustrations anchor to the CURRENT text's indexes.
            const paragraphProposals = usingEdition
              ? []
              : proposals.filter(
                  (p) =>
                    p.target_type === "paragraph" &&
                    p.target_chapter_id === chapter.chapter_id &&
                    (p.target_path ?? "") === String(idx),
                );
            const illustrationsHere = usingEdition ? [] : chapterIllustrations.filter((g) => g.anchor_index === idx);
            const isNarrated = followNarration !== null && narratedParagraph === idx;

            return (
              <React.Fragment key={idx}>
                <div
                  data-paragraph-index={idx}
                  className={cn(
                    "mb-3 leading-relaxed rounded transition-colors",
                    isNarrated && "bg-yellow-100 -mx-2 px-2",
                  )}
                >
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
          {!usingEdition &&
            overflowIllustrations.map((img) => <Illustration key={img.id} img={img} />)}
          <ChapterInteractions chapterId={chapter.chapter_id} />
        </div>
      )}

      {/* VIDEO */}
      {contentTypes.video && (
        <div className="mb-4">
          <VideoPanel videos={byKind("video")} />
        </div>
      )}

      <Dialog open={contributeKind !== null} onOpenChange={(open) => !open && setContributeKind(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <EditableText id="story-contribute-dialog-title">Contribute to this chapter</EditableText>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">
            <EditableText id="story-contribute-review-note">The story owner reviews submissions before readers see them.</EditableText>
          </p>
          {contributeKind && (
            <ChapterMediaEditor
              kind={contributeKind}
              storyTitleId={storyTitleId}
              chapterId={chapter.chapter_id}
              chapterParagraphs={liveParagraphs}
              chapters={chapters}
              list={media}
              onChanged={onMediaChanged}
              onAiJobQueued={onAiJobQueued}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChapterReader;
