// Bidirectional sync between a screenplay scene and a creative_space_items
// file linked to it (creative_space_items.linked_scene_id + content_sync_enabled).
// Mirrors chapterSpaceSync.js exactly: both directions go through the
// scene's CRDT doc (screenplaySceneCrdtSync.js) so concurrent edits from the
// screenplay editor and the connected GitHub repo/Drive folder merge for
// real instead of one side clobbering the other.
import crypto from 'crypto';
import { pool } from './db.js';
import { storeItemContent, guessMimeType } from './creativeSpaceFiles.js';
import { sceneToText, textToScene } from './screenplayMarkdown.js';
import { scheduleGithubPush } from './githubSync.js';
import { scheduleGoogleDrivePush } from './googleDriveSync.js';
import { getSceneCrdtHandle } from './screenplaySceneCrdtSync.js';
import { applyContentToHandle } from './crdt/repo.js';

const SCENE_SYNC_ACTOR = { id: null, email: 'scene-sync@crowdly.internal' };

function hashOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Renders a scene's current (CRDT) content into its linked Space item(s) and schedules the existing GitHub/Drive item push. */
export async function pushSceneToLinkedItem(sceneId) {
  const { rows: itemRows } = await pool.query(
    `SELECT * FROM creative_space_items
     WHERE linked_scene_id = $1 AND content_sync_enabled = true AND deleted = false`,
    [sceneId],
  );
  if (itemRows.length === 0) return;

  const handle = await getSceneCrdtHandle(sceneId);
  const doc = handle.doc();
  if (!doc) return;

  const buffer = Buffer.from(sceneToText({ slugline: doc.slugline, blocks: doc.blocks }), 'utf8');
  const hash = hashOf(buffer);

  for (const item of itemRows) {
    if (item.content_hash === hash) continue; // already in sync

    try {
      await storeItemContent({
        spaceId: item.space_id,
        itemId: item.id,
        buffer,
        mimeType: item.mime_type || guessMimeType(item.name),
        updatedBy: 'scene-sync',
      });
      await pool.query(
        'UPDATE creative_space_items SET content_hash = $1, content_last_synced_at = now() WHERE id = $2',
        [hash, item.id],
      );
      scheduleGithubPush(item.space_id, item.id);
      scheduleGoogleDrivePush(item.space_id, item.id);
    } catch (err) {
      console.error('[screenplaySpaceSync] push failed for item', item.id, err);
    }
  }
}

/**
 * Folds a Space item's just-pulled bytes into its linked scene's CRDT doc, if
 * any. Called by githubSync.js/googleDriveSync.js after they've written
 * pulled content to disk, and by chapterSpaceReconcile.js when re-pointing a
 * scene at a renamed file. Returns 'not_linked' | 'echo' | 'unchanged' | 'applied'
 * (same contract as pullChapterFromLinkedItem).
 */
export async function pullSceneFromLinkedItem(item, buffer) {
  if (!item.linked_scene_id || !item.content_sync_enabled) return 'not_linked';

  const hash = hashOf(buffer);
  if (item.content_hash === hash) return 'echo';

  const parsed = textToScene(buffer);

  let handle;
  try {
    handle = await getSceneCrdtHandle(item.linked_scene_id);
  } catch (err) {
    console.error('[screenplaySpaceSync] pull skipped: could not load CRDT doc for scene', item.linked_scene_id, err);
    return 'not_linked';
  }
  const before = handle.doc();
  if (!before) return 'not_linked';

  const beforeBlocks = (before.blocks || []).map((b) => ({ blockType: b.blockType, text: b.text }));
  const unchanged = (parsed.slugline || '') === (before.slugline || '')
    && JSON.stringify(parsed.blocks) === JSON.stringify(beforeBlocks);

  if (!unchanged) {
    applyContentToHandle(
      handle,
      { ...before, slugline: parsed.slugline || before.slugline, blocks: parsed.blocks },
      SCENE_SYNC_ACTOR,
      'external-sync',
    );
  }

  await pool.query(
    'UPDATE creative_space_items SET content_hash = $1, content_last_synced_at = now() WHERE id = $2',
    [hash, item.id],
  );

  return unchanged ? 'unchanged' : 'applied';
}
