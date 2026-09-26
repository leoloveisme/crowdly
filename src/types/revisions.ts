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
  /**
   * Present only when this revision came from the real-time CRDT history
   * endpoint (GET /crdt/docs/:docKey/history) rather than the legacy
   * story_title_revisions/chapter_revisions/screenplay_revisions read
   * path. `docKey` + `heads` are what POST /crdt/docs/:docKey/restore
   * needs — restore is unavailable for revisions sourced from the legacy
   * endpoints (pre-CRDT-migration content), which is why these are
   * optional rather than required on RevisionSnapshot.
   */
  docKey?: string;
  heads?: string[];
}
