export type ContentType = 'story' | 'screenplay' | 'comic' | 'presentation' | 'audio' | 'video';

export interface RevisionSnapshot {
  id: string;
  revisionNumber: number;
  title: string;           // chapter title, scene heading, etc.
  contentText: string;     // full text for diffing
  contentData: unknown;    // raw structured data (paragraphs[], blocks[], etc.)
  contentType: ContentType;
  createdBy: string | null;
  createdByName?: string;
  createdAt: string;
  revisionReason: string | null;
  isContribution: boolean; // true if from a contributor (not owner)
}
