// Branch sync for offline clients (the desktop app now, the mobile apps
// next): one request reconciles the branches a client knows with the server.
//
//   POST /stories/:id/branches/sync      { branches: [{ id?, chapterId, paragraphIndex, text, name?, language?, deleted? }] }
//   POST /screenplays/:id/branches/sync  { branches: [{ id?, blockId, text, name?, language?, deleted? }] }
//   POST /comics/:id/branches/sync       { branches: [{ id?, pageId, imageUrl?, overlays?, name?, deleted? }] }
//
// Rules (same for every kind, see Documentation/branching-api.md):
// - an entry without id is created, authored by the signed-in user;
// - an entry with id is updated when the caller may edit that branch (its
//   author, the work's owner, platform staff); otherwise a text change becomes
//   a proposal for the owner (stories / screenplays) or is refused (comics);
// - `deleted: true` removes a branch the caller may edit;
// - branches the client doesn't mention are NEVER touched;
// - the response lists every branch of the work plus a per-entry result.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { canView, isOwner, isPlatformAdminOrEditor, isUuid, loadWork, viewDeniedMessage, writeAccess } from './workAccess.js';

const router = express.Router();

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null);

async function canEditBranch(kind, work, branchAuthorId, userId) {
  if (branchAuthorId && branchAuthorId === userId) return true;
  return (await isOwner(pool, kind, work, userId)) || isPlatformAdminOrEditor(userId);
}

// Per-kind storage: list the work's branches, create / update / delete one.
const KIND = {
  story: {
    path: '/stories/:workId/branches/sync',
    async list(work) {
      const { rows } = await pool.query(
        `SELECT pb.id, pb.chapter_id, pb.parent_paragraph_index, pb.branch_text, pb.branch_name, pb.language,
                pb.user_id, pb.created_at
           FROM paragraph_branches pb JOIN stories s ON s.chapter_id = pb.chapter_id
          WHERE s.story_title_id = $1
          ORDER BY s.chapter_index, pb.parent_paragraph_index, pb.created_at`,
        [work.story_title_id],
      );
      return rows.map((r) => ({
        id: r.id,
        chapterId: r.chapter_id,
        paragraphIndex: r.parent_paragraph_index,
        text: r.branch_text,
        name: r.branch_name,
        language: r.language,
        userId: r.user_id,
        createdAt: r.created_at,
      }));
    },
    async load(id) {
      const { rows } = await pool.query(
        `SELECT pb.*, s.story_title_id AS work_id FROM paragraph_branches pb JOIN stories s ON s.chapter_id = pb.chapter_id
          WHERE pb.id = $1`,
        [id],
      );
      return rows[0] ? { ...rows[0], text: rows[0].branch_text } : null;
    },
    async create(work, entry, userId) {
      const chapter = await pool.query(
        'SELECT chapter_id, paragraphs FROM stories WHERE chapter_id = $1 AND story_title_id = $2',
        [entry.chapterId, work.story_title_id],
      );
      if (!chapter.rows[0] || !Number.isInteger(entry.paragraphIndex) || typeof entry.text !== 'string') return null;
      const parentText = (chapter.rows[0].paragraphs ?? [])[entry.paragraphIndex] ?? '';
      const { rows } = await pool.query(
        `INSERT INTO paragraph_branches (chapter_id, parent_paragraph_index, parent_paragraph_text, branch_text, user_id, language, branch_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [entry.chapterId, entry.paragraphIndex, parentText, entry.text, userId, clip(entry.language, 20) || work.language || 'en', clip(entry.name, 200)],
      );
      return rows[0].id;
    },
    async update(branch, entry) {
      await pool.query(
        `UPDATE paragraph_branches SET branch_text = COALESCE($1, branch_text),
                branch_name = CASE WHEN $2::boolean THEN $3 ELSE branch_name END
          WHERE id = $4`,
        [typeof entry.text === 'string' ? entry.text : null, entry.name !== undefined, clip(entry.name, 200), branch.id],
      );
    },
    remove: (branch) => pool.query('DELETE FROM paragraph_branches WHERE id = $1', [branch.id]),
    propose: (work, branch, entry, userId) =>
      pool.query(
        `INSERT INTO crdt_proposals (story_title_id, target_type, target_chapter_id, target_branch_id, proposed_text, author_user_id)
         VALUES ($1, 'branch', $2, $3, $4, $5)`,
        [work.story_title_id, branch.chapter_id, branch.id, entry.text, userId],
      ),
    changed: (branch, entry) =>
      (typeof entry.text === 'string' && entry.text !== branch.branch_text) ||
      (entry.name !== undefined && (entry.name || null) !== branch.branch_name),
  },

  screenplay: {
    path: '/screenplays/:workId/branches/sync',
    async list(work) {
      const { rows } = await pool.query(
        `SELECT br.*, b.scene_id FROM screenplay_block_branches br JOIN screenplay_block b ON b.block_id = br.block_id
          WHERE br.screenplay_id = $1 ORDER BY br.created_at`,
        [work.screenplay_id],
      );
      return rows.map((r) => ({
        id: r.id,
        blockId: r.block_id,
        sceneId: r.scene_id,
        text: r.branch_text,
        name: r.name,
        language: r.language,
        userId: r.user_id,
        createdAt: r.created_at,
      }));
    },
    async load(id) {
      const { rows } = await pool.query('SELECT *, screenplay_id AS work_id FROM screenplay_block_branches WHERE id = $1', [id]);
      return rows[0] ? { ...rows[0], text: rows[0].branch_text } : null;
    },
    async create(work, entry, userId) {
      const block = await pool.query('SELECT block_id, block_type FROM screenplay_block WHERE block_id = $1 AND screenplay_id = $2', [
        entry.blockId,
        work.screenplay_id,
      ]);
      if (!block.rows[0] || typeof entry.text !== 'string' || !entry.text.trim()) return null;
      const { rows } = await pool.query(
        `INSERT INTO screenplay_block_branches (block_id, screenplay_id, branch_text, block_type, name, language, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [entry.blockId, work.screenplay_id, entry.text, block.rows[0].block_type, clip(entry.name, 200), clip(entry.language, 20) || work.language || 'en', userId],
      );
      return rows[0].id;
    },
    async update(branch, entry) {
      await pool.query(
        `UPDATE screenplay_block_branches SET branch_text = COALESCE($1, branch_text),
                name = CASE WHEN $2::boolean THEN $3 ELSE name END, updated_at = now()
          WHERE id = $4`,
        [typeof entry.text === 'string' && entry.text.trim() ? entry.text : null, entry.name !== undefined, clip(entry.name, 200), branch.id],
      );
    },
    remove: (branch) => pool.query('DELETE FROM screenplay_block_branches WHERE id = $1', [branch.id]),
    propose: (work, branch, entry, userId) =>
      pool.query(
        `INSERT INTO crdt_proposals (screenplay_id, target_type, target_branch_id, proposed_text, author_user_id)
         VALUES ($1, 'block_branch', $2, $3, $4)`,
        [work.screenplay_id, branch.id, entry.text, userId],
      ),
    changed: (branch, entry) =>
      (typeof entry.text === 'string' && entry.text !== branch.branch_text) ||
      (entry.name !== undefined && (entry.name || null) !== branch.name),
  },

  comic: {
    path: '/comics/:workId/branches/sync',
    async list(work) {
      const { rows } = await pool.query(
        `SELECT br.*, p.issue_id FROM comic_page_branches br JOIN comic_page p ON p.page_id = br.page_id
          WHERE br.comic_id = $1 ORDER BY br.created_at`,
        [work.comic_id],
      );
      return rows.map((r) => ({
        id: r.id,
        pageId: r.page_id,
        issueId: r.issue_id,
        imageUrl: r.image_url,
        overlays: r.overlays ?? [],
        name: r.name,
        language: r.language,
        userId: r.user_id,
        createdAt: r.created_at,
      }));
    },
    async load(id) {
      const { rows } = await pool.query('SELECT *, comic_id AS work_id FROM comic_page_branches WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
    async create(work, entry, userId) {
      const page = await pool.query('SELECT page_id FROM comic_page WHERE page_id = $1 AND comic_id = $2', [entry.pageId, work.comic_id]);
      if (!page.rows[0] || !(await isKnownComicImage(work.comic_id, entry.imageUrl))) return null;
      const { rows } = await pool.query(
        `INSERT INTO comic_page_branches (page_id, comic_id, image_url, overlays, name, language, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [entry.pageId, work.comic_id, entry.imageUrl, JSON.stringify(cleanOverlays(entry.overlays) ?? []), clip(entry.name, 200), work.language || 'en', userId],
      );
      return rows[0].id;
    },
    async update(branch, entry) {
      const overlays = cleanOverlays(entry.overlays);
      await pool.query(
        `UPDATE comic_page_branches SET overlays = COALESCE($1::jsonb, overlays),
                name = CASE WHEN $2::boolean THEN $3 ELSE name END, updated_at = now()
          WHERE id = $4`,
        [overlays ? JSON.stringify(overlays) : null, entry.name !== undefined, clip(entry.name, 200), branch.id],
      );
    },
    remove: (branch) => pool.query('DELETE FROM comic_page_branches WHERE id = $1', [branch.id]),
    propose: null, // page alternatives' text has no proposal flow; others can add their own alternative
    changed: (branch, entry) =>
      (entry.overlays !== undefined && JSON.stringify(cleanOverlays(entry.overlays)) !== JSON.stringify(branch.overlays ?? [])) ||
      (entry.name !== undefined && (entry.name || null) !== branch.name),
  },
};

// Overlays: [{ text, x, y, style }] (percent positions), same shape everywhere.
export function cleanOverlays(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 200).map((o) => ({
    text: String(o?.text ?? '').slice(0, 2000),
    x: Math.min(100, Math.max(0, Number(o?.x) || 0)),
    y: Math.min(100, Math.max(0, Number(o?.y) || 0)),
    style: o?.style === 'box' ? 'box' : 'bubble',
  }));
}

// An image a comic may reference: uploaded for it (POST /comics/:id/page-images)
// or already used by one of its pages / alternatives.
export async function isKnownComicImage(comicId, url) {
  if (typeof url !== 'string' || !url) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM comic_uploaded_images WHERE comic_id = $1 AND url = $2
     UNION ALL SELECT 1 FROM comic_page WHERE comic_id = $1 AND image_url = $2
     UNION ALL SELECT 1 FROM comic_page_branches WHERE comic_id = $1 AND image_url = $2
     LIMIT 1`,
    [comicId, url],
  );
  return rows.length > 0;
}

for (const [kind, cfg] of Object.entries(KIND)) {
  router.post(cfg.path, requireAuth, async (req, res) => {
    const userId = req.user.id;
    const entries = Array.isArray(req.body?.branches) ? req.body.branches.slice(0, 2000) : null;
    if (!entries) return res.status(400).json({ error: 'branches[] is required' });
    try {
      const work = await loadWork(pool, kind, req.params.workId);
      if (!work) return res.status(404).json({ error: 'Not found' });
      if (!(await canView(pool, kind, work, userId))) return res.status(403).json({ error: viewDeniedMessage(kind, work) });
      const { role } = await writeAccess(pool, kind, work, userId);
      const workId = work[{ story: 'story_title_id', screenplay: 'screenplay_id', comic: 'comic_id' }[kind]];

      const results = [];
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i] ?? {};
        if (!entry.id) {
          if (entry.deleted) {
            results.push({ index: i, status: 'skipped' });
            continue;
          }
          // Readers may add branches wherever the work accepts contributions.
          const id = role || kind !== 'story' ? await cfg.create(work, entry, userId) : null;
          results.push(id ? { index: i, id, status: 'created' } : { index: i, status: 'invalid' });
          continue;
        }
        const branch = isUuid(entry.id) ? await cfg.load(entry.id) : null;
        if (!branch || branch.work_id !== workId) {
          results.push({ index: i, id: entry.id, status: 'not_found' });
          continue;
        }
        const editable = await canEditBranch(kind, work, branch.user_id, userId);
        if (entry.deleted) {
          if (editable) {
            await cfg.remove(branch);
            results.push({ index: i, id: branch.id, status: 'deleted' });
          } else {
            results.push({ index: i, id: branch.id, status: 'forbidden' });
          }
          continue;
        }
        if (!cfg.changed(branch, entry)) {
          results.push({ index: i, id: branch.id, status: 'unchanged' });
        } else if (editable) {
          await cfg.update(branch, entry);
          results.push({ index: i, id: branch.id, status: 'updated' });
        } else if (cfg.propose && typeof entry.text === 'string') {
          await cfg.propose(work, branch, entry, userId);
          results.push({ index: i, id: branch.id, status: 'proposed' });
        } else {
          results.push({ index: i, id: branch.id, status: 'forbidden' });
        }
      }
      res.json({ results, branches: await cfg.list(work) });
    } catch (err) {
      console.error(`[POST ${cfg.path}] failed:`, err);
      res.status(500).json({ error: 'Failed to sync branches' });
    }
  });
}

export default router;
