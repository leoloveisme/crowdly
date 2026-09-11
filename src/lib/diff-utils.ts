import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/**
 * Character-level diff between two strings.
 * Returns an array of segments indicating equal, inserted, or deleted text.
 */
export function charDiff(oldText: string, newText: string): DiffSegment[] {
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }));
}

/**
 * Line-level diff between two strings.
 * First diffs by line, then refines changed blocks with character-level detail.
 */
export function lineDiff(oldText: string, newText: string): DiffSegment[] {
  // Use diff-match-patch's line mode for efficiency on large texts
  const a = dmp.diff_linesToChars_(oldText, newText);
  const diffs = dmp.diff_main(a.chars1, a.chars2, false);
  dmp.diff_charsToLines_(diffs, a.lineArray);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }));
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render diff segments into HTML with colored highlighting.
 *
 * @param segments - Diff segments from charDiff or lineDiff
 * @param side - Which side to render: 'old' shows deletions highlighted,
 *               'new' shows insertions highlighted
 *
 * Colors match desktop app: deletions #ff9999 (red), additions #99ff99 (green).
 * Line-level backgrounds: deleted lines #ffcccc, inserted lines #ccffcc.
 */
export function renderDiffHtml(segments: DiffSegment[], side: 'old' | 'new'): string {
  const parts: string[] = [];

  for (const seg of segments) {
    const escaped = escapeHtml(seg.text);

    if (seg.type === 'equal') {
      parts.push(escaped);
    } else if (seg.type === 'delete' && side === 'old') {
      parts.push(
        `<span style="background:#ff9999">${escaped}</span>`
      );
    } else if (seg.type === 'insert' && side === 'new') {
      parts.push(
        `<span style="background:#99ff99">${escaped}</span>`
      );
    }
    // skip: delete on 'new' side, insert on 'old' side
  }

  return parts.join('');
}

/**
 * Build a full diff comparison between old and new text.
 * Returns HTML for both sides with character-level highlighting.
 *
 * Ported from desktop's _build_diff_html() logic.
 */
export function buildDiffHtml(oldText: string, newText: string): { oldHtml: string; newHtml: string } {
  const segments = charDiff(oldText, newText);

  return {
    oldHtml: renderDiffHtml(segments, 'old'),
    newHtml: renderDiffHtml(segments, 'new'),
  };
}
