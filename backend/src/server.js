import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
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

async function ensureStoryTitleGenreAndTagsColumns() {
  try {
    await pool.query('ALTER TABLE story_title ADD COLUMN IF NOT EXISTS genre text');
    await pool.query('ALTER TABLE story_title ADD COLUMN IF NOT EXISTS tags text[]');
    console.log('[init] ensured story_title.genre and story_title.tags columns exist');
  } catch (err) {
    console.error('[init] failed to ensure story_title.genre/tags columns:', err);
  }
}

async function ensureStoryTitleUpdatedAtColumn() {
  try {
    await pool.query('ALTER TABLE story_title ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()');
    console.log('[init] ensured story_title.updated_at column exists');
  } catch (err) {
    console.error('[init] failed to ensure story_title.updated_at column:', err);
  }
}

// Mapping tables for desktop story metadata.
// Per spec:
// - author_id is stored in table `authors`
// - initiator_id is stored in table `story_initiators`
// Both tables have creator_id as their primary key.
async function ensureAuthorsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS authors (
        creator_id uuid PRIMARY KEY REFERENCES local_users(id) ON DELETE CASCADE,
        author_id  uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[init] ensured authors table exists');
  } catch (err) {
    console.error('[init] failed to ensure authors table:', err);
  }
}

async function ensureStoryInitiatorsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_initiators (
        creator_id uuid PRIMARY KEY REFERENCES local_users(id) ON DELETE CASCADE,
        initiator_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('[init] ensured story_initiators table exists');
  } catch (err) {
    console.error('[init] failed to ensure story_initiators table:', err);
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

// Some of our tables (story revisions, CRDT docs, creative spaces, etc.)
// rely on gen_random_uuid(). Ensure the pgcrypto extension is available
// so that function exists.
async function ensurePgcryptoExtension() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    console.log('[init] ensured pgcrypto extension exists');
  } catch (err) {
    console.error('[init] failed to ensure pgcrypto extension:', err);
  }
}

// CRDT document and change storage, following the high-level plan in
// further revisioning plans.md. This initial implementation focuses on
// storing changes (as opaque binary patches) and basic metadata; the
// server does not yet reconstruct or interpret Automerge docs itself.
async function ensureCrdtDocumentsTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crdt_documents (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        doc_key         text NOT NULL UNIQUE,
        story_title_id  uuid NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        chapter_id      uuid NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
        branch_id       bigint NULL REFERENCES paragraph_branches(id) ON DELETE CASCADE,
        doc_type        text NOT NULL,
        is_canonical    boolean NOT NULL DEFAULT true,
        owner_user_id   uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
        created_by      uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_documents_story_idx ON crdt_documents(story_title_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_documents_chapter_idx ON crdt_documents(chapter_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_documents_branch_idx ON crdt_documents(branch_id)',
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crdt_changes (
        id           bigserial PRIMARY KEY,
        doc_id       uuid NOT NULL REFERENCES crdt_documents(id) ON DELETE CASCADE,
        actor_id     uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
        seq          integer NOT NULL,
        ts           timestamptz NOT NULL DEFAULT now(),
        patch        bytea NOT NULL,
        is_snapshot  boolean NOT NULL DEFAULT false
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_changes_doc_ts_idx ON crdt_changes(doc_id, ts)',
    );

    console.log('[init] ensured crdt_documents and crdt_changes tables exist');
  } catch (err) {
    console.error('[init] failed to ensure CRDT tables:', err);
  }
}

// Basic proposal/approval support: lightweight version of the CRDT plan
// that lets us attach proposed text and an approval status to chapters
// and branches. This currently stores proposed text directly but is
// structured so we can gradually attach each proposal to a CRDT doc.
async function ensureProposalsTable() {
  try {
    // Create proposal_status enum if needed
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
          CREATE TYPE proposal_status AS ENUM ('undecided', 'approved', 'declined');
        END IF;
      END
      $$;
    `);

    // Create proposal_target enum if needed
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_target') THEN
          CREATE TYPE proposal_target AS ENUM ('story_title', 'chapter', 'paragraph', 'branch');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crdt_proposals (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id    uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        target_type       proposal_target NOT NULL,
        target_chapter_id uuid NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
        -- Note: we intentionally do NOT add a foreign key here because the
        -- existing paragraph_branches.id type may differ between
        -- deployments (uuid vs bigint). We only store the identifier and
        -- validate at the application level.
        target_branch_id  uuid NULL,
        target_path       text NULL,
        proposed_text     text NOT NULL,
        author_user_id    uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
        status            proposal_status NOT NULL DEFAULT 'undecided',
        decided_by        uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
        decided_at        timestamptz NULL,
        created_at        timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Ensure doc_id column exists so proposals can be linked to CRDT docs
    await pool.query(
      "ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS doc_id uuid NULL",
    );
    // Best-effort foreign key; if it already exists, log and continue
    try {
      await pool.query(
        'ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_doc_fk FOREIGN KEY (doc_id) REFERENCES crdt_documents(id) ON DELETE CASCADE',
      );
    } catch (err) {
      if (err && err.code === '42710') {
        // duplicate_object: constraint already exists
        console.log('[init] crdt_proposals_doc_fk already exists, skipping');
      } else {
        console.error('[init] failed to ensure crdt_proposals_doc_fk:', err);
      }
    }

    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_proposals_story_idx ON crdt_proposals(story_title_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS crdt_proposals_status_idx ON crdt_proposals(story_title_id, status)',
    );

    console.log('[init] ensured crdt_proposals table and enums exist');
  } catch (err) {
    console.error('[init] failed to ensure crdt_proposals table:', err);
  }
}

async function ensureCreativeSpacesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS creative_spaces (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     text NOT NULL,
        name        text NOT NULL,
        description text,
        path        text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // In case the table was created earlier with a foreign key to
    // local_users(id), drop that constraint and ensure user_id is text so
    // we can store both local and Supabase user ids without FK violations.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'creative_spaces_user_id_fkey'
            AND table_name = 'creative_spaces'
        ) THEN
          ALTER TABLE creative_spaces DROP CONSTRAINT creative_spaces_user_id_fkey;
        END IF;
      END
      $$;
    `);

    await pool.query(
      'ALTER TABLE creative_spaces ALTER COLUMN user_id TYPE text USING user_id::text',
    );

    await pool.query(
      'CREATE INDEX IF NOT EXISTS creative_spaces_user_idx ON creative_spaces(user_id)',
    );
    console.log('[init] ensured creative_spaces table exists');
  } catch (err) {
    console.error('[init] failed to ensure creative_spaces table:', err);
  }
}

// Fire and forget; if this fails we log but do not crash the server
ensurePgcryptoExtension().catch((err) => {
  console.error('[init] ensurePgcryptoExtension unhandled error:', err);
});
ensureStoryAccessTable().catch((err) => {
  console.error('[init] ensureStoryAccessTable unhandled error:', err);
});
ensureStoryTitlePublishedColumn().catch((err) => {
  console.error('[init] ensureStoryTitlePublishedColumn unhandled error:', err);
});
ensureStoryTitleGenreAndTagsColumns().catch((err) => {
  console.error('[init] ensureStoryTitleGenreAndTagsColumns unhandled error:', err);
});
ensureStoryTitleUpdatedAtColumn().catch((err) => {
  console.error('[init] ensureStoryTitleUpdatedAtColumn unhandled error:', err);
});
ensureAuthorsTable().catch((err) => {
  console.error('[init] ensureAuthorsTable unhandled error:', err);
});
ensureStoryInitiatorsTable().catch((err) => {
  console.error('[init] ensureStoryInitiatorsTable unhandled error:', err);
});
ensureParagraphBranchesTable().catch((err) => {
  console.error('[init] ensureParagraphBranchesTable unhandled error:', err);
});
ensureCrdtDocumentsTables().catch((err) => {
  console.error('[init] ensureCrdtDocumentsTables unhandled error:', err);
});
ensureProposalsTable().catch((err) => {
  console.error('[init] ensureProposalsTable unhandled error:', err);
});
ensureCreativeSpacesTable().catch((err) => {
  console.error('[init] ensureCreativeSpacesTable unhandled error:', err);
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
// Profile endpoints (local Postgres-backed user profiles)
// ---------------------------------------------------------------------------

// Fetch or lazily create a profile row for the given user id. This is used
// by the web Profile page when authenticating against the local backend.
app.get('/profiles/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const existing = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // No profile yet: create a minimal one using the local_users email as
    // username (if available) and sensible defaults.
    let username = 'user';
    try {
      const userRes = await pool.query('SELECT email FROM local_users WHERE id = $1', [userId]);
      if (userRes.rows.length > 0 && userRes.rows[0].email) {
        username = userRes.rows[0].email;
      }
    } catch (lookupErr) {
      console.error('[GET /profiles/:userId] failed to look up local_users row:', lookupErr);
    }

    try {
      const insertRes = await pool.query(
        `INSERT INTO profiles (
           id,
           username,
           created_at,
           updated_at,
           notify_app,
           notify_email,
           notify_phone
         )
         VALUES ($1, $2, now(), now(), true, true, false)
         RETURNING *`,
        [userId, username],
      );
      return res.status(201).json(insertRes.rows[0]);
    } catch (insertErr) {
      // If the username is already taken (e.g. an older Supabase profile
      // row exists for this email), generate a unique fallback username
      // based on the user id and try once more.
      if (insertErr && insertErr.code === '23505') {
        const fallbackUsername = `${username}-${String(userId).slice(0, 8)}`;
        console.warn(
          '[GET /profiles/:userId] username already exists, retrying with fallback username',
          { userId, username, fallbackUsername },
        );
        try {
          const insertRes2 = await pool.query(
            `INSERT INTO profiles (
               id,
               username,
               created_at,
               updated_at,
               notify_app,
               notify_email,
               notify_phone
             )
             VALUES ($1, $2, now(), now(), true, true, false)
             RETURNING *`,
            [userId, fallbackUsername],
          );
          return res.status(201).json(insertRes2.rows[0]);
        } catch (insertErr2) {
          console.error(
            '[GET /profiles/:userId] fallback username insert also failed:',
            insertErr2,
          );
          return res.status(500).json({ error: 'Failed to create default profile' });
        }
      }

      console.error('[GET /profiles/:userId] failed to insert default profile:', insertErr);
      return res.status(500).json({ error: 'Failed to create default profile' });
    }
  } catch (err) {
    console.error('[GET /profiles/:userId] failed:', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Patch a profile row. Accepts any subset of profile fields and updates
// updated_at automatically. The caller is responsible for enforcing that the
// user is editing their own profile (frontend passes authUser.id).
app.patch('/profiles/:userId', async (req, res) => {
  const { userId } = req.params;
  const body = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const allowedFields = [
    'first_name',
    'last_name',
    'nickname',
    'about',
    'bio',
    'profile_image_url',
    'birthday',
    'languages',
    'social_facebook',
    'social_snapchat',
    'social_instagram',
    'social_other',
    'telephone',
    'notify_phone',
    'notify_app',
    'notify_email',
    'interests',
    'username',
  ];

  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = $${idx++}`);
      values.push(body[key]);
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  fields.push('updated_at = now()');
  values.push(userId);

  const sql = `UPDATE profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /profiles/:userId] failed:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
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

// Reorder chapters for a story by updating chapter_index to match the
// provided chapterIds array. This allows the frontend to express an
// explicit chapter ordering (e.g., inserting a new chapter directly
// below the current one).
app.patch('/stories/:storyTitleId/chapters/reorder', async (req, res) => {
  const { storyTitleId } = req.params;
  const { chapterIds } = req.body ?? {};

  if (!storyTitleId || !Array.isArray(chapterIds) || chapterIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'storyTitleId and non-empty chapterIds[] are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let idx = 1;
    for (const chapterId of chapterIds) {
      if (!chapterId) continue;
      await client.query(
        'UPDATE stories SET chapter_index = $1 WHERE chapter_id = $2 AND story_title_id = $3',
        [idx++, chapterId, storyTitleId],
      );
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /stories/:storyTitleId/chapters/reorder] failed:', err);
    res.status(500).json({ error: 'Failed to reorder chapters' });
  } finally {
    client.release();
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

// ---------------------------------------------------------------------------
// Creative spaces (project spaces) CRUD
// ---------------------------------------------------------------------------

// List creative spaces for a user
app.get('/creative-spaces', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM creative_spaces WHERE user_id = $1 ORDER BY created_at ASC',
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /creative-spaces] failed:', err);
    res.status(500).json({ error: 'Failed to fetch creative spaces' });
  }
});

// Ensure at least one creative space exists for a user, creating a
// default "No name creative space" if necessary. This is intended for
// synchronisation flows coming from desktop or other apps.
app.post('/creative-spaces/ensure-default', async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM creative_spaces WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [userId],
    );
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const id = randomUUID();
    const { rows } = await pool.query(
      'INSERT INTO creative_spaces (id, user_id, name) VALUES ($1, $2, $3) RETURNING *',
      [id, userId, 'No name creative space'],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/ensure-default] failed:', err);
    res.status(500).json({ error: 'Failed to ensure default creative space' });
  }
});

// Create a new creative space
app.post('/creative-spaces', async (req, res) => {
  const { userId, name, description, path } = req.body ?? {};

  console.error('[POST /creative-spaces] incoming body:', req.body);

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const finalName = trimmedName || 'No name creative space';

  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      'INSERT INTO creative_spaces (id, user_id, name, description, path) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, userId, finalName, description || null, path || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces] failed:', {
      error: err,
      userId,
      name,
      description,
      path,
    });
    res.status(500).json({ error: 'Failed to create creative space' });
  }
});

// Update (rename / edit) a creative space owned by the user
app.patch('/creative-spaces/:spaceId', async (req, res) => {
  const { spaceId } = req.params;
  const { userId, name, description, path } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const finalName = trimmedName || 'No name creative space';
    fields.push(`name = $${idx++}`);
    values.push(finalName);
  }
  if (description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(description || null);
  }
  if (path !== undefined) {
    fields.push(`path = $${idx++}`);
    values.push(path || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Always bump updated_at
  fields.push(`updated_at = now()`);

  values.push(spaceId, userId);

  const sql = `UPDATE creative_spaces
               SET ${fields.join(', ')}
               WHERE id = $${idx++} AND user_id = $${idx}
               RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /creative-spaces/:spaceId] failed:', err);
    res.status(500).json({ error: 'Failed to update creative space' });
  }
});

// Delete a creative space owned by the user
app.delete('/creative-spaces/:spaceId', async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM creative_spaces WHERE id = $1 AND user_id = $2',
      [spaceId, userId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /creative-spaces/:spaceId] failed:', err);
    res.status(500).json({ error: 'Failed to delete creative space' });
  }
});

// Clone a creative space (shallow clone for now: just duplicate metadata).
// Later, when creative space folders/files are modelled in the DB, this
// endpoint can be extended to deep-clone that structure as well.
app.post('/creative-spaces/:spaceId/clone', async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const existingRes = await pool.query(
      'SELECT * FROM creative_spaces WHERE id = $1 AND user_id = $2',
      [spaceId, userId],
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }
    const src = existingRes.rows[0];

    const cloneName = `${src.name || 'No name creative space'} (copy)`;
    const { rows } = await pool.query(
      'INSERT INTO creative_spaces (user_id, name, description, path) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, cloneName, src.description || null, src.path || null],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/:spaceId/clone] failed:', err);
    res.status(500).json({ error: 'Failed to clone creative space' });
  }
});

// Create a new chapter
app.post('/chapters', async (req, res) => {
  const {
    storyTitleId,
    chapterTitle,
    paragraphs,
    episodeNumber,
    partNumber,
    chapterIndex,
    userId,
  } = req.body ?? {};

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
    const chapterRow = rows[0];

    // Best-effort 1: record the chapter creator as a contributor in
    // story_access so they appear in the Contributors tab even if they
    // have not yet edited existing chapters.
    if (userId) {
      try {
        await pool.query(
          `INSERT INTO story_access (story_title_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (story_title_id, user_id) DO NOTHING`,
          [storyTitleId, userId, 'contributor'],
        );
      } catch (accessErr) {
        console.error('[POST /chapters] failed to insert story_access row for contributor:', accessErr);
        // Do not fail chapter creation if story_access insert fails.
      }

      // Best-effort 2: create an initial chapter_revisions row so this
      // creation is visible as a text contribution and is attributed to
      // the user in chapter_revisions.created_by.
      try {
        const nextRev = await getNextChapterRevisionNumber(chapterRow.chapter_id);
        await pool.query(
          `INSERT INTO chapter_revisions
             (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            chapterRow.chapter_id,
            null,
            chapterTitle,
            null,
            paragraphs,
            userId,
            nextRev,
            'Chapter created',
            'en',
          ],
        );
      } catch (revErr) {
        console.error('[POST /chapters] failed to insert initial chapter_revision:', revErr);
        // Again, do not fail chapter creation if revision insert fails.
      }
    }

    // Bump story_title.updated_at so desktop clients can detect remote changes.
    try {
      await pool.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [storyTitleId]);
    } catch (errTs) {
      console.error('[POST /chapters] failed to bump story_title.updated_at:', errTs);
    }

    res.status(201).json(chapterRow);
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
      'SELECT story_title_id, chapter_title, paragraphs FROM stories WHERE chapter_id = $1',
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

    // Bump story_title.updated_at so desktop clients can detect remote changes.
    try {
      if (existing.story_title_id) {
        await pool.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [existing.story_title_id]);
      }
    } catch (errTs) {
      console.error('[PATCH /chapters/:chapterId] failed to bump story_title.updated_at:', errTs);
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

// List paragraph-level contributions for a story.
// This aggregates chapter_revisions (expanding the paragraphs array)
// across all chapters belonging to the given story_title_id. This works
// for both legacy stories and new ones. Reactions and comments are
// aggregated per (chapter_id, paragraph_index).
app.get('/stories/:storyTitleId/contributions', async (req, res) => {
  const { storyTitleId } = req.params;

  try {
    const { rows } = await pool.query(
      `WITH reactions_agg AS (
         SELECT
           chapter_id,
           paragraph_index,
           COUNT(*) FILTER (WHERE reaction_type = 'like') AS likes,
           COUNT(*) FILTER (WHERE reaction_type = 'dislike') AS dislikes
         FROM reactions
         WHERE story_title_id = $1
         GROUP BY chapter_id, paragraph_index
       ),
       comments_agg AS (
         SELECT
           chapter_id,
           paragraph_index,
           COUNT(*) AS comments
         FROM comments
         WHERE story_title_id = $1
         GROUP BY chapter_id, paragraph_index
       ),
       paragraph_contribs AS (
         -- Contributions recorded via chapter_revisions (new revision system)
         SELECT
           cr.id::text AS id,
           s.chapter_id,
           st.title AS story_title,
           s.chapter_title,
           (t.idx - 1) AS paragraph_index,
           t.paragraph_text AS new_paragraph,
           cr.created_at,
           cr.revision_number,
           u.email AS user_email
         FROM chapter_revisions cr
         JOIN stories s ON s.chapter_id = cr.chapter_id
         JOIN story_title st ON st.story_title_id = s.story_title_id
         LEFT JOIN local_users u ON u.id = cr.created_by
         CROSS JOIN LATERAL unnest(cr.new_paragraphs) WITH ORDINALITY AS t(paragraph_text, idx)
         WHERE s.story_title_id = $1

         UNION ALL

         -- Legacy contributions where chapters have a contributor_id but
         -- no explicit chapter_revisions rows. Treat each paragraph of
         -- those chapters as a contribution.
         SELECT
           ('chapter-' || s.chapter_id::text || '-' || t.idx)::text AS id,
           s.chapter_id,
           st.title AS story_title,
           s.chapter_title,
           (t.idx - 1) AS paragraph_index,
           t.paragraph_text AS new_paragraph,
           s.created_at AS created_at,
           0::integer AS revision_number,
           u.email AS user_email
         FROM stories s
         JOIN story_title st ON st.story_title_id = s.story_title_id
         LEFT JOIN local_users u ON u.id = s.contributor_id
         CROSS JOIN LATERAL unnest(s.paragraphs) WITH ORDINALITY AS t(paragraph_text, idx)
         WHERE s.story_title_id = $1
           AND s.contributor_id IS NOT NULL
       )
       SELECT
         pc.id,
         pc.story_title,
         pc.chapter_title,
         pc.paragraph_index,
         pc.new_paragraph,
         pc.created_at,
         pc.revision_number,
         pc.user_email,
         cardinality(regexp_split_to_array(coalesce(pc.new_paragraph, ''), E'\\s+')) AS words,
         COALESCE(ra.likes, 0) AS likes,
         COALESCE(ra.dislikes, 0) AS dislikes,
         COALESCE(ca.comments, 0) AS comments
       FROM paragraph_contribs pc
       LEFT JOIN reactions_agg ra
         ON ra.chapter_id = pc.chapter_id AND ra.paragraph_index = pc.paragraph_index
       LEFT JOIN comments_agg ca
         ON ca.chapter_id = pc.chapter_id AND ca.paragraph_index = pc.paragraph_index
       ORDER BY pc.created_at DESC, pc.revision_number DESC, pc.paragraph_index ASC`,
      [storyTitleId],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/contributions] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story contributions' });
  }
});

// Delete a chapter
app.delete('/chapters/:chapterId', async (req, res) => {
  const { chapterId } = req.params;

  try {
    // Look up story_title_id first so we can bump updated_at.
    let storyTitleId = null;
    try {
      const lookup = await pool.query('SELECT story_title_id FROM stories WHERE chapter_id = $1', [chapterId]);
      if (lookup.rows.length > 0) {
        storyTitleId = lookup.rows[0].story_title_id;
      }
    } catch (errLookup) {
      console.error('[DELETE /chapters/:chapterId] failed to look up story_title_id:', errLookup);
    }

    const { rowCount } = await pool.query('DELETE FROM stories WHERE chapter_id = $1', [chapterId]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (storyTitleId) {
      try {
        await pool.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [storyTitleId]);
      } catch (errTs) {
        console.error('[DELETE /chapters/:chapterId] failed to bump story_title.updated_at:', errTs);
      }
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

// Simple CRDT document APIs. These are intentionally conservative:
// they store opaque binary patches (e.g. Automerge changes) and return
// them to clients, but do not attempt to reconstruct or interpret docs
// on the server yet.

// Get CRDT document metadata and all changes by docKey
app.get('/crdt/docs/:docKey', async (req, res) => {
  const { docKey } = req.params;

  try {
    const { rows: docs } = await pool.query(
      'SELECT * FROM crdt_documents WHERE doc_key = $1',
      [docKey],
    );
    if (docs.length === 0) {
      return res.status(404).json({ error: 'Doc not found' });
    }
    const doc = docs[0];

    const { rows: changes } = await pool.query(
      'SELECT id, actor_id, seq, ts, encode(patch, \'base64\') AS patch, is_snapshot FROM crdt_changes WHERE doc_id = $1 ORDER BY id ASC',
      [doc.id],
    );

    res.json({ doc, changes });
  } catch (err) {
    console.error('[GET /crdt/docs/:docKey] failed:', err);
    res.status(500).json({ error: 'Failed to load CRDT document' });
  }
});

// Append CRDT changes to a document, creating it if needed.
// Body: { actorId, changes: string[base64], docType?, storyTitleId?, chapterId?, branchId?, isCanonical?, ownerUserId? }
app.post('/crdt/docs/:docKey/changes', async (req, res) => {
  const { docKey } = req.params;
  const {
    actorId,
    changes,
    docType,
    storyTitleId,
    chapterId,
    branchId,
    isCanonical,
    ownerUserId,
  } = req.body ?? {};

  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'changes[] (base64) is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let docRes = await client.query(
      'SELECT * FROM crdt_documents WHERE doc_key = $1 FOR UPDATE',
      [docKey],
    );
    let doc = docRes.rows[0];

    if (!doc) {
      if (!docType || !storyTitleId) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ error: 'docType and storyTitleId are required when creating a new CRDT doc' });
      }

      const insertRes = await client.query(
        `INSERT INTO crdt_documents
           (doc_key, story_title_id, chapter_id, branch_id, doc_type, is_canonical, owner_user_id, created_by)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), $7, $8)
         RETURNING *`,
        [
          docKey,
          storyTitleId,
          chapterId || null,
          branchId || null,
          docType,
          typeof isCanonical === 'boolean' ? isCanonical : true,
          ownerUserId || null,
          actorId || null,
        ],
      );
      doc = insertRes.rows[0];
    }

    const seqBaseRes = await client.query(
      'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM crdt_changes WHERE doc_id = $1',
      [doc.id],
    );
    let seq = Number(seqBaseRes.rows[0]?.max_seq ?? 0);

    for (const c of changes) {
      seq += 1;
      if (typeof c !== 'string') continue;
      const buf = Buffer.from(c, 'base64');
      await client.query(
        `INSERT INTO crdt_changes (doc_id, actor_id, seq, patch, is_snapshot)
         VALUES ($1, $2, $3, $4, $5)`,
        [doc.id, actorId || null, seq, buf, false],
      );
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /crdt/docs/:docKey/changes] failed:', err);
    res.status(500).json({ error: 'Failed to append CRDT changes' });
  } finally {
    client.release();
  }
});

// Simple proposal APIs (initial implementation)
//
// NOTE: This is a lightweight implementation that stores proposed text
// and approval status. It does not yet integrate full CRDT docs, but
// follows the same approval semantics (approved / declined / undecided).

// Create a new proposal for a chapter paragraph or branch
app.post('/stories/:storyTitleId/proposals', async (req, res) => {
  const { storyTitleId } = req.params;
  const {
    targetType,
    targetChapterId,
    targetBranchId,
    targetPath,
    proposedText,
    authorUserId,
  } = req.body ?? {};

  if (
    !storyTitleId ||
    !targetType ||
    proposedText === undefined ||
    proposedText === null ||
    !authorUserId
  ) {
    return res
      .status(400)
      .json({ error: 'storyTitleId, targetType, proposedText, and authorUserId are required' });
  }

  if (targetType === 'paragraph' && !targetChapterId) {
    return res.status(400).json({ error: 'targetChapterId is required for paragraph proposals' });
  }

  if (targetType === 'branch' && !targetBranchId) {
    return res.status(400).json({ error: 'targetBranchId is required for branch proposals' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO crdt_proposals
         (story_title_id, target_type, target_chapter_id, target_branch_id, target_path, proposed_text, author_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        storyTitleId,
        targetType,
        targetChapterId || null,
        targetBranchId || null,
        targetPath || null,
        proposedText,
        authorUserId,
      ],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /stories/:storyTitleId/proposals] failed:', err);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// List proposals for a story, optionally filtered by status
app.get('/stories/:storyTitleId/proposals', async (req, res) => {
  const { storyTitleId } = req.params;
  const { status } = req.query;

  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId is required' });
  }

  try {
    let rows;
    if (status) {
      const { rows: r } = await pool.query(
        `SELECT p.*, u.email AS author_email
         FROM crdt_proposals p
         LEFT JOIN local_users u ON u.id = p.author_user_id
         WHERE p.story_title_id = $1 AND p.status = $2
         ORDER BY p.created_at DESC`,
        [storyTitleId, status],
      );
      rows = r;
    } else {
      const { rows: r } = await pool.query(
        `SELECT p.*, u.email AS author_email
         FROM crdt_proposals p
         LEFT JOIN local_users u ON u.id = p.author_user_id
         WHERE p.story_title_id = $1
         ORDER BY p.created_at DESC`,
        [storyTitleId],
      );
      rows = r;
    }

    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/proposals] failed:', err);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Approve a proposal and (for now) merge by replacing target text
app.post('/proposals/:proposalId/approve', async (req, res) => {
  const { proposalId } = req.params;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: propRows } = await client.query(
        'SELECT * FROM crdt_proposals WHERE id = $1 FOR UPDATE',
        [proposalId],
      );
      if (propRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Proposal not found' });
      }
      const proposal = propRows[0];

      if (proposal.status === 'approved') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Proposal already approved' });
      }

      if (proposal.target_type === 'paragraph') {
        const chapterId = proposal.target_chapter_id;
        const idx = proposal.target_path ? parseInt(proposal.target_path, 10) : null;
        if (!chapterId || Number.isNaN(idx)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid paragraph proposal target' });
        }

        const existingRes = await client.query(
          'SELECT chapter_title, paragraphs FROM stories WHERE chapter_id = $1',
          [chapterId],
        );
        if (existingRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Chapter not found for proposal' });
        }
        const existing = existingRes.rows[0];
        const paragraphs = Array.isArray(existing.paragraphs) ? [...existing.paragraphs] : [];

        // Interpret proposed_text the same way the web editor does when
        // saving paragraphs directly: split on blank lines so a single
        // edited paragraph can expand into multiple paragraphs.
        const lines = String(proposal.proposed_text || '')
          .split(/\n+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        if (lines.length === 0) {
          // Empty proposal = delete this paragraph
          paragraphs.splice(idx, 1);
        } else {
          paragraphs.splice(idx, 1, ...lines);
        }

        await client.query(
          'UPDATE stories SET paragraphs = $1 WHERE chapter_id = $2',
          [paragraphs, chapterId],
        );
      } else if (proposal.target_type === 'branch') {
        const branchId = proposal.target_branch_id;
        if (!branchId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid branch proposal target' });
        }

        await client.query(
          'UPDATE paragraph_branches SET branch_text = $1 WHERE id = $2',
          [proposal.proposed_text, branchId],
        );
      }

      const now = new Date();
      await client.query(
        `UPDATE crdt_proposals
         SET status = 'approved', decided_at = $1
         WHERE id = $2`,
        [now.toISOString(), proposalId],
      );

      await client.query('COMMIT');
      res.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /proposals/:proposalId/approve] failed:', err);
      res.status(500).json({ error: 'Failed to approve proposal' });
    } finally {
      client.release();
    }
  } catch (errOuter) {
    console.error('[POST /proposals/:proposalId/approve] outer failed:', errOuter);
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

// Decline a proposal (no merge)
app.post('/proposals/:proposalId/decline', async (req, res) => {
  const { proposalId } = req.params;

  try {
    const now = new Date();
    const { rowCount } = await pool.query(
      `UPDATE crdt_proposals
       SET status = 'declined', decided_at = $1
       WHERE id = $2`,
      [now.toISOString(), proposalId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[POST /proposals/:proposalId/decline] failed:', err);
    res.status(500).json({ error: 'Failed to decline proposal' });
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
       ),
       access_contributors AS (
         SELECT sa.user_id,
                -- Map story_access roles to contributor labels; owner will
                -- be filtered out later because creator already covers it.
                CASE
                  WHEN sa.role = 'owner' THEN 'creator'
                  ELSE 'contributor'
                END AS role
         FROM story_access sa
         WHERE sa.story_title_id = $1
       ),
       comment_contributors AS (
         SELECT DISTINCT c.user_id, 'contributor'::text AS role
         FROM comments c
         WHERE c.story_title_id = $1 AND c.user_id IS NOT NULL
       ),
       reaction_contributors AS (
         SELECT DISTINCT r.user_id, 'contributor'::text AS role
         FROM reactions r
         WHERE r.story_title_id = $1 AND r.user_id IS NOT NULL
       )
       SELECT DISTINCT
         COALESCE(u.id, c.user_id)      AS id,
         COALESCE(u.email, c.user_id::text) AS email,
         c.role
       FROM (
         SELECT * FROM creator
         UNION ALL
         SELECT * FROM chapter_contributors
         UNION ALL
         SELECT * FROM story_contributors
         UNION ALL
         SELECT * FROM access_contributors
         UNION ALL
         SELECT * FROM comment_contributors
         UNION ALL
         SELECT * FROM reaction_contributors
       ) c
       LEFT JOIN local_users u ON u.id = c.user_id`,
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
  const { visibility, published, genre, tags } = req.body ?? {};

  if (
    visibility === undefined &&
    published === undefined &&
    genre === undefined &&
    tags === undefined
  ) {
    return res.status(400).json({
      error: 'At least one of visibility, published, genre, or tags must be provided',
    });
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
  if (genre !== undefined) {
    fields.push(`genre = $${idx++}`);
    values.push(genre || null);
  }
  if (tags !== undefined) {
    fields.push(`tags = $${idx++}`);
    values.push(Array.isArray(tags) ? tags : null);
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

// Desktop sync endpoint: sync story metadata and full story content.
// Body: {
//   userId: uuid,
//   title: string,
//   metadata?: { author_id?: uuid, initiator_id?: uuid, genre?: string|null, tags?: string[]|null },
//   chapters: [{ chapterTitle: string, paragraphs: string[] }]
// }
app.post('/story-titles/:storyTitleId/sync-desktop', async (req, res) => {
  const { storyTitleId } = req.params;
  const { userId, title, metadata, chapters } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId is required' });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ error: 'chapters[] is required' });
  }

  const client = await pool.connect();

  const getNextStoryTitleRevisionNumberTx = async (storyId) => {
    const { rows } = await client.query(
      'SELECT revision_number FROM story_title_revisions WHERE story_title_id = $1 ORDER BY revision_number DESC LIMIT 1',
      [storyId],
    );
    if (rows.length === 0) return 1;
    return Number(rows[0].revision_number) + 1;
  };

  const getNextChapterRevisionNumberTx = async (chapterId) => {
    const { rows } = await client.query(
      'SELECT revision_number FROM chapter_revisions WHERE chapter_id = $1 ORDER BY revision_number DESC LIMIT 1',
      [chapterId],
    );
    if (rows.length === 0) return 1;
    return Number(rows[0].revision_number) + 1;
  };

  const getNextParagraphRevisionNumberTx = async (chapterId, paragraphIndex) => {
    const { rows } = await client.query(
      'SELECT revision_number FROM paragraph_revisions WHERE chapter_id = $1 AND paragraph_index = $2 ORDER BY revision_number DESC LIMIT 1',
      [chapterId, paragraphIndex],
    );
    if (rows.length === 0) return 1;
    return Number(rows[0].revision_number) + 1;
  };

  try {
    await client.query('BEGIN');

    const storyRes = await client.query(
      'SELECT story_title_id, title, creator_id, genre, tags FROM story_title WHERE story_title_id = $1 FOR UPDATE',
      [storyTitleId],
    );
    if (storyRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Story not found' });
    }

    const storyRow = storyRes.rows[0];
    const creatorId = storyRow.creator_id;

    // 1) Sync title (with revision)
    const newTitle = title.trim();
    if (newTitle !== storyRow.title) {
      await client.query(
        'UPDATE story_title SET title = $1 WHERE story_title_id = $2',
        [newTitle, storyTitleId],
      );

      const nextRevision = await getNextStoryTitleRevisionNumberTx(storyTitleId);
      await client.query(
        'INSERT INTO story_title_revisions (story_title_id, prev_title, new_title, created_by, revision_number, revision_reason, language) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [storyTitleId, storyRow.title, newTitle, userId, nextRevision, 'Desktop sync', 'en'],
      );
    }

    // 2) Sync story_title settings/metadata stored on story_title
    const genre = metadata?.genre;
    const tags = metadata?.tags;
    if (genre !== undefined || tags !== undefined) {
      const fields = [];
      const values = [];
      let idx = 1;
      if (genre !== undefined) {
        fields.push(`genre = $${idx++}`);
        values.push(genre || null);
      }
      if (tags !== undefined) {
        fields.push(`tags = $${idx++}`);
        values.push(Array.isArray(tags) ? tags : null);
      }
      values.push(storyTitleId);
      await client.query(
        `UPDATE story_title SET ${fields.join(', ')} WHERE story_title_id = $${idx}`,
        values,
      );
    }

    // 3) Sync author/initiator mapping tables (creator_id as key)
    const authorId = metadata?.author_id || creatorId;
    const initiatorId = metadata?.initiator_id || creatorId;

    if (creatorId) {
      await client.query(
        `INSERT INTO authors (creator_id, author_id, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (creator_id)
         DO UPDATE SET author_id = EXCLUDED.author_id, updated_at = now()`,
        [creatorId, authorId],
      );

      await client.query(
        `INSERT INTO story_initiators (creator_id, initiator_id, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (creator_id)
         DO UPDATE SET initiator_id = EXCLUDED.initiator_id, updated_at = now()`,
        [creatorId, initiatorId],
      );
    }

    // 4) Sync chapters + paragraphs by position
    const existingChaptersRes = await client.query(
      'SELECT chapter_id, chapter_index, chapter_title, paragraphs FROM stories WHERE story_title_id = $1 ORDER BY episode_number NULLS FIRST, part_number NULLS FIRST, chapter_index ASC, created_at ASC',
      [storyTitleId],
    );
    const existingChapters = existingChaptersRes.rows;

    const incoming = chapters.map((c) => ({
      chapterTitle: typeof c?.chapterTitle === 'string' && c.chapterTitle.trim() ? c.chapterTitle.trim() : 'Chapter',
      paragraphs: Array.isArray(c?.paragraphs) ? c.paragraphs : [],
    }));

    const minLen = Math.min(existingChapters.length, incoming.length);

    for (let i = 0; i < minLen; i++) {
      const ex = existingChapters[i];
      const inc = incoming[i];

      const desiredIndex = i + 1;
      const indexChanged = Number(ex.chapter_index) !== desiredIndex;

      const titleChanged = ex.chapter_title !== inc.chapterTitle;
      const paragraphsChanged = JSON.stringify(ex.paragraphs ?? null) !== JSON.stringify(inc.paragraphs ?? null);

      // If nothing changed (including ordering), do nothing.
      if (!indexChanged && !titleChanged && !paragraphsChanged) {
        continue;
      }

      // If only ordering changed, update chapter_index without creating a revision.
      if (indexChanged && !titleChanged && !paragraphsChanged) {
        await client.query(
          'UPDATE stories SET chapter_index = $1 WHERE chapter_id = $2',
          [desiredIndex, ex.chapter_id],
        );
        continue;
      }

      // Content changed: update chapter row.
      const updatedRes = await client.query(
        'UPDATE stories SET chapter_index = $1, chapter_title = $2, paragraphs = $3 WHERE chapter_id = $4 RETURNING chapter_title, paragraphs',
        [desiredIndex, inc.chapterTitle, inc.paragraphs, ex.chapter_id],
      );
      const updated = updatedRes.rows[0];

      // Record chapter revision (only when content changes).
      const nextRev = await getNextChapterRevisionNumberTx(ex.chapter_id);
      await client.query(
        `INSERT INTO chapter_revisions
           (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ex.chapter_id,
          ex.chapter_title,
          updated.chapter_title,
          ex.paragraphs,
          updated.paragraphs,
          userId,
          nextRev,
          'Desktop sync',
          'en',
        ],
      );

      // Best-effort paragraph revisions for changed paragraphs.
      if (Array.isArray(ex.paragraphs) && Array.isArray(updated.paragraphs)) {
        const maxLen = Math.max(ex.paragraphs.length, updated.paragraphs.length);
        for (let p = 0; p < maxLen; p++) {
          const prevP = ex.paragraphs[p] ?? null;
          const newP = updated.paragraphs[p] ?? null;
          if (prevP === newP || newP == null) continue;
          const nextParRev = await getNextParagraphRevisionNumberTx(ex.chapter_id, p);
          await client.query(
            `INSERT INTO paragraph_revisions
               (chapter_id, paragraph_index, prev_paragraph, new_paragraph, created_by, revision_number, revision_reason, language)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [ex.chapter_id, p, prevP, newP, userId, nextParRev, 'Desktop sync', 'en'],
          );
        }
      }
    }

    // Create new chapters if needed
    for (let i = minLen; i < incoming.length; i++) {
      const inc = incoming[i];
      const insertRes = await client.query(
        'INSERT INTO stories (story_title_id, episode_number, part_number, chapter_index, chapter_title, paragraphs) VALUES ($1, $2, $3, $4, $5, $6) RETURNING chapter_id',
        [storyTitleId, null, null, i + 1, inc.chapterTitle, inc.paragraphs],
      );
      const chapterId = insertRes.rows[0].chapter_id;

      // Initial revision for new chapter
      const nextRev = await getNextChapterRevisionNumberTx(chapterId);
      await client.query(
        `INSERT INTO chapter_revisions
           (chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, revision_number, revision_reason, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [chapterId, null, inc.chapterTitle, null, inc.paragraphs, userId, nextRev, 'Desktop sync (created)', 'en'],
      );

      // Ensure story_access contributor row exists (best-effort)
      try {
        await client.query(
          `INSERT INTO story_access (story_title_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (story_title_id, user_id) DO NOTHING`,
          [storyTitleId, userId, 'contributor'],
        );
      } catch (errAccess) {
        console.error('[POST /story-titles/:storyTitleId/sync-desktop] failed to insert story_access row:', errAccess);
      }
    }

    // Delete extra chapters if local has fewer
    for (let i = incoming.length; i < existingChapters.length; i++) {
      const ex = existingChapters[i];
      await client.query('DELETE FROM stories WHERE chapter_id = $1', [ex.chapter_id]);
    }

    // Bump story_title.updated_at for desktop sync.
    try {
      await client.query('UPDATE story_title SET updated_at = now() WHERE story_title_id = $1', [storyTitleId]);
    } catch (errTs) {
      console.error('[POST /story-titles/:storyTitleId/sync-desktop] failed to bump story_title.updated_at:', errTs);
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      storyTitleId,
      syncedChapters: incoming.length,
      deletedChapters: Math.max(0, existingChapters.length - incoming.length),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /story-titles/:storyTitleId/sync-desktop] failed:', err);
    return res.status(500).json({ error: 'Failed to sync story from desktop', details: err?.message || String(err) });
  } finally {
    client.release();
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
