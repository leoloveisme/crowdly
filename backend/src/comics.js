import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { UPLOADS_ROOT } from './gallery.js';
import { adoptLocalFile, removeStoredFile } from './storage.js';
import { cleanOverlays, isKnownComicImage } from './branchSync.js';
import {
  canView,
  isOwner,
  isPlatformAdminOrEditor,
  isTeam,
  loadWork,
  optionalUserId,
  policyFlags,
  viewDeniedMessage,
} from './workAccess.js';

const COMIC_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'comics');

export async function ensureComicTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comic_title (
        comic_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        creator_id uuid REFERENCES local_users(id) ON DELETE SET NULL,
        visibility text NOT NULL DEFAULT 'public',
        published boolean NOT NULL DEFAULT true,
        genre text,
        tags text[],
        cover_image_url text,
        reading_direction text NOT NULL DEFAULT 'ltr' CHECK (reading_direction IN ('ltr', 'rtl')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comic_page (
        page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
        page_index integer NOT NULL,
        image_url text NOT NULL,
        alt_text text,
        width integer,
        height integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS comic_page_comic_index_idx ON comic_page (comic_id, page_index)',
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comic_access (
        comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'contributor',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (comic_id, user_id)
      )
    `);
    console.log('[init] ensured comic_title, comic_page, comic_access tables exist');
  } catch (err) {
    console.error('[init] failed to ensure comic tables:', err);
  }
}

// Same shape as gallery.js's getStoryGalleryRole — creator is always
// 'owner', otherwise defer to the access table.
async function getComicRole(comicId, userId) {
  if (!userId) return null;
  try {
    const { rows } = await pool.query('SELECT creator_id FROM comic_title WHERE comic_id = $1', [comicId]);
    if (rows.length === 0) return null;
    if (rows[0].creator_id === userId) return 'owner';

    const access = await pool.query(
      'SELECT role FROM comic_access WHERE comic_id = $1 AND user_id = $2 LIMIT 1',
      [comicId, userId],
    );
    if (access.rows.length === 0) return null;
    return access.rows[0].role === 'owner' ? 'owner' : 'contributor';
  } catch (err) {
    console.error('[getComicRole] failed:', err);
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
    const dir = path.join(COMIC_UPLOADS_DIR, req.params.comicId);
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
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error('Unsupported image type — only PNG, JPEG, WEBP, and GIF are allowed'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

// Cloned comics share their source's image files, so a file is only removed
// once no page or page alternative still points at it.
function removeUnreferencedImages(urls) {
  for (const url of new Set(urls.filter(Boolean))) {
    pool
      .query(
        `SELECT (SELECT count(*) FROM comic_page WHERE image_url = $1)
              + (SELECT count(*) FROM comic_page_branches WHERE image_url = $1) AS refs`,
        [url],
      )
      .then(async ({ rows }) => {
        if (Number(rows[0].refs) === 0) {
          await removeStoredFile(url);
          await pool.query('DELETE FROM comic_uploaded_images WHERE url = $1', [url]);
        }
      })
      .catch((err) => console.error('[comics] failed to remove page image:', err));
  }
}

// Revision log for the comic's Revisions tab (best-effort).
function logComicRevision(comicId, userId, event, { issueId = null, pageId = null, detail = {} } = {}) {
  pool
    .query(
      `INSERT INTO comic_revisions (comic_id, issue_id, page_id, event, detail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [comicId, issueId, pageId, event, JSON.stringify(detail), userId],
    )
    .catch((err) => console.error('[comics] failed to log revision:', err));
}

async function resolveUploadIssue(comicId, requestedIssueId) {
  if (requestedIssueId) {
    const { rows } = await pool.query('SELECT issue_id FROM comic_issue WHERE issue_id = $1 AND comic_id = $2', [
      requestedIssueId,
      comicId,
    ]).catch(() => ({ rows: [] }));
    return rows[0]?.issue_id ?? null;
  }
  const last = await pool.query(
    'SELECT issue_id FROM comic_issue WHERE comic_id = $1 ORDER BY issue_index DESC, created_at DESC LIMIT 1',
    [comicId],
  );
  if (last.rows[0]) return last.rows[0].issue_id;
  const created = await pool.query(
    "INSERT INTO comic_issue (comic_id, issue_index, title) VALUES ($1, 0, 'Issue 1') RETURNING issue_id",
    [comicId],
  );
  return created.rows[0].issue_id;
}

router.get('/comics/newest', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  try {
    const { rows } = await pool.query(
      `SELECT ct.comic_id, ct.title, ct.cover_image_url,
              ct.reading_direction, ct.tags, ct.created_at, ct.updated_at,
              COALESCE(
                (SELECT array_agg(cp.image_url ORDER BY cp.page_index)
                 FROM (SELECT image_url, page_index FROM comic_page WHERE comic_page.comic_id = ct.comic_id ORDER BY page_index LIMIT 4) cp),
                ARRAY[]::text[]
              ) AS filmstrip_urls
       FROM comic_title ct
       WHERE ct.visibility = 'public' AND ct.published = true
       ORDER BY ct.created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /comics/newest] failed:', err);
    res.status(500).json({ error: 'Failed to fetch newest comics' });
  }
});

// A comic, its issues and pages. Same visibility rules as stories; issues
// that aren't published are only shown to the comic's team.
router.get('/comics/:comicId', async (req, res) => {
  const { comicId } = req.params;
  try {
    const comic = await loadWork(pool, 'comic', comicId);
    if (!comic) {
      return res.status(404).json({ error: 'Comic not found' });
    }
    const userId = await optionalUserId(req);
    if (!(await canView(pool, 'comic', comic, userId))) {
      return res.status(403).json({ error: viewDeniedMessage('comic', comic) });
    }
    const team = await isTeam(pool, 'comic', comic, userId);
    const issues = await pool.query(
      `SELECT * FROM comic_issue WHERE comic_id = $1 ${team ? '' : 'AND published = true'}
       ORDER BY issue_index ASC, created_at ASC`,
      [comicId],
    );
    const issueIds = issues.rows.map((i) => i.issue_id);
    const pages = await pool.query(
      `SELECT * FROM comic_page WHERE comic_id = $1 AND (issue_id = ANY($2::uuid[]) ${team ? 'OR issue_id IS NULL' : ''})
       ORDER BY page_index ASC`,
      [comicId, issueIds],
    );
    res.json({
      ...comic,
      ...(await policyFlags(pool, 'comic', comic, userId)),
      issues: issues.rows,
      pages: pages.rows,
    });
  } catch (err) {
    console.error('[GET /comics/:comicId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch comic' });
  }
});

router.post('/comics', requireAuth, async (req, res) => {
  const { title, visibility, genre, tags, reading_direction: readingDirection } = req.body ?? {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO comic_title (title, creator_id, visibility, genre, tags, reading_direction)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        title,
        req.user.id,
        visibility === 'private' || visibility === 'unlisted' ? visibility : 'public',
        genre || null,
        Array.isArray(tags) ? tags : null,
        readingDirection === 'rtl' ? 'rtl' : 'ltr',
      ],
    );
    // Every comic starts with one issue that new pages go into.
    await pool.query("INSERT INTO comic_issue (comic_id, issue_index, title) VALUES ($1, 0, 'Issue 1')", [
      rows[0].comic_id,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /comics] failed:', err);
    res.status(500).json({ error: 'Failed to create comic' });
  }
});

router.post(
  '/comics/:comicId/pages',
  requireAuth,
  (req, res, next) => {
    upload.array('images', 20)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    const { comicId } = req.params;
    const files = req.files ?? [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one page image is required' });
    }

    try {
      const role = await getComicRole(comicId, req.user.id);
      if (role !== 'owner' && role !== 'contributor') {
        return res.status(403).json({ error: 'You do not have permission to add pages to this comic' });
      }

      // Pages go into the requested issue, or the last one (created if the
      // comic has none yet).
      const issueId = await resolveUploadIssue(comicId, req.body?.issueId);
      if (!issueId) {
        return res.status(400).json({ error: 'Issue not found' });
      }

      const maxRes = await pool.query(
        'SELECT COALESCE(MAX(page_index), -1) AS max_index FROM comic_page WHERE issue_id = $1',
        [issueId],
      );
      let nextIndex = Number(maxRes.rows[0].max_index) + 1;

      const inserted = [];
      for (const file of files) {
        // Moved to object storage when configured; otherwise stays on disk.
        const imageUrl = await adoptLocalFile(file.path, file.mimetype);
        const { rows } = await pool.query(
          `INSERT INTO comic_page (comic_id, issue_id, page_index, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [comicId, issueId, nextIndex, imageUrl],
        );
        inserted.push(rows[0]);
        nextIndex += 1;
      }
      logComicRevision(comicId, req.user.id, 'pages_added', { issueId, detail: { count: inserted.length } });

      res.status(201).json(inserted);
    } catch (err) {
      console.error('[POST /comics/:comicId/pages] failed:', err);
      res.status(500).json({ error: 'Failed to upload pages' });
    }
  },
);

// Bulk resequence — mirrors the desktop sync-desktop "delete and reinsert in
// order" approach for screenplay scenes/blocks (server.js), the only
// existing precedent for reordering in this codebase.
router.put('/comics/:comicId/pages/reorder', requireAuth, async (req, res) => {
  const { comicId } = req.params;
  const { pageIds } = req.body ?? {};
  if (!Array.isArray(pageIds) || pageIds.length === 0) {
    return res.status(400).json({ error: 'pageIds must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    const role = await getComicRole(comicId, req.user.id);
    if (role !== 'owner' && role !== 'contributor') {
      return res.status(403).json({ error: 'You do not have permission to reorder pages on this comic' });
    }

    await client.query('BEGIN');
    for (let i = 0; i < pageIds.length; i += 1) {
      await client.query(
        'UPDATE comic_page SET page_index = $1 WHERE page_id = $2 AND comic_id = $3',
        [i, pageIds[i], comicId],
      );
    }
    await client.query('COMMIT');
    logComicRevision(comicId, req.user.id, 'pages_reordered', { detail: { count: pageIds.length } });

    const { rows } = await pool.query(
      'SELECT * FROM comic_page WHERE comic_id = $1 ORDER BY page_index ASC',
      [comicId],
    );
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /comics/:comicId/pages/reorder] failed:', err);
    res.status(500).json({ error: 'Failed to reorder pages' });
  } finally {
    client.release();
  }
});

async function loadPageWithComic(pageId) {
  const { rows } = await pool.query(
    `SELECT cp.*, ct.creator_id AS comic_creator_id
     FROM comic_page cp
     JOIN comic_title ct ON ct.comic_id = cp.comic_id
     WHERE cp.page_id = $1`,
    [pageId],
  );
  return rows[0] ?? null;
}

router.patch('/comic-pages/:pageId', requireAuth, async (req, res) => {
  const { pageId } = req.params;
  const { alt_text: altText, overlays } = req.body ?? {};
  if (overlays !== undefined && !Array.isArray(overlays)) {
    return res.status(400).json({ error: 'overlays must be an array' });
  }

  try {
    const page = await loadPageWithComic(pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    const role = await getComicRole(page.comic_id, req.user.id);
    if (role !== 'owner' && role !== 'contributor') {
      return res.status(403).json({
        error: "You can't change this page directly. Suggest changes instead, or ask the author to invite you.",
      });
    }

    const { rows } = await pool.query(
      `UPDATE comic_page
          SET alt_text = CASE WHEN $1::boolean THEN $2 ELSE alt_text END,
              overlays = COALESCE($3::jsonb, overlays)
        WHERE page_id = $4 RETURNING *`,
      [altText !== undefined, altText || null, overlays === undefined ? null : JSON.stringify(overlays), pageId],
    );
    if (overlays !== undefined) {
      logComicRevision(page.comic_id, req.user.id, 'layers_edited', {
        issueId: page.issue_id,
        pageId,
        detail: { before: page.overlays ?? [], after: overlays },
      });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /comic-pages/:pageId] failed:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

router.delete('/comic-pages/:pageId', requireAuth, async (req, res) => {
  const { pageId } = req.params;

  try {
    const page = await loadPageWithComic(pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    const role = await getComicRole(page.comic_id, req.user.id);
    if (role !== 'owner' && role !== 'contributor') {
      return res.status(403).json({ error: 'You do not have permission to delete this page' });
    }

    const branchImages = await pool.query('SELECT image_url FROM comic_page_branches WHERE page_id = $1', [pageId]);
    await pool.query('DELETE FROM comic_page WHERE page_id = $1', [pageId]);
    removeUnreferencedImages([page.image_url, ...branchImages.rows.map((b) => b.image_url)]);
    logComicRevision(page.comic_id, req.user.id, 'page_deleted', { issueId: page.issue_id, detail: { pageIndex: page.page_index } });

    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /comic-pages/:pageId] failed:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// ---------------------------------------------------------------------------
// Issues (episodes): group a comic's pages the way chapters group a story.
// The team adds and renames issues; reorder, publish and delete are
// owner-only, matching chapters.
// ---------------------------------------------------------------------------

async function loadIssueWithComic(issueId) {
  const { rows } = await pool
    .query('SELECT * FROM comic_issue WHERE issue_id = $1', [issueId])
    .catch(() => ({ rows: [] }));
  if (!rows[0]) return null;
  const comic = await loadWork(pool, 'comic', rows[0].comic_id);
  return comic ? { issue: rows[0], comic } : null;
}

router.post('/comics/:comicId/issues', requireAuth, async (req, res) => {
  const { comicId } = req.params;
  const { title, afterIssueId } = req.body ?? {};
  try {
    const comic = await loadWork(pool, 'comic', comicId);
    if (!comic) return res.status(404).json({ error: 'Comic not found' });
    if (!(await isTeam(pool, 'comic', comic, req.user.id))) {
      return res.status(403).json({ error: 'You do not have permission to add issues to this comic' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT issue_id FROM comic_issue WHERE comic_id = $1 ORDER BY issue_index ASC, created_at ASC',
        [comicId],
      );
      const order = existing.rows.map((r) => r.issue_id);
      const { rows } = await client.query(
        'INSERT INTO comic_issue (comic_id, issue_index, title) VALUES ($1, $2, $3) RETURNING *',
        [comicId, order.length, typeof title === 'string' && title.trim() ? title.trim() : `Issue ${order.length + 1}`],
      );
      // Inserting after a given issue renumbers the rest.
      const afterAt = afterIssueId ? order.indexOf(afterIssueId) : -1;
      if (afterAt !== -1) {
        order.splice(afterAt + 1, 0, rows[0].issue_id);
        for (let i = 0; i < order.length; i += 1) {
          await client.query('UPDATE comic_issue SET issue_index = $1 WHERE issue_id = $2', [i, order[i]]);
        }
      }
      await client.query('COMMIT');
      logComicRevision(comicId, req.user.id, 'issue_added', { issueId: rows[0].issue_id, detail: { title: rows[0].title } });
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[POST /comics/:comicId/issues] failed:', err);
    res.status(500).json({ error: 'Failed to add issue' });
  }
});

router.patch('/comic-issues/:issueId', requireAuth, async (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const found = await loadIssueWithComic(req.params.issueId);
    if (!found) return res.status(404).json({ error: 'Issue not found' });
    if (!(await isTeam(pool, 'comic', found.comic, req.user.id))) {
      return res.status(403).json({ error: 'You do not have permission to edit this issue' });
    }
    const { rows } = await pool.query(
      'UPDATE comic_issue SET title = $1, updated_at = now() WHERE issue_id = $2 RETURNING *',
      [title.trim(), found.issue.issue_id],
    );
    logComicRevision(found.comic.comic_id, req.user.id, 'issue_renamed', {
      issueId: found.issue.issue_id,
      detail: { before: found.issue.title, after: title.trim() },
    });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /comic-issues/:issueId] failed:', err);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

router.patch('/comic-issues/:issueId/publish', requireAuth, async (req, res) => {
  try {
    const found = await loadIssueWithComic(req.params.issueId);
    if (!found) return res.status(404).json({ error: 'Issue not found' });
    if (!(await isOwner(pool, 'comic', found.comic, req.user.id))) {
      return res.status(403).json({ error: 'Only the comic owner can publish issues' });
    }
    const { rows } = await pool.query(
      'UPDATE comic_issue SET published = $1, updated_at = now() WHERE issue_id = $2 RETURNING *',
      [req.body?.published !== false, found.issue.issue_id],
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /comic-issues/:issueId/publish] failed:', err);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

router.delete('/comic-issues/:issueId', requireAuth, async (req, res) => {
  try {
    const found = await loadIssueWithComic(req.params.issueId);
    if (!found) return res.status(404).json({ error: 'Issue not found' });
    if (!(await isOwner(pool, 'comic', found.comic, req.user.id))) {
      return res.status(403).json({ error: 'Only the comic owner can delete issues' });
    }
    const pages = await pool.query(
      `SELECT image_url FROM comic_page WHERE issue_id = $1
       UNION ALL
       SELECT b.image_url FROM comic_page_branches b JOIN comic_page p ON p.page_id = b.page_id WHERE p.issue_id = $1`,
      [found.issue.issue_id],
    );
    await pool.query('DELETE FROM comic_issue WHERE issue_id = $1', [found.issue.issue_id]);
    removeUnreferencedImages(pages.rows.map((p) => p.image_url));
    logComicRevision(found.comic.comic_id, req.user.id, 'issue_deleted', { detail: { title: found.issue.title } });
    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /comic-issues/:issueId] failed:', err);
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

router.put('/comics/:comicId/issues/reorder', requireAuth, async (req, res) => {
  const { comicId } = req.params;
  const { issueIds } = req.body ?? {};
  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return res.status(400).json({ error: 'issueIds must be a non-empty array' });
  }
  const client = await pool.connect();
  try {
    const comic = await loadWork(pool, 'comic', comicId);
    if (!comic) return res.status(404).json({ error: 'Comic not found' });
    if (!(await isOwner(pool, 'comic', comic, req.user.id))) {
      return res.status(403).json({ error: 'Only the comic owner can reorder issues' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < issueIds.length; i += 1) {
      await client.query('UPDATE comic_issue SET issue_index = $1 WHERE issue_id = $2 AND comic_id = $3', [
        i,
        issueIds[i],
        comicId,
      ]);
    }
    await client.query('UPDATE comic_title SET updated_at = now() WHERE comic_id = $1', [comicId]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[PUT /comics/:comicId/issues/reorder] failed:', err);
    res.status(500).json({ error: 'Failed to reorder issues' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Page alternatives (branches): another version of one page — a redrawn
// panel, a different ending — with its own text layers. Any signed-in reader
// may add one, like paragraph branches on stories; the owner, the author or
// platform staff may edit or delete it.
// ---------------------------------------------------------------------------

const branchUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const dir = path.join(COMIC_UPLOADS_DIR, 'branches');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      cb(null, `${randomUUID()}${ALLOWED_MIME_EXTENSIONS[file.mimetype] || ''}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error('Unsupported image type — only PNG, JPEG, WEBP, and GIF are allowed'));
      return;
    }
    cb(null, true);
  },
});

const pageBranchRow = (r) => ({
  id: r.id,
  page_id: r.page_id,
  comic_id: r.comic_id,
  image_url: r.image_url,
  overlays: r.overlays ?? [],
  name: r.name,
  language: r.language,
  user_id: r.user_id,
  author_email: r.author_email ?? null,
  issue_id: r.issue_id ?? null,
  created_at: r.created_at,
});

router.get('/comics/:comicId/branches', async (req, res) => {
  try {
    const comic = await loadWork(pool, 'comic', req.params.comicId);
    if (!comic) return res.status(404).json({ error: 'Comic not found' });
    if (!(await canView(pool, 'comic', comic, await optionalUserId(req)))) {
      return res.status(403).json({ error: viewDeniedMessage('comic', comic) });
    }
    const { rows } = await pool.query(
      `SELECT b.*, p.issue_id, u.email AS author_email
         FROM comic_page_branches b
         JOIN comic_page p ON p.page_id = b.page_id
         LEFT JOIN local_users u ON u.id = b.user_id
        WHERE b.comic_id = $1
        ORDER BY b.created_at ASC`,
      [comic.comic_id],
    );
    res.json(rows.map(pageBranchRow));
  } catch (err) {
    console.error('[GET /comics/:comicId/branches] failed:', err);
    res.status(500).json({ error: 'Failed to fetch page alternatives' });
  }
});

router.post(
  '/comic-pages/:pageId/branches',
  requireAuth,
  (req, res, next) => {
    branchUpload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'An image is required' });
    try {
      const page = await loadPageWithComic(req.params.pageId);
      const comic = page && (await loadWork(pool, 'comic', page.comic_id));
      if (!comic) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(404).json({ error: 'Page not found' });
      }
      if (!(await canView(pool, 'comic', comic, req.user.id))) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ error: viewDeniedMessage('comic', comic) });
      }
      const imageUrl = await adoptLocalFile(req.file.path, req.file.mimetype);
      const { rows } = await pool.query(
        `INSERT INTO comic_page_branches (page_id, comic_id, image_url, name, language, user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [page.page_id, page.comic_id, imageUrl, req.body?.name || null, comic.language || 'en', req.user.id],
      );
      logComicRevision(page.comic_id, req.user.id, 'alternative_added', { issueId: page.issue_id, pageId: page.page_id });
      res.status(201).json(pageBranchRow({ ...rows[0], issue_id: page.issue_id }));
    } catch (err) {
      console.error('[POST /comic-pages/:pageId/branches] failed:', err);
      res.status(500).json({ error: 'Failed to add page alternative' });
    }
  },
);

async function authorizePageBranch(req, res) {
  const { rows } = await pool
    .query('SELECT * FROM comic_page_branches WHERE id = $1', [req.params.branchId])
    .catch(() => ({ rows: [] }));
  const branch = rows[0];
  if (!branch) {
    res.status(404).json({ error: 'Page alternative not found' });
    return null;
  }
  if (branch.user_id === req.user.id) return branch;
  const comic = await loadWork(pool, 'comic', branch.comic_id);
  if ((await isOwner(pool, 'comic', comic, req.user.id)) || (await isPlatformAdminOrEditor(req.user.id))) return branch;
  res.status(403).json({ error: 'Only the comic owner or the author can change this page alternative' });
  return null;
}

router.patch('/comic-page-branches/:branchId', requireAuth, async (req, res) => {
  const { name, overlays } = req.body ?? {};
  if (overlays !== undefined && !Array.isArray(overlays)) {
    return res.status(400).json({ error: 'overlays must be an array' });
  }
  try {
    const branch = await authorizePageBranch(req, res);
    if (!branch) return;
    const { rows } = await pool.query(
      `UPDATE comic_page_branches
          SET name = CASE WHEN $1::boolean THEN $2 ELSE name END,
              overlays = COALESCE($3::jsonb, overlays),
              updated_at = now()
        WHERE id = $4 RETURNING *`,
      [name !== undefined, name || null, overlays === undefined ? null : JSON.stringify(overlays), branch.id],
    );
    res.json(pageBranchRow(rows[0]));
  } catch (err) {
    console.error('[PATCH /comic-page-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update page alternative' });
  }
});

router.delete('/comic-page-branches/:branchId', requireAuth, async (req, res) => {
  try {
    const branch = await authorizePageBranch(req, res);
    if (!branch) return;
    await pool.query('DELETE FROM comic_page_branches WHERE id = $1', [branch.id]);
    removeUnreferencedImages([branch.image_url]);
    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /comic-page-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete page alternative' });
  }
});

// Revisions tab: the comic's change log, newest first.
router.get('/comics/:comicId/revisions', async (req, res) => {
  try {
    const comic = await loadWork(pool, 'comic', req.params.comicId);
    if (!comic) return res.status(404).json({ error: 'Comic not found' });
    if (!(await canView(pool, 'comic', comic, await optionalUserId(req)))) {
      return res.status(403).json({ error: viewDeniedMessage('comic', comic) });
    }
    const { rows } = await pool.query(
      `SELECT r.*, u.email AS author_email, i.title AS issue_title, p.page_index
         FROM comic_revisions r
         LEFT JOIN local_users u ON u.id = r.created_by
         LEFT JOIN comic_issue i ON i.issue_id = r.issue_id
         LEFT JOIN comic_page p ON p.page_id = r.page_id
        WHERE r.comic_id = $1
        ORDER BY r.created_at DESC
        LIMIT 500`,
      [comic.comic_id],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /comics/:comicId/revisions] failed:', err);
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

// ---------------------------------------------------------------------------
// Desktop (and later mobile) sync
// ---------------------------------------------------------------------------

// One page image, uploaded before a sync references it. Team members only
// (alternatives by other readers go through POST /comic-pages/:id/branches).
router.post(
  '/comics/:comicId/page-images',
  requireAuth,
  (req, res, next) => {
    branchUpload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'An image is required' });
    try {
      const comic = await loadWork(pool, 'comic', req.params.comicId);
      if (!comic || !(await canView(pool, 'comic', comic, req.user.id))) {
        fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(comic ? 403 : 404).json({ error: comic ? viewDeniedMessage('comic', comic) : 'Comic not found' });
      }
      const url = await adoptLocalFile(req.file.path, req.file.mimetype);
      await pool.query('INSERT INTO comic_uploaded_images (comic_id, url, uploaded_by) VALUES ($1, $2, $3)', [
        comic.comic_id,
        url,
        req.user.id,
      ]);
      res.status(201).json({ url });
    } catch (err) {
      console.error('[POST /comics/:comicId/page-images] failed:', err);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  },
);

// Replace a comic's title, reading direction, issues and pages with the
// desktop's copy — IN PLACE: issues / pages are matched by issueId / pageId
// (returned by this route), so comments, alternatives, proposals and media
// attached to them survive. Rows the payload no longer has are deleted.
// { title, direction: 'ltr' | 'rtl', issues: [{ issueId?, title, pages: [{ pageId?, imageUrl, alt?, overlays? }] }] }
router.post('/comics/:comicId/sync-desktop', requireAuth, async (req, res) => {
  const { title, direction, issues } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!Array.isArray(issues)) return res.status(400).json({ error: 'issues[] is required' });
  const comic = await loadWork(pool, 'comic', req.params.comicId).catch(() => null);
  if (!comic) return res.status(404).json({ error: 'Comic not found' });
  if (!(await isTeam(pool, 'comic', comic, req.user.id))) {
    return res.status(403).json({
      error: 'not_permitted',
      message: "You can't change this comic directly. Suggest changes instead, or ask the author to invite you.",
    });
  }
  // Every referenced image must belong to this comic.
  for (const issue of issues) {
    for (const page of Array.isArray(issue?.pages) ? issue.pages : []) {
      if (!(await isKnownComicImage(comic.comic_id, page?.imageUrl))) {
        return res.status(400).json({ error: `Upload the image first: ${String(page?.imageUrl ?? '').slice(0, 200)}` });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE comic_title SET title = $1, reading_direction = $2, updated_at = now() WHERE comic_id = $3', [
      title.trim(),
      direction === 'rtl' ? 'rtl' : 'ltr',
      comic.comic_id,
    ]);
    const existingIssues = (await client.query('SELECT issue_id FROM comic_issue WHERE comic_id = $1', [comic.comic_id])).rows.map((r) => r.issue_id);
    const existingPages = (await client.query('SELECT page_id, image_url FROM comic_page WHERE comic_id = $1', [comic.comic_id])).rows;
    const pageIds = new Set(existingPages.map((p) => p.page_id));
    const usedIssues = new Set();
    const usedPages = new Set();
    const synced = [];

    for (let i = 0; i < issues.length; i += 1) {
      const issue = issues[i] ?? {};
      let issueId = typeof issue.issueId === 'string' && existingIssues.includes(issue.issueId) && !usedIssues.has(issue.issueId) ? issue.issueId : null;
      const issueTitle = typeof issue.title === 'string' && issue.title.trim() ? issue.title.trim() : `Issue ${i + 1}`;
      if (issueId) {
        await client.query('UPDATE comic_issue SET issue_index = $1, title = $2, updated_at = now() WHERE issue_id = $3', [i, issueTitle, issueId]);
      } else {
        issueId = (
          await client.query('INSERT INTO comic_issue (comic_id, issue_index, title) VALUES ($1, $2, $3) RETURNING issue_id', [
            comic.comic_id,
            i,
            issueTitle,
          ])
        ).rows[0].issue_id;
      }
      usedIssues.add(issueId);

      const syncedPages = [];
      const pages = Array.isArray(issue.pages) ? issue.pages : [];
      for (let n = 0; n < pages.length; n += 1) {
        const page = pages[n] ?? {};
        const overlays = cleanOverlays(page.overlays);
        let pageId = typeof page.pageId === 'string' && pageIds.has(page.pageId) && !usedPages.has(page.pageId) ? page.pageId : null;
        if (pageId) {
          await client.query(
            `UPDATE comic_page SET issue_id = $1, page_index = $2, image_url = $3, alt_text = $4,
                    overlays = COALESCE($5::jsonb, overlays)
              WHERE page_id = $6`,
            [issueId, n, page.imageUrl, page.alt || null, overlays ? JSON.stringify(overlays) : null, pageId],
          );
        } else {
          pageId = (
            await client.query(
              `INSERT INTO comic_page (comic_id, issue_id, page_index, image_url, alt_text, overlays)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING page_id`,
              [comic.comic_id, issueId, n, page.imageUrl, page.alt || null, JSON.stringify(overlays ?? [])],
            )
          ).rows[0].page_id;
        }
        usedPages.add(pageId);
        syncedPages.push({ pageId, imageUrl: page.imageUrl });
      }
      synced.push({ issueId, title: issueTitle, pages: syncedPages });
    }

    const stalePages = existingPages.filter((p) => !usedPages.has(p.page_id));
    if (stalePages.length > 0) {
      await client.query('DELETE FROM comic_page WHERE page_id = ANY($1::uuid[])', [stalePages.map((p) => p.page_id)]);
    }
    const staleIssues = existingIssues.filter((id) => !usedIssues.has(id));
    if (staleIssues.length > 0) {
      await client.query('DELETE FROM comic_issue WHERE issue_id = ANY($1::uuid[])', [staleIssues]);
    }
    await client.query('COMMIT');
    removeUnreferencedImages(stalePages.map((p) => p.image_url));
    logComicRevision(comic.comic_id, req.user.id, 'desktop_sync', { detail: { issues: synced.length } });
    res.json({ ok: true, comicId: comic.comic_id, issues: synced });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /comics/:comicId/sync-desktop] failed:', err);
    res.status(500).json({ error: 'Failed to sync comic from desktop' });
  } finally {
    client.release();
  }
});

// A user's comics (profile pages): public ones for everyone, all for the user.
router.get('/users/:userId/comics', async (req, res) => {
  const { userId } = req.params;
  try {
    const viewer = await optionalUserId(req);
    const { rows } = await pool.query(
      `SELECT comic_id, title, cover_image_url, reading_direction, visibility, published, created_at, updated_at
         FROM comic_title
        WHERE creator_id = $1 ${viewer === userId ? '' : "AND visibility = 'public' AND published = true"}
        ORDER BY created_at DESC`,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /users/:userId/comics] failed:', err);
    res.status(500).json({ error: 'Failed to fetch comics' });
  }
});

export default router;
