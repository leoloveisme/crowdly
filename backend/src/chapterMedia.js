// Chapter media — the Audio, Comics | Manga / Presentation and Video formats of a
// chapter. See backend/migrations/0004_chapter_media.sql.
//
// Storage: multer writes uploads to backend/uploads/media/<storyTitleId>/;
// when S3-compatible object storage is configured (backend/src/storage.js)
// files are moved to the bucket right after. Large files (narrations, video
// files) can instead go straight from the browser to the bucket through a
// presigned URL (POST .../media/upload-url, then the matching "complete"
// request with the returned storageKey). Video files need object storage;
// without it, video is embed-only (YouTube / Vimeo).
//
// Moderation mirrors the gallery: the story team (owner or an explicit
// story_access row) publishes directly; anyone else's submission starts as
// 'pending' until the owner approves it. Narrations additionally respect the
// story's narration_policy ('anyone' | 'restricted' | 'none').
//
// All routes live under the existing /stories and /chapters prefixes so no
// new nginx / vite proxy locations are needed.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { UPLOADS_ROOT } from './gallery.js';
import { optionalUserId, loadStory, isStoryTeam, canViewStory, canUsePolicy } from './storyAccess.js';
import { createAutoSnapshotEdition } from './editions.js';
import {
  adoptLocalFile,
  removeStoredFile,
  isObjectStorageConfigured,
  newKey,
  presignUpload,
  headObject,
  deleteObjectKey,
  publicUrlForKey,
} from './storage.js';

const MEDIA_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'media');
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_UPLOAD_MB) || 1024) * 1024 * 1024;

const VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const AUDIO_TYPES = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
};
const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadChapterWithStory(db, chapterId) {
  const { rows } = await db.query('SELECT chapter_id, story_title_id FROM stories WHERE chapter_id = $1', [chapterId]);
  if (rows.length === 0) return null;
  const story = await loadStory(db, rows[0].story_title_id);
  return story ? { chapter: rows[0], story } : null;
}

async function loadMediaWithStory(db, mediaId) {
  const { rows } = await db.query('SELECT * FROM chapter_media WHERE id = $1', [mediaId]);
  if (rows.length === 0) return null;
  const story = await loadStory(db, rows[0].story_title_id);
  return story ? { media: rows[0], story } : null;
}

// Loads chapter + story into req.mediaTarget and checks the viewer may see
// (and, when not on the team, submit to) the story. Runs BEFORE multer so
// uploads land in the right story folder and refused uploads never hit disk.
function withChapterTarget(req, res, next) {
  (async () => {
    const target = await loadChapterWithStory(pool, req.params.chapterId);
    if (!target) return res.status(404).json({ error: 'Chapter not found' });
    if (!(await canViewStory(pool, target.story, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed to add media to this story' });
    }
    target.isTeam = await isStoryTeam(pool, target.story, req.user.id);
    req.mediaTarget = target;
    next();
  })().catch((err) => {
    console.error('[chapterMedia] target lookup failed:', err);
    res.status(500).json({ error: 'Failed to process media' });
  });
}

function diskUpload(types, maxBytes, maxFiles) {
  return multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        const dir = path.join(MEDIA_UPLOADS_DIR, req.mediaTarget.story.story_title_id);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(_req, file, cb) {
        cb(null, `${randomUUID()}${types[file.mimetype] || ''}`);
      },
    }),
    limits: { fileSize: maxBytes, files: maxFiles },
    fileFilter(_req, file, cb) {
      if (!types[file.mimetype]) {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  });
}

const audioUpload = diskUpload(AUDIO_TYPES, MAX_AUDIO_BYTES, 1);
const imageUpload = diskUpload(IMAGE_TYPES, MAX_IMAGE_BYTES, 20);

function runUpload(middleware) {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message || 'Upload failed';
        return res.status(400).json({ error: message });
      }
      next();
    });
}

function removeUploadedFile(url) {
  removeStoredFile(url).catch(() => {});
}

/** Media MIME type without parameters ("audio/webm;codecs=opus" → "audio/webm"). */
const baseMime = (type) => String(type || '').split(';')[0].trim().toLowerCase();

class UploadError extends Error {}

/**
 * Claim a finished direct-to-bucket upload: it must be one this user started
 * for this chapter and purpose, it must exist, and it must not exceed the
 * size limit (oversized objects are deleted). Returns { url, mime, size }.
 */
async function claimDirectUpload(storageKey, { userId, chapterId, purpose }) {
  const { rows } = await pool.query(
    'SELECT * FROM pending_uploads WHERE storage_key = $1 AND user_id = $2 AND chapter_id = $3 AND purpose = $4',
    [String(storageKey || ''), userId, chapterId, purpose],
  );
  const pending = rows[0];
  if (!pending) throw new UploadError('Unknown upload — please try again');
  const object = await headObject(pending.storage_key);
  if (!object) throw new UploadError("The file hasn't finished uploading");
  await pool.query('DELETE FROM pending_uploads WHERE storage_key = $1', [pending.storage_key]);
  if (object.size > Number(pending.max_bytes)) {
    await deleteObjectKey(pending.storage_key);
    throw new UploadError('File is too large');
  }
  // The presigned URL binds the Content-Type, but don't rely on every
  // S3-compatible service enforcing that: never keep an object served with a
  // different type than the one we approved (e.g. text/html).
  if (baseMime(object.contentType) !== pending.content_type) {
    await deleteObjectKey(pending.storage_key);
    throw new UploadError('The uploaded file type does not match');
  }
  return { url: publicUrlForKey(pending.storage_key), mime: pending.content_type, size: object.size };
}

/** Forget (and delete) direct uploads that were never completed. */
async function sweepAbandonedUploads() {
  const { rows } = await pool.query(
    "DELETE FROM pending_uploads WHERE created_at < now() - interval '1 day' RETURNING storage_key",
  );
  for (const r of rows) await deleteObjectKey(r.storage_key);
}

/** Turn a YouTube / Vimeo page URL into its embeddable URL, or null. */
export function toEmbedUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const idPattern = /^[A-Za-z0-9_-]{6,20}$/;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    if (!id && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
    return id && idPattern.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && idPattern.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((p) => /^\d+$/.test(p));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

async function mediaRowsForChapter(db, chapterId, { userId, isTeam }) {
  const { rows } = await db.query(
    `SELECT m.*, e.name AS edition_name, e.is_auto_snapshot AS edition_is_auto_snapshot,
            e.snapshot_at AS edition_snapshot_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name
       FROM chapter_media m
       LEFT JOIN story_editions e ON e.id = m.edition_id
       LEFT JOIN local_users u ON u.id = m.created_by
       LEFT JOIN profiles p ON p.id = m.created_by
      WHERE m.chapter_id = $1
        AND (m.status = 'approved' OR $3 OR (m.created_by IS NOT NULL AND m.created_by = $2))
      ORDER BY m.kind, m.is_primary DESC, m.created_at ASC`,
    [chapterId, userId, isTeam],
  );
  const visualIds = rows.filter((r) => r.kind === 'visual').map((r) => r.id);
  const framesByMedia = new Map();
  if (visualIds.length > 0) {
    const frames = await db.query(
      'SELECT * FROM chapter_media_frames WHERE media_id = ANY($1::uuid[]) ORDER BY frame_index, created_at',
      [visualIds],
    );
    for (const f of frames.rows) {
      if (!framesByMedia.has(f.media_id)) framesByMedia.set(f.media_id, []);
      framesByMedia.get(f.media_id).push(f);
    }
  }
  return rows.map((r) => ({
    ...r,
    frames: r.kind === 'visual' ? framesByMedia.get(r.id) ?? [] : undefined,
    is_mine: Boolean(userId && r.created_by === userId),
  }));
}

async function resolveEditionForStory(db, editionId, storyTitleId) {
  if (!editionId) return null;
  const { rows } = await db.query('SELECT id FROM story_editions WHERE id = $1 AND story_title_id = $2', [
    editionId,
    storyTitleId,
  ]);
  return rows[0]?.id ?? undefined; // undefined = given but invalid
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// GET /chapters/:chapterId/media — all media of a chapter the viewer may see
router.get('/chapters/:chapterId/media', async (req, res) => {
  try {
    const userId = await optionalUserId(req);
    const target = await loadChapterWithStory(pool, req.params.chapterId);
    if (!target) return res.status(404).json({ error: 'Chapter not found' });
    if (!(await canViewStory(pool, target.story, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }
    const isTeam = await isStoryTeam(pool, target.story, userId);
    const media = await mediaRowsForChapter(pool, req.params.chapterId, { userId, isTeam });
    res.json({
      can_moderate: isTeam,
      can_narrate: await canUsePolicy(pool, target.story, userId, 'narration_policy', 'narrate'),
      // Object storage on: large files go straight to the bucket, and video
      // files can be uploaded.
      direct_upload: isObjectStorageConfigured(),
      max_video_bytes: MAX_VIDEO_BYTES,
      media,
    });
  } catch (err) {
    console.error('[GET /chapters/:chapterId/media] failed:', err);
    res.status(500).json({ error: 'Failed to load chapter media' });
  }
});

// GET /stories/:storyTitleId/media-summary — approved media counts per chapter
// and kind, so the reader can disable formats a chapter doesn't have.
router.get('/stories/:storyTitleId/media-summary', async (req, res) => {
  try {
    const userId = await optionalUserId(req);
    const story = await loadStory(pool, req.params.storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (!(await canViewStory(pool, story, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }
    const { rows } = await pool.query(
      `SELECT m.chapter_id, m.kind, count(*)::int AS n
         FROM chapter_media m
        WHERE m.story_title_id = $1 AND m.status = 'approved'
          AND (m.kind <> 'visual' OR EXISTS (SELECT 1 FROM chapter_media_frames f WHERE f.media_id = m.id))
        GROUP BY m.chapter_id, m.kind`,
      [story.story_title_id],
    );
    const summary = {};
    for (const r of rows) {
      summary[r.chapter_id] = summary[r.chapter_id] ?? { audio: 0, visual: 0, video: 0 };
      summary[r.chapter_id][r.kind] = r.n;
    }
    res.json(summary);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/media-summary] failed:', err);
    res.status(500).json({ error: 'Failed to load media summary' });
  }
});

// ---------------------------------------------------------------------------
// Audio (narrations / audiobooks)
// ---------------------------------------------------------------------------

// POST /stories/:storyTitleId/narration-snapshot — freeze the current text as
// a hidden edition for an audiobook of "the story as it is now". The client
// calls this once, then uploads each chapter's file with the returned id.
router.post('/stories/:storyTitleId/narration-snapshot', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const story = await loadStory(client, req.params.storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (
      !(await canViewStory(client, story, req.user.id)) ||
      !(await canUsePolicy(client, story, req.user.id, 'narration_policy', 'narrate'))
    ) {
      return res.status(403).json({ error: 'You do not have permission to narrate this story' });
    }
    await client.query('BEGIN');
    const edition = await createAutoSnapshotEdition(client, story.story_title_id, req.user.id);
    await client.query('COMMIT');
    res.status(201).json(edition);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /stories/:storyTitleId/narration-snapshot] failed:', err);
    res.status(500).json({ error: 'Failed to snapshot the story' });
  } finally {
    client.release();
  }
});

// POST /chapters/:chapterId/media/upload-url { purpose: 'audio' | 'video', contentType, size }
// → { storageKey, url, method, headers }: a presigned URL for uploading the
// file straight to object storage. Finish with the matching "complete"
// request (media/audio or media/video-file) passing storageKey.
router.post('/chapters/:chapterId/media/upload-url', requireAuth, withChapterTarget, async (req, res) => {
  if (!isObjectStorageConfigured()) {
    return res.status(409).json({ error: 'Direct uploads need object storage, which is not configured' });
  }
  const { story, chapter } = req.mediaTarget;
  const purpose = req.body?.purpose;
  const contentType = baseMime(req.body?.contentType);
  const size = Number(req.body?.size);
  const rules = {
    audio: { types: AUDIO_TYPES, max: MAX_AUDIO_BYTES },
    video: { types: VIDEO_TYPES, max: MAX_VIDEO_BYTES },
  }[purpose];
  if (!rules) return res.status(400).json({ error: "purpose must be 'audio' or 'video'" });
  if (!rules.types[contentType]) return res.status(400).json({ error: `Unsupported file type: ${contentType || 'unknown'}` });
  if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'size is required' });
  if (size > rules.max) return res.status(400).json({ error: 'File is too large' });
  try {
    if (purpose === 'audio' && !(await canUsePolicy(pool, story, req.user.id, 'narration_policy', 'narrate'))) {
      return res.status(403).json({ error: 'You do not have permission to narrate this story' });
    }
    sweepAbandonedUploads().catch(() => {});
    const storageKey = newKey('media', story.story_title_id, rules.types[contentType]);
    await pool.query(
      `INSERT INTO pending_uploads (storage_key, user_id, story_title_id, chapter_id, purpose, content_type, max_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [storageKey, req.user.id, story.story_title_id, chapter.chapter_id, purpose, contentType, rules.max],
    );
    res.json({ storageKey, ...(await presignUpload(storageKey, contentType)) });
  } catch (err) {
    console.error('[POST /chapters/:chapterId/media/upload-url] failed:', err);
    res.status(500).json({ error: 'Failed to prepare the upload' });
  }
});

// POST /chapters/:chapterId/media/audio
//   multipart: file, label?, editionId?, durationSeconds?     (upload through the backend), or
//   JSON: { storageKey, label?, editionId?, durationSeconds? } (after a direct upload)
// Without editionId, the current text is frozen as an auto-snapshot edition.
router.post(
  '/chapters/:chapterId/media/audio',
  requireAuth,
  withChapterTarget,
  (req, res, next) => {
    (async () => {
      const { story } = req.mediaTarget;
      if (!(await canUsePolicy(pool, story, req.user.id, 'narration_policy', 'narrate'))) {
        return res.status(403).json({ error: 'You do not have permission to narrate this story' });
      }
      next();
    })().catch(next);
  },
  runUpload(audioUpload.single('file')),
  async (req, res) => {
    const { chapter, story, isTeam } = req.mediaTarget;
    const file = req.file;
    if (!file && !req.body?.storageKey) return res.status(400).json({ error: 'An audio file is required' });

    let stored;
    try {
      stored = file
        ? { url: await adoptLocalFile(file.path, file.mimetype), mime: file.mimetype, size: file.size }
        : await claimDirectUpload(req.body.storageKey, {
            userId: req.user.id,
            chapterId: chapter.chapter_id,
            purpose: 'audio',
          });
    } catch (err) {
      if (file) fs.promises.unlink(file.path).catch(() => {});
      if (err instanceof UploadError) return res.status(400).json({ error: err.message });
      console.error('[POST /chapters/:chapterId/media/audio] storing failed:', err);
      return res.status(500).json({ error: 'Failed to store the audio file' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let editionId = await resolveEditionForStory(client, req.body.editionId, story.story_title_id);
      if (editionId === undefined) {
        await client.query('ROLLBACK');
        removeUploadedFile(stored.url);
        return res.status(400).json({ error: 'Edition does not belong to this story' });
      }
      if (editionId === null) {
        editionId = (await createAutoSnapshotEdition(client, story.story_title_id, req.user.id)).id;
      }
      const duration = Number(req.body.durationSeconds);
      const { rows } = await client.query(
        `INSERT INTO chapter_media
           (story_title_id, chapter_id, edition_id, kind, source, label, url, mime, size_bytes, duration_seconds, status, created_by)
         VALUES ($1, $2, $3, 'audio', 'upload', $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          story.story_title_id,
          chapter.chapter_id,
          editionId,
          (req.body.label || '').trim() || null,
          stored.url,
          stored.mime,
          stored.size,
          Number.isFinite(duration) && duration > 0 ? duration : null,
          isTeam ? 'approved' : 'pending',
          req.user.id,
        ],
      );
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      removeUploadedFile(stored.url);
      console.error('[POST /chapters/:chapterId/media/audio] failed:', err);
      res.status(500).json({ error: 'Failed to save narration' });
    } finally {
      client.release();
    }
  },
);

// ---------------------------------------------------------------------------
// Video: YouTube / Vimeo embeds, or your own files (object storage only)
// ---------------------------------------------------------------------------

// POST /chapters/:chapterId/media/video-file { storageKey, label? } — after a
// direct upload (purpose 'video'). Only available with object storage.
router.post('/chapters/:chapterId/media/video-file', requireAuth, withChapterTarget, async (req, res) => {
  const { chapter, story, isTeam } = req.mediaTarget;
  let stored;
  try {
    stored = await claimDirectUpload(req.body?.storageKey, {
      userId: req.user.id,
      chapterId: chapter.chapter_id,
      purpose: 'video',
    });
  } catch (err) {
    if (err instanceof UploadError) return res.status(400).json({ error: err.message });
    console.error('[POST /chapters/:chapterId/media/video-file] storing failed:', err);
    return res.status(500).json({ error: 'Failed to store the video' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO chapter_media (story_title_id, chapter_id, kind, source, label, url, mime, size_bytes, status, created_by)
       VALUES ($1, $2, 'video', 'upload', $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        story.story_title_id,
        chapter.chapter_id,
        (req.body?.label || '').trim() || null,
        stored.url,
        stored.mime,
        stored.size,
        isTeam ? 'approved' : 'pending',
        req.user.id,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    removeUploadedFile(stored.url);
    console.error('[POST /chapters/:chapterId/media/video-file] failed:', err);
    res.status(500).json({ error: 'Failed to save the video' });
  }
});

// POST /chapters/:chapterId/media/embed { url, label? }
router.post('/chapters/:chapterId/media/embed', requireAuth, withChapterTarget, async (req, res) => {
  const { chapter, story, isTeam } = req.mediaTarget;
  const embedUrl = toEmbedUrl(req.body?.url);
  if (!embedUrl) {
    return res.status(400).json({ error: 'Only YouTube and Vimeo links are supported' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO chapter_media (story_title_id, chapter_id, kind, source, label, url, status, created_by)
       VALUES ($1, $2, 'video', 'embed', $3, $4, $5, $6)
       RETURNING *`,
      [
        story.story_title_id,
        chapter.chapter_id,
        (req.body?.label || '').trim() || null,
        embedUrl,
        isTeam ? 'approved' : 'pending',
        req.user.id,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /chapters/:chapterId/media/embed] failed:', err);
    res.status(500).json({ error: 'Failed to add video' });
  }
});

// ---------------------------------------------------------------------------
// Comics | Manga / Presentation (frames)
// ---------------------------------------------------------------------------

// POST /chapters/:chapterId/media/visual  multipart: images[] (1-20), label?
// Creates a new Comics | Manga / Presentation with the uploaded images as frames.
router.post(
  '/chapters/:chapterId/media/visual',
  requireAuth,
  withChapterTarget,
  runUpload(imageUpload.array('images', 20)),
  async (req, res) => {
    const { chapter, story, isTeam } = req.mediaTarget;
    const files = req.files ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'At least one image is required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO chapter_media (story_title_id, chapter_id, kind, source, label, status, created_by)
         VALUES ($1, $2, 'visual', 'upload', $3, $4, $5)
         RETURNING *`,
        [story.story_title_id, chapter.chapter_id, (req.body.label || '').trim() || null, isTeam ? 'approved' : 'pending', req.user.id],
      );
      const media = rows[0];
      for (const [i, file] of files.entries()) {
        await client.query(
          'INSERT INTO chapter_media_frames (media_id, frame_index, image_url) VALUES ($1, $2, $3)',
          [media.id, i, await adoptLocalFile(file.path, file.mimetype)],
        );
      }
      await client.query('COMMIT');
      res.status(201).json(media);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      for (const file of files) fs.promises.unlink(file.path).catch(() => {});
      console.error('[POST /chapters/:chapterId/media/visual] failed:', err);
      res.status(500).json({ error: 'Failed to create presentation' });
    } finally {
      client.release();
    }
  },
);

// Loads media + story into req.mediaItem; only its creator or the story team
// may change it.
function withEditableMedia(req, res, next) {
  (async () => {
    const found = await loadMediaWithStory(pool, req.params.mediaId);
    if (!found) return res.status(404).json({ error: 'Media not found' });
    found.isTeam = await isStoryTeam(pool, found.story, req.user.id);
    found.isCreator = found.media.created_by === req.user.id;
    if (!found.isTeam && !found.isCreator) {
      return res.status(403).json({ error: 'Not allowed to change this media' });
    }
    // Upload targets for multer (appending frames)
    req.mediaTarget = { story: found.story };
    req.mediaItem = found;
    next();
  })().catch((err) => {
    console.error('[chapterMedia] media lookup failed:', err);
    res.status(500).json({ error: 'Failed to process media' });
  });
}

// POST /chapters/media/:mediaId/frames  multipart: images[] — append frames
router.post(
  '/chapters/media/:mediaId/frames',
  requireAuth,
  withEditableMedia,
  runUpload(imageUpload.array('images', 20)),
  async (req, res) => {
    const { media, story } = req.mediaItem;
    const files = req.files ?? [];
    if (media.kind !== 'visual') {
      for (const file of files) fs.promises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'Frames can only be added to a comic, manga or presentation' });
    }
    if (files.length === 0) return res.status(400).json({ error: 'At least one image is required' });
    try {
      const { rows } = await pool.query(
        'SELECT COALESCE(max(frame_index), -1) + 1 AS next FROM chapter_media_frames WHERE media_id = $1',
        [media.id],
      );
      let next = rows[0].next;
      const inserted = [];
      for (const file of files) {
        const r = await pool.query(
          'INSERT INTO chapter_media_frames (media_id, frame_index, image_url) VALUES ($1, $2, $3) RETURNING *',
          [media.id, next++, await adoptLocalFile(file.path, file.mimetype)],
        );
        inserted.push(r.rows[0]);
      }
      res.status(201).json(inserted);
    } catch (err) {
      for (const file of files) fs.promises.unlink(file.path).catch(() => {});
      console.error('[POST /chapters/media/:mediaId/frames] failed:', err);
      res.status(500).json({ error: 'Failed to add frames' });
    }
  },
);

// PATCH /chapters/media/:mediaId/frames/order { frameIds: [] }
router.patch('/chapters/media/:mediaId/frames/order', requireAuth, withEditableMedia, async (req, res) => {
  const frameIds = req.body?.frameIds;
  if (!Array.isArray(frameIds)) return res.status(400).json({ error: 'frameIds[] is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, frameId] of frameIds.entries()) {
      await client.query('UPDATE chapter_media_frames SET frame_index = $1 WHERE id = $2 AND media_id = $3', [
        i,
        frameId,
        req.mediaItem.media.id,
      ]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[PATCH /chapters/media/:mediaId/frames/order] failed:', err);
    res.status(500).json({ error: 'Failed to reorder frames' });
  } finally {
    client.release();
  }
});

const sanitizeOverlays = (overlays) =>
  (Array.isArray(overlays) ? overlays : [])
    .slice(0, 12)
    .map((o) => ({
      text: String(o?.text ?? '').slice(0, 500),
      x: Math.min(100, Math.max(0, Number(o?.x) || 0)),
      y: Math.min(100, Math.max(0, Number(o?.y) || 0)),
      style: o?.style === 'box' ? 'box' : 'bubble',
    }))
    .filter((o) => o.text.trim());

// PATCH /chapters/media/:mediaId/frames/:frameId { caption?, overlays?, anchorStart?, anchorEnd? }
router.patch('/chapters/media/:mediaId/frames/:frameId', requireAuth, withEditableMedia, async (req, res) => {
  const { caption, overlays, anchorStart, anchorEnd } = req.body ?? {};
  const fields = [];
  const values = [];
  if (caption !== undefined) {
    values.push(caption ? String(caption).slice(0, 1000) : null);
    fields.push(`caption = $${values.length}`);
  }
  if (overlays !== undefined) {
    values.push(JSON.stringify(sanitizeOverlays(overlays)));
    fields.push(`overlays = $${values.length}`);
  }
  for (const [column, value] of [
    ['anchor_start', anchorStart],
    ['anchor_end', anchorEnd],
  ]) {
    if (value !== undefined) {
      const n = value === null || value === '' ? null : Number(value);
      values.push(Number.isInteger(n) && n >= 0 ? n : null);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.params.frameId, req.mediaItem.media.id);
  try {
    const { rows } = await pool.query(
      `UPDATE chapter_media_frames SET ${fields.join(', ')}
        WHERE id = $${values.length - 1} AND media_id = $${values.length} RETURNING *`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Frame not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /chapters/media/:mediaId/frames/:frameId] failed:', err);
    res.status(500).json({ error: 'Failed to update frame' });
  }
});

// DELETE /chapters/media/:mediaId/frames/:frameId
router.delete('/chapters/media/:mediaId/frames/:frameId', requireAuth, withEditableMedia, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM chapter_media_frames WHERE id = $1 AND media_id = $2 RETURNING image_url',
      [req.params.frameId, req.mediaItem.media.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Frame not found' });
    removeUploadedFile(rows[0].image_url);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /chapters/media/:mediaId/frames/:frameId] failed:', err);
    res.status(500).json({ error: 'Failed to delete frame' });
  }
});

// ---------------------------------------------------------------------------
// Any media: edit, moderate, delete
// ---------------------------------------------------------------------------

// PATCH /chapters/media/:mediaId { label?, timings?, status?, isPrimary? }
// Creator: label, timings. Story team: also status (moderation) and primary.
router.patch('/chapters/media/:mediaId', requireAuth, withEditableMedia, async (req, res) => {
  const { media, isTeam } = req.mediaItem;
  const { label, timings, status, isPrimary } = req.body ?? {};
  const fields = ['updated_at = now()'];
  const values = [];
  if (label !== undefined) {
    values.push(label ? String(label).slice(0, 200) : null);
    fields.push(`label = $${values.length}`);
  }
  if (timings !== undefined) {
    const clean = Array.isArray(timings)
      ? timings
          .map((t) => ({ paragraph: Number(t?.paragraph), start: Number(t?.start) }))
          .filter((t) => Number.isInteger(t.paragraph) && t.paragraph >= 0 && Number.isFinite(t.start) && t.start >= 0)
          .sort((a, b) => a.start - b.start)
      : null;
    values.push(clean ? JSON.stringify(clean) : null);
    fields.push(`timings = $${values.length}`);
  }
  if (status !== undefined || isPrimary !== undefined) {
    if (!isTeam) return res.status(403).json({ error: 'Only the story team can moderate media' });
  }
  if (status !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    values.push(status);
    fields.push(`status = $${values.length}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isPrimary !== undefined) {
      if (isPrimary) {
        // One primary per chapter and kind
        await client.query(
          'UPDATE chapter_media SET is_primary = false WHERE chapter_id = $1 AND kind = $2 AND id <> $3',
          [media.chapter_id, media.kind, media.id],
        );
      }
      values.push(Boolean(isPrimary));
      fields.push(`is_primary = $${values.length}`);
    }
    values.push(media.id);
    const { rows } = await client.query(
      `UPDATE chapter_media SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[PATCH /chapters/media/:mediaId] failed:', err);
    res.status(500).json({ error: 'Failed to update media' });
  } finally {
    client.release();
  }
});

// DELETE /chapters/media/:mediaId — creator or story team; removes files too
router.delete('/chapters/media/:mediaId', requireAuth, withEditableMedia, async (req, res) => {
  const { media } = req.mediaItem;
  try {
    const frames = await pool.query('SELECT image_url FROM chapter_media_frames WHERE media_id = $1', [media.id]);
    await pool.query('DELETE FROM chapter_media WHERE id = $1', [media.id]);
    removeUploadedFile(media.url);
    for (const f of frames.rows) removeUploadedFile(f.image_url);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /chapters/media/:mediaId] failed:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;
