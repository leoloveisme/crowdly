/**
 * Fountain format importer
 * Parses Fountain screenplay format into markdown
 */

import { ImportResult, ImportFormat, ImportedDocument } from '@/types/import-export';

/**
 * Imports a Fountain file and converts to markdown
 */
export async function importFountain(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'No text content was found in this file.',
        errorType: 'empty_content',
      };
    }

    const { content, metadata } = parseFountain(text);

    const document: ImportedDocument = {
      content,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        originalFormat: ImportFormat.FOUNTAIN,
        importedAt: new Date(),
        wordCount: countWords(content),
      },
    };

    return {
      success: true,
      document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import Fountain file',
      errorType: 'unknown_error',
    };
  }
}

interface FountainMetadata {
  title?: string;
  author?: string;
  [key: string]: string | undefined;
}

/**
 * Parses Fountain text into markdown content and metadata
 */
function parseFountain(text: string): { content: string; metadata: FountainMetadata } {
  const lines = text.split('\n');
  const result: string[] = [];
  const metadata: FountainMetadata = {};

  let inTitlePage = true;
  let inBoneyard = false; // /* ... */ comments
  let currentElement = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle boneyard (multi-line comments)
    if (trimmed.startsWith('/*')) {
      inBoneyard = true;
      continue;
    }
    if (trimmed.endsWith('*/')) {
      inBoneyard = false;
      continue;
    }
    if (inBoneyard) continue;

    // Handle single-line notes [[...]]
    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
      continue; // Skip notes
    }

    // Handle title page
    if (inTitlePage) {
      // Title page ends with === or first non-metadata line
      if (trimmed === '===' || trimmed === '---') {
        inTitlePage = false;
        continue;
      }

      // Parse metadata
      const metaMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (metaMatch) {
        const key = metaMatch[1].toLowerCase();
        const value = metaMatch[2];
        metadata[key] = value;
        continue;
      }

      // If we hit a blank line followed by content, we're done with title page
      if (trimmed === '') {
        if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
          const nextLine = lines[i + 1].trim();
          if (!nextLine.match(/^\w+:/)) {
            inTitlePage = false;
          }
        }
        continue;
      }

      // Non-metadata line ends title page
      if (!trimmed.match(/^\w+:\s*/)) {
        inTitlePage = false;
        // Don't skip this line - process it below
      } else {
        continue;
      }
    }

    // Empty line
    if (trimmed === '') {
      result.push('');
      currentElement = '';
      continue;
    }

    // Page break (===)
    if (trimmed === '===') {
      result.push('');
      result.push('---');
      result.push('');
      continue;
    }

    // Forced elements (starting with special characters)
    // Scene heading forced with .
    if (trimmed.startsWith('.') && !trimmed.startsWith('..')) {
      const heading = trimmed.slice(1).trim();
      result.push(`## ${heading}`);
      currentElement = 'scene';
      continue;
    }

    // Action forced with !
    if (trimmed.startsWith('!')) {
      const action = trimmed.slice(1);
      result.push(action);
      currentElement = 'action';
      continue;
    }

    // Character forced with @
    if (trimmed.startsWith('@')) {
      const character = trimmed.slice(1).trim();
      result.push('');
      result.push(`**${character}**`);
      currentElement = 'character';
      continue;
    }

    // Centered text with > <
    if (trimmed.startsWith('>') && trimmed.endsWith('<')) {
      const centered = trimmed.slice(1, -1).trim();
      result.push(`> ${centered}`);
      continue;
    }

    // Scene headings (INT./EXT./EST./INT/EXT./I/E.)
    const sceneHeadingPattern = /^(INT\.|EXT\.|EST\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.)/i;
    if (sceneHeadingPattern.test(trimmed)) {
      result.push(`## ${trimmed}`);
      currentElement = 'scene';
      continue;
    }

    // Transition (ends with TO: or is > at start)
    if (/TO:$/i.test(trimmed) || (trimmed.startsWith('>') && !trimmed.endsWith('<'))) {
      const transition = trimmed.startsWith('>')
        ? trimmed.slice(1).trim().toUpperCase()
        : trimmed.toUpperCase();
      result.push(`*${transition}*`);
      currentElement = 'transition';
      continue;
    }

    // Character (all caps, not a scene heading)
    if (trimmed === trimmed.toUpperCase() && /^[A-Z][A-Z\s.'()\-]+$/.test(trimmed)) {
      // Check if it's followed by dialogue
      const isCharacter = i + 1 < lines.length && lines[i + 1].trim() !== '';
      if (isCharacter) {
        result.push('');
        result.push(`**${trimmed}**`);
        currentElement = 'character';
        continue;
      }
    }

    // Parenthetical
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      result.push(`*(${trimmed.slice(1, -1)})*`);
      currentElement = 'parenthetical';
      continue;
    }

    // Dialogue (after character or parenthetical)
    if (currentElement === 'character' || currentElement === 'parenthetical') {
      result.push(trimmed);
      currentElement = 'dialogue';
      continue;
    }

    // Default: action
    result.push(trimmed);
    currentElement = 'action';
  }

  // Add title as heading if present
  let content = result.join('\n');
  if (metadata.title) {
    content = `# ${metadata.title}\n\n${content}`;
  }

  return { content, metadata };
}

/**
 * Counts words in text
 */
function countWords(text: string): number {
  return text
    .replace(/[#*_~`\[\]()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
