// Bidirectional sync between a story chapter and a creative_space_items
// file that's been linked to it (creative_space_items.linked_chapter_id +
// content_sync_enabled). Both directions go through the chapter's CRDT doc
// (chapterCrdtSync.js) rather than the plain `stories` table directly, so
// concurrent edits from the chapter editor and the connected GitHub repo /
// Google Drive folder merge for real (Automerge) instead of one side
// clobbering the other or a manual "skip and log" conflict gate. The
// materialization listener in chapterCrdtSync.js persists the merged result
// into `stories`/`chapter_revisions` after every doc change.
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
import { getChapterCrdtHandle } from './chapterCrdtSync.js';
import { applyContentToHandle } from './crdt/repo.js';

const CHAPTER_SYNC_ACTOR = { id: null, email: 'chapter-sync@crowdly.internal' };

function hashOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Renders a chapter's current (CRDT) content into its linked Space item(s)
 * and schedules the existing GitHub/Drive item push. Safe to call after
 * every chapter-content write; no-ops quickly when nothing is linked or
 * nothing actually changed.
 */
export async function pushChapterToLinkedItem(chapterId) {
  const { rows: itemRows } = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE linked_chapter_id = $1 AND content_sync_enabled = true AND deleted = false`,
    [chapterId],
  );
  if (itemRows.length === 0) return;

  const handle = await getChapterCrdtHandle(chapterId);
  const doc = handle.doc();
  if (!doc) return;

  const buffer = Buffer.from(chapterToMarkdown({ title: doc.title, paragraphs: doc.paragraphs }), 'utf8');
  const hash = hashOf(buffer);

  for (const item of itemRows) {
    if (item.content_hash === hash) continue; // already in sync

    try {
      await storeItemContent({
        spaceId: item.space_id,
        itemId: item.id,
        buffer,
        mimeType: item.mime_type || guessMimeType(item.name),
        updatedBy: 'chapter-sync',
      });
      await pool.query(
        'UPDATE creative_space_items SET content_hash = $1, content_last_synced_at = now() WHERE id = $2',
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
 * Folds a Space item's just-pulled bytes into its linked chapter's CRDT doc,
 * if any. Called by githubSync.js/googleDriveSync.js right after they've
 * written pulled content to disk for a tracked item, and by
 * chapterSpaceReconcile.js when re-pointing a chapter at a renamed file.
 * Automerge merges this against whatever the chapter editor has done since
 * the last sync — no manual conflict gate. Returns a status string the
 * caller can log to its own (transport-specific) sync log:
 *   'not_linked' — item has no enabled chapter link (or its chapter/doc is gone), nothing to do.
 *   'echo'       — this is just the file we ourselves last pushed.
 *   'unchanged'  — parsed content matches the chapter's doc already; bookkeeping only.
 *   'applied'    — the chapter's doc was updated (merged) from this file's content.
 */
export async function pullChapterFromLinkedItem(item, buffer) {
  if (!item.linked_chapter_id || !item.content_sync_enabled) return 'not_linked';

  const hash = hashOf(buffer);
  if (item.content_hash === hash) return 'echo';

  const parsed = markdownToChapter(buffer);

  let handle;
  try {
    handle = await getChapterCrdtHandle(item.linked_chapter_id);
  } catch (err) {
    console.error('[chapterSpaceSync] pull skipped: could not load CRDT doc for chapter', item.linked_chapter_id, err);
    return 'not_linked';
  }
  const before = handle.doc();
  if (!before) return 'not_linked';

  const unchanged = (parsed.title || '') === (before.title || '')
    && JSON.stringify(parsed.paragraphs) === JSON.stringify(before.paragraphs || []);

  if (!unchanged) {
    applyContentToHandle(
      handle,
      { ...before, title: parsed.title || before.title, paragraphs: parsed.paragraphs },
      CHAPTER_SYNC_ACTOR,
      'external-sync',
    );
  }

  await pool.query(
    'UPDATE creative_space_items SET content_hash = $1, content_last_synced_at = now() WHERE id = $2',
    [hash, item.id],
  );

  return unchanged ? 'unchanged' : 'applied';
}
