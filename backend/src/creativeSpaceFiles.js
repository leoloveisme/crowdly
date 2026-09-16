// Real byte storage for creative_space_items — the Space sync protocol
// (POST /creative-spaces/:spaceId/sync in server.js) only ever exchanged a
// metadata manifest (relative_path/kind/size/hash), never actual file
// content, so there was previously no way to preview or edit a Space file's
// contents anywhere. This module adds that, following the same shape as
// gallery.js/comics.js (multer.diskStorage, DB row stores just a pointer),
// but deliberately NOT under UPLOADS_ROOT/express.static('/uploads') — Space
// items can be private, and that route is unauthenticated. Access here
// follows the existing creative-space convention instead (explicit
// ?userId=/body userId, checked against space.user_id — see
// GET /creative-spaces/:spaceId in server.js), not requireAuth/cookies.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { scheduleGithubPush } from './githubSync.js';
import { scheduleGoogleDrivePush } from './googleDriveSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CREATIVE_SPACE_FILES_ROOT = path.join(__dirname, '..', 'creative-space-files');

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSION_MIME_TYPES = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export function guessMimeType(name) {
  const ext = path.extname(name || '').toLowerCase();
  return EXTENSION_MIME_TYPES[ext] || 'application/octet-stream';
}

async function loadItemWithSpace(spaceId, itemId) {
  const { rows } = await pool.query(
    `SELECT i.*, s.user_id AS space_owner_id, s.visibility AS space_visibility
     FROM creative_space_items i
     JOIN creative_spaces s ON s.id = i.space_id
     WHERE i.id = $1 AND i.space_id = $2 AND i.deleted = false`,
    [itemId, spaceId],
  );
  return rows[0] || null;
}

function canRead(item, userId) {
  const isOwner = Boolean(userId) && String(item.space_owner_id) === String(userId);
  if (isOwner) return true;
  const spaceVisibility = String(item.space_visibility || 'private').toLowerCase();
  const itemVisibility = String(item.visibility || 'private').toLowerCase();
  return spaceVisibility === 'public' && itemVisibility === 'public';
}

function canWrite(item, userId) {
  return Boolean(userId) && String(item.space_owner_id) === String(userId);
}

/**
 * Writes `buffer` to disk for the given item and updates its
 * storage_path/size_bytes/mime_type/hash/updated_at columns. Shared between
 * the upload/edit routes below and scripts/backfill-happybeings-space-content.js
 * so there's exactly one place that knows how content gets stored.
 */
export async function storeItemContent({ spaceId, itemId, buffer, mimeType, updatedBy }) {
  const dir = path.join(CREATIVE_SPACE_FILES_ROOT, spaceId);
  fs.mkdirSync(dir, { recursive: true });
  const storagePath = path.join(spaceId, itemId);
  fs.writeFileSync(path.join(CREATIVE_SPACE_FILES_ROOT, storagePath), buffer);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const { rows } = await pool.query(
    `UPDATE creative_space_items
     SET storage_path = $1, size_bytes = $2, mime_type = $3, hash = $4, updated_at = now(), updated_by = $5
     WHERE id = $6
     RETURNING *`,
    [storagePath, buffer.length, mimeType, hash, updatedBy || null, itemId],
  );
  return rows[0] || null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const router = express.Router();

router.post(
  '/creative-spaces/:spaceId/items/:itemId/content',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    const { spaceId, itemId } = req.params;
    const userId = req.body?.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'A file is required (field name "file")' });
    }

    try {
      const item = await loadItemWithSpace(spaceId, itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (item.kind !== 'file') return res.status(400).json({ error: 'Only file items can have content' });
      if (!canWrite(item, userId)) {
        return res.status(403).json({ error: 'You do not have permission to upload content for this item' });
      }

      const mimeType = req.file.mimetype && req.file.mimetype !== 'application/octet-stream'
        ? req.file.mimetype
        : guessMimeType(item.name);

      const updated = await storeItemContent({
        spaceId,
        itemId,
        buffer: req.file.buffer,
        mimeType,
        updatedBy: userId,
      });
      scheduleGithubPush(spaceId, itemId);
      scheduleGoogleDrivePush(spaceId, itemId);
      res.json(updated);
    } catch (err) {
      console.error('[POST /creative-spaces/:spaceId/items/:itemId/content] failed:', err);
      res.status(500).json({ error: 'Failed to store file content' });
    }
  },
);

router.put('/creative-spaces/:spaceId/items/:itemId/content', async (req, res) => {
  const { spaceId, itemId } = req.params;
  const { userId, content } = req.body ?? {};

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }

  try {
    const item = await loadItemWithSpace(spaceId, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.kind !== 'file') return res.status(400).json({ error: 'Only file items can have content' });
    if (!canWrite(item, userId)) {
      return res.status(403).json({ error: 'You do not have permission to edit this item' });
    }

    const mimeType = item.mime_type && item.mime_type !== 'application/octet-stream'
      ? item.mime_type
      : guessMimeType(item.name);

    const updated = await storeItemContent({
      spaceId,
      itemId,
      buffer: Buffer.from(content, 'utf8'),
      mimeType,
      updatedBy: userId,
    });
    scheduleGithubPush(spaceId, itemId);
    scheduleGoogleDrivePush(spaceId, itemId);
    res.json(updated);
  } catch (err) {
    console.error('[PUT /creative-spaces/:spaceId/items/:itemId/content] failed:', err);
    res.status(500).json({ error: 'Failed to save file content' });
  }
});

router.get('/creative-spaces/:spaceId/items/:itemId/content', async (req, res) => {
  const { spaceId, itemId } = req.params;
  const userId = req.query.userId ?? null;

  try {
    const item = await loadItemWithSpace(spaceId, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!canRead(item, userId)) {
      return res.status(403).json({ error: 'You do not have access to this item' });
    }
    if (!item.storage_path) {
      return res.status(404).json({ error: 'no_content', message: 'No content has been uploaded for this item yet.' });
    }

    const filePath = path.join(CREATIVE_SPACE_FILES_ROOT, item.storage_path);
    if (!fs.existsSync(filePath)) {
      console.error('[GET /creative-spaces/:spaceId/items/:itemId/content] storage_path set but file missing on disk', { itemId, filePath });
      return res.status(404).json({ error: 'no_content', message: 'Stored content could not be found.' });
    }

    res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[GET /creative-spaces/:spaceId/items/:itemId/content] failed:', err);
    res.status(500).json({ error: 'Failed to load file content' });
  }
});

export default router;
