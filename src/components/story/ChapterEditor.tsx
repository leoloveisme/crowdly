import React, { useEffect, useState } from "react";
import { GitBranch, ImagePlus } from "lucide-react";
import EditableText from "@/components/EditableText";
import ParagraphBranchPopover from "@/components/ParagraphBranchPopover";
import GalleryUpload from "@/components/GalleryUpload";
import TagBadge from "@/components/TagBadge";
import TagInput from "@/components/TagInput";
import { cn } from "@/lib/utils";
import type { GalleryImage } from "@/lib/galleryApi";
import { ChapterNav } from "./ChapterReader";
import { isChapterUntitled, type InlineBranch, type StoryChapter } from "./types";

export interface BranchConfig {
  branchName: string;
  paragraphs: string[];
  language: string;
  metadata: Record<string, unknown> | null;
}

interface ChapterEditorProps {
  storyTitleId: string;
  chapter: StoryChapter;
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  headerExtra?: React.ReactNode;
  /** Owner edits apply directly; everyone else's become proposals. */
  isOwner: boolean;

  onRename: (chapter: StoryChapter, newTitle: string) => void;
  onUpdateTags: (chapterId: string, tags: string[]) => void;

  editingParagraph: { chapterId: string; index: number } | null;
  editingParagraphText: string;
  onStartEditParagraph: (chapter: StoryChapter, index: number, text: string) => void;
  onParagraphTextChange: (text: string) => void;
  onSaveParagraph: (chapter: StoryChapter, index: number) => void;
  onParagraphKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, chapter: StoryChapter, index: number) => void;

  inlineBranches: InlineBranch[];
  editingBranchId: number | null;
  onBranchFocus: (branchId: number) => void;
  onBranchTextChange: (branchId: number, text: string) => void;
  onBranchBlur: (branchId: number) => void;
  onQuickCreateBranch: (chapter: StoryChapter, index: number, text: string) => void;
  onConfigureBranch: (branchId: number, config: BranchConfig) => void;

  illustrations: GalleryImage[];
  illustrationTarget: { chapterId: string; anchorIndex: number } | null;
  onToggleIllustrationTarget: (chapterId: string, anchorIndex: number) => void;
  onIllustrationUploaded: () => void;
}

const textareaRows = (text: string) => Math.min(20, Math.max(3, Math.ceil(text.length / 90) + 1));

const actionBtn =
  "border rounded px-2 py-1 text-xs font-medium flex items-center gap-1 bg-white hover:bg-gray-100 shadow-sm whitespace-nowrap";

/**
 * Editing view of the active chapter: title, tags, one textarea per
 * paragraph, inline branches and illustration anchors.
 */
const ChapterEditor: React.FC<ChapterEditorProps> = (props) => {
  const {
    storyTitleId,
    chapter,
    index,
    total,
    onPrevious,
    onNext,
    headerExtra,
    isOwner,
    onRename,
    onUpdateTags,
    editingParagraph,
    editingParagraphText,
    onStartEditParagraph,
    onParagraphTextChange,
    onSaveParagraph,
    onParagraphKeyDown,
    inlineBranches,
    editingBranchId,
    onBranchFocus,
    onBranchTextChange,
    onBranchBlur,
    onQuickCreateBranch,
    onConfigureBranch,
    illustrations,
    illustrationTarget,
    onToggleIllustrationTarget,
    onIllustrationUploaded,
  } = props;

  const [titleValue, setTitleValue] = useState(isChapterUntitled(chapter) ? "" : chapter.chapter_title);
  useEffect(() => {
    setTitleValue(isChapterUntitled(chapter) ? "" : chapter.chapter_title);
  }, [chapter.chapter_id, chapter.chapter_title]);

  const commitTitle = () => {
    const next = titleValue.trim();
    if (next && next !== chapter.chapter_title) onRename(chapter, next);
  };

  // An empty chapter still gets one textarea so there's somewhere to type.
  const hasParagraphs = Array.isArray(chapter.paragraphs) && chapter.paragraphs.length > 0;
  const editableChapter: StoryChapter = hasParagraphs ? chapter : { ...chapter, paragraphs: [""] };

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl font-semibold text-gray-400 shrink-0">{index + 1}.</span>
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setTitleValue(isChapterUntitled(chapter) ? "" : chapter.chapter_title);
              }
            }}
            placeholder="Untitled chapter — click to add a title"
            className="flex-1 min-w-0 text-xl font-semibold border-b border-dashed border-gray-300 hover:border-blue-400 focus:border-blue-500 bg-transparent px-1 py-0.5 focus:outline-none placeholder:italic placeholder:font-medium placeholder:text-gray-400"
          />
          {headerExtra}
        </div>
        <ChapterNav index={index} total={total} onPrevious={onPrevious} onNext={onNext} />
      </div>

      {!isOwner && (
        <p className="mb-3 text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded px-2 py-1">
          <EditableText id="story-editor-proposal-hint">
            Your changes are submitted as proposals for the story owner to review.
          </EditableText>
        </p>
      )}

      {/* Chapter tags */}
      {isOwner ? (
        <div className="mb-4">
          <TagInput
            tags={chapter.tags || []}
            onChange={(newTags) => onUpdateTags(chapter.chapter_id, newTags)}
            placeholder="#chapter-tag"
            className="border border-gray-100 rounded p-1.5 text-xs"
          />
        </div>
      ) : chapter.tags && chapter.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 mb-4">
          {chapter.tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </div>
      ) : null}

      {editableChapter.paragraphs.map((paragraph, idx) => {
        const isActive = editingParagraph?.chapterId === chapter.chapter_id && editingParagraph?.index === idx;
        const value = isActive ? editingParagraphText : paragraph;
        const branchesHere = inlineBranches.filter(
          (b) => b.chapterId === chapter.chapter_id && b.parentParagraphIndex === idx,
        );
        const showIllustrationUpload =
          isOwner &&
          illustrationTarget?.chapterId === chapter.chapter_id &&
          illustrationTarget?.anchorIndex === idx;

        return (
          <div key={idx} className="mb-4">
            <div className="group/paragraph flex items-start gap-2">
              <textarea
                className="flex-1 border border-gray-200 hover:border-gray-300 focus:border-blue-400 px-2 py-1.5 text-sm leading-relaxed focus:outline-none resize-y rounded bg-white"
                value={value}
                placeholder="Type the chapter text here..."
                onFocus={() => onStartEditParagraph(editableChapter, idx, paragraph)}
                onChange={(e) => onParagraphTextChange(e.target.value)}
                onBlur={() => onSaveParagraph(editableChapter, idx)}
                onKeyDown={(e) => onParagraphKeyDown(e, editableChapter, idx)}
                rows={textareaRows(value)}
              />
              <div className="flex flex-col gap-1 opacity-60 group-hover/paragraph:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  className={actionBtn}
                  type="button"
                  onClick={() => onQuickCreateBranch(chapter, idx, paragraph)}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  <EditableText id="story-branch-create-btn">Create Branch</EditableText>
                </button>
                {isOwner && hasParagraphs && (
                  <button
                    className={actionBtn}
                    type="button"
                    onClick={() => onToggleIllustrationTarget(chapter.chapter_id, idx)}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    <EditableText id="story-insert-illustration">Insert illustration</EditableText>
                  </button>
                )}
              </div>
            </div>

            {/* Illustrations already anchored to this paragraph */}
            {illustrations
              .filter((g) => g.chapter_id === chapter.chapter_id && g.anchor_index === idx)
              .map((img) => (
                <figure key={img.id} className="my-3">
                  <img
                    src={img.image_url}
                    alt={img.caption ?? ""}
                    className="max-w-full max-h-96 rounded-md object-contain mx-auto"
                  />
                </figure>
              ))}

            {showIllustrationUpload && (
              <div className="my-3 max-w-sm">
                <GalleryUpload
                  storyTitleId={storyTitleId}
                  kind="inline_illustration"
                  chapterId={chapter.chapter_id}
                  anchorIndex={idx}
                  idPrefix="story-illustration-upload"
                  onUploaded={onIllustrationUploaded}
                />
              </div>
            )}

            {/* Inline branches created under this base paragraph */}
            {branchesHere.map((b) => (
              <div key={b.id} className="ml-4 mt-2 border-l border-dashed border-blue-200 pl-2">
                <div className="flex items-start gap-2">
                  <textarea
                    className={cn(
                      "flex-1 border border-blue-200 focus:border-blue-400 px-2 py-1.5 text-sm leading-relaxed focus:outline-none resize-y rounded bg-blue-50/40",
                    )}
                    placeholder="Type the branch text here..."
                    value={b.text}
                    autoFocus={editingBranchId === b.id}
                    onFocus={() => onBranchFocus(b.id)}
                    onChange={(e) => onBranchTextChange(b.id, e.target.value)}
                    onBlur={() => onBranchBlur(b.id)}
                    rows={textareaRows(b.text)}
                  />
                  <div className="flex flex-col gap-1 text-xs">
                    <button
                      type="button"
                      className={actionBtn}
                      onClick={() => onQuickCreateBranch(chapter, idx, b.text || paragraph)}
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      <EditableText id="story-branch-create-btn">Create Branch</EditableText>
                    </button>
                    <ParagraphBranchPopover
                      trigger={
                        <button type="button" className={actionBtn}>
                          <EditableText id="story-branch-configure-btn">Configure branch</EditableText>
                        </button>
                      }
                      onCreateBranch={({ branchName, paragraphs }) =>
                        onConfigureBranch(b.id, { branchName, paragraphs, language: "en", metadata: null })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <p className="text-[11px] text-gray-400">
        <EditableText id="story-editor-save-hint">
          Changes save when you click outside a paragraph (or press Ctrl/⌘+Enter). Esc cancels.
        </EditableText>
      </p>
    </div>
  );
};

export default ChapterEditor;
