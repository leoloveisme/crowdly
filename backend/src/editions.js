// Editions: a named, saved path through a story's paragraph branches, with
// the resolved text frozen as a snapshot. See backend/migrations/0003_editions.sql.
//
// Anyone who can view a story may build an edition of it (it's a reading
// path, it doesn't change the story). Drafts are visible to their creator and
// the story team; published editions to everyone who can view the story.
// Auto-snapshot editions back audiobooks of the current text and are hidden
// from edition lists.

import express from 'express';
import { pool } from './db.js';
import { requireAuth } from './sessions.js';
import { optionalUserId, loadStory, isStoryTeam, canViewStory } from './storyAccess.js';

const router = express.Router();

async function loadChapters(db, storyTitleId) {
  const { rows } = await db.query(
    `SELECT chapter_id, chapter_title, paragraphs
       FROM stories
      WHERE story_title_id = $1
      ORDER BY episode_number NULLS FIRST, part_number NULLS FIRST, chapter_index ASC, created_at ASC`,
    [storyTitleId],
  );
  return rows;
}

/**
 * Resolve an edition's chapters from the story's CURRENT text.
 * `selectionsByChapter`: { [chapterId]: { [paragraphIndex]: branchId } }.
 * Branches are only honoured when they belong to that chapter and anchor at
 * that paragraph index; anything else falls back to the base text.
 */
async function resolveChapters(db, storyTitleId, selectionsByChapter = {}) {
  const chapters = await loadChapters(db, storyTitleId);
  // Branch ids are compared as text: the baseline migration declares
  // paragraph_branches.id as bigserial, but existing databases have uuid ids.
  const branchIds = Object.values(selectionsByChapter)
    .flatMap((sel) => Object.values(sel ?? {}))
    .map((id) => String(id))
    .filter((id) => id && id.length <= 64);
  const branches = new Map();
  if (branchIds.length > 0) {
    const { rows } = await db.query(
      'SELECT id::text AS id, chapter_id, parent_paragraph_index, branch_text FROM paragraph_branches WHERE id::text = ANY($1::text[])',
      [branchIds],
    );
    for (const b of rows) branches.set(b.id, b);
  }

  return chapters.map((ch, position) => {
    const paragraphs = Array.isArray(ch.paragraphs) ? [...ch.paragraphs] : [];
    const requested = selectionsByChapter[ch.chapter_id] ?? {};
    const selections = {};
    for (const [indexKey, branchIdRaw] of Object.entries(requested)) {
      const index = Number(indexKey);
      const branch = branches.get(String(branchIdRaw));
      if (!branch || branch.chapter_id !== ch.chapter_id || branch.parent_paragraph_index !== index) continue;
      if (index < 0 || index >= paragraphs.length) continue;
      paragraphs[index] = branch.branch_text;
      selections[index] = branch.id;
    }
    return {
      position,
      chapter_id: ch.chapter_id,
      chapter_title: ch.chapter_title ?? '',
      selections,
      snapshot_paragraphs: paragraphs,
    };
  });
}

async function writeEditionChapters(db, editionId, resolved) {
  await db.query('DELETE FROM story_edition_chapters WHERE edition_id = $1', [editionId]);
  for (const ch of resolved) {
    await db.query(
      `INSERT INTO story_edition_chapters (edition_id, position, chapter_id, chapter_title, selections, snapshot_paragraphs)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [editionId, ch.position, ch.chapter_id, ch.chapter_title, JSON.stringify(ch.selections), ch.snapshot_paragraphs],
    );
  }
}

/**
 * Freeze the story's current base text as a hidden "Original · as of <date>"
 * edition. Used when someone uploads a narration of the current story
 * without choosing an edition, so the recording stays tied to the exact text
 * that was read.
 */
export async function createAutoSnapshotEdition(db, storyTitleId, userId) {
  const resolved = await resolveChapters(db, storyTitleId, {});
  const date = new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(
    `INSERT INTO story_editions (story_title_id, name, created_by, status, is_auto_snapshot)
     VALUES ($1, $2, $3, 'published', true)
     RETURNING *`,
    [storyTitleId, `Original · as of ${date}`, userId],
  );
  await writeEditionChapters(db, rows[0].id, resolved);
  return rows[0];
}

async function canSeeEdition(db, edition, story, userId) {
  if (!(await canViewStory(db, story, userId))) return false;
  if (edition.status === 'published') return true;
  if (userId && edition.created_by === userId) return true;
  return isStoryTeam(db, story, userId);
}

async function canManageEdition(db, edition, story, userId) {
  if (!userId) return false;
  if (edition.created_by === userId) return true;
  return story.creator_id === userId;
}

async function loadEdition(db, editionId) {
  const { rows } = await db.query('SELECT * FROM story_editions WHERE id = $1', [editionId]);
  return rows[0] ?? null;
}

// GET /stories/:storyTitleId/editions — editions the viewer may see (no auto-snapshots)
router.get('/stories/:storyTitleId/editions', async (req, res) => {
  const { storyTitleId } = req.params;
  try {
    const userId = await optionalUserId(req);
    const story = await loadStory(pool, storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (!(await canViewStory(pool, story, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }
    const isTeam = await isStoryTeam(pool, story, userId);
    const { rows } = await pool.query(
      `SELECT e.id, e.name, e.description, e.status, e.created_by, e.snapshot_at, e.created_at,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email) AS creator_name,
              (SELECT count(*) FROM story_edition_chapters c, jsonb_object_keys(c.selections) k
                WHERE c.edition_id = e.id)::int AS branch_count,
              (SELECT count(*) FROM chapter_media m WHERE m.edition_id = e.id AND m.kind = 'audio')::int AS narration_count
         FROM story_editions e
         LEFT JOIN local_users u ON u.id = e.created_by
         LEFT JOIN profiles p ON p.id = e.created_by
        WHERE e.story_title_id = $1
          AND NOT e.is_auto_snapshot
          AND (e.status = 'published' OR e.created_by = $2 OR $3)
        ORDER BY e.created_at DESC`,
      [storyTitleId, userId, isTeam],
    );
    res.json(rows.map((r) => ({ ...r, is_mine: Boolean(userId && r.created_by === userId) })));
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/editions] failed:', err);
    res.status(500).json({ error: 'Failed to load editions' });
  }
});

// GET /stories/editions/:editionId — an edition with its frozen chapters
router.get('/stories/editions/:editionId', async (req, res) => {
  try {
    const userId = await optionalUserId(req);
    const edition = await loadEdition(pool, req.params.editionId);
    if (!edition) return res.status(404).json({ error: 'Edition not found' });
    const story = await loadStory(pool, edition.story_title_id);
    if (!story || !(await canSeeEdition(pool, edition, story, userId))) {
      return res.status(403).json({ error: 'Not allowed to view this edition' });
    }
    const { rows } = await pool.query(
      `SELECT position, chapter_id, chapter_title, selections, snapshot_paragraphs
         FROM story_edition_chapters WHERE edition_id = $1 ORDER BY position`,
      [edition.id],
    );
    res.json({
      ...edition,
      can_manage: await canManageEdition(pool, edition, story, userId),
      chapters: rows,
    });
  } catch (err) {
    console.error('[GET /stories/editions/:editionId] failed:', err);
    res.status(500).json({ error: 'Failed to load edition' });
  }
});

// POST /stories/:storyTitleId/editions { name, description?, status?, selections: { chapterId: { index: branchId } } }
router.post('/stories/:storyTitleId/editions', requireAuth, async (req, res) => {
  const { storyTitleId } = req.params;
  const { name, description, status = 'draft', selections = {} } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!['draft', 'published'].includes(status)) {
    return res.status(400).json({ error: "status must be 'draft' or 'published'" });
  }
  const client = await pool.connect();
  try {
    const story = await loadStory(client, storyTitleId);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (!(await canViewStory(client, story, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed to view this story' });
    }
    await client.query('BEGIN');
    const resolved = await resolveChapters(client, storyTitleId, selections);
    const { rows } = await client.query(
      `INSERT INTO story_editions (story_title_id, name, description, created_by, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [storyTitleId, name.trim(), description || null, req.user.id, status],
    );
    await writeEditionChapters(client, rows[0].id, resolved);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /stories/:storyTitleId/editions] failed:', err);
    res.status(500).json({ error: 'Failed to create edition' });
  } finally {
    client.release();
  }
});

// PATCH /stories/editions/:editionId { name?, description?, status?, selections? }
// Passing `selections` re-resolves the snapshot from the story's current text,
// which can invalidate narration timings — the UI warns before doing this.
router.patch('/stories/editions/:editionId', requireAuth, async (req, res) => {
  const { name, description, status, selections } = req.body ?? {};
  if (status !== undefined && !['draft', 'published'].includes(status)) {
    return res.status(400).json({ error: "status must be 'draft' or 'published'" });
  }
  const client = await pool.connect();
  try {
    const edition = await loadEdition(client, req.params.editionId);
    if (!edition) return res.status(404).json({ error: 'Edition not found' });
    const story = await loadStory(client, edition.story_title_id);
    if (!story || !(await canManageEdition(client, edition, story, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed to change this edition' });
    }
    await client.query('BEGIN');
    const fields = ['updated_at = now()'];
    const values = [];
    if (typeof name === 'string' && name.trim()) {
      values.push(name.trim());
      fields.push(`name = $${values.length}`);
    }
    if (description !== undefined) {
      values.push(description || null);
      fields.push(`description = $${values.length}`);
    }
    if (status !== undefined) {
      values.push(status);
      fields.push(`status = $${values.length}`);
    }
    if (selections !== undefined) {
      const resolved = await resolveChapters(client, edition.story_title_id, selections ?? {});
      await writeEditionChapters(client, edition.id, resolved);
      fields.push('snapshot_at = now()');
    }
    values.push(edition.id);
    const { rows } = await client.query(
      `UPDATE story_editions SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[PATCH /stories/editions/:editionId] failed:', err);
    res.status(500).json({ error: 'Failed to update edition' });
  } finally {
    client.release();
  }
});

// DELETE /stories/editions/:editionId — narrations of it keep their audio but
// lose their text alignment (edition_id is set to NULL).
router.delete('/stories/editions/:editionId', requireAuth, async (req, res) => {
  try {
    const edition = await loadEdition(pool, req.params.editionId);
    if (!edition) return res.status(404).json({ error: 'Edition not found' });
    const story = await loadStory(pool, edition.story_title_id);
    if (!story || !(await canManageEdition(pool, edition, story, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed to delete this edition' });
    }
    await pool.query('DELETE FROM story_editions WHERE id = $1', [edition.id]);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /stories/editions/:editionId] failed:', err);
    res.status(500).json({ error: 'Failed to delete edition' });
  }
});

export default router;
