// Shapes shared between the Story page and its presentational components.

export interface StoryChapter {
  chapter_id: string;
  chapter_title: string;
  chapter_index?: number;
  paragraphs: string[];
  tags?: string[];
  paragraphTags?: Record<string, string[]>;
  published?: boolean;
}

export interface StoryProposal {
  id: string;
  target_type: "story_title" | "chapter" | "paragraph" | "branch";
  target_chapter_id: string | null;
  target_path: string | null;
  proposed_text: string;
  created_at: string;
  author_email?: string;
}

export interface InlineBranch {
  id: number;
  chapterId: string;
  parentParagraphIndex: number;
  text: string;
}

// Chapters that were never given a custom title (including the old
// "New chapter" default before this fell back to "Untitled chapter")
// get a visual hint instead of looking like a finished title.
export const isChapterUntitled = (chapter: StoryChapter) =>
  !chapter.chapter_title ||
  chapter.chapter_title === "Untitled chapter" ||
  chapter.chapter_title === "New chapter";
