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
// Scope: flat, non-recursive. Only items directly at the Space's root
// (relative_path with no "/") are matched against the connected folder's
// direct children — a Drive folder's subfolders aren't synced in Phase 1.
// Same kind of accepted simplification as GitHub Phase 1 not handling giant
// repos.
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
  listFilesInFolder,
  getStartPageToken,
  listChangesSince,
  getFileMeta,
  getFileContent,
  putFileContent,
  watchChanges,
} from './googleDriveApp.js';
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

// --- Pull path (Drive -> Crowdly) -----------------------------------------

async function pullFolderContents(space, token) {
  const itemsRes = await pool.query(
    "SELECT * FROM creative_space_items WHERE space_id = $1 AND deleted = false AND kind = 'file' AND relative_path NOT LIKE '%/%'",
    [space.id],
  );
  const itemsByName = new Map(itemsRes.rows.map((item) => [item.name, item]));

  const files = await listFilesInFolder({ token, folderId: space.google_drive_folder_id });
  let pulled = 0;

  for (const file of files) {
    const item = itemsByName.get(file.name);
    if (!item) continue; // not a file we track for this Space — same "don't invent items" rule GitHub's pull follows.
    if (item.google_drive_md5 && file.md5Checksum && item.google_drive_md5 === file.md5Checksum) continue;

    try {
      const buffer = await getFileContent({ token, fileId: file.id });
      await storeItemContent({
        spaceId: space.id,
        itemId: item.id,
        buffer,
        mimeType: item.mime_type || guessMimeType(item.name),
        updatedBy: 'google-drive-sync',
      });
      await pool.query(
        'UPDATE creative_space_items SET google_drive_file_id = $1, google_drive_md5 = $2 WHERE id = $3',
        [file.id, file.md5Checksum || null, item.id],
      );
      pulled += 1;
      await logSync(space.id, 'pull', 'info', `Pulled ${file.name} from Google Drive`, file.name);
    } catch (err) {
      console.error('[googleDriveSync] pull failed for', file.name, err);
      await logSync(space.id, 'pull', 'error', `Failed to pull ${file.name}: ${err.message}`, file.name);
    }
  }

  await pool.query('UPDATE creative_spaces SET google_drive_last_synced_at = now() WHERE id = $1', [space.id]);
  return { pulled };
}

/** Entry point for both the poll loop and the webhook handler. */
export async function runSpaceDriveSync(spaceId) {
  const { rows } = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
  const space = rows[0];
  if (!space) return { skipped: true, reason: 'not_found' };
  if (!space.google_drive_sync_enabled || !space.google_drive_account_id || !space.google_drive_folder_id) {
    return { skipped: true, reason: 'not_connected' };
  }

  const accountRes = await pool.query('SELECT * FROM google_drive_accounts WHERE id = $1', [space.google_drive_account_id]);
  const account = accountRes.rows[0];
  if (!account) return { skipped: true, reason: 'account_missing' };

  try {
    const token = await getValidAccessToken(account);
    return await pullFolderContents(space, token);
  } catch (err) {
    console.error('[googleDriveSync] sync failed for space', spaceId, err);
    await logSync(spaceId, 'pull', 'error', `Sync failed: ${err.message}`);
    throw err;
  }
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
    pushItemToDrive(spaceId, itemId).catch((err) => {
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
    "SELECT * FROM creative_space_items WHERE id = $1 AND space_id = $2 AND deleted = false AND kind = 'file' AND relative_path NOT LIKE '%/%'",
    [itemId, spaceId],
  );
  const item = itemRes.rows[0];
  if (!item || !item.storage_path) return; // not a top-level item — out of Phase 1's flat sync scope, see module header.

  const accountRes = await pool.query('SELECT * FROM google_drive_accounts WHERE id = $1', [space.google_drive_account_id]);
  const account = accountRes.rows[0];
  if (!account) return;

  let buffer;
  try {
    buffer = fs.readFileSync(path.join(CREATIVE_SPACE_FILES_ROOT, item.storage_path));
  } catch (err) {
    console.error('[googleDriveSync] could not read local file for push', item.relative_path, err);
    await logSync(spaceId, 'push', 'error', `Could not read local content for ${item.relative_path}: ${err.message}`, item.relative_path);
    return;
  }

  const token = await getValidAccessToken(account);

  // If Drive already has a version we haven't seen (via a prior pull),
  // pushing now would silently clobber a Drive-side edit we don't know
  // about yet — defer to the next pull/poll instead (mirrors GitHub's
  // pre-push conflict check).
  if (item.google_drive_file_id) {
    let remote = null;
    try {
      remote = await getFileMeta({ token, fileId: item.google_drive_file_id });
    } catch (err) {
      console.error('[googleDriveSync] failed to look up remote file before push', item.relative_path, err);
      await logSync(spaceId, 'push', 'error', `Failed to check Google Drive before push for ${item.relative_path}: ${err.message}`, item.relative_path);
      return;
    }
    if (remote && item.google_drive_md5 && remote.md5Checksum && remote.md5Checksum !== item.google_drive_md5) {
      await logSync(spaceId, 'push', 'warn', `Skipped push for ${item.relative_path}: Google Drive has changes not yet pulled into Crowdly`, item.relative_path);
      return;
    }
  }

  try {
    const result = await putFileContent({
      token,
      fileId: item.google_drive_file_id || undefined,
      folderId: space.google_drive_folder_id,
      name: item.name,
      buffer,
      mimeType: item.mime_type || guessMimeType(item.name),
    });
    await pool.query(
      'UPDATE creative_space_items SET google_drive_file_id = $1, google_drive_md5 = $2 WHERE id = $3',
      [result.fileId, result.md5Checksum || null, itemId],
    );
    await pool.query('UPDATE creative_spaces SET google_drive_last_synced_at = now() WHERE id = $1', [spaceId]);
    await logSync(spaceId, 'push', 'info', `Pushed ${item.relative_path} to Google Drive`, item.relative_path);
  } catch (err) {
    console.error('[googleDriveSync] push failed for', item.relative_path, err);
    await logSync(spaceId, 'push', 'error', `Failed to push ${item.relative_path}: ${err.message}`, item.relative_path);
  }
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
      'SELECT id, google_drive_folder_id FROM creative_spaces WHERE google_drive_account_id = $1 AND google_drive_sync_enabled = true',
      [account.id],
    );
    const spacesByFolder = new Map(spacesRes.rows.map((s) => [s.google_drive_folder_id, s.id]));

    const affectedSpaceIds = new Set();
    for (const change of changes || []) {
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
