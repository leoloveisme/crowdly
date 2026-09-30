// Shared chapter <-> markdown rendering, used by both githubSync.js's
// CRDT-backed Phase 2 links and chapterSpaceSync.js's plain stories-table
// sync, so a chapter renders identically regardless of which mechanism
// pushed/pulled it.

import { stripLeadingTitleLine, splitParagraphs } from '../scripts/lib/happybeingsSource.js';

export function chapterToMarkdown({ title, paragraphs }) {
  return `# ${title || ''}\n\n${(paragraphs || []).filter(Boolean).join('\n\n')}\n`;
}

export function markdownToChapter(buffer) {
  const { title, body } = stripLeadingTitleLine(buffer.toString('utf8'));
  return { title, paragraphs: splitParagraphs(body) };
}
