import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { loginWithEmailPassword, registerWithEmailPassword } from './auth.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Ensure auxiliary tables / columns exist (best-effort)
async function ensureStoryAccessTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_access (
        story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'owner',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (story_title_id, user_id)
      )
    `);
    console.log('[init] ensured story_access table exists');
  } catch (err) {
    console.error('[init] failed to ensure story_access table:', err);
  }
}

async function ensureStoryTitlePublishedColumn() {
  try {
    await pool.query(
      "ALTER TABLE story_title ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true",
    );
    console.log('[init] ensured story_title.published column exists');
  } catch (err) {
    console.error('[init] failed to ensure story_title.published column:', err);
  }
}

// Paragraph branches table for story paragraph branching (moved from Supabase)
async function ensureParagraphBranchesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paragraph_branches (
        id bigserial PRIMARY KEY,
        chapter_id uuid NOT NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
        parent_paragraph_index integer NOT NULL,
        parent_paragraph_text text,
        branch_text text NOT NULL,
        user_id uuid REFERENCES local_users(id) ON DELETE SET NULL,
        language text NOT NULL DEFAULT 'en',
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[init] ensured paragraph_branches table exists');
  } catch (err) {
    console.error('[init] failed to ensure paragraph_branches table:', err);
  }
}

// Fire and forget; if this fails we log but do not crash the server
ensureStoryAccessTable().catch((err) => {
  console.error('[init] ensureStoryAccessTable unhandled error:', err);
});
ensureStoryTitlePublishedColumn().catch((err) => {
  console.error('[init] ensureStoryTitlePublishedColumn unhandled error:', err);
});
ensureParagraphBranchesTable().catch((err) => {
  console.error('[init] ensureParagraphBranchesTable unhandled error:', err);
});

app.get('/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 as ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 ? 'connected' : 'unknown' });
  } catch (err) {
    console.error('[health] DB check failed:', err);
    res.status(500).json({ status: 'error', db: 'unreachable' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const authResult = await loginWithEmailPassword(email, password);
    res.json(authResult);
  } catch (err) {
    console.error('[auth/login] failed:', err);
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Register a new local user account
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const registered = await registerWithEmailPassword(email, password);
    res.status(201).json(registered);
  } catch (err) {
    console.error('[auth/register] failed:', err);
    res.status(400).json({ error: err.message || 'Failed to register account' });
  }
});

// ---------------------------------------------------------------------------
// Story and chapter endpoints (for NewStoryTemplate and story editor UIs)
// ---------------------------------------------------------------------------

// List story titles created by a user
app.get('/story-titles', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM story_title WHERE creator_id = $1 ORDER BY created_at ASC',
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[story-titles] failed:', err);
    res.status(500).json({ error: 'Failed to fetch user stories' });
  }
});

// Get a single story title by ID, enforcing visibility/access rules
app.get('/story-titles/:storyTitleId', async (req, res) => {
  const { storyTitleId } = req.params;
  const userId = req.query.userId ?? null;

  try {
    const { rows } = await pool.query(
      'SELECT * FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (rows.length === 0) {
      console.warn('[GET /story-titles/:storyTitleId] story not found', { storyTitleId });
      return res.status(404).json({ error: 'Story not found' });
    }

    const story = rows[0];
    const visibility = story.visibility ?? 'public';

    if (visibility !== 'private') {
      return res.json(story);
    }

    // Private story: enforce access
    if (!userId) {
      console.warn('[GET /story-titles/:storyTitleId] private story requested without userId', {
        storyTitleId,
      });
      return res.status(403).json({
        error: 'This story is private. Please log in or ask the owner for access.',
      });
    }

    // Creator always has access
    if (story.creator_id === userId) {
      return res.json(story);
    }

    // Check story_access table; if it does not exist, fall back to creator-only access
    try {
      const access = await pool.query(
        'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
        [storyTitleId, userId],
      );
      if (access.rows.length > 0) {
        return res.json(story);
      }

      console.warn('[GET /story-titles/:storyTitleId] access denied for private story', {
        storyTitleId,
        userId,
      });
      return res.status(403).json({
        error: 'You do not have access to this private story.',
      });
    } catch (errAccess) {
      // If story_access table is missing, do not break existing behavior; just allow creator-only
      if (errAccess?.code === '42P01') {
        console.warn(
          '[GET /story-titles/:storyTitleId] story_access table missing, treating as creator-only access',
          { storyTitleId, userId },
        );
        return res.status(403).json({
          error: 'You do not have access to this private story.',
        });
      }

      console.error('[GET /story-titles/:storyTitleId] access check failed:', errAccess);
      return res.status(500).json({ error: 'Failed to check story access' });
    }
  } catch (err) {
    console.error('[GET /story-titles/:storyTitleId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

// Get story title revisions for a story
app.get('/story-title-revisions/:storyTitleId', async (req, res) => {
  const { storyTitleId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM story_title_revisions WHERE story_title_id = $1 ORDER BY revision_number ASC',
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[story-title-revisions] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story title revisions' });
  }
});

// Helper to get the next revision number for story_title_revisions
async function getNextStoryTitleRevisionNumber(storyTitleId) {
  const { rows } = await pool.query(
    'SELECT revision_number FROM story_title_revisions WHERE story_title_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [storyTitleId],
  );
  if (rows.length === 0) return 1;
  return Number(rows[0].revision_number) + 1;
}

// Helper to get next revision numbers for chapters and paragraphs
async function getNextChapterRevisionNumber(chapterId) {
  const { rows } = await pool.query(
    'SELECT revision_number FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number DESC LIMIT 1',
    [chapterId],
  );
  if (rows.length === 0) return 1;
  return Number(rows[0].revision_number) + 1;
}

async function getNextParagraphRevisionNumber(chapterId, paragraphIndex) {
  const { rows } = await pool.query(
    'SELECT revision_number FROM paragraph_revisions WHERE chapter_id = $1 AND paragraph_index = $2 ORDER BY revision_number DESC LIMIT 1',
    [chapterId, paragraphIndex],
  );
  if (rows.length === 0) return 1;
  return Number(rows[0].revision_number) + 1;
}

// Create story title + initial revision + first chapter in a single transaction
app.post('/stories/template', async (req, res) => {
  const { title, chapterTitle, paragraphs, userId } = req.body ?? {};

  if (!title || !chapterTitle || !Array.isArray(paragraphs) || !userId) {
    return res.status(400).json({ error: 'title, chapterTitle, paragraphs[], and userId are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertTitle = await client.query(
      'INSERT INTO story_title (title, creator_id) VALUES ($1, $2) RETURNING story_title_id, title',
      [title, userId],
    );
    const storyTitleRow = insertTitle.rows[0];

    await client.query(
      'INSERT INTO story_title_revisions (story_title_id, prev_title, new_title, created_by, revision_number, revision_reason, language) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        storyTitleRow.story_title_id,
        null,
        storyTitleRow.title,
        userId,
        1,
        'Initial creation',
        'en',
      ],
    );

    const insertChapter = await client.query(
      'INSERT INTO stories (story_title_id, episode_number, part_number, chapter_index, chapter_title, paragraphs) VALUES ($1, $2, $3, $4, $5, $6) RETURNING chapter_id, chapter_title, paragraphs, episode_number, part_number, chapter_index',
      [storyTitleRow.story_title_id, null, null, 1, chapterTitle, paragraphs],
    );
    const chapterRow = insertChapter.rows[0];

    await client.query('COMMIT');

    // Best-effort: ensure the creator has an access row for this story
    try {
      await client.query(
        `INSERT INTO story_access (story_title_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (story_title_id, user_id) DO NOTHING`,
        [storyTitleRow.story_title_id, userId, 'owner'],
      );
    } catch (errAccess) {
      // Do not fail story creation if story_access insert fails
      console.error('[stories/template] failed to insert story_access row:', errAccess);
    }

    res.status(201).json({
      storyTitleId: storyTitleRow.story_title_id,
      chapterId: chapterRow.chapter_id,
      title: storyTitleRow.title,
      chapterTitle: chapterRow.chapter_title,
      paragraphs: chapterRow.paragraphs,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[stories/template] failed:', err);
    res.status(500).json({
      error: 'Failed to create story template',
      details: err?.message || String(err),
    });
  } finally {
    client.release();
  }
});

// List newest stories across the platform (by chapter created_at)
app.get('/stories/newest', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `SELECT s.chapter_id,
              s.chapter_title,
              s.created_at,
              s.story_title_id,
              st.title AS story_title
       FROM stories s
       JOIN story_title st ON st.story_title_id = s.story_title_id
       WHERE st.visibility = 'public' AND st.published = true
       ORDER BY s.created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/newest] failed:', err);
    res.status(500).json({ error: 'Failed to fetch newest stories' });
  }
});

// List chapters (stories rows) for a story
app.get('/chapters', async (req, res) => {
  const storyTitleId = req.query.storyTitleId;
  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM stories WHERE story_title_id = $1 ORDER BY episode_number NULLS FIRST, part_number NULLS FIRST, chapter_index ASC, created_at ASC',
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[chapters] failed:', err);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// List stories a user is creating or contributing to
app.get('/users/:userId/stories', async (req, res) => {
  const { userId } = req.params;

  try {
    // Stories created by the user
    const created = await pool.query(
      'SELECT story_title_id, title, created_at FROM story_title WHERE creator_id = $1',
      [userId],
    );

    // Stories the user has contributed to.
    // We support both legacy stories.contributor_id and new chapter_revisions.created_by.
    const contributed = await pool.query(
      `SELECT DISTINCT st.story_title_id,
              st.title,
              st.created_at
       FROM story_title st
       JOIN stories s ON st.story_title_id = s.story_title_id
       LEFT JOIN chapter_revisions cr ON cr.chapter_id = s.chapter_id
       WHERE s.contributor_id = $1 OR cr.created_by = $1`,
      [userId],
    );

    // Merge and tag roles
    const map = new Map();
    for (const row of created.rows) {
      map.set(row.story_title_id, {
        story_title_id: row.story_title_id,
        title: row.title,
        created_at: row.created_at,
        roles: ['creator'],
      });
    }
    for (const row of contributed.rows) {
      const existing = map.get(row.story_title_id);
      if (existing) {
        if (!existing.roles.includes('contributor')) {
          existing.roles.push('contributor');
        }
      } else {
        map.set(row.story_title_id, {
          story_title_id: row.story_title_id,
          title: row.title,
          created_at: row.created_at,
          roles: ['contributor'],
        });
      }
    }

    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    res.json(combined);
  } catch (err) {
    console.error('[GET /users/:userId/stories] failed:', err);
    res.status(500).json({ error: 'Failed to fetch user stories' });
  }
});

// Create a new chapter
app.post('/chapters', async (req, res) => {
  const { storyTitleId, chapterTitle, paragraphs, episodeNumber, partNumber, chapterIndex } = req.body ?? {};

  if (!storyTitleId || !chapterTitle || !Array.isArray(paragraphs)) {
    return res.status(400).json({ error: 'storyTitleId, chapterTitle, and paragraphs[] are required' });
  }

  const ep = Number.isInteger(episodeNumber) ? episodeNumber : null;
  const part = Number.isInteger(partNumber) ? partNumber : null;
  const idx = Number.isInteger(chapterIndex) ? chapterIndex : 1;

  try {
    const { rows } = await pool.query(
      'INSERT INTO stories (story_title_id, episode_number, part_number, chapter_index, chapter_title, paragraphs) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [storyTitleId, ep, part, idx, chapterTitle, paragraphs],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /chapters] failed:', err);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// Update an existing chapter and record a revision
app.patch('/chapters/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  const { chapterTitle, paragraphs, userId } = req.body ?? {};

  if (!chapterTitle && !Array.isArray(paragraphs)) {
    return res.status(400).json({ error: 'chapterTitle or paragraphs[] must be provided' });
  }

  try {
    // Fetch existing chapter for revision data
    const existingRes = await pool.query(
      'SELECT chapter_title, paragraphs FROM stories WHERE chapter_id = $1',
      [chapterId],
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const existing = existingRes.rows[0];

    const fields = [];
    const values = [];
    let idx = 1;

    if (chapterTitle !== undefined) {
      fields.push(`chapter_title = $${idx++}`);
      values.push(chapterTitle);
    }
    if (paragraphs !== undefined) {
      fields.push(`paragraphs = $${idx++}`);
      values.push(paragraphs);
    }
    values.push(chapterId);

    const sql = `UPDATE stories SET ${fields.join(', ')} WHERE chapter_id = $${idx} RETURNING *`;

    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    const updated = rows[0];

    // Insert chapter revision
    const nextRev = await getNextChapterRevisionNumber(chapterId);
    await pool.query(
      `INSERT INTO chapter_revisions
         (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        chapterId,
        existing.chapter_title,
        updated.chapter_title,
        existing.paragraphs,
        updated.paragraphs,
        userId ?? null,
        nextRev,
        'Chapter updated',
        'en',
      ],
    );

    // Insert paragraph revisions for changed paragraphs (best-effort)
    if (Array.isArray(existing.paragraphs) && Array.isArray(updated.paragraphs)) {
      const maxLen = Math.max(existing.paragraphs.length, updated.paragraphs.length);
      for (let i = 0; i < maxLen; i++) {
        const prevP = existing.paragraphs[i] ?? null;
        const newP = updated.paragraphs[i] ?? null;
        if (prevP === newP || newP == null) continue;
        const nextParRev = await getNextParagraphRevisionNumber(chapterId, i);
        await pool.query(
          `INSERT INTO paragraph_revisions
             (chapter_id, paragraph_index, prev_paragraph, new_paragraph, created_by, revision_number, revision_reason, language)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            chapterId,
            i,
            prevP,
            newP,
            userId ?? null,
            nextParRev,
            'Paragraph updated',
            'en',
          ],
        );
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('[PATCH /chapters/:chapterId] failed:', err);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// Get chapter revisions for a chapter
app.get('/chapter-revisions/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number ASC',
      [chapterId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /chapter-revisions/:chapterId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch chapter revisions' });
  }
});

// Delete a chapter
app.delete('/chapters/:chapterId', async (req, res) => {
  const { chapterId } = req.params;

  try {
    const { rowCount } = await pool.query('DELETE FROM stories WHERE chapter_id = $1', [chapterId]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /chapters/:chapterId] failed:', err);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

// Delete a story (story_title) and cascade to chapters via FK
app.delete('/story-titles/:storyTitleId', async (req, res) => {
  const { storyTitleId } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }
    // FKs on stories and child tables should cascade
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /story-titles/:storyTitleId] failed:', err);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// Reactions (likes/dislikes)
app.post('/reactions', async (req, res) => {
  const { userId, storyTitleId, chapterId, paragraphIndex, reactionType } = req.body ?? {};

  if (!userId || !reactionType || (!storyTitleId && !chapterId)) {
    return res.status(400).json({ error: 'userId, reactionType, and storyTitleId or chapterId are required' });
  }

  try {
    await pool.query(
      'INSERT INTO reactions (user_id, story_title_id, chapter_id, paragraph_index, reaction_type) VALUES ($1, $2, $3, $4, $5)',
      [userId, storyTitleId || null, chapterId || null, paragraphIndex ?? null, reactionType],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[POST /reactions] failed:', err);
    res.status(500).json({ error: 'Failed to record reaction' });
  }
});

app.get('/reactions', async (req, res) => {
  const { storyTitleId } = req.query;
  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT reaction_type, COUNT(*) as count
       FROM reactions
       WHERE story_title_id = $1
       GROUP BY reaction_type`,
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /reactions] failed:', err);
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

// Comments
app.post('/comments', async (req, res) => {
  const { userId, storyTitleId, chapterId, paragraphIndex, body, parentCommentId } = req.body ?? {};

  if (!userId || !storyTitleId || !body) {
    return res.status(400).json({ error: 'userId, storyTitleId, and body are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO comments (user_id, story_title_id, chapter_id, paragraph_index, body, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, storyTitleId, chapterId || null, paragraphIndex ?? null, body, parentCommentId || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /comments] failed:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.get('/comments', async (req, res) => {
  const { storyTitleId } = req.query;
  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM comments
       WHERE story_title_id = $1
       ORDER BY created_at ASC`,
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /comments] failed:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Paragraph branches: create
app.post('/paragraph-branches', async (req, res) => {
  const {
    chapterId,
    parentParagraphIndex,
    parentParagraphText,
    branchText,
    userId,
    language,
    metadata,
  } = req.body ?? {};

  // Allow empty string for branchText so that a "quick branch" can be
  // created before the user has typed any content. We only reject if the
  // value is truly missing/undefined/null.
  if (!chapterId || typeof parentParagraphIndex !== 'number' || branchText === undefined || branchText === null) {
    return res.status(400).json({
      error: 'chapterId, parentParagraphIndex (number), and branchText are required',
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO paragraph_branches
         (chapter_id, parent_paragraph_index, parent_paragraph_text, branch_text, user_id, language, metadata)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'en'), $7)
       RETURNING *`,
      [
        chapterId,
        parentParagraphIndex,
        parentParagraphText || null,
        branchText,
        userId || null,
        language || 'en',
        metadata ?? null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /paragraph-branches] failed:', err);
    res.status(500).json({ error: 'Failed to create paragraph branch' });
  }
});

// Paragraph branches: list across all stories (used by homepage BranchList)
app.get('/paragraph-branches', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pb.*, s.story_title_id, s.chapter_title
       FROM paragraph_branches pb
       JOIN stories s ON s.chapter_id = pb.chapter_id
       ORDER BY pb.created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /paragraph-branches] failed:', err);
    res.status(500).json({ error: 'Failed to fetch paragraph branches' });
  }
});

// Paragraph branches: list for a single story (used by StoryBranchList)
app.get('/stories/:storyTitleId/branches', async (req, res) => {
  const { storyTitleId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT pb.*, s.chapter_title
       FROM paragraph_branches pb
       JOIN stories s ON s.chapter_id = pb.chapter_id
       WHERE s.story_title_id = $1
       ORDER BY pb.created_at DESC`,
      [storyTitleId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/branches] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story branches' });
  }
});

// Paragraph branches: update
app.patch('/paragraph-branches/:id', async (req, res) => {
  const { id } = req.params;
  const { branchText, parentParagraphText } = req.body ?? {};

  if (!branchText && !parentParagraphText) {
    return res.status(400).json({ error: 'branchText or parentParagraphText must be provided' });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (branchText !== undefined) {
    fields.push(`branch_text = $${idx++}`);
    values.push(branchText);
  }
  if (parentParagraphText !== undefined) {
    fields.push(`parent_paragraph_text = $${idx++}`);
    values.push(parentParagraphText);
  }
  values.push(id);

  const sql = `UPDATE paragraph_branches SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (!rows.length) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /paragraph-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to update paragraph branch' });
  }
});

// Paragraph branches: delete
app.delete('/paragraph-branches/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM paragraph_branches WHERE id = $1', [id]);
    if (!rowCount) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /paragraph-branches/:id] failed:', err);
    res.status(500).json({ error: 'Failed to delete paragraph branch' });
  }
});

// Get contributors for a story (creator + chapter revision authors + story-level contributors)
app.get('/stories/:storyTitleId/contributors', async (req, res) => {
  const { storyTitleId } = req.params;

  try {
    const { rows } = await pool.query(
      `WITH creator AS (
         SELECT st.creator_id AS user_id, 'creator'::text AS role
         FROM story_title st
         WHERE st.story_title_id = $1
       ),
       chapter_contributors AS (
         SELECT DISTINCT cr.created_by AS user_id, 'contributor'::text AS role
         FROM chapter_revisions cr
         JOIN stories s ON s.chapter_id = cr.chapter_id
         WHERE s.story_title_id = $1 AND cr.created_by IS NOT NULL
       ),
       story_contributors AS (
         SELECT DISTINCT s.contributor_id AS user_id, 'contributor'::text AS role
         FROM stories s
         WHERE s.story_title_id = $1 AND s.contributor_id IS NOT NULL
       )
       SELECT DISTINCT u.id, u.email, c.role
       FROM (
         SELECT * FROM creator
         UNION ALL
         SELECT * FROM chapter_contributors
         UNION ALL
         SELECT * FROM story_contributors
       ) c
       JOIN local_users u ON u.id = c.user_id`,
      [storyTitleId],
    );

    res.json(rows);
  } catch (err) {
    if (err?.code === '42P01') {
      // Revisions table missing: fall back to just creator
      console.warn('[GET /stories/:storyTitleId/contributors] revisions table missing, falling back to creator only', err);
      try {
        const fallback = await pool.query(
          `SELECT u.id, u.email, 'creator'::text AS role
           FROM story_title st
           JOIN local_users u ON u.id = st.creator_id
           WHERE st.story_title_id = $1`,
          [storyTitleId],
        );
        return res.json(fallback.rows);
      } catch (innerErr) {
        console.error('[GET /stories/:storyTitleId/contributors] fallback failed:', innerErr);
        return res.status(500).json({ error: 'Failed to fetch contributors' });
      }
    }

    console.error('[GET /stories/:storyTitleId/contributors] failed:', err);
    res.status(500).json({ error: 'Failed to fetch contributors' });
  }
});

// Update story title and create a revision
app.patch('/story-titles/:storyTitleId', async (req, res) => {
  const { storyTitleId } = req.params;
  const { title, userId } = req.body ?? {};

  if (!title || !userId) {
    return res.status(400).json({ error: 'title and userId are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT title FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Story title not found' });
    }

    const prevTitle = existing.rows[0].title;

    const updated = await client.query(
      'UPDATE story_title SET title = $1 WHERE story_title_id = $2 RETURNING *',
      [title, storyTitleId],
    );

    const nextRevision = await getNextStoryTitleRevisionNumber(storyTitleId);

    await client.query(
      'INSERT INTO story_title_revisions (story_title_id, prev_title, new_title, created_by, revision_number, revision_reason, language) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        storyTitleId,
        prevTitle,
        title,
        userId,
        nextRevision,
        'Manual update',
        'en',
      ],
    );

    await client.query('COMMIT');

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /story-titles/:storyTitleId] failed:', err);
    res.status(500).json({ error: 'Failed to update story title' });
  } finally {
    client.release();
  }
});

// Update story visibility / published flags (no revision)
app.patch('/story-titles/:storyTitleId/settings', async (req, res) => {
  const { storyTitleId } = req.params;
  const { visibility, published } = req.body ?? {};

  if (visibility === undefined && published === undefined) {
    return res.status(400).json({ error: 'At least one of visibility or published must be provided' });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (visibility !== undefined) {
    fields.push(`visibility = $${idx++}`);
    values.push(visibility);
  }
  if (published !== undefined) {
    fields.push(`published = $${idx++}`);
    values.push(Boolean(published));
  }
  values.push(storyTitleId);

  const sql = `UPDATE story_title SET ${fields.join(', ')} WHERE story_title_id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /story-titles/:storyTitleId/settings] failed:', err);
    res.status(500).json({ error: 'Failed to update story settings' });
  }
});

// Clone a story (title + chapters) for the requesting user
app.post('/stories/:storyTitleId/clone', async (req, res) => {
  const { storyTitleId } = req.params;
  const { userId } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required to clone a story' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceTitleRes = await client.query(
      'SELECT story_title_id, title, visibility, published FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (sourceTitleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source story not found' });
    }
    const src = sourceTitleRes.rows[0];

    const insertTitleRes = await client.query(
      'INSERT INTO story_title (title, creator_id, visibility, published) VALUES ($1, $2, $3, $4) RETURNING story_title_id, title, visibility, published',
      [src.title, userId, src.visibility ?? 'public', src.published ?? true],
    );
    const newTitle = insertTitleRes.rows[0];

    await client.query(
      `INSERT INTO stories (story_title_id, episode_number, part_number, chapter_index, chapter_title, paragraphs)
       SELECT $1, episode_number, part_number, chapter_index, chapter_title, paragraphs
       FROM stories WHERE story_title_id = $2`,
      [newTitle.story_title_id, storyTitleId],
    );

    // Initial revision for cloned story
    await client.query(
      `INSERT INTO story_title_revisions (story_title_id, prev_title, new_title, created_by, revision_number, revision_reason, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newTitle.story_title_id,
        null,
        newTitle.title,
        userId,
        1,
        `Cloned from story ${storyTitleId}`,
        'en',
      ],
    );

    // Best-effort access row
    try {
      await client.query(
        `INSERT INTO story_access (story_title_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (story_title_id, user_id) DO NOTHING`,
        [newTitle.story_title_id, userId, 'owner'],
      );
    } catch (accessErr) {
      console.error('[POST /stories/:storyTitleId/clone] failed to insert story_access for clone:', accessErr);
    }

    await client.query('COMMIT');

    res.status(201).json({
      storyTitleId: newTitle.story_title_id,
      title: newTitle.title,
      visibility: newTitle.visibility,
      published: newTitle.published,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /stories/:storyTitleId/clone] failed:', err);
    res.status(500).json({ error: 'Failed to clone story' });
  } finally {
    client.release();
  }
});

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`Crowdly backend listening on http://localhost:${port}`);
});
