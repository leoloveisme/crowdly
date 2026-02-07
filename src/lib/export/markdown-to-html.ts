/**
 * Markdown to HTML converter for export functionality
 */

interface ConversionOptions {
  wrapInDocument?: boolean;
  includeStyles?: boolean;
}

/**
 * Converts markdown content to HTML
 * Uses a simple but effective regex-based approach for common markdown patterns
 */
export function markdownToHtml(markdown: string, options: ConversionOptions = {}): string {
  const { wrapInDocument = false, includeStyles = false } = options;

  let html = markdown;

  // Escape HTML special characters in code blocks first
  const codeBlocks: string[] = [];
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  const inlineCode: string[] = [];
  html = html.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINE_CODE_${inlineCode.length - 1}__`;
  });

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^[-*_]{3,}$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Paragraphs - wrap lines that aren't already HTML tags
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return '';
    if (trimmed.startsWith('<') && !trimmed.startsWith('<a') && !trimmed.startsWith('<em') && !trimmed.startsWith('<strong')) {
      return line;
    }
    if (trimmed.match(/^<(h[1-6]|ul|ol|li|blockquote|hr|p|div|pre|code|table|thead|tbody|tr|td|th)/)) {
      return line;
    }
    return `<p>${trimmed}</p>`;
  });
  html = processedLines.join('\n');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    const content = block.replace(/```(\w+)?\n?([\s\S]*?)```/, (_, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre><code class="language-${lang || 'text'}">${escaped}</code></pre>`;
    });
    html = html.replace(`__CODE_BLOCK_${i}__`, content);
  });

  inlineCode.forEach((code, i) => {
    const content = code.slice(1, -1).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`__INLINE_CODE_${i}__`, `<code>${content}</code>`);
  });

  // Clean up extra paragraph tags around block elements
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr \/>)<\/p>/g, '$1');
  html = html.replace(/<p><\/p>/g, '');

  if (wrapInDocument) {
    const styles = includeStyles ? `
      <style>
        body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2, h3, h4, h5, h6 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin-top: 1.5em; margin-bottom: 0.5em; }
        p { margin: 1em 0; }
        blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 1em; color: #666; }
        code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-family: 'Courier New', Courier, monospace; }
        pre { background: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
      </style>
    ` : '';

    html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styles}
</head>
<body>
${html}
</body>
</html>`;
  }

  return html;
}

/**
 * Extracts the first heading from markdown as a title
 */
export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Estimates word count from markdown
 */
export function countWords(markdown: string): number {
  // Remove markdown syntax
  const text = markdown
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/[#*_~\[\]()]/g, '') // Remove markdown symbols
    .replace(/\n+/g, ' '); // Normalize whitespace

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}
