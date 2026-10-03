// Discovery mode (desktop app): a private library per user and reading data.
// Tables: backend/migrations/0018_discovery_library.sql. Client:
// apps/desktop/src/editor/library/sync.py.
//
// Privacy rules (see "Enhancement of the desktop app v2.0.md", Copyright &
// legal):
//   - every route needs a session and only ever touches the caller's rows;
//   - imported book files live OUTSIDE the public /uploads tree and are only
//     streamed back to their owner - no share links, no public URLs, no
//     search indexing;
//   - deduplication is per user only: one user's upload is never served to
//     another user, even when the files are identical;
//   - only own work / public domain / Creative Commons books may be marked as
//     converted into a Crowdly story.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LIBRARY_FILES_ROOT =
  process.env.LIBRARY_FILES_ROOT || path.join(__dirname, '..', 'private', 'library');
const MAX_FILE_BYTES = Number(process.env.LIBRARY_MAX_FILE_BYTES) || 300 * 1024 * 1024;
const USER_QUOTA_BYTES = Number(process.env.LIBRARY_USER_QUOTA_BYTES) || 2 * 1024 * 1024 * 1024;

const KINDS = new Set(['imported_book', 'crowdly_story']);
const FORMATS = new Set(['epub', 'pdf', 'audio', 'text']);
const RIGHTS = new Set(['unknown', 'personal_copy', 'own_work', 'public_domain', 'cc_licensed']);
const CONVERTIBLE_RIGHTS = new Set(['own_work', 'public_domain', 'cc_licensed']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MIN_SESSION_SECONDS = 10;
const MAX_SESSION_SECONDS = 24 * 60 * 60;

const router = express.Router();

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function serializeItem(row) {
  return {
    id: row.id,
    kind: row.kind,
    story_title_id: row.story_title_id,
    title: row.title,
    author: row.author,
    language: row.language,
    format: row.format,
    file_sha256: row.file_sha256,
    file_size: row.file_size === null ? null : Number(row.file_size),
    has_file: Boolean(row.storage_key),
    rights_status: row.rights_status,
    rights_declared_at: row.rights_declared_at,
    visibility: row.visibility,
    converted_at: row.converted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadOwnItem(userId, itemId) {
  if (!isUuid(itemId)) return null;
  const { rows } = await pool.query(
    'SELECT * FROM library_items WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [itemId, userId],
  );
  return rows[0] ?? null;
}

function filePathFor(storageKey) {
  // storage_key is "<userId>/<itemId>" - both uuids, so no path traversal.
  const [userId, itemId] = String(storageKey).split('/');
  if (!isUuid(userId) || !isUuid(itemId)) return null;
  return path.join(LIBRARY_FILES_ROOT, userId, itemId);
}

/** Remove every library file of a user (account deletion). */
export async function deleteUserLibraryFiles(userId) {
  if (!isUuid(userId)) return;
  await fs.promises.rm(path.join(LIBRARY_FILES_ROOT, userId), { recursive: true, force: true });
}

// -- library ------------------------------------------------------------------

router.get('/library/items', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM library_items
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [req.user.id],
    );
    const used = rows.reduce((sum, r) => sum + (r.storage_key ? Number(r.file_size || 0) : 0), 0);
    res.json({ items: rows.map(serializeItem), quota: { used, limit: USER_QUOTA_BYTES } });
  } catch (err) {
    console.error('[GET /library/items] failed:', err);
    res.status(500).json({ error: 'Failed to load library' });
  }
});

router.post('/library/items', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const kind = body.kind;
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'kind must be imported_book or crowdly_story' });
  const format = FORMATS.has(body.format) ? body.format : 'text';
  const rights = RIGHTS.has(body.rightsStatus) ? body.rightsStatus : 'unknown';
  const sha = typeof body.sha256 === 'string' && SHA256_RE.test(body.sha256) ? body.sha256 : null;
  const size = Number.isFinite(Number(body.size)) && Number(body.size) > 0 ? Math.floor(Number(body.size)) : null;
  const userId = req.user.id;

  try {
    if (kind === 'crowdly_story') {
      if (!isUuid(body.storyTitleId)) return res.status(400).json({ error: 'storyTitleId is required' });
      const story = await pool.query('SELECT title FROM story_title WHERE story_title_id = $1', [body.storyTitleId]);
      if (story.rows.length === 0) return res.status(404).json({ error: 'Story not found' });
      const existing = await pool.query(
        `SELECT * FROM library_items
          WHERE user_id = $1 AND story_title_id = $2 AND kind = 'crowdly_story' AND deleted_at IS NULL`,
        [userId, body.storyTitleId],
      );
      if (existing.rows[0]) return res.json({ item: serializeItem(existing.rows[0]) });
      const { rows } = await pool.query(
        `INSERT INTO library_items (user_id, kind, story_title_id, title, format)
         VALUES ($1, 'crowdly_story', $2, $3, 'text') RETURNING *`,
        [userId, body.storyTitleId, clip(body.title, 500) || story.rows[0].title || ''],
      );
      return res.status(201).json({ item: serializeItem(rows[0]) });
    }

    if (sha) {
      // The same file again from another device: return the existing copy.
      const existing = await pool.query(
        `SELECT * FROM library_items
          WHERE user_id = $1 AND file_sha256 = $2 AND deleted_at IS NULL`,
        [userId, sha],
      );
      if (existing.rows[0]) return res.json({ item: serializeItem(existing.rows[0]) });
    }
    if (size !== null && size > MAX_FILE_BYTES) {
      return res.status(413).json({ error: 'File is too large for the library' });
    }
    const { rows } = await pool.query(
      `INSERT INTO library_items
         (user_id, kind, title, author, language, format, file_sha256, file_size,
          rights_status, rights_declared_at)
       VALUES ($1, 'imported_book', $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $8 = 'unknown' THEN NULL ELSE now() END)
       RETURNING *`,
      [userId, clip(body.title, 500), clip(body.author, 300), clip(body.language, 35), format, sha, size, rights],
    );
    res.status(201).json({ item: serializeItem(rows[0]) });
  } catch (err) {
    console.error('[POST /library/items] failed:', err);
    res.status(500).json({ error: 'Failed to add library item' });
  }
});

router.put(
  '/library/items/:id/file',
  requireAuth,
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    const userId = req.user.id;
    try {
      const item = await loadOwnItem(userId, req.params.id);
      if (!item) return res.status(404).json({ error: 'Library item not found' });
      if (item.kind !== 'imported_book') return res.status(400).json({ error: 'Only imported books have files' });
      const data = req.body;
      if (!Buffer.isBuffer(data) || data.length === 0) return res.status(400).json({ error: 'File body is required' });

      const sha = createHash('sha256').update(data).digest('hex');
      if (item.file_sha256 && item.file_sha256 !== sha) {
        return res.status(400).json({ error: 'File does not match the library item' });
      }
      const { rows: usage } = await pool.query(
        `SELECT COALESCE(SUM(file_size), 0) AS used FROM library_items
          WHERE user_id = $1 AND deleted_at IS NULL AND storage_key IS NOT NULL AND id <> $2`,
        [userId, item.id],
      );
      if (Number(usage[0].used) + data.length > USER_QUOTA_BYTES) {
        return res.status(413).json({ error: 'Your library storage is full' });
      }

      const storageKey = `${userId}/${item.id}`;
      const target = filePathFor(storageKey);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${randomUUID()}.tmp`;
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, target);

      const { rows } = await pool.query(
        `UPDATE library_items
            SET storage_key = $1, file_size = $2, file_sha256 = $3, updated_at = now()
          WHERE id = $4 AND user_id = $5
          RETURNING *`,
        [storageKey, data.length, sha, item.id, userId],
      );
      res.json({ item: serializeItem(rows[0]) });
    } catch (err) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'This file is already in your library' });
      }
      console.error('[PUT /library/items/:id/file] failed:', err);
      res.status(500).json({ error: 'Failed to store file' });
    }
  },
);

router.get('/library/items/:id/file', requireAuth, async (req, res) => {
  try {
    const item = await loadOwnItem(req.user.id, req.params.id);
    if (!item || !item.storage_key) return res.status(404).json({ error: 'File not found' });
    const filePath = filePathFor(item.storage_key);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.sendFile(filePath);
  } catch (err) {
    console.error('[GET /library/items/:id/file] failed:', err);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

router.patch('/library/items/:id', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  try {
    const item = await loadOwnItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Library item not found' });
    const rights = body.rightsStatus === undefined ? null : body.rightsStatus;
    if (rights !== null && !RIGHTS.has(rights)) return res.status(400).json({ error: 'Unknown rights status' });
    const { rows } = await pool.query(
      `UPDATE library_items
          SET rights_status = COALESCE($1, rights_status),
              rights_declared_at = CASE WHEN $1 IS NULL THEN rights_declared_at ELSE now() END,
              title = COALESCE(NULLIF($2, ''), title),
              author = COALESCE($3, author),
              updated_at = now()
        WHERE id = $4 AND user_id = $5
        RETURNING *`,
      [
        rights,
        clip(body.title, 500),
        body.author === undefined ? null : clip(body.author, 300),
        item.id,
        req.user.id,
      ],
    );
    res.json({ item: serializeItem(rows[0]) });
  } catch (err) {
    console.error('[PATCH /library/items/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update library item' });
  }
});

router.delete('/library/items/:id', requireAuth, async (req, res) => {
  try {
    const item = await loadOwnItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Library item not found' });
    await pool.query(
      `UPDATE library_items SET deleted_at = now(), storage_key = NULL, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [item.id, req.user.id],
    );
    if (item.storage_key) {
      const filePath = filePathFor(item.storage_key);
      if (filePath) await fs.promises.rm(filePath, { force: true });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /library/items/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete library item' });
  }
});

router.post('/library/items/:id/convert', requireAuth, async (req, res) => {
  const { storyTitleId } = req.body ?? {};
  try {
    const item = await loadOwnItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Library item not found' });
    if (item.kind !== 'imported_book') return res.status(400).json({ error: 'Only imported books can be converted' });
    if (!CONVERTIBLE_RIGHTS.has(item.rights_status)) {
      return res.status(403).json({
        error: 'Only your own work, public-domain or Creative Commons books can become Crowdly stories',
      });
    }
    // Only link a story the caller actually owns.
    let linkedStory = null;
    if (isUuid(storyTitleId)) {
      const story = await pool.query(
        'SELECT story_title_id FROM story_title WHERE story_title_id = $1 AND creator_id = $2',
        [storyTitleId, req.user.id],
      );
      linkedStory = story.rows[0]?.story_title_id ?? null;
    }
    const { rows } = await pool.query(
      `UPDATE library_items
          SET visibility = 'converted', converted_at = COALESCE(converted_at, now()),
              story_title_id = COALESCE($1, story_title_id), updated_at = now()
        WHERE id = $2 AND user_id = $3
        RETURNING *`,
      [linkedStory, item.id, req.user.id],
    );
    res.json({ item: serializeItem(rows[0]) });
  } catch (err) {
    console.error('[POST /library/items/:id/convert] failed:', err);
    res.status(500).json({ error: 'Failed to convert library item' });
  }
});

// -- reading positions --------------------------------------------------------

function serializePosition(row) {
  if (!row) return null;
  return {
    percent: Number(row.percent),
    locator: row.locator ?? {},
    narration: row.narration ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

router.get('/reading/positions/:itemId', requireAuth, async (req, res) => {
  try {
    const item = await loadOwnItem(req.user.id, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Library item not found' });
    const { rows } = await pool.query(
      'SELECT * FROM reading_positions WHERE user_id = $1 AND library_item_id = $2',
      [req.user.id, item.id],
    );
    res.json({ position: serializePosition(rows[0]) });
  } catch (err) {
    console.error('[GET /reading/positions/:itemId] failed:', err);
    res.status(500).json({ error: 'Failed to load position' });
  }
});

router.put('/reading/positions/:itemId', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const percent = Math.max(0, Math.min(100, Number(body.percent) || 0));
  const locator = body.locator && typeof body.locator === 'object' ? body.locator : {};
  const narration = body.narration && typeof body.narration === 'object' ? body.narration : null;
  // The newer position wins; a client clock in the future is clamped to now.
  const reported = Date.parse(body.updatedAt);
  const updatedAt = new Date(Number.isFinite(reported) ? Math.min(reported, Date.now()) : Date.now());
  try {
    const item = await loadOwnItem(req.user.id, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Library item not found' });
    await pool.query(
      `INSERT INTO reading_positions (user_id, library_item_id, percent, locator, narration, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, library_item_id) DO UPDATE
         SET percent = EXCLUDED.percent,
             locator = EXCLUDED.locator,
             narration = COALESCE(EXCLUDED.narration, reading_positions.narration),
             updated_at = EXCLUDED.updated_at
       WHERE reading_positions.updated_at < EXCLUDED.updated_at`,
      [req.user.id, item.id, percent, JSON.stringify(locator), narration ? JSON.stringify(narration) : null, updatedAt],
    );
    const { rows } = await pool.query(
      'SELECT * FROM reading_positions WHERE user_id = $1 AND library_item_id = $2',
      [req.user.id, item.id],
    );
    res.json({ position: serializePosition(rows[0]) });
  } catch (err) {
    console.error('[PUT /reading/positions/:itemId] failed:', err);
    res.status(500).json({ error: 'Failed to save position' });
  }
});

// -- reading sessions ---------------------------------------------------------

router.post('/reading/sessions', requireAuth, async (req, res) => {
  const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions.slice(0, 500) : [];
  if (sessions.length === 0) return res.json({ accepted: 0 });
  try {
    const itemIds = [...new Set(sessions.map((s) => s?.libraryItemId).filter(isUuid))];
    const { rows: owned } = await pool.query(
      'SELECT id FROM library_items WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.user.id, itemIds],
    );
    const ownedIds = new Set(owned.map((r) => r.id));
    const now = Date.now();
    let accepted = 0;
    for (const s of sessions) {
      if (!s || !isUuid(s.id) || !ownedIds.has(s.libraryItemId)) continue;
      const started = Date.parse(s.startedAt);
      const ended = Date.parse(s.endedAt);
      if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) continue;
      if (ended > now + 5 * 60 * 1000) continue;
      // Never count more than the time that actually passed.
      const elapsed = Math.floor((ended - started) / 1000);
      const seconds = Math.min(Math.floor(Number(s.seconds) || 0), elapsed, MAX_SESSION_SECONDS);
      if (seconds < MIN_SESSION_SECONDS) continue;
      const result = await pool.query(
        `INSERT INTO reading_sessions (id, user_id, library_item_id, started_at, ended_at, seconds)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, req.user.id, s.libraryItemId, new Date(started), new Date(ended), seconds],
      );
      accepted += result.rowCount;
    }
    res.json({ accepted });
  } catch (err) {
    console.error('[POST /reading/sessions] failed:', err);
    res.status(500).json({ error: 'Failed to save reading sessions' });
  }
});

// -- highlights ---------------------------------------------------------------

function serializeHighlight(row) {
  return {
    id: row.id,
    color: row.color,
    note: row.note,
    quote: row.quote,
    locator: row.locator ?? {},
    deleted: row.deleted,
    version: Number(row.version),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

router.post('/reading/highlights/sync', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const deviceId = clip(body.deviceId, 100) || 'unknown';
  const since = Math.max(0, Math.floor(Number(body.since) || 0));
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, 1000) : [];
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    const item = await loadOwnItem(userId, body.libraryItemId);
    if (!item) return res.status(404).json({ error: 'Library item not found' });

    await client.query('BEGIN');
    for (const c of changes) {
      if (!c || !isUuid(c.id)) continue;
      const reported = Date.parse(c.updatedAt);
      const updatedAt = new Date(Number.isFinite(reported) ? Math.min(reported, Date.now()) : Date.now());
      // Last write wins; the user_id guard stops anyone from touching
      // another account's highlight by reusing its id.
      await client.query(
        `INSERT INTO reading_highlights
           (id, user_id, library_item_id, color, note, quote, locator, deleted, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE
           SET color = EXCLUDED.color,
               note = EXCLUDED.note,
               quote = EXCLUDED.quote,
               locator = EXCLUDED.locator,
               deleted = reading_highlights.deleted OR EXCLUDED.deleted,
               updated_at = EXCLUDED.updated_at,
               version = nextval('reading_highlights_version_seq')
         WHERE reading_highlights.user_id = EXCLUDED.user_id
           AND reading_highlights.library_item_id = EXCLUDED.library_item_id
           AND reading_highlights.updated_at <= EXCLUDED.updated_at`,
        [
          c.id,
          userId,
          item.id,
          clip(c.color, 20) || 'yellow',
          clip(c.note, 10000),
          clip(c.quote, 10000),
          JSON.stringify(c.locator && typeof c.locator === 'object' ? c.locator : {}),
          Boolean(c.deleted),
          updatedAt,
        ],
      );
    }

    const { rows } = await client.query(
      `SELECT * FROM reading_highlights
        WHERE user_id = $1 AND library_item_id = $2 AND version > $3
        ORDER BY version ASC`,
      [userId, item.id, since],
    );
    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(version), 0) AS v FROM reading_highlights WHERE user_id = $1 AND library_item_id = $2',
      [userId, item.id],
    );
    const ack = Math.max(since, Number(maxRows[0].v));
    await client.query(
      `INSERT INTO reading_sync_acks (user_id, device_id, library_item_id, acked_version, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, device_id, library_item_id) DO UPDATE
         SET acked_version = EXCLUDED.acked_version, updated_at = now()`,
      [userId, deviceId, item.id, ack],
    );
    // Tombstones every recently active device has seen are no longer needed.
    await client.query(
      `DELETE FROM reading_highlights
        WHERE user_id = $1 AND library_item_id = $2 AND deleted
          AND version <= (
            SELECT MIN(acked_version) FROM reading_sync_acks
             WHERE user_id = $1 AND library_item_id = $2
               AND updated_at > now() - interval '90 days')`,
      [userId, item.id],
    );
    await client.query('COMMIT');
    res.json({ highlights: rows.map(serializeHighlight), ack });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /reading/highlights/sync] failed:', err);
    res.status(500).json({ error: 'Failed to sync highlights' });
  } finally {
    client.release();
  }
});

export default router;
