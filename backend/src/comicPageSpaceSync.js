// Sync between a comic page and a creative_space_items image file linked to
// it (creative_space_items.linked_page_id + content_sync_enabled). Unlike
// chapters/scenes, a comic page has no text to CRDT-merge — it's just an
// image — so this is pull-direction only: when the linked Space file's
// bytes change (an external GitHub/Drive edit, or a re-upload), the page's
// image_url is re-adopted to point at the new bytes. There's currently no
// UI path that replaces a comic page's image in place (comics.js only
// adds/reorders/deletes pages and patches alt_text), so push has nothing to
// trigger it yet — pushPageToLinkedItem is a documented no-op stub, wired in
// for when/if in-place image replacement is built.
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { pool } from './db.js';
import { guessMimeType } from './creativeSpaceFiles.js';
import { adoptLocalFile, LOCAL_UPLOADS_ROOT } from './storage.js';

function hashOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** No-op today — nothing in the product mutates a comic page's image_url in place yet. Kept for architectural symmetry with chapter/scene sync and so a future "replace page image" feature has somewhere to call into. */
export async function pushPageToLinkedItem(_pageId) {
  // Intentionally empty.
}

/**
 * Re-adopts a Space item's just-pulled image bytes into its linked comic
 * page's image_url. Returns 'not_linked' | 'echo' | 'applied' (same
 * contract shape as pullChapterFromLinkedItem/pullSceneFromLinkedItem).
 */
export async function pullPageFromLinkedItem(item, buffer) {
  if (!item.linked_page_id || !item.content_sync_enabled) return 'not_linked';

  const hash = hashOf(buffer);
  if (item.content_hash === hash) return 'echo';

  const pageRes = await pool.query('SELECT comic_id FROM comic_page WHERE page_id = $1', [item.linked_page_id]);
  if (pageRes.rows.length === 0) return 'not_linked';
  const { comic_id: comicId } = pageRes.rows[0];

  const mimeType = item.mime_type || guessMimeType(item.name);
  const destDir = path.join(LOCAL_UPLOADS_ROOT, 'comics', comicId);
  fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(item.name) || '';
  const destPath = path.join(destDir, `${randomUUID()}${ext}`);
  fs.writeFileSync(destPath, buffer);
  const imageUrl = await adoptLocalFile(destPath, mimeType);

  await pool.query('UPDATE comic_page SET image_url = $1 WHERE page_id = $2', [imageUrl, item.linked_page_id]);
  await pool.query(
    'UPDATE creative_space_items SET content_hash = $1, content_last_synced_at = now() WHERE id = $2',
    [hash, item.id],
  );

  return 'applied';
}
