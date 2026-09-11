import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { requireAuth, getSessionUser, SESSION_COOKIE_NAME } from './sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const GALLERY_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'gallery');

export async function ensureStoryGalleryImagesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_gallery_images (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        uploaded_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
        image_url text NOT NULL,
        chapter_id uuid,
        anchor_index integer,
        caption text,
        tags text[],
        kind text NOT NULL DEFAULT 'gallery'
          CHECK (kind IN ('cover_variant', 'inline_illustration', 'fan_art', 'gallery')),
        status text NOT NULL DEFAULT 'approved'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        position integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS story_gallery_images_story_status_idx ON story_gallery_images (story_title_id, status)',
    );
    console.log('[init] ensured story_gallery_images table exists');
  } catch (err) {
    console.error('[init] failed to ensure story_gallery_images table:', err);
  }
}

// A story's creator is always its 'owner'; everyone else's standing comes
// from story_access. Both a fan (no role) and a rejected contributor land on
// null — callers only need to know "can this person publish without review".
async function getStoryGalleryRole(storyTitleId, userId) {
  if (!userId) return null;
  try {
    const { rows } = await pool.query(
      'SELECT creator_id FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (rows.length === 0) return null;
    if (rows[0].creator_id === userId) return 'owner';

    const access = await pool.query(
      'SELECT role FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
      [storyTitleId, userId],
    );
    if (access.rows.length === 0) return null;
    return access.rows[0].role === 'owner' ? 'owner' : 'contributor';
  } catch (err) {
    console.error('[getStoryGalleryRole] failed:', err);
    return null;
  }
}

async function isPlatformAdmin(userId) {
  if (!userId) return false;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'platform_admin'",
      [userId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

// Best-effort: an unauthenticated GET should still work (public gallery
// browsing), so this never rejects — it just resolves to null when there's
// no session, same shape as requireAuth's req.user on success.
async function optionalUser(req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;
  try {
    return await getSessionUser(token);
  } catch {
    return null;
  }
}

const ALLOWED_MIME_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(GALLERY_UPLOADS_DIR, req.params.storyTitleId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = ALLOWED_MIME_EXTENSIONS[file.mimetype] || '';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error('Unsupported image type — only PNG, JPEG, WEBP, and GIF are allowed'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

router.post(
  '/stories/:storyTitleId/gallery',
  requireAuth,
  (req, res, next) => {
    upload.array('images', 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    const { storyTitleId } = req.params;
    const userId = req.user.id;
    const files = req.files ?? [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }

    try {
      const storyRes = await pool.query(
        'SELECT creator_id, visibility FROM story_title WHERE story_title_id = $1',
        [storyTitleId],
      );
      if (storyRes.rows.length === 0) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const story = storyRes.rows[0];
      const role = await getStoryGalleryRole(storyTitleId, userId);
      const isModerator = role === 'owner' || role === 'contributor';

      if (story.visibility === 'private' && !isModerator) {
        return res.status(403).json({ error: 'You do not have permission to upload images to this story' });
      }

      const requestedKind = typeof req.body.kind === 'string' ? req.body.kind : 'gallery';
      const kind = isModerator ? requestedKind : 'fan_art';
      const status = isModerator ? 'approved' : 'pending';
      const isInlineIllustration = isModerator && kind === 'inline_illustration';
      const chapterId = isInlineIllustration ? (req.body.chapter_id || null) : null;
      const anchorIndex =
        isInlineIllustration && req.body.anchor_index !== undefined
          ? Number(req.body.anchor_index)
          : null;
      const caption = req.body.caption || null;
      const tags = typeof req.body.tags === 'string'
        ? req.body.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : null;

      const inserted = [];
      for (const file of files) {
        const imageUrl = `/uploads/gallery/${storyTitleId}/${file.filename}`;
        const { rows } = await pool.query(
          `INSERT INTO story_gallery_images
            (story_title_id, uploaded_by, image_url, chapter_id, anchor_index, caption, tags, kind, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [storyTitleId, userId, imageUrl, chapterId, anchorIndex, caption, tags, kind, status],
        );
        inserted.push(rows[0]);
      }

      res.status(201).json(inserted);
    } catch (err) {
      console.error('[POST /stories/:storyTitleId/gallery] failed:', err);
      res.status(500).json({ error: 'Failed to upload images' });
    }
  },
);

router.get('/stories/:storyTitleId/gallery', async (req, res) => {
  const { storyTitleId } = req.params;

  try {
    const user = await optionalUser(req);
    const role = user ? await getStoryGalleryRole(storyTitleId, user.id) : null;
    const canModerate = role === 'owner' || role === 'contributor' || (user && await isPlatformAdmin(user.id));

    const { rows } = await pool.query(
      canModerate
        ? `SELECT * FROM story_gallery_images WHERE story_title_id = $1 ORDER BY position NULLS LAST, created_at ASC`
        : `SELECT * FROM story_gallery_images WHERE story_title_id = $1 AND status = 'approved' ORDER BY position NULLS LAST, created_at ASC`,
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/gallery] failed:', err);
    res.status(500).json({ error: 'Failed to load gallery' });
  }
});

async function loadGalleryImageWithStory(id) {
  const { rows } = await pool.query(
    `SELECT gi.*, st.creator_id AS story_creator_id
     FROM story_gallery_images gi
     JOIN story_title st ON st.story_title_id = gi.story_title_id
     WHERE gi.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

router.patch('/gallery-images/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { caption, tags, position, status } = req.body ?? {};

  try {
    const image = await loadGalleryImageWithStory(id);
    if (!image) {
      return res.status(404).json({ error: 'Gallery image not found' });
    }

    const role = await getStoryGalleryRole(image.story_title_id, userId);
    const isModerator = role === 'owner' || role === 'contributor' || await isPlatformAdmin(userId);
    const isUploader = image.uploaded_by === userId;

    if (!isModerator && !isUploader) {
      return res.status(403).json({ error: 'You do not have permission to edit this image' });
    }
    if (status !== undefined && !isModerator) {
      return res.status(403).json({ error: 'Only a story owner, contributor, or platform admin can change moderation status' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (caption !== undefined) {
      fields.push(`caption = $${idx++}`);
      values.push(caption || null);
    }
    if (tags !== undefined) {
      fields.push(`tags = $${idx++}`);
      values.push(Array.isArray(tags) ? tags : null);
    }
    if (position !== undefined) {
      fields.push(`position = $${idx++}`);
      values.push(position === null ? null : Number(position));
    }
    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'At least one of caption, tags, position, or status must be provided' });
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE story_gallery_images SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /gallery-images/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update gallery image' });
  }
});

router.delete('/gallery-images/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const image = await loadGalleryImageWithStory(id);
    if (!image) {
      return res.status(404).json({ error: 'Gallery image not found' });
    }

    const role = await getStoryGalleryRole(image.story_title_id, userId);
    const isModerator = role === 'owner' || role === 'contributor' || await isPlatformAdmin(userId);
    const isUploader = image.uploaded_by === userId;

    if (!isModerator && !isUploader) {
      return res.status(403).json({ error: 'You do not have permission to delete this image' });
    }

    await pool.query('DELETE FROM story_gallery_images WHERE id = $1', [id]);

    // Best-effort file cleanup — a stray file on disk is harmless, so this
    // never fails the request.
    if (image.image_url && image.image_url.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_ROOT, image.image_url.slice('/uploads/'.length));
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error('[DELETE /gallery-images/:id] failed to remove file:', err);
        }
      });
    }

    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /gallery-images/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete gallery image' });
  }
});

export default router;
