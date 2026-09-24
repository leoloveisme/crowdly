// Phase 1 of the Google Drive <-> Crowdly connector: file-level bidirectional
// sync between one Drive folder and one creative space's `creative_space_items`
// content. Owns the new schema, the pull (Drive -> Crowdly) and push
// (Crowdly -> Drive) logic, the webhook event handler, the polling fallback,
// and push-notification channel renewal. server.js owns the REST endpoints
// and wires them to the functions here; creativeSpaceFiles.js's upload/edit
// routes call scheduleGoogleDrivePush() after a user-initiated content change
// — mirrors githubSync.js's structure and split of responsibilities.
//
// Loop guard: creative_space_items.google_drive_md5 records the Drive
// md5Checksum we last pulled or pushed for that item — same role as
// github_blob_sha in githubSync.js.
//
// Scope: recursive. The connected folder and all its subfolders map onto the
// Space's items by relative path ("Chapter 1/notes.md"); files are paired by
// Drive file id first (so renames/moves are followed), then by path. When
// both sides changed a text file since the last sync, it gets a line-based
// three-way merge against google_drive_base_content (the last agreed
// version); overlapping edits or binary files keep the Crowdly version and
// save Drive's as a "(conflict from Google Drive ...)" copy next to it.
// Deletes propagate only when the other side hadn't changed the file.
//
// Account vs. Space scoping: a Google Drive OAuth connection
// (google_drive_accounts) is per Crowdly user, reusable across all of that
// user's Spaces without re-consenting. A push-notification channel is
// registered per account (Drive has no "watch this one folder" mode — see
// googleDriveApp.js), so the webhook handler below fans a single
// notification out to every Space whose connected folder was touched.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from './db.js';
import {
  encryptToken,
  decryptToken,
  refreshAccessToken,
  listFolderTree,
  listChildFolders,
  createFolder,
  moveFile,
  trashFile,
  getStartPageToken,
  listChangesSince,
  getFileMeta,
  getFileContent,
  putFileContent,
  watchChanges,
} from './googleDriveApp.js';
import { merge as mergeLines } from 'node-diff3';
import { storeItemContent, guessMimeType, CREATIVE_SPACE_FILES_ROOT } from './creativeSpaceFiles.js';

export async function ensureGoogleDriveSyncTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS google_drive_accounts (
        id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 text NOT NULL UNIQUE,
        google_email            text,
        access_token_encrypted  text NOT NULL,
        refresh_token_encrypted text NOT NULL,
        token_expires_at        timestamptz NOT NULL,
        start_page_token        text,
        channel_id              text,
        channel_resource_id     text,
        channel_expires_at      timestamptz,
        connected_at            timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_account_id uuid REFERENCES google_drive_accounts(id)');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_folder_id text');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_folder_name text');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_sync_enabled boolean NOT NULL DEFAULT false');
    await pool.query('ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_last_synced_at timestamptz');

    // Per-item loop guard (see module header) — separate from the
    // metadata-manifest `hash` column and from github_blob_sha.
    await pool.query('ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS google_drive_file_id text');
    await pool.query('ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS google_drive_md5 text');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS google_drive_sync_log (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        direction     text NOT NULL,
        level         text NOT NULL DEFAULT 'info',
        message       text NOT NULL,
        relative_path text,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS google_drive_sync_log_space_idx ON google_drive_sync_log(space_id, created_at DESC)');

    console.log('[init] ensured Google Drive sync tables/columns exist');
  } catch (err) {
    console.error('[init] failed to ensure Google Drive sync tables:', err);
  }
}

async function logSync(spaceId, direction, level, message, relativePath = null) {
  try {
    await pool.query(
      'INSERT INTO google_drive_sync_log (space_id, direction, level, message, relative_path) VALUES ($1, $2, $3, $4, $5)',
      [spaceId, direction, level, message, relativePath],
    );
  } catch (err) {
    console.error('[googleDriveSync] failed to write sync log:', err);
  }
}

export async function recentSyncLog(spaceId, limit = 20) {
  const { rows } = await pool.query(
    'SELECT direction, level, message, relative_path, created_at FROM google_drive_sync_log WHERE space_id = $1 ORDER BY created_at DESC LIMIT $2',
    [spaceId, limit],
  );
  return rows;
}

// --- Token handling -------------------------------------------------------

const TOKEN_REFRESH_SKEW_MS = 60_000;

async function getValidAccessToken(account) {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return decryptToken(account.access_token_encrypted);
  }
  const refreshToken = decryptToken(account.refresh_token_encrypted);
  const refreshed = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await pool.query(
    'UPDATE google_drive_accounts SET access_token_encrypted = $1, token_expires_at = $2 WHERE id = $3',
    [encryptToken(refreshed.access_token), newExpiresAt, account.id],
  );
  return refreshed.access_token;
}

/** For routes (server.js) that only have an accountId, not the whole row. */
export async function getValidDriveAccessToken(accountId) {
  const { rows } = await pool.query('SELECT * FROM google_drive_accounts WHERE id = $1', [accountId]);
  const account = rows[0];
  if (!account) throw new Error('Google Drive account not found');
  return getValidAccessToken(account);
}

// --- Sync core (shared by full sync and single-item push) ------------------

const MERGE_MAX_BYTES = 2 * 1024 * 1024;
const SYNC_ACTOR = 'google-drive-sync';

function md5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/** Small, valid-UTF-8, NUL-free content is treated as text and gets a three-way merge; anything else is binary (conflict copy instead). */
function isMergeableText(buffer) {
  if (!buffer || buffer.length > MERGE_MAX_BYTES) return false;
  if (buffer.subarray(0, 8192).includes(0)) return false;
  return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
}

function baseContentFor(buffer) {
  return isMergeableText(buffer) ? buffer : null;
}

/** Line-based three-way merge. Returns the merged Buffer, or null when both sides changed the same lines. */
function threeWayMerge(ours, base, theirs) {
  const result = mergeLines(ours.toString('utf8').split('\n'), base.toString('utf8').split('\n'), theirs.toString('utf8').split('\n'));
  if (result.conflict) return null;
  return Buffer.from(result.result.join('\n'), 'utf8');
}

function readItemContent(item) {
  if (!item?.storage_path) return null;
  try {
    return fs.readFileSync(path.join(CREATIVE_SPACE_FILES_ROOT, item.storage_path));
  } catch {
    return null;
  }
}

function splitPath(relPath) {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? { parent: '', name: relPath } : { parent: relPath.slice(0, idx), name: relPath.slice(idx + 1) };
}

/** Per-Space serialization so the poll loop, webhook, "Sync now" and edit-triggered pushes never interleave on the same Space. */
const spaceLocks = new Map();
function withSpaceLock(spaceId, fn) {
  const previous = spaceLocks.get(spaceId) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  spaceLocks.set(spaceId, tail);
  tail.then(() => {
    if (spaceLocks.get(spaceId) === tail) spaceLocks.delete(spaceId);
  });
  return run;
}

async function loadSyncContext(space) {
  const accountRes = await pool.query('SELECT * FROM google_drive_accounts WHERE id = $1', [space.google_drive_account_id]);
  const account = accountRes.rows[0];
  if (!account) return null;
  const token = await getValidAccessToken(account);
  const folderIdsByPath = new Map([['', space.google_drive_folder_id]]);
  for (const [id, relPath] of Object.entries(space.google_drive_folder_ids || {})) {
    if (relPath) folderIdsByPath.set(relPath, id);
  }
  return {
    space,
    token,
    folderIdsByPath,
    stats: { pulled: 0, pushed: 0, merged: 0, conflicts: 0, deleted: 0, moved: 0 },
  };
}

/** Drive folder id for `relPath` under the Space's root, creating missing folders along the way (reusing an existing same-named folder rather than duplicating it). */
async function ensureDriveFolder(ctx, relPath) {
  if (ctx.folderIdsByPath.has(relPath)) return ctx.folderIdsByPath.get(relPath);
  const { parent, name } = splitPath(relPath);
  const parentId = await ensureDriveFolder(ctx, parent);
  const existing = (await listChildFolders({ token: ctx.token, parentId })).find((f) => f.name === name);
  const folder = existing || (await createFolder({ token: ctx.token, parentId, name }));
  ctx.folderIdsByPath.set(relPath, folder.id);
  return folder.id;
}

/** Crowdly folder item for `relPath` (and its ancestors), creating or undeleting as needed. */
async function ensureLocalFolder(ctx, relPath, driveFolderId = null) {
  if (!relPath) return;
  const { parent, name } = splitPath(relPath);
  await ensureLocalFolder(ctx, parent);
  await pool.query(
    `INSERT INTO creative_space_items (space_id, relative_path, name, kind, visibility, published, updated_by, google_drive_file_id)
     VALUES ($1, $2, $3, 'folder', $4, false, $5, $6)
     ON CONFLICT (space_id, relative_path) DO UPDATE
     SET deleted = false,
         kind = 'folder',
         google_drive_file_id = COALESCE(EXCLUDED.google_drive_file_id, creative_space_items.google_drive_file_id),
         updated_at = CASE WHEN creative_space_items.deleted THEN now() ELSE creative_space_items.updated_at END
     WHERE creative_space_items.deleted OR creative_space_items.kind = 'folder'`,
    [ctx.space.id, relPath, name, ctx.space.visibility || 'private', SYNC_ACTOR, driveFolderId],
  );
}

/** Creates (or revives a soft-deleted row for) a Crowdly file item at `relPath`. */
async function createLocalFileItem(ctx, relPath, mimeType) {
  const { parent, name } = splitPath(relPath);
  await ensureLocalFolder(ctx, parent);
  const { rows } = await pool.query(
    `INSERT INTO creative_space_items (space_id, relative_path, name, kind, mime_type, visibility, published, updated_by)
     VALUES ($1, $2, $3, 'file', $4, $5, false, $6)
     ON CONFLICT (space_id, relative_path) DO UPDATE
     SET deleted = false, kind = 'file', updated_at = now()
     WHERE creative_space_items.deleted OR creative_space_items.kind = 'file'
     RETURNING *`,
    [ctx.space.id, relPath, name, mimeType || guessMimeType(name), ctx.space.visibility || 'private', SYNC_ACTOR],
  );
  if (!rows[0]) throw new Error(`A folder already exists at ${relPath}`);
  return rows[0];
}

async function markSynced(itemId, { fileId, md5Checksum, content }) {
  await pool.query(
    'UPDATE creative_space_items SET google_drive_file_id = $1, google_drive_md5 = $2, google_drive_base_content = $3 WHERE id = $4',
    [fileId, md5Checksum || null, content ? baseContentFor(content) : null, itemId],
  );
}

async function storeLocal(ctx, item, buffer) {
  return storeItemContent({
    spaceId: ctx.space.id,
    itemId: item.id,
    buffer,
    mimeType: item.mime_type || guessMimeType(item.name),
    updatedBy: SYNC_ACTOR,
  });
}

async function uploadToDrive(ctx, item, buffer, existingFileId) {
  const { parent, name } = splitPath(item.relative_path);
  const folderId = existingFileId ? undefined : await ensureDriveFolder(ctx, parent);
  return putFileContent({
    token: ctx.token,
    fileId: existingFileId || undefined,
    folderId,
    name,
    buffer,
    mimeType: item.mime_type || guessMimeType(name),
  });
}

/** Keeps Crowdly's version at the original path and saves Drive's version next to it, so neither side's edits are lost. */
async function saveConflictCopy(ctx, item, remoteBuffer) {
  const { parent, name } = splitPath(item.relative_path);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const day = new Date().toISOString().slice(0, 10);
  let candidate;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : ` ${n}`;
    const fileName = `${stem} (conflict from Google Drive ${day}${suffix})${ext}`;
    candidate = parent ? `${parent}/${fileName}` : fileName;
    const { rows } = await pool.query(
      'SELECT 1 FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = false',
      [ctx.space.id, candidate],
    );
    if (rows.length === 0) break;
  }
  const conflictItem = await createLocalFileItem(ctx, candidate, item.mime_type);
  await storeLocal(ctx, conflictItem, remoteBuffer);
  const uploaded = await uploadToDrive(ctx, conflictItem, remoteBuffer, null);
  await markSynced(conflictItem.id, { fileId: uploaded.fileId, md5Checksum: uploaded.md5Checksum, content: remoteBuffer });
  return candidate;
}

/**
 * Brings one Crowdly file item and its Drive counterpart into agreement.
 * `item` and/or `remote` may be null. `remote` is `{ id, md5Checksum }`.
 * `item.google_drive_md5` is the md5 of the content both sides last agreed
 * on, so it tells us which side(s) changed since the last sync.
 */
async function reconcileFile(ctx, item, remote, remotePath = null) {
  const { space } = ctx;

  if (item && remote) {
    const local = readItemContent(item);
    const localMd5 = local ? md5(local) : null;
    const syncedMd5 = item.google_drive_md5 || null;
    const driveChanged = remote.md5Checksum !== syncedMd5;
    const localChanged = local !== null && localMd5 !== syncedMd5;

    if (local !== null && localMd5 === remote.md5Checksum) {
      if (item.google_drive_file_id !== remote.id || syncedMd5 !== localMd5) {
        await markSynced(item.id, { fileId: remote.id, md5Checksum: remote.md5Checksum, content: local });
      }
      return;
    }
    if (!localChanged && driveChanged) {
      const remoteBuffer = await getFileContent({ token: ctx.token, fileId: remote.id });
      await storeLocal(ctx, item, remoteBuffer);
      await markSynced(item.id, { fileId: remote.id, md5Checksum: remote.md5Checksum, content: remoteBuffer });
      ctx.stats.pulled += 1;
      await logSync(space.id, 'pull', 'info', `Pulled ${item.relative_path} from Google Drive`, item.relative_path);
      return;
    }
    if (localChanged && !driveChanged) {
      const uploaded = await uploadToDrive(ctx, item, local, remote.id);
      await markSynced(item.id, { fileId: uploaded.fileId, md5Checksum: uploaded.md5Checksum, content: local });
      ctx.stats.pushed += 1;
      await logSync(space.id, 'push', 'info', `Pushed ${item.relative_path} to Google Drive`, item.relative_path);
      return;
    }
    if (!localChanged && !driveChanged) return;

    // Both sides changed since the last sync.
    const remoteBuffer = await getFileContent({ token: ctx.token, fileId: remote.id });
    const base = item.google_drive_base_content;
    const merged =
      base && isMergeableText(local) && isMergeableText(remoteBuffer) ? threeWayMerge(local, Buffer.from(base), remoteBuffer) : null;

    if (merged) {
      if (!merged.equals(local)) await storeLocal(ctx, item, merged);
      const uploaded = await uploadToDrive(ctx, item, merged, remote.id);
      await markSynced(item.id, { fileId: uploaded.fileId, md5Checksum: uploaded.md5Checksum, content: merged });
      ctx.stats.merged += 1;
      await logSync(space.id, 'merge', 'info', `Merged Crowdly and Google Drive edits to ${item.relative_path}`, item.relative_path);
      return;
    }

    const conflictPath = await saveConflictCopy(ctx, item, remoteBuffer);
    const uploaded = await uploadToDrive(ctx, item, local, remote.id);
    await markSynced(item.id, { fileId: uploaded.fileId, md5Checksum: uploaded.md5Checksum, content: local });
    ctx.stats.conflicts += 1;
    await logSync(
      space.id,
      'merge',
      'warn',
      `Conflicting edits to ${item.relative_path}: kept the Crowdly version, saved the Google Drive version as ${conflictPath}`,
      item.relative_path,
    );
    return;
  }

  if (item && !remote) {
    const local = readItemContent(item);
    if (item.google_drive_file_id) {
      // Was synced before, now gone from the Drive folder: deleted (or moved out) on Drive.
      const localChanged = local !== null && md5(local) !== item.google_drive_md5;
      if (!localChanged) {
        await pool.query('UPDATE creative_space_items SET deleted = true, updated_at = now() WHERE id = $1', [item.id]);
        ctx.stats.deleted += 1;
        await logSync(space.id, 'pull', 'info', `Removed ${item.relative_path} (deleted on Google Drive)`, item.relative_path);
        return;
      }
      // Edited in Crowdly since — the edit wins, re-upload below as a new Drive file.
    }
    if (local === null) return; // metadata-only item (e.g. desktop manifest sync) — nothing to upload yet.
    const uploaded = await uploadToDrive(ctx, item, local, null);
    await markSynced(item.id, { fileId: uploaded.fileId, md5Checksum: uploaded.md5Checksum, content: local });
    ctx.stats.pushed += 1;
    await logSync(space.id, 'push', 'info', `Pushed ${item.relative_path} to Google Drive`, item.relative_path);
    return;
  }

  if (!item && remote) {
    const deletedRes = await pool.query(
      "SELECT * FROM creative_space_items WHERE space_id = $1 AND kind = 'file' AND deleted = true AND google_drive_file_id = $2",
      [space.id, remote.id],
    );
    const deletedItem = deletedRes.rows[0];
    if (deletedItem && deletedItem.google_drive_md5 === remote.md5Checksum) {
      // Deleted in Crowdly and untouched on Drive since — propagate the delete (to Drive's trash, recoverable).
      await trashFile({ token: ctx.token, fileId: remote.id });
      await pool.query('UPDATE creative_space_items SET google_drive_file_id = NULL WHERE id = $1', [deletedItem.id]);
      ctx.stats.deleted += 1;
      await logSync(space.id, 'push', 'info', `Moved ${remotePath} to the Google Drive trash (deleted in Crowdly)`, remotePath);
      return;
    }
    const remoteBuffer = await getFileContent({ token: ctx.token, fileId: remote.id });
    const newItem = await createLocalFileItem(ctx, remotePath, remote.mimeType);
    await storeLocal(ctx, newItem, remoteBuffer);
    await markSynced(newItem.id, { fileId: remote.id, md5Checksum: remote.md5Checksum, content: remoteBuffer });
    ctx.stats.pulled += 1;
    await logSync(space.id, 'pull', 'info', `Added ${remotePath} from Google Drive`, remotePath);
  }
}

/**
 * The same file (by Drive id) sits at different paths on each side: whichever
 * side changed since the last sync wins. A Crowdly-side move (item touched
 * after the last sync) is replayed on Drive; otherwise Drive's path is
 * adopted in Crowdly.
 */
async function reconcileMove(ctx, item, remote) {
  const lastSynced = ctx.space.google_drive_last_synced_at ? new Date(ctx.space.google_drive_last_synced_at).getTime() : 0;
  const crowdlyMoved = new Date(item.updated_at).getTime() > lastSynced;
  if (crowdlyMoved) {
    const { parent, name } = splitPath(item.relative_path);
    const toParentId = await ensureDriveFolder(ctx, parent);
    await moveFile({ token: ctx.token, fileId: remote.id, name, fromParentId: remote.parentId, toParentId });
    ctx.stats.moved += 1;
    await logSync(ctx.space.id, 'push', 'info', `Moved ${remote.path} to ${item.relative_path} on Google Drive`, item.relative_path);
    return item;
  }
  const taken = await pool.query(
    'SELECT 1 FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = false',
    [ctx.space.id, remote.path],
  );
  if (taken.rows.length > 0) return item; // target path occupied in Crowdly — leave both where they are.
  const { parent, name } = splitPath(remote.path);
  await ensureLocalFolder(ctx, parent);
  await pool.query('DELETE FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = true', [
    ctx.space.id,
    remote.path,
  ]);
  const { rows } = await pool.query(
    'UPDATE creative_space_items SET relative_path = $1, name = $2, updated_at = now() WHERE id = $3 RETURNING *',
    [remote.path, name, item.id],
  );
  ctx.stats.moved += 1;
  await logSync(ctx.space.id, 'pull', 'info', `Moved ${item.relative_path} to ${remote.path} (moved on Google Drive)`, remote.path);
  return rows[0];
}

async function saveFolderMap(ctx) {
  const map = {};
  for (const [relPath, id] of ctx.folderIdsByPath) {
    if (relPath) map[id] = relPath;
  }
  await pool.query(
    'UPDATE creative_spaces SET google_drive_folder_ids = $1, google_drive_last_synced_at = now() WHERE id = $2',
    [JSON.stringify(map), ctx.space.id],
  );
}

async function withItemErrorLogging(ctx, relPath, fn) {
  try {
    await fn();
  } catch (err) {
    console.error('[googleDriveSync] sync failed for', relPath, err);
    await logSync(ctx.space.id, 'sync', 'error', `Failed to sync ${relPath}: ${err.message}`, relPath);
  }
}

/** Full two-way reconcile of the connected Drive folder tree with the Space's items. */
async function syncWholeSpace(ctx) {
  const { space, token } = ctx;
  const tree = await listFolderTree({ token, rootId: space.google_drive_folder_id });

  ctx.folderIdsByPath = new Map([['', space.google_drive_folder_id]]);
  for (const folder of tree.folders) ctx.folderIdsByPath.set(folder.path, folder.id);

  for (const folder of tree.folders) {
    await withItemErrorLogging(ctx, folder.path, () => ensureLocalFolder(ctx, folder.path, folder.id));
  }

  const itemsRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE space_id = $1 AND deleted = false AND kind = 'file' ORDER BY relative_path",
    [space.id],
  );
  const remoteById = new Map(tree.files.map((f) => [f.id, f]));
  const remoteByPath = new Map(tree.files.map((f) => [f.path, f]));
  const usedRemote = new Set();
  const pairs = [];

  for (const item of itemsRes.rows) {
    const remote = item.google_drive_file_id ? remoteById.get(item.google_drive_file_id) : null;
    if (remote && !usedRemote.has(remote.id)) {
      usedRemote.add(remote.id);
      pairs.push([item, remote]);
    }
  }
  const pairedItemIds = new Set(pairs.map(([item]) => item.id));
  for (const item of itemsRes.rows) {
    if (pairedItemIds.has(item.id)) continue;
    const remote = remoteByPath.get(item.relative_path);
    if (remote && !usedRemote.has(remote.id)) {
      usedRemote.add(remote.id);
      pairs.push([item, remote]);
    } else {
      pairs.push([item, null]);
    }
  }
  for (const remote of tree.files) {
    if (!usedRemote.has(remote.id)) pairs.push([null, remote]);
  }

  for (const [pairedItem, remote] of pairs) {
    const relPath = pairedItem?.relative_path || remote.path;
    await withItemErrorLogging(ctx, relPath, async () => {
      let item = pairedItem;
      if (item && remote && item.relative_path !== remote.path) item = await reconcileMove(ctx, item, remote);
      await reconcileFile(ctx, item, remote, remote?.path);
    });
  }

  // Folders that exist only in Crowdly: new ones are created on Drive (so
  // empty folders round-trip too); previously-synced ones that vanished from
  // Drive are removed in Crowdly if nothing live remains inside them.
  const foldersRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE space_id = $1 AND deleted = false AND kind = 'folder' ORDER BY relative_path DESC",
    [space.id],
  );
  for (const folder of foldersRes.rows) {
    if (ctx.folderIdsByPath.has(folder.relative_path)) continue;
    await withItemErrorLogging(ctx, folder.relative_path, async () => {
      if (folder.google_drive_file_id) {
        const live = await pool.query(
          "SELECT 1 FROM creative_space_items WHERE space_id = $1 AND deleted = false AND relative_path LIKE $2 LIMIT 1",
          [space.id, `${folder.relative_path.replace(/[\\%_]/g, '\\$&')}/%`],
        );
        if (live.rows.length === 0) {
          await pool.query('UPDATE creative_space_items SET deleted = true, updated_at = now() WHERE id = $1', [folder.id]);
          ctx.stats.deleted += 1;
          return;
        }
      }
      const driveId = await ensureDriveFolder(ctx, folder.relative_path);
      await pool.query('UPDATE creative_space_items SET google_drive_file_id = $1 WHERE id = $2', [driveId, folder.id]);
    });
  }

  await saveFolderMap(ctx);
  return ctx.stats;
}

/** Entry point for the poll loop, the webhook handler and "Sync now". */
export async function runSpaceDriveSync(spaceId) {
  return withSpaceLock(spaceId, async () => {
    const { rows } = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
    const space = rows[0];
    if (!space) return { skipped: true, reason: 'not_found' };
    if (!space.google_drive_sync_enabled || !space.google_drive_account_id || !space.google_drive_folder_id) {
      return { skipped: true, reason: 'not_connected' };
    }
    try {
      const ctx = await loadSyncContext(space);
      if (!ctx) return { skipped: true, reason: 'account_missing' };
      const stats = await syncWholeSpace(ctx);
      const changed = Object.values(stats).some((n) => n > 0);
      if (changed) {
        await logSync(
          spaceId,
          'sync',
          'info',
          `Sync finished: ${stats.pulled} pulled, ${stats.pushed} pushed, ${stats.merged} merged, ${stats.conflicts} conflicts, ${stats.deleted} deleted, ${stats.moved} moved`,
        );
      }
      return stats;
    } catch (err) {
      console.error('[googleDriveSync] sync failed for space', spaceId, err);
      await logSync(spaceId, 'sync', 'error', `Sync failed: ${err.message}`);
      throw err;
    }
  });
}

// --- Push path (Crowdly -> Drive) ------------------------------------------

const PUSH_DEBOUNCE_MS = 1500;
const pushTimers = new Map(); // itemId -> Timeout, debounces rapid consecutive edits to the same item.

/** Called by creativeSpaceFiles.js after a user-initiated content write. No-op (cheaply) when the Space has no Drive sync configured/enabled. */
export function scheduleGoogleDrivePush(spaceId, itemId) {
  const existing = pushTimers.get(itemId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pushTimers.delete(itemId);
    withSpaceLock(spaceId, () => pushItemToDrive(spaceId, itemId)).catch((err) => {
      console.error('[googleDriveSync] push failed for item', itemId, err);
    });
  }, PUSH_DEBOUNCE_MS);
  pushTimers.set(itemId, timer);
}

async function pushItemToDrive(spaceId, itemId) {
  const spaceRes = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
  const space = spaceRes.rows[0];
  if (!space || !space.google_drive_sync_enabled || !space.google_drive_account_id || !space.google_drive_folder_id) return;

  const itemRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE id = $1 AND space_id = $2 AND deleted = false AND kind = 'file'",
    [itemId, spaceId],
  );
  const item = itemRes.rows[0];
  if (!item || !item.storage_path) return;

  const ctx = await loadSyncContext(space);
  if (!ctx) return;

  let remote = null;
  if (item.google_drive_file_id) {
    const meta = await getFileMeta({ token: ctx.token, fileId: item.google_drive_file_id });
    if (meta && !meta.trashed) remote = { id: meta.id, md5Checksum: meta.md5Checksum || null };
  }
  // A Drive file that disappeared (trashed) is treated as "never synced" here —
  // this push is a fresh local edit, so it re-creates the file rather than
  // mirroring the Drive-side delete.
  const pushable = remote ? item : { ...item, google_drive_file_id: null };
  await withItemErrorLogging(ctx, item.relative_path, () => reconcileFile(ctx, pushable, remote, item.relative_path));
  await saveFolderMap(ctx);
}

// --- Push-notification channel (account-scoped — see module header) -------

const CHANNEL_TTL_MS = 23 * 60 * 60 * 1000; // renew comfortably inside Google's ~24h max
const CHANNEL_RENEW_THRESHOLD_MS = 2 * 60 * 60 * 1000; // renew if expiring within 2h

async function armChannel(account, token) {
  const backendBase = process.env.BACKEND_BASE_URL || 'http://localhost:4000';
  const channelId = account.channel_id || crypto.randomUUID();
  const pageToken = account.start_page_token || (await getStartPageToken({ token }));

  const { resourceId, expiration } = await watchChanges({
    token,
    pageToken,
    channelId,
    address: `${backendBase}/api/google-drive/webhook`,
    expirationMs: Date.now() + CHANNEL_TTL_MS,
  });

  await pool.query(
    `UPDATE google_drive_accounts
     SET start_page_token = COALESCE(start_page_token, $1), channel_id = $2, channel_resource_id = $3, channel_expires_at = $4
     WHERE id = $5`,
    [pageToken, channelId, resourceId, expiration ? new Date(expiration) : new Date(Date.now() + CHANNEL_TTL_MS), account.id],
  );
}

/** Arms (or renews, if expiring soon) the push-notification channel for one account. Safe to call repeatedly — no-ops if the current channel still has plenty of life left. */
export async function ensureChannelArmed(accountId) {
  const { rows } = await pool.query('SELECT * FROM google_drive_accounts WHERE id = $1', [accountId]);
  const account = rows[0];
  if (!account) return;
  const expiresAt = account.channel_expires_at ? new Date(account.channel_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > CHANNEL_RENEW_THRESHOLD_MS) return; // still healthy
  const token = await getValidAccessToken(account);
  await armChannel(account, token);
}

// --- Webhook handling -------------------------------------------------

/**
 * Dispatches a Drive push notification. Called from the async tail of
 * POST /api/google-drive/webhook, after the request has already been ack'd.
 * A channel is account-wide (see module header), so one notification can
 * touch several Spaces — everything whose connected folder appears in a
 * changed file's parents gets re-synced.
 */
export async function handleGoogleDriveWebhookEvent(channelId, resourceId) {
  if (!channelId || !resourceId) return;

  const { rows } = await pool.query(
    'SELECT * FROM google_drive_accounts WHERE channel_id = $1 AND channel_resource_id = $2',
    [channelId, resourceId],
  );
  const account = rows[0];
  if (!account || !account.start_page_token) return;

  try {
    const token = await getValidAccessToken(account);
    const { changes, newStartPageToken } = await listChangesSince({ token, pageToken: account.start_page_token });

    const spacesRes = await pool.query(
      'SELECT id, google_drive_folder_id, google_drive_folder_ids FROM creative_spaces WHERE google_drive_account_id = $1 AND google_drive_sync_enabled = true',
      [account.id],
    );
    // Any folder under a Space's root (root included) maps back to that Space.
    const spacesByFolder = new Map();
    for (const s of spacesRes.rows) {
      spacesByFolder.set(s.google_drive_folder_id, s.id);
      for (const folderId of Object.keys(s.google_drive_folder_ids || {})) spacesByFolder.set(folderId, s.id);
    }

    const affectedSpaceIds = new Set();
    for (const change of changes || []) {
      if (spacesByFolder.has(change.fileId)) affectedSpaceIds.add(spacesByFolder.get(change.fileId)); // a synced folder itself changed
      for (const parentId of change.file?.parents || []) {
        const spaceId = spacesByFolder.get(parentId);
        if (spaceId) affectedSpaceIds.add(spaceId);
      }
    }

    if (newStartPageToken) {
      await pool.query('UPDATE google_drive_accounts SET start_page_token = $1 WHERE id = $2', [newStartPageToken, account.id]);
    }

    for (const spaceId of affectedSpaceIds) {
      try {
        await runSpaceDriveSync(spaceId);
      } catch (err) {
        console.error('[googleDriveSync] webhook-triggered sync failed for space', spaceId, err);
      }
    }
  } catch (err) {
    console.error('[googleDriveSync] webhook processing failed for account', account.id, err);
  }
}

// --- Polling fallback + channel renewal sweep ------------------------------

const POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 min — self-heals missed/undelivered notifications, same cadence as GitHub's fallback.
const CHANNEL_RENEWAL_SWEEP_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4h, renews any channel within CHANNEL_RENEW_THRESHOLD_MS of expiring.

export function startGoogleDrivePollingLoop() {
  setInterval(async () => {
    let rows;
    try {
      ({ rows } = await pool.query(
        'SELECT id FROM creative_spaces WHERE google_drive_sync_enabled = true AND google_drive_account_id IS NOT NULL',
      ));
    } catch (err) {
      console.error('[googleDriveSync] poll query failed:', err);
      return;
    }
    for (const row of rows) {
      try {
        await runSpaceDriveSync(row.id);
      } catch {
        // Already logged (console + google_drive_sync_log) inside runSpaceDriveSync.
      }
    }
  }, POLL_INTERVAL_MS);

  setInterval(async () => {
    let rows;
    try {
      ({ rows } = await pool.query('SELECT id FROM google_drive_accounts'));
    } catch (err) {
      console.error('[googleDriveSync] channel renewal query failed:', err);
      return;
    }
    for (const row of rows) {
      try {
        await ensureChannelArmed(row.id);
      } catch (err) {
        console.error('[googleDriveSync] channel renewal failed for account', row.id, err);
      }
    }
  }, CHANNEL_RENEWAL_SWEEP_INTERVAL_MS);

  console.log(
    `[init] Google Drive sync poll loop started (every ${Math.round(POLL_INTERVAL_MS / 60000)} min), ` +
      `channel renewal sweep every ${Math.round(CHANNEL_RENEWAL_SWEEP_INTERVAL_MS / 3600000)}h`,
  );
}
