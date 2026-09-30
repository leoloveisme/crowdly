// Bidirectional sync between a story chapter (`stories.paragraphs`, the
// table the live chapter editor actually writes to) and a creative_space_items
// file that's been explicitly linked to it (creative_space_items.linked_chapter_id
// + chapter_sync_enabled). Deliberately built on the plain stories table, not
// the CRDT-backed Phase 2 link in githubSync.js — the real chapter editor
// (PATCH /chapters/:chapterId) never touches CRDT, so a mechanism built on it
// would never fire for real edits.
//
// Once an item's bytes are updated here, the EXISTING GitHub/Drive item-level
// push (scheduleGithubPush/scheduleGoogleDrivePush) and pull
// (githubSync.js's pullChangedPaths / googleDriveSync.js's storeLocal)
// machinery carries the change the rest of the way to/from the connected
// repo or Drive folder — no new transport code here.
import crypto from 'crypto';
import { pool } from './db.js';
import { storeItemContent, guessMimeType } from './creativeSpaceFiles.js';
import { chapterToMarkdown, markdownToChapter } from './chapterMarkdown.js';
import { scheduleGithubPush } from './githubSync.js';
import { scheduleGoogleDrivePush } from './googleDriveSync.js';

function hashOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function nextChapterRevisionNumber(queryable, chapterId) {
  const { rows } = await queryable.query(
    'SELECT revision_number FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [chapterId],
  );
  if (rows.length === 0) return 1;
  return Number(rows[0].revision_number) + 1;
}

/**
 * Renders a chapter's current content into its linked Space item (if sync is
 * enabled for it) and schedules the existing GitHub/Drive item push. Safe to
 * call after every chapter-content write; no-ops quickly when nothing is
 * linked or nothing actually changed.
 */
export async function pushChapterToLinkedItem(chapterId) {
  const { rows: itemRows } = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE linked_chapter_id = $1 AND chapter_sync_enabled = true AND deleted = false`,
    [chapterId],
  );
  if (itemRows.length === 0) return;

  const { rows: chapterRows } = await pool.query(
    'SELECT chapter_title, paragraphs FROM stories WHERE chapter_id = $1',
    [chapterId],
  );
  if (chapterRows.length === 0) return;
  const chapter = chapterRows[0];

  const buffer = Buffer.from(chapterToMarkdown({ title: chapter.chapter_title, paragraphs: chapter.paragraphs }), 'utf8');
  const hash = hashOf(buffer);

  for (const item of itemRows) {
    if (item.chapter_content_hash === hash) continue; // already in sync

    try {
      await storeItemContent({
        spaceId: item.space_id,
        itemId: item.id,
        buffer,
        mimeType: item.mime_type || guessMimeType(item.name),
        updatedBy: 'chapter-sync',
      });
      await pool.query(
        'UPDATE creative_space_items SET chapter_content_hash = $1, chapter_last_synced_at = now() WHERE id = $2',
        [hash, item.id],
      );
      scheduleGithubPush(item.space_id, item.id);
      scheduleGoogleDrivePush(item.space_id, item.id);
    } catch (err) {
      console.error('[chapterSpaceSync] push failed for item', item.id, err);
    }
  }
}

/**
 * Folds a Space item's just-pulled bytes into its linked chapter, if any.
 * Called by githubSync.js/googleDriveSync.js right after they've written
 * pulled content to disk for a tracked item. Returns a status string the
 * caller can log to its own (transport-specific) sync log:
 *   'not_linked'   — item has no enabled chapter link, nothing to do.
 *   'echo'         — this is just the file we ourselves last pushed.
 *   'unchanged'    — parsed content matches the chapter already; bookkeeping only.
 *   'conflict'     — the chapter changed locally since our last sync; skipped, needs manual resolution.
 *   'applied'      — the chapter was updated from this file's content.
 */
export async function pullChapterFromLinkedItem(item, buffer) {
  if (!item.linked_chapter_id || !item.chapter_sync_enabled) return 'not_linked';

  const hash = hashOf(buffer);
  if (item.chapter_content_hash === hash) return 'echo';

  const { title, paragraphs } = markdownToChapter(buffer);

  // SELECT ... FOR UPDATE holds the row lock across the read-check-write so a
  // concurrent PATCH /chapters/:chapterId can't land between our staleness
  // check and our write (same pattern already used for crdt_proposals in
  // POST /proposals/:proposalId/approve).
  const client = await pool.connect();
  let chapter;
  let status;
  let nextChapterTitle;
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT story_title_id, chapter_title, paragraphs, content_updated_at FROM stories WHERE chapter_id = $1 FOR UPDATE',
      [item.linked_chapter_id],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      console.error('[chapterSpaceSync] pull skipped: linked chapter no longer exists', item.linked_chapter_id);
      return 'not_linked';
    }
    chapter = rows[0];

    const titleChanged = (title || '') !== (chapter.chapter_title || '');
    const paragraphsChanged = JSON.stringify(paragraphs) !== JSON.stringify(chapter.paragraphs || []);
    if (!titleChanged && !paragraphsChanged) {
      await client.query('COMMIT');
      status = 'unchanged';
    } else {
      // The chapter changed in Crowdly since we last synced this item —
      // don't clobber a newer local edit with the incoming file content.
      const lastSynced = item.chapter_last_synced_at || item.created_at;
      if (chapter.content_updated_at && lastSynced && new Date(chapter.content_updated_at) > new Date(lastSynced)) {
        await client.query('ROLLBACK');
        return 'conflict';
      }

      nextChapterTitle = title || chapter.chapter_title;
      await client.query(
        'UPDATE stories SET chapter_title = $1, paragraphs = $2 WHERE chapter_id = $3',
        [nextChapterTitle, paragraphs, item.linked_chapter_id],
      );

      const revisionNumber = await nextChapterRevisionNumber(client, item.linked_chapter_id);
      await client.query(
        `INSERT INTO chapter_revisions
           (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)`,
        [item.linked_chapter_id, chapter.chapter_title, nextChapterTitle, chapter.paragraphs, paragraphs, revisionNumber, 'Synced from Space file', 'en'],
      );

      await client.query('COMMIT');
      status = 'applied';
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await pool.query(
    'UPDATE creative_space_items SET chapter_content_hash = $1, chapter_last_synced_at = now() WHERE id = $2',
    [hash, item.id],
  );

  if (status === 'applied' && chapter.story_title_id) {
    try {
      await pool.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [chapter.story_title_id]);
    } catch (errTs) {
      console.error('[chapterSpaceSync] failed to bump story_title.updated_at:', errTs);
    }
  }

  return status;
}
