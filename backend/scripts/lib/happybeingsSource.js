// Reads the public github.com/leoloveisme/happybeings repo (7 books, each an
// English novel and, for Book I only, a screenplay) and turns its files into
// the {title, chapters: [{chapterTitle, paragraphs}]} shape the existing
// desktop-sync endpoints (`/stories/template` + `/story-titles/:id/sync-desktop`,
// `/screenplays/template` + `/screenplays/:id/sync-desktop`) already expect —
// see apps/desktop/src/editor/story_sync.py and crowdly_client.py, whose
// contract this mirrors instead of re-inventing one.
//
// Two source layouts exist in the repo:
//   Type A ("Book I Episode IV - New horizons"): English/novel/ and
//     English/screenplay/ subfolders, each with title.md, "table of
//     contents.md", and chapters/<Chapter Name>.md.
//   Type B (all other books): flat English/ folder — "Index of contents.md"
//     (Obsidian-style [[wikilinks]]) plus one .md file per chapter directly
//     alongside a "<Book folder name>.md" compiled/hub note (excluded — it's
//     not a chapter, it's an Obsidian index note). No screenplay.

const REPO = 'leoloveisme/happybeings';
const BRANCH = 'master';
const API_BASE = `https://api.github.com/repos/${REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    throw new Error(`GitHub API request failed (${res.status} ${res.statusText}) for ${url}`);
  }
  return res.json();
}

function rawUrl(path) {
  return `${RAW_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchRawFile(path) {
  const res = await fetch(rawUrl(path));
  if (!res.ok) {
    throw new Error(`Failed to fetch raw file (${res.status} ${res.statusText}): ${path}`);
  }
  return res.text();
}

/** Binary sibling of fetchRawFile, for photos/PDFs — returns a Buffer. */
export async function fetchRawFileBinary(path) {
  const res = await fetch(rawUrl(path));
  if (!res.ok) {
    throw new Error(`Failed to fetch raw file (${res.status} ${res.statusText}): ${path}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Full recursive file listing of the repo, one API call. */
export async function fetchRepoTree() {
  const data = await fetchJson(`${API_BASE}/git/trees/${BRANCH}?recursive=1`);
  if (data.truncated) {
    throw new Error('GitHub tree response was truncated — repo has grown too large for a single recursive listing.');
  }
  return data.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
}

/** Mirrors apps/desktop/src/editor/story_sync.py's _split_paragraphs: blank-line-separated blocks. */
export function splitParagraphs(text) {
  const lines = (text || '').split(/\r\n|\r|\n/);
  const paragraphs = [];
  let buf = [];
  const flush = () => {
    if (buf.length === 0) return;
    const joined = buf.join('\n').trim();
    buf = [];
    if (joined) paragraphs.push(joined);
  };
  for (const line of lines) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    buf.push(line.replace(/\s+$/, ''));
  }
  flush();
  return paragraphs;
}

/** Strips a single leading "# Title" line (if present) and returns {title, body}. */
export function stripLeadingTitleLine(content) {
  const lines = (content || '').split(/\r\n|\r|\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length) {
    const stripped = lines[i].trimStart();
    if (stripped.startsWith('#') && !stripped.startsWith('##')) {
      const title = (stripped.startsWith('# ') ? stripped.slice(2) : stripped.slice(1)).trim();
      const body = lines.slice(i + 1).join('\n');
      return { title: title || null, body };
    }
  }
  return { title: null, body: content || '' };
}

/** Parses either "table of contents.md" (plain lines) or "Index of contents.md" (Obsidian [[wikilinks]]) into an ordered list of chapter-name hints. */
export function parseTocEntries(tocText) {
  const wikilink = /^\[\[(.+)\]\]$/;
  const markdownHeading = /^#{1,6}\s/; // e.g. "# Index of contents" — a section label, not a chapter entry.
  return (tocText || '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !markdownHeading.test(line))
    .map((line) => {
      const m = line.match(wikilink);
      return m ? m[1].trim() : line;
    });
}

export function normalizeForMatch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function stem(path) {
  const base = path.split('/').pop() || '';
  return base.replace(/\.md$/i, '');
}

/**
 * Matches ToC entries (in order) against candidate chapter file paths by
 * filename stem, falling back to a normalized (punctuation/case-insensitive)
 * comparison. Any candidate file left unmatched is appended at the end (in
 * filename order) rather than silently dropped. Returns
 * { orderedPaths, unmatchedTocEntries, extraFiles }.
 */
export function resolveChapterOrder(tocEntries, candidatePaths) {
  const remaining = new Map(candidatePaths.map((p) => [p, { exact: stem(p), norm: normalizeForMatch(stem(p)) }]));
  const orderedPaths = [];
  const unmatchedTocEntries = [];

  for (const entry of tocEntries) {
    let matchPath = null;
    for (const [path, keys] of remaining) {
      if (keys.exact === entry) {
        matchPath = path;
        break;
      }
    }
    if (!matchPath) {
      const normEntry = normalizeForMatch(entry);
      for (const [path, keys] of remaining) {
        if (keys.norm === normEntry) {
          matchPath = path;
          break;
        }
      }
    }
    if (matchPath) {
      orderedPaths.push(matchPath);
      remaining.delete(matchPath);
    } else {
      unmatchedTocEntries.push(entry);
    }
  }

  const extraFiles = [...remaining.keys()].sort();
  orderedPaths.push(...extraFiles);

  return { orderedPaths, unmatchedTocEntries, extraFiles };
}

/**
 * Given the full repo tree, groups it into the 7 "Book * Episode *"
 * directories and, per book, the available formats ("novel", and
 * "screenplay" where present) with their title/toc/chapter file paths.
 */
export function discoverBooks(tree) {
  const bookDirs = new Set();
  for (const path of tree) {
    const m = path.match(/^(Book [^/]+)\//);
    if (m) bookDirs.add(m[1]);
  }

  const books = [];
  for (const folder of [...bookDirs].sort()) {
    const prefix = `${folder}/English/`;
    const filesUnderEnglish = tree.filter((p) => p.startsWith(prefix));

    const hasNovelDir = filesUnderEnglish.some((p) => p.startsWith(`${prefix}novel/`));
    const hasScreenplayDir = filesUnderEnglish.some((p) => p.startsWith(`${prefix}screenplay/`));

    const formats = {};

    if (hasNovelDir || hasScreenplayDir) {
      // Type A: structured novel/ and/or screenplay/ subfolders.
      for (const format of ['novel', 'screenplay']) {
        const formatPrefix = `${prefix}${format}/`;
        if (!filesUnderEnglish.some((p) => p.startsWith(formatPrefix))) continue;
        const titlePath = `${formatPrefix}title.md`;
        const tocPath = `${formatPrefix}table of contents.md`;
        const chapterPaths = filesUnderEnglish.filter(
          (p) => p.startsWith(`${formatPrefix}chapters/`) && p.endsWith('.md'),
        );
        formats[format] = { layout: 'nested', titlePath, tocPath, chapterPaths };
      }
    } else {
      // Type B: flat English/ folder, novel only.
      const compiledDocPath = `${prefix}${folder}.md`;
      const tocCandidates = ['Index of contents.md', 'table of contents.md'];
      const tocPath = tocCandidates
        .map((name) => `${prefix}${name}`)
        .find((p) => filesUnderEnglish.includes(p));
      const chapterPaths = filesUnderEnglish.filter(
        (p) => p.endsWith('.md') && p !== tocPath && p !== compiledDocPath,
      );
      formats.novel = { layout: 'flat', titlePath: null, tocPath, chapterPaths, folderName: folder };
    }

    books.push({ folder, formats });
  }

  return books;
}

/**
 * Fully resolves one format (novel/screenplay) of one book: title, ordered
 * chapters with paragraphs, and any match warnings. Performs the network
 * fetches (title.md/toc + every chapter file).
 */
export async function loadFormat(descriptor) {
  const title = descriptor.titlePath
    ? (await fetchRawFile(descriptor.titlePath)).trim()
    : descriptor.folderName;

  const tocText = descriptor.tocPath ? await fetchRawFile(descriptor.tocPath) : '';
  const tocEntries = parseTocEntries(tocText);
  const { orderedPaths, unmatchedTocEntries, extraFiles } = resolveChapterOrder(
    tocEntries,
    descriptor.chapterPaths,
  );

  const chapters = [];
  for (const path of orderedPaths) {
    const raw = await fetchRawFile(path);
    const { title: leadingTitle, body } = stripLeadingTitleLine(raw);
    const chapterTitle = leadingTitle || stem(path);
    const paragraphs = splitParagraphs(body);
    chapters.push({ chapterTitle, paragraphs, sourcePath: path });
  }

  return {
    title,
    chapters,
    warnings: {
      unmatchedTocEntries, // ToC entries with no matching file — nothing was invented for these.
      extraFiles, // chapter files not referenced by the ToC — appended at the end, not dropped.
    },
  };
}

export const HAPPYBEINGS_REPO = REPO;
