/**
 * Tag parser utility for #tag syntax.
 * Supports: #simple, #'multi word', #"multi word"
 * Separators: spaces, commas
 */

const TAG_REGEX = /#(?:"([^"]+)"|'([^']+)'|([^\s,#]+))/g;

/** Parse a string containing #tag tokens into an array of unique tag strings. */
export function parseTags(input: string): string[] {
  if (!input) return [];
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;
  while ((match = TAG_REGEX.exec(input)) !== null) {
    const tag = (match[1] || match[2] || match[3] || '').trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/** Convert a tag array back to a #-prefixed display string. */
export function formatTags(tags: string[]): string {
  return tags
    .map((t) => (t.includes(' ') ? `#'${t}'` : `#${t}`))
    .join(' ');
}
