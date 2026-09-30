// Keeps creative_space_items <-> content links correct automatically:
// - after a GitHub/Drive sync run, re-points a chapter/scene/page's link at
//   its file's new path if the connected repo/folder renamed or
//   reorganized it (GitHub's own sync has no rename detection at all; this
//   is also a backstop for anything Drive's own move-detection doesn't
//   cover), and
// - fills the gap for any chapter whose story is associated with a Space
//   but has no linked file yet (new chapters, or a story just pointed at a
//   Space for the first time). Gap-filling stays chapter-only — screenplay
//   scenes and comic pages don't get auto-created a Space file yet
//   (they can still be *linked* manually via the "Link to content" dialog).
// No manual "Link to chapter" step is required for the chapter case —
// server.js's content-link routes remain only as an override/manual path
// for pointing a specific file at a specific chapter/scene/page.
import path from 'path';
import fs from 'fs';
import { pool } from './db.js';
import { CREATIVE_SPACE_FILES_ROOT } from './creativeSpaceFiles.js';
import { ensureChapterCrdtDoc } from './chapterCrdtSync.js';
import { pullChapterFromLinkedItem, pushChapterToLinkedItem } from './chapterSpaceSync.js';
import { pullSceneFromLinkedItem } from './screenplaySpaceSync.js';
import { pullPageFromLinkedItem } from './comicPageSpaceSync.js';

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

async function logEvent(spaceId, entityType, entityId, oldItemId, newItemId, eventType, detail) {
  try {
    await pool.query(
      `INSERT INTO content_link_events (space_id, entity_type, entity_id, old_item_id, new_item_id, event_type, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [spaceId, entityType, entityId || null, oldItemId || null, newItemId || null, eventType, detail || null],
    );
  } catch (err) {
    console.error('[chapterSpaceReconcile] failed to log event:', err);
  }
}

// One entry per entity type that can be linked to a Space file — the
// matching/relinking algorithm below is identical for all three; only the
// column and the "fold the new file's content in" call differ.
const LINKABLE_ENTITY_TYPES = [
  { entityType: 'chapter', linkedColumn: 'linked_chapter_id', pullFn: pullChapterFromLinkedItem },
  { entityType: 'scene', linkedColumn: 'linked_scene_id', pullFn: pullSceneFromLinkedItem },
  { entityType: 'page', linkedColumn: 'linked_page_id', pullFn: pullPageFromLinkedItem },
];

/** Moves a link from `orphan` (a path the sync just discovered no longer exists) to `candidate` (a same-named, entirely unlinked file the sync just created/updated), folding the candidate's content into the linked entity first. */
async function relinkOrphan(spaceId, entityType, linkedColumn, pullFn, orphan, candidate) {
  const buffer = readItemBuffer(candidate);
  if (buffer) {
    try {
      // Reuses the normal pull path, just against a fabricated item view —
      // each pullFn only reads its own linked-id field, content_sync_enabled
      // and content_hash off `item`.
      await pullFn(
        { [linkedColumn]: orphan[linkedColumn], content_sync_enabled: true, content_hash: null },
        buffer,
      );
    } catch (err) {
      console.error('[chapterSpaceReconcile] merge-on-relink failed for', candidate.relative_path, err);
    }
  }

  // Carry the orphan's sync on/off state over rather than forcing it on —
  // a file whose sync the user stopped shouldn't resume just because the
  // connected repo renamed it.
  await pool.query(
    `UPDATE creative_space_items SET ${linkedColumn} = $1, content_sync_enabled = $2 WHERE id = $3`,
    [orphan[linkedColumn], Boolean(orphan.content_sync_enabled), candidate.id],
  );
  await pool.query(
    `UPDATE creative_space_items SET ${linkedColumn} = NULL, content_sync_enabled = false, deleted = true WHERE id = $1`,
    [orphan.id],
  );
  await logEvent(
    spaceId, entityType, orphan[linkedColumn], orphan.id, candidate.id,
    'auto_relinked',
    `Re-linked from "${orphan.relative_path}" to "${candidate.relative_path}"`,
  );
}

/** Re-points one entity type's links whose file moved/renamed on the connected side, matched by filename among files nothing links to yet (of ANY of the three types — a file the wizard already turned into a comic page, say, must never be "stolen" by a chapter-orphan match). Only orphans whose old path is genuinely gone from `remotePaths` and have exactly one same-named candidate get auto-relinked; anything ambiguous is logged, not guessed. */
async function reconcileOrphansForType(spaceId, remotePaths, { entityType, linkedColumn, pullFn }) {
  const orphansRes = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE space_id = $1 AND ${linkedColumn} IS NOT NULL AND deleted = false`,
    [spaceId],
  );
  const orphans = orphansRes.rows.filter((item) => !remotePaths.has(item.relative_path));
  if (orphans.length === 0) return;

  const candidatesRes = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE space_id = $1 AND kind = 'file' AND deleted = false
       AND linked_chapter_id IS NULL AND linked_scene_id IS NULL AND linked_page_id IS NULL`,
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
        await relinkOrphan(spaceId, entityType, linkedColumn, pullFn, orphan, matches[0]);
        // Claimed — remove so a later type in this same run can't also match it.
        candidatesByName.set(baseFileName(orphan.relative_path), []);
      } catch (err) {
        console.error('[chapterSpaceReconcile] relink failed for', orphan.relative_path, err);
      }
    } else {
      await logEvent(
        spaceId, entityType, orphan[linkedColumn], orphan.id, null,
        'unmatched_orphan',
        matches.length === 0
          ? `No file matching "${orphan.relative_path}" was found anymore — left linked at its old (now missing) path`
          : `Multiple files could match "${orphan.relative_path}" — left unresolved, pick one manually`,
      );
    }
  }
}

async function reconcileOrphans(spaceId, remotePaths) {
  for (const entry of LINKABLE_ENTITY_TYPES) {
    await reconcileOrphansForType(spaceId, remotePaths, entry);
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
       (space_id, relative_path, name, kind, mime_type, visibility, published, updated_by, linked_chapter_id, content_sync_enabled)
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
    space.id, 'chapter', chapter.chapter_id, null, item.id,
    'auto_created',
    `Created "${relativePath}" for a chapter that had no Space file yet`,
  );
}

/** Chapters whose story is associated with this Space (story_title.creative_space_id) but that no Space item links to yet. Chapter-only by design — see the module header. */
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
 * `remotePaths`, so renamed/removed files can be detected, across all three
 * linkable entity types) and, without `remotePaths`, right after a chapter
 * is created or a story is newly pointed at a Space (gap-filling only —
 * nothing to compare paths against yet).
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
