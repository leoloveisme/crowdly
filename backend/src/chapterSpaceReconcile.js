// Keeps creative_space_items <-> chapter links correct automatically:
// - after a GitHub/Drive sync run, re-points a chapter's link at its file's
//   new path if the connected repo/folder renamed or reorganized it
//   (GitHub's own sync has no rename detection at all; this is also a
//   backstop for anything Drive's own move-detection doesn't cover), and
// - fills the gap for any chapter whose story is associated with a Space
//   but has no linked file yet (new chapters, or a story just pointed at a
//   Space for the first time).
// No manual "Link to chapter" step is required for either case — that
// route in server.js remains only as an override for pointing a specific
// file at a different chapter.
import path from 'path';
import fs from 'fs';
import { pool } from './db.js';
import { CREATIVE_SPACE_FILES_ROOT } from './creativeSpaceFiles.js';
import { ensureChapterCrdtDoc } from './chapterCrdtSync.js';
import { pullChapterFromLinkedItem, pushChapterToLinkedItem } from './chapterSpaceSync.js';

function baseFileName(relativePath) {
  const name = relativePath.split('/').pop() || '';
  return name.replace(/\.[^.]+$/, '').toLowerCase().trim();
}

function slugify(title) {
  const slug = (title || 'untitled').trim().replace(/[\\/:*?"<>|]/g, '');
  return slug.slice(0, 120) || 'untitled';
}

function readItemBuffer(item) {
  if (!item.storage_path) return null;
  try {
    return fs.readFileSync(path.join(CREATIVE_SPACE_FILES_ROOT, item.storage_path));
  } catch {
    return null;
  }
}

async function logEvent(spaceId, chapterId, oldItemId, newItemId, eventType, detail) {
  try {
    await pool.query(
      `INSERT INTO chapter_link_events (space_id, chapter_id, old_item_id, new_item_id, event_type, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [spaceId, chapterId, oldItemId || null, newItemId || null, eventType, detail || null],
    );
  } catch (err) {
    console.error('[chapterSpaceReconcile] failed to log event:', err);
  }
}

/** Moves a chapter link from `orphan` (a path the sync just discovered no longer exists) to `candidate` (a same-named file the sync just created/updated), merging the candidate's content into the chapter's CRDT doc first. */
async function relinkOrphan(spaceId, orphan, candidate) {
  const buffer = readItemBuffer(candidate);
  if (buffer) {
    try {
      // Reuses the normal pull path, just against a fabricated item view —
      // pullChapterFromLinkedItem only reads these three fields off `item`.
      await pullChapterFromLinkedItem(
        {
          linked_chapter_id: orphan.linked_chapter_id,
          chapter_sync_enabled: true,
          chapter_content_hash: null,
        },
        buffer,
      );
    } catch (err) {
      console.error('[chapterSpaceReconcile] merge-on-relink failed for', candidate.relative_path, err);
    }
  }

  await pool.query(
    'UPDATE creative_space_items SET linked_chapter_id = $1, chapter_sync_enabled = true WHERE id = $2',
    [orphan.linked_chapter_id, candidate.id],
  );
  await pool.query(
    'UPDATE creative_space_items SET linked_chapter_id = NULL, chapter_sync_enabled = false, deleted = true WHERE id = $1',
    [orphan.id],
  );
  await logEvent(
    spaceId,
    orphan.linked_chapter_id,
    orphan.id,
    candidate.id,
    'auto_relinked',
    `Re-linked from "${orphan.relative_path}" to "${candidate.relative_path}"`,
  );
}

/** Re-points chapter links whose file moved/renamed on the connected side, matched by filename among files the latest sync touched. Only orphans whose old path is genuinely gone from `remotePaths` (not just this run's changed subset) and have exactly one same-named unlinked candidate get auto-relinked; anything ambiguous is logged, not guessed. */
async function reconcileOrphans(spaceId, remotePaths) {
  const orphansRes = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE space_id = $1 AND linked_chapter_id IS NOT NULL AND deleted = false`,
    [spaceId],
  );
  const orphans = orphansRes.rows.filter((item) => !remotePaths.has(item.relative_path));
  if (orphans.length === 0) return;

  const candidatesRes = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE space_id = $1 AND kind = 'file' AND deleted = false AND linked_chapter_id IS NULL`,
    [spaceId],
  );
  const candidatesByName = new Map();
  for (const candidate of candidatesRes.rows) {
    const key = baseFileName(candidate.relative_path);
    if (!candidatesByName.has(key)) candidatesByName.set(key, []);
    candidatesByName.get(key).push(candidate);
  }

  for (const orphan of orphans) {
    const matches = candidatesByName.get(baseFileName(orphan.relative_path)) || [];
    if (matches.length === 1) {
      try {
        await relinkOrphan(spaceId, orphan, matches[0]);
      } catch (err) {
        console.error('[chapterSpaceReconcile] relink failed for', orphan.relative_path, err);
      }
    } else {
      await logEvent(
        spaceId,
        orphan.linked_chapter_id,
        orphan.id,
        null,
        'unmatched_orphan',
        matches.length === 0
          ? `No file matching "${orphan.relative_path}" was found anymore — left linked at its old (now missing) path`
          : `Multiple files could match "${orphan.relative_path}" — left unresolved, pick one manually`,
      );
    }
  }
}

/** Picks the parent folder most of the Space's other linked chapter files already live under, so a newly auto-created file lands next to its siblings instead of at the Space root. */
async function mostCommonChapterFolder(spaceId) {
  const { rows } = await pool.query(
    `SELECT relative_path FROM creative_space_items
     WHERE space_id = $1 AND linked_chapter_id IS NOT NULL AND deleted = false`,
    [spaceId],
  );
  const counts = new Map();
  for (const row of rows) {
    const idx = row.relative_path.lastIndexOf('/');
    const folder = idx === -1 ? '' : row.relative_path.slice(0, idx);
    counts.set(folder, (counts.get(folder) || 0) + 1);
  }
  let best = '';
  let bestCount = -1;
  for (const [folder, count] of counts) {
    if (count > bestCount) {
      best = folder;
      bestCount = count;
    }
  }
  return best;
}

async function createMissingLink(space, chapter) {
  const folder = await mostCommonChapterFolder(space.id);
  const fileName = `${slugify(chapter.chapter_title)}.md`;
  let relativePath = folder ? `${folder}/${fileName}` : fileName;

  const clash = await pool.query(
    'SELECT 1 FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = false',
    [space.id, relativePath],
  );
  if (clash.rows.length > 0) {
    const disambiguated = `${chapter.chapter_id}-${fileName}`;
    relativePath = folder ? `${folder}/${disambiguated}` : disambiguated;
  }

  const { rows } = await pool.query(
    `INSERT INTO creative_space_items
       (space_id, relative_path, name, kind, mime_type, visibility, published, updated_by, linked_chapter_id, chapter_sync_enabled)
     VALUES ($1, $2, $3, 'file', 'text/markdown', $4, false, 'chapter-sync', $5, true)
     ON CONFLICT (space_id, relative_path) DO NOTHING
     RETURNING *`,
    [space.id, relativePath, fileName, space.visibility || 'private', chapter.chapter_id],
  );
  const item = rows[0];
  if (!item) return; // lost a race with a concurrent reconcile; the next run will retry.

  await ensureChapterCrdtDoc(chapter.chapter_id);
  await pushChapterToLinkedItem(chapter.chapter_id);
  await logEvent(
    space.id,
    chapter.chapter_id,
    null,
    item.id,
    'auto_created',
    `Created "${relativePath}" for a chapter that had no Space file yet`,
  );
}

/** Chapters whose story is associated with this Space (story_title.creative_space_id) but that no Space item links to yet. */
async function fillLinkGaps(space) {
  const { rows } = await pool.query(
    `SELECT s.chapter_id, s.chapter_title
     FROM stories s
     JOIN story_title st ON st.story_title_id = s.story_title_id
     WHERE st.creative_space_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM creative_space_items i
         WHERE i.linked_chapter_id = s.chapter_id AND i.deleted = false
       )`,
    [space.id],
  );
  for (const chapter of rows) {
    try {
      await createMissingLink(space, chapter);
    } catch (err) {
      console.error('[chapterSpaceReconcile] auto-create failed for chapter', chapter.chapter_id, err);
    }
  }
}

/**
 * Entry point, called at the end of a GitHub/Drive sync run (with
 * `remotePaths`, so renamed/removed files can be detected) and, without
 * `remotePaths`, right after a chapter is created or a story is newly
 * pointed at a Space (gap-filling only — nothing to compare paths against
 * yet).
 */
export async function reconcileSpaceChapterLinks(spaceId, { remotePaths } = {}) {
  const spaceRes = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
  const space = spaceRes.rows[0];
  if (!space) return;

  if (remotePaths) {
    await reconcileOrphans(spaceId, remotePaths);
  }
  await fillLinkGaps(space);
}
