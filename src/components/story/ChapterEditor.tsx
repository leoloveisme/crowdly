import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Columns2, FileAudio, FileText, GitBranch, Image as ImageIcon, ImagePlus, Loader2, Sparkles, Video } from "lucide-react";
import { Link } from "react-router-dom";
import EditableText from "@/components/EditableText";
import ParagraphBranchPopover from "@/components/ParagraphBranchPopover";
import GalleryUpload from "@/components/GalleryUpload";
import TagBadge from "@/components/TagBadge";
import TagInput from "@/components/TagInput";
import { cn } from "@/lib/utils";
import type { GalleryImage } from "@/lib/galleryApi";
import { fetchSourceChapter, markChapterSourceSynced, type SourceChapter } from "@/lib/translationsApi";
import { useLocales, localeName } from "./LanguageSwitcher";
import type { ChapterMediaList, MediaKind } from "@/lib/mediaApi";
import ChapterMediaEditor from "./media/ChapterMediaEditor";
import { connectionName, type AiConnection, type AiJob } from "@/lib/aiApi";
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

  /** Translation team may mark a translated chapter as up to date with its source. */
  canMarkSynced: boolean;
  onSourceSynced: () => void;

  /** All chapters (for the whole-audiobook uploader) and this chapter's media. */
  chapters: { chapter_id: string; chapter_title: string }[];
  media: ChapterMediaList | null;
  onMediaChanged: () => void;
  /** Active format tab, kept by the page so it survives chapter switches. */
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;

  /** The user's translation-capable AI connections, and AI job state for this chapter. */
  aiTranslateConnections: AiConnection[];
  aiJob: AiJob | null;
  onAiTranslateChapter: (connectionId: string) => void;
  onAiTranslateAll: (connectionId: string) => void;
  onAiJobQueued: () => void;
}

export type EditorTab = "text" | MediaKind;

const EDITOR_TABS: { id: EditorTab; icon: React.ReactNode; label: React.ReactNode }[] = [
  { id: "text", icon: <FileText className="h-3.5 w-3.5" />, label: <EditableText id="story-content-type-text">Text</EditableText> },
  { id: "audio", icon: <FileAudio className="h-3.5 w-3.5" />, label: <EditableText id="story-content-type-audio">Audio</EditableText> },
  {
    id: "visual",
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    label: <EditableText id="story-content-type-cartoon">Comics | Manga / Presentation</EditableText>,
  },
  { id: "video", icon: <Video className="h-3.5 w-3.5" />, label: <EditableText id="story-content-type-video">Video</EditableText> },
];

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
    canMarkSynced,
    onSourceSynced,
    chapters,
    media,
    onMediaChanged,
    tab,
    onTabChange: setTab,
    aiTranslateConnections,
    aiJob,
    onAiTranslateChapter,
    onAiTranslateAll,
    onAiJobQueued,
  } = props;

  const [aiConnectionId, setAiConnectionId] = useState("");
  const aiConnection = aiTranslateConnections.find((c) => c.id === aiConnectionId) ?? aiTranslateConnections[0];
  const aiBusy = aiJob !== null && (aiJob.status === "queued" || aiJob.status === "running");
  const chapterHasText = (chapter.paragraphs ?? []).some((p) => p.trim());

  const mediaCount = (kind: MediaKind) => (media?.media ?? []).filter((m) => m.kind === kind).length;

  // --- Translation support: the chapter this one translates, side by side ---
  const locales = useLocales();
  const [source, setSource] = useState<SourceChapter | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);
  const [markingSynced, setMarkingSynced] = useState(false);
  const loadSource = useCallback(() => {
    if (!chapter.source_chapter_id) {
      setSource(null);
      return;
    }
    fetchSourceChapter(chapter.chapter_id)
      .then(setSource)
      .catch(() => setSource(null));
  }, [chapter.chapter_id, chapter.source_chapter_id]);
  useEffect(loadSource, [loadSource]);

  const handleMarkSynced = async () => {
    setMarkingSynced(true);
    try {
      await markChapterSourceSynced(chapter.chapter_id);
      loadSource();
      onSourceSynced();
    } finally {
      setMarkingSynced(false);
    }
  };

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

  // Side by side: one row per paragraph position, original on the left. While
  // the original is longer, keep one empty slot after the last translated
  // paragraph so the translator can continue.
  const sideBySide = showOriginal && !!source?.source;
  const srcParas = sideBySide ? source!.source!.paragraphs : [];
  const trParas = editableChapter.paragraphs;
  const needsTrailingSlot =
    sideBySide && srcParas.length > trParas.length && (trParas[trParas.length - 1] ?? "").trim() !== "";
  const slotChapter: StoryChapter = needsTrailingSlot ? { ...editableChapter, paragraphs: [...trParas, ""] } : editableChapter;
  const rowCount = sideBySide ? Math.max(srcParas.length, slotChapter.paragraphs.length) : slotChapter.paragraphs.length;

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

      {/* Formats of this chapter — mirrors the reader's content-type checkboxes */}
      <div className="mb-4 flex flex-wrap gap-1 border-b" role="tablist">
        {EDITOR_TABS.map((t) => {
          const count = t.id === "text" ? 0 : mediaCount(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border-b-2 -mb-px transition",
                tab === t.id ? "border-blue-500 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900",
              )}
            >
              {t.icon}
              {t.label}
              {count > 0 && <span className="text-[10px] rounded-full bg-gray-100 px-1.5">{count}</span>}
            </button>
          );
        })}
      </div>

      {tab !== "text" ? (
        <ChapterMediaEditor
          kind={tab}
          storyTitleId={storyTitleId}
          chapterId={chapter.chapter_id}
          chapterParagraphs={Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []}
          chapters={chapters}
          list={media}
          onChanged={onMediaChanged}
          onAiJobQueued={onAiJobQueued}
        />
      ) : (
      <>

      {!isOwner && (
        <p className="mb-3 text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded px-2 py-1">
          <EditableText id="story-editor-proposal-hint">
            Your changes are submitted as proposals for the story owner to review.
          </EditableText>
        </p>
      )}

      {source?.source && (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              aria-pressed={showOriginal}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded border",
                showOriginal ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white hover:bg-gray-50",
              )}
            >
              <Columns2 className="h-3.5 w-3.5" />
              <EditableText id="story-editor-show-original">Show original</EditableText>
            </button>
            <span>
              <EditableText id="story-editor-translating-from">Translating from</EditableText>{" "}
              {localeName(locales, source.source.language || "en")}: “{source.source.chapter_title}”
            </span>
          </div>
          {/* AI translation draft */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {aiBusy ? (
              <span className="inline-flex items-center gap-1 text-purple-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <EditableText id="story-editor-ai-drafting">AI is drafting this chapter…</EditableText>
              </span>
            ) : aiTranslateConnections.length === 0 ? (
              <Link to="/profile" className="inline-flex items-center gap-1 text-purple-700 hover:underline">
                <Sparkles className="h-3.5 w-3.5" />
                <EditableText id="story-editor-ai-connect">Connect an AI provider to draft translations</EditableText>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      chapterHasText &&
                      !window.confirm("Replace this chapter's current text with a new AI draft? (It stays in Revisions.)")
                    ) {
                      return;
                    }
                    onAiTranslateChapter(aiConnection.id);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <EditableText id="story-editor-ai-draft-chapter">Draft this chapter with AI</EditableText>
                </button>
                <button
                  type="button"
                  onClick={() => onAiTranslateAll(aiConnection.id)}
                  className="px-2 py-1 rounded border bg-white hover:bg-gray-50"
                >
                  <EditableText id="story-editor-ai-draft-all">Draft all empty chapters</EditableText>
                </button>
                {aiTranslateConnections.length > 1 && (
                  <select
                    value={aiConnection.id}
                    onChange={(e) => setAiConnectionId(e.target.value)}
                    className="border rounded px-1 py-1 bg-white"
                  >
                    {aiTranslateConnections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {connectionName(c)}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {aiJob?.status === "failed" && aiJob.error && (
              <span className="text-red-700">
                <EditableText id="story-editor-ai-failed">Last AI draft failed:</EditableText> {aiJob.error}
              </span>
            )}
          </div>
          {chapter.ai_draft && (
            <div className="flex items-center gap-2 text-xs text-purple-900 bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <EditableText id="story-editor-ai-draft-note">
                AI draft — review it against the original. This note disappears after your first edit.
              </EditableText>
            </div>
          )}
          {source.stale && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <EditableText id="story-editor-stale">
                The original chapter changed since this translation was last marked up to date.
              </EditableText>
              {canMarkSynced && (
                <button
                  type="button"
                  disabled={markingSynced}
                  onClick={handleMarkSynced}
                  className="ml-auto px-2 py-0.5 rounded border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-50"
                >
                  <EditableText id="story-editor-mark-synced">Mark as up to date</EditableText>
                </button>
              )}
            </div>
          )}
        </div>
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

      {Array.from({ length: rowCount }, (_, idx) => {
        const paragraph = slotChapter.paragraphs[idx];
        const sourceCell = sideBySide ? (
          <div className="text-sm leading-relaxed text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1.5 whitespace-pre-wrap">
            {srcParas[idx] ?? ""}
          </div>
        ) : null;
        if (paragraph === undefined) {
          // Original has more paragraphs than the translation so far.
          return (
            <div key={idx} className="mb-4 grid md:grid-cols-2 gap-3 items-start">
              {sourceCell}
              <div />
            </div>
          );
        }
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
          <div key={idx} className={cn("mb-4", sideBySide && "grid md:grid-cols-2 gap-3 items-start")}>
            {sourceCell}
            <div className="min-w-0">
            <div className="group/paragraph flex items-start gap-2">
              <textarea
                className="flex-1 border border-gray-200 hover:border-gray-300 focus:border-blue-400 px-2 py-1.5 text-sm leading-relaxed focus:outline-none resize-y rounded bg-white"
                value={value}
                placeholder="Type the chapter text here..."
                onFocus={() => onStartEditParagraph(slotChapter, idx, paragraph)}
                onChange={(e) => onParagraphTextChange(e.target.value)}
                onBlur={() => {
                  // Leaving the empty "continue here" slot untouched is not an edit.
                  if (needsTrailingSlot && idx === trParas.length && !value.trim()) return;
                  onSaveParagraph(slotChapter, idx);
                }}
                onKeyDown={(e) => onParagraphKeyDown(e, slotChapter, idx)}
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
                {isOwner && hasParagraphs && idx < trParas.length && (
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
          </div>
        );
      })}

      <p className="text-[11px] text-gray-400">
        <EditableText id="story-editor-save-hint">
          Changes save when you click outside a paragraph (or press Ctrl/⌘+Enter). Esc cancels.
        </EditableText>
      </p>
      </>
      )}
    </div>
  );
};

export default ChapterEditor;
