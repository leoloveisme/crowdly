// Renders a screenplay scene (slugline + ordered blocks) to a simple text
// file and back, for scene<->Space-file sync (screenplaySpaceSync.js). The
// block-type inference on parse is the exact heuristic already used by
// POST /screenplays/:screenplayId/sync-desktop in server.js — extracted
// here so both places agree on what a CHARACTER cue / (parenthetical) /
// TRANSITION: / action line looks like.

export function inferBlockType(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 'action';
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  if (isAllCaps && !trimmed.endsWith(':')) return 'character';
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return 'parenthetical';
  if (isAllCaps && trimmed.endsWith(':')) return 'transition';
  return 'action';
}

/** `{slugline, blocks: [{blockType, text}, ...]}` -> a plain text file. The slugline is the first line; each block's text is its own paragraph, written verbatim so inferBlockType can recover its type on the way back in. */
export function sceneToText({ slugline, blocks }) {
  const lines = [slugline || ''];
  lines.push('');
  for (const block of blocks || []) {
    const text = (block && block.text) || '';
    if (!text.trim()) continue;
    lines.push(text.trim());
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

/** Inverse of sceneToText: first non-blank line is the slugline, every paragraph after that becomes one block with an inferred type. */
export function textToScene(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const slugline = paragraphs[0] || '';
  const blocks = paragraphs.slice(1).map((p) => ({ blockType: inferBlockType(p), text: p }));
  return { slugline, blocks };
}
