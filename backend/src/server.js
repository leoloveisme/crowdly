import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { pool } from './db.js';
import { loginWithEmailPassword, registerWithEmailPassword, changePassword, deleteAccountWithPassword } from './auth.js';

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

// Additional profile metadata columns
async function ensureProfilesRealNicknameColumn() {
  try {
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS real_nickname text',
    );
    console.log('[init] ensured profiles.real_nickname column exists');
  } catch (err) {
    console.error('[init] failed to ensure profiles.real_nickname column:', err);
  }
}

async function ensureProfilesVisibilityColumns() {
  try {
    // Legacy boolean flags used by older frontends; keep them for backward
    // compatibility but prefer the newer per-container visibility fields
    // below when available.
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_stories boolean DEFAULT true',
    );
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_screenplays boolean DEFAULT true',
    );
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_favorites boolean DEFAULT true',
    );
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_living boolean DEFAULT true',
    );
    await pool.query(
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_lived boolean DEFAULT true',
    );

    // New fine-grained per-container visibility controls. These allow a
    // profile owner to mark each experience container as public, private,
    // friends-only, or selected-users-only.
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorites_visibility text DEFAULT 'public'",
    );
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS living_visibility text DEFAULT 'public'",
    );
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lived_visibility text DEFAULT 'public'",
    );

    // Selected-users-only audiences for each container. Stored as arrays of
    // local user ids; gating is enforced in the web layer for now.
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorites_selected_user_ids uuid[] DEFAULT '{}'::uuid[]",
    );
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS living_selected_user_ids uuid[] DEFAULT '{}'::uuid[]",
    );
    await pool.query(
      "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lived_selected_user_ids uuid[] DEFAULT '{}'::uuid[]",
    );

    console.log('[init] ensured profiles visibility columns exist');
  } catch (err) {
    console.error('[init] failed to ensure profiles visibility columns:', err);
  }
}

// Dedicated locales table to keep a single authoritative list of supported
// interface languages across the web platform and the desktop editor.
async function ensureLocalesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locales (
        code         text PRIMARY KEY,
        english_name text NOT NULL,
        native_name  text,
        direction    text NOT NULL DEFAULT 'ltr',
        enabled      boolean NOT NULL DEFAULT true,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `);

    const seedLocales = [
      // Core languages used by both platform and desktop app
      ['en', 'English', 'English', 'ltr'],
      ['ru', 'Russian', 'Русский', 'ltr'],
      ['pt', 'Portuguese', 'Português', 'ltr'],
      ['kr', 'Korean', '한국어', 'ltr'],
      ['ar', 'Arabic', 'العربية', 'rtl'],
      ['zh-Hans', 'Chinese (Simplified)', '简体中文', 'ltr'],
      ['zh-Hant', 'Chinese (Traditional)', '繁體中文', 'ltr'],
      ['ja', 'Japanese', '日本語', 'ltr'],
      // Additional languages referenced in branching / UI components
      ['fr', 'French', 'Français', 'ltr'],
      ['es', 'Spanish', 'Español', 'ltr'],
      ['de', 'German', 'Deutsch', 'ltr'],
      ['zh', 'Chinese (unspecified script)', '中文', 'ltr'],
      ['hi', 'Hindi', 'हिन्दी', 'ltr'],
    ];

    for (const [code, englishName, nativeName, direction] of seedLocales) {
      await pool.query(
        `INSERT INTO locales (code, english_name, native_name, direction)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE
         SET english_name = EXCLUDED.english_name,
             native_name  = EXCLUDED.native_name,
             direction    = EXCLUDED.direction,
             updated_at   = now()`,
        [code, englishName, nativeName, direction],
      );
    }

    console.log('[init] ensured locales table and seed data exist');
  } catch (err) {
    console.error('[init] failed to ensure locales table:', err);
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

    // Add the foreign key only if it does not already exist to avoid noisy
    // "constraint already exists" errors in the Postgres logs.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'crdt_proposals_doc_fk'
            AND table_name = 'crdt_proposals'
        ) THEN
          ALTER TABLE crdt_proposals
            ADD CONSTRAINT crdt_proposals_doc_fk
            FOREIGN KEY (doc_id) REFERENCES crdt_documents(id) ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

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
        -- Visibility/publishing and sync metadata for web Spaces
        visibility  text NOT NULL DEFAULT 'private',
        published   boolean NOT NULL DEFAULT false,
        default_item_visibility text NULL,
        last_synced_at timestamptz NULL,
        sync_state  text NULL,
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

    // Ensure new columns exist on older databases without failing if they
    // are already present.
    await pool.query(
      "ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'",
    );
    await pool.query(
      'ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false',
    );
    await pool.query(
      'ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS default_item_visibility text',
    );
    await pool.query(
      'ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS last_synced_at timestamptz',
    );
    await pool.query(
      'ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS sync_state text',
    );

    await pool.query(
      'CREATE INDEX IF NOT EXISTS creative_spaces_user_idx ON creative_spaces(user_id)',
    );
    console.log('[init] ensured creative_spaces table exists');
  } catch (err) {
    console.error('[init] failed to ensure creative_spaces table:', err);
  }
}

// Items (folders/files) inside creative spaces
async function ensureCreativeSpaceItemsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS creative_space_items (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        relative_path text NOT NULL,
        name          text NOT NULL,
        kind          text NOT NULL,
        mime_type     text,
        size_bytes    bigint,
        hash          text,
        visibility    text,
        published     boolean,
        deleted       boolean NOT NULL DEFAULT false,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        updated_by    text
      )
    `);

    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS creative_space_items_space_path_idx ON creative_space_items(space_id, relative_path)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS creative_space_items_space_idx ON creative_space_items(space_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS creative_space_items_space_updated_idx ON creative_space_items(space_id, updated_at)',
    );

    console.log('[init] ensured creative_space_items table exists');
  } catch (err) {
    console.error('[init] failed to ensure creative_space_items table:', err);
  }
}

// Ensure story/screenplay Space association and attachment tables exist.
async function ensureStoryCreativeSpaceColumnsAndAttachments() {
  try {
    // Add creative_space_id directly on story_title and screenplay_title so
    // each story/screenplay can have a primary owning Space.
    await pool.query(
      'ALTER TABLE story_title ADD COLUMN IF NOT EXISTS creative_space_id uuid NULL REFERENCES creative_spaces(id) ON DELETE SET NULL',
    );
    await pool.query(
      'ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS creative_space_id uuid NULL REFERENCES creative_spaces(id) ON DELETE SET NULL',
    );

    await pool.query(
      'CREATE INDEX IF NOT EXISTS story_title_space_idx ON story_title(creative_space_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS screenplay_title_space_idx ON screenplay_title(creative_space_id)',
    );

    // Attachments table linking stories to specific files inside Spaces.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_attachments (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id  uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        space_id        uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        item_id         uuid NOT NULL REFERENCES creative_space_items(id) ON DELETE CASCADE,
        kind            text NOT NULL DEFAULT 'other',
        role            text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS story_attachments_story_item_idx ON story_attachments(story_title_id, item_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS story_attachments_space_idx ON story_attachments(space_id)',
    );

    console.log('[init] ensured story creative_space columns and story_attachments table exist');
  } catch (err) {
    console.error('[init] failed to ensure story creative_space/attachments structures:', err);
  }
}

// Join table for associating stories with multiple Spaces (primary + copies).
async function ensureStorySpacesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_spaces (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        space_id       uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
        role           text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS story_spaces_story_space_idx ON story_spaces(story_title_id, space_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS story_spaces_space_idx ON story_spaces(space_id)',
    );

    console.log('[init] ensured story_spaces table exists');
  } catch (err) {
    console.error('[init] failed to ensure story_spaces table:', err);
  }
}

// Record per-paragraph and proposal-based contributions in a dedicated table
// so we can easily query contributions per story and per user.
async function ensureContributionsTable() {
  try {
    // Ensure contribution_status enum exists (Supabase migration already creates
    // it, but this is a safe guard for local dev).
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_status') THEN
          CREATE TYPE contribution_status AS ENUM ('approved', 'rejected', 'undecided');
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contributions (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id   uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        chapter_id       uuid NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
        branch_id        uuid NULL,
        paragraph_index  integer NULL,
        target_type      text NOT NULL,
        source           text NOT NULL,
        source_id        text NULL,
        author_user_id   uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
        status           contribution_status NOT NULL,
        words            integer NOT NULL DEFAULT 0,
        new_paragraph    text,
        created_at       timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Ensure new_paragraph column exists even if table was created earlier
    await pool.query(
      'ALTER TABLE contributions ADD COLUMN IF NOT EXISTS new_paragraph text',
    );

    await pool.query(
      'CREATE INDEX IF NOT EXISTS contributions_story_idx ON contributions(story_title_id, status, created_at DESC)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS contributions_user_idx ON contributions(author_user_id, status, created_at DESC)',
    );

    console.log('[init] ensured contributions table exists');
  } catch (err) {
    console.error('[init] failed to ensure contributions table:', err);
  }
}

// Track per-user experience state (favorites / living / lived) for both
// stories and screenplays without disturbing existing story tables.
async function ensureUserStoryStatusTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_story_status (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL,
        content_type  text NOT NULL,
        story_title_id uuid NULL,
        screenplay_id  uuid NULL,
        is_favorite   boolean NOT NULL DEFAULT false,
        is_living     boolean NOT NULL DEFAULT false,
        is_lived      boolean NOT NULL DEFAULT false,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Constrain content_type to the two supported kinds. Use a DO block to
    // avoid noisy "constraint already exists" errors in Postgres logs.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'user_story_status_type_check'
            AND table_name = 'user_story_status'
        ) THEN
          ALTER TABLE user_story_status
            ADD CONSTRAINT user_story_status_type_check
            CHECK (content_type IN ('story','screenplay'));
        END IF;
      END
      $$;
    `);

    // Ensure we don't create duplicate rows per user/content.
    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS user_story_status_unique ON user_story_status(user_id, content_type, story_title_id, screenplay_id)',
    );

    // Simple index for querying by user and flags.
    await pool.query(
      'CREATE INDEX IF NOT EXISTS user_story_status_user_idx ON user_story_status(user_id, content_type)',
    );

    console.log('[init] ensured user_story_status table exists');
  } catch (err) {
    console.error('[init] failed to ensure user_story_status table:', err);
  }
}

// Extend comments table to support screenplay-level comments as well as
// story-level comments. This keeps existing story functionality intact while
// allowing new callers to associate comments with a screenplay_id and an
// optional per-scene association.
async function ensureCommentsScreenplayColumn() {
  try {
    await pool.query(
      'ALTER TABLE comments ADD COLUMN IF NOT EXISTS screenplay_id uuid',
    );
    await pool.query(
      'ALTER TABLE comments ADD COLUMN IF NOT EXISTS screenplay_scene_id uuid',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS comments_screenplay_idx ON comments(screenplay_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS comments_screenplay_scene_idx ON comments(screenplay_scene_id)',
    );

    // Best-effort: add a foreign key from comments.screenplay_scene_id to
    // screenplay_scene.scene_id, if it is not already present.
    await pool
      .query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_name = 'comments_screenplay_scene_id_fkey'
              AND table_name = 'comments'
          ) THEN
            ALTER TABLE comments
              ADD CONSTRAINT comments_screenplay_scene_id_fkey
              FOREIGN KEY (screenplay_scene_id)
              REFERENCES screenplay_scene(scene_id)
              ON DELETE CASCADE;
          END IF;
        END
        $$;
      `)
      .catch((err) => {
        // If the constraint already exists or the table is missing, log and
        // continue without failing startup.
        console.error('[init] ensureCommentsScreenplayColumn FK setup issue:', err);
      });

    console.log('[init] ensured comments screenplay columns exist');
  } catch (err) {
    console.error('[init] failed to ensure comments screenplay columns:', err);
  }
}

// Extend reactions table to support screenplay-level and scene-level reactions
// in addition to story/paragraph reactions.
async function ensureReactionsScreenplayColumns() {
  try {
    await pool.query(
      'ALTER TABLE reactions ADD COLUMN IF NOT EXISTS screenplay_id uuid',
    );
    await pool.query(
      'ALTER TABLE reactions ADD COLUMN IF NOT EXISTS screenplay_scene_id uuid',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS reactions_screenplay_idx ON reactions(screenplay_id)',
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS reactions_screenplay_scene_idx ON reactions(screenplay_scene_id)',
    );
    console.log('[init] ensured reactions screenplay columns exist');
  } catch (err) {
    console.error('[init] failed to ensure reactions screenplay columns:', err);
  }
}

// Screenplay tables: title, scenes, blocks, and linking table between stories
// and screenplays. These mirror the story tables but are kept separate to
// avoid breaking existing story functionality.
async function ensureScreenplayTables() {
  try {
    // Main screenplay title/metadata table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenplay_title (
        screenplay_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title         text NOT NULL,
        -- For now, keep creator_id as a loose UUID like story_title.creator_id
        -- so it can store Supabase user IDs or local user IDs without a
        -- strict foreign key. This mirrors story_title and avoids FK
        -- violations when creating screenplays from the web app.
        creator_id    uuid NULL,
        visibility    text NOT NULL DEFAULT 'public',
        published     boolean NOT NULL DEFAULT true,
        genre         text NULL,
        tags          text[] NULL,
        format_type   text NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    // If an earlier version created a FK to local_users, drop it so that
    // creator_id matches the semantics of story_title.creator_id.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'screenplay_title_creator_id_fkey'
            AND table_name = 'screenplay_title'
        ) THEN
          ALTER TABLE screenplay_title DROP CONSTRAINT screenplay_title_creator_id_fkey;
        END IF;
      END
      $$;
    `);

    // Scenes within a screenplay.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenplay_scene (
        scene_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
        scene_index   integer NOT NULL,
        slugline      text NOT NULL,
        location      text NULL,
        time_of_day   text NULL,
        is_interior   boolean NULL,
        synopsis      text NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS screenplay_scene_screenplay_idx ON screenplay_scene(screenplay_id, scene_index)',
    );

    // Atomic blocks (elements) inside scenes.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenplay_block (
        block_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
        scene_id      uuid NULL REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE,
        block_index   integer NOT NULL,
        block_type    text NOT NULL,
        text          text NOT NULL,
        metadata      jsonb NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS screenplay_block_screenplay_idx ON screenplay_block(screenplay_id, block_index)',
    );

    // Linking table between stories and screenplays so a story can reference a
    // related screenplay (e.g. adaptation) and vice versa.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_screenplay_links (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
        screenplay_id  uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
        relation_type  text NOT NULL DEFAULT 'adaptation',
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS story_screenplay_unique ON story_screenplay_links(story_title_id, screenplay_id, relation_type)',
    );

    // Access control for screenplays (owner / contributor / editor, etc.).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenplay_access (
        screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
        user_id       uuid NOT NULL,
        role          text NOT NULL DEFAULT 'owner',
        created_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (screenplay_id, user_id)
      )
    `);

    await pool.query(
      'CREATE INDEX IF NOT EXISTS screenplay_access_user_idx ON screenplay_access(user_id)',
    );

    console.log('[init] ensured screenplay tables exist');
  } catch (err) {
    console.error('[init] failed to ensure screenplay tables:', err);
  }
}

// Best-effort helper: ensure a screenplay_access row exists for a given
// screenplay and user. Used when someone edits a screenplay so they
// appear as a collaborator in /users/:userId/screenplays.
async function ensureScreenplayAccessRow(screenplayId, userId, role = 'contributor') {
  if (!screenplayId || !userId) return;

  try {
    await pool.query(
      `INSERT INTO screenplay_access (screenplay_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (screenplay_id, user_id)
       DO UPDATE SET role = CASE
         WHEN screenplay_access.role = 'owner' THEN screenplay_access.role
         ELSE EXCLUDED.role
       END`,
      [screenplayId, userId, role],
    );
  } catch (err) {
    console.error('[ensureScreenplayAccessRow] failed:', {
      screenplayId,
      userId,
      role,
      error: err,
    });
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
ensureProfilesRealNicknameColumn().catch((err) => {
  console.error('[init] ensureProfilesRealNicknameColumn unhandled error:', err);
});
ensureProfilesVisibilityColumns().catch((err) => {
  console.error('[init] ensureProfilesVisibilityColumns unhandled error:', err);
});
ensureLocalesTable().catch((err) => {
  console.error('[init] ensureLocalesTable unhandled error:', err);
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
ensureContributionsTable().catch((err) => {
  console.error('[init] ensureContributionsTable unhandled error:', err);
});
ensureScreenplayTables().catch((err) => {
  console.error('[init] ensureScreenplayTables unhandled error:', err);
});
ensureUserStoryStatusTable().catch((err) => {
  console.error('[init] ensureUserStoryStatusTable unhandled error:', err);
});
ensureCommentsScreenplayColumn().catch((err) => {
  console.error('[init] ensureCommentsScreenplayColumn unhandled error:', err);
});
ensureReactionsScreenplayColumns().catch((err) => {
  console.error('[init] ensureReactionsScreenplayColumns unhandled error:', err);
});
ensureCreativeSpaceItemsTable().catch((err) => {
  console.error('[init] ensureCreativeSpaceItemsTable unhandled error:', err);
});
ensureStoryCreativeSpaceColumnsAndAttachments().catch((err) => {
  console.error('[init] ensureStoryCreativeSpaceColumnsAndAttachments unhandled error:', err);
});
ensureStorySpacesTable().catch((err) => {
  console.error('[init] ensureStorySpacesTable unhandled error:', err);
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

// Change password for a logged-in user (local auth)
app.post('/auth/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body ?? {};

  if (!userId || !currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: 'userId, current password, and new password are required' });
  }

  try {
    await changePassword(userId, currentPassword, newPassword);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/change-password] failed:', err);
    const message = err?.message || 'Failed to change password';
    const status =
      message === 'Current password is incorrect' || message === 'Invalid password'
        ? 401
        : 400;
    return res.status(status).json({ error: message });
  }
});

// Delete a local user account after confirming password
app.post('/auth/delete-account', async (req, res) => {
  const { userId, password } = req.body ?? {};

  if (!userId || !password) {
    return res.status(400).json({ error: 'userId and password are required' });
  }

  try {
    await deleteAccountWithPassword(userId, password);
    return res.status(204).send();
  } catch (err) {
    console.error('[auth/delete-account] failed:', err);
    const code = err?.code;
    if (code === 'INVALID_PASSWORD') {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const message = err?.message || 'Failed to delete account';
    const status = message === 'User not found' ? 404 : 500;
    return res.status(status).json({ error: message });
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
// Locales / localisation endpoints
// ---------------------------------------------------------------------------

app.get('/locales', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT code, english_name, native_name, direction, enabled FROM locales WHERE enabled = true ORDER BY english_name ASC',
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /locales] failed:', err);
    res.status(500).json({ error: 'Failed to load locales' });
  }
});

// ---------------------------------------------------------------------------
// Profile endpoints (local Postgres-backed user profiles)
// ---------------------------------------------------------------------------

// Lightweight user search for interaction widgets (e.g. selecting users for
// per-container visibility lists). This searches local_users joined with
// profiles and supports simple pagination.
app.get('/users/search', async (req, res) => {
  const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
  const search = rawQuery.trim();

  const rawPage = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 10;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(rawPageSize, 5), 50)
    : 10;

  const offset = (page - 1) * pageSize;
  const limit = pageSize + 1; // fetch one extra row to determine hasMore

  try {
    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE (
        COALESCE(p.username, '') ILIKE $1 OR
        u.email ILIKE $1 OR
        COALESCE(p.first_name, '') ILIKE $1 OR
        COALESCE(p.last_name, '') ILIKE $1
      )`;
    }

    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.email,
         p.username,
         p.first_name,
         p.last_name
       FROM local_users u
       LEFT JOIN profiles p ON p.id = u.id
       ${whereClause}
       ORDER BY COALESCE(p.username, u.email) ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const hasMore = rows.length > pageSize;
    const users = hasMore ? rows.slice(0, pageSize) : rows;

    res.json({ users, hasMore, page, pageSize });
  } catch (err) {
    console.error('[GET /users/search] failed:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Public profile lookup by username for public user pages (e.g. /leolove)
app.get('/public-profiles/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM profiles
       WHERE LOWER(username) = LOWER($1)
          OR LOWER(COALESCE(nickname, '')) = LOWER($1)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [username],
    );
    if (rows.length === 0) {
      console.warn('[GET /public-profiles/:username] no profile match found', { username });
      return res.status(404).json({ error: 'Profile not found' });
    }
    // In future we can enforce per-field visibility based on profile settings
    // (e.g. a dedicated "public handle" field). For now we accept either
    // username or nickname (case-insensitive) as the slug.
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /public-profiles/:username] failed:', err);
    res.status(500).json({ error: 'Failed to load public profile' });
  }
});

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
async function handleProfileUpdate(req, res) {
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
    'real_nickname',
    'show_public_stories',
    'show_public_screenplays',
'show_public_favorites',
    'show_public_living',
    'show_public_lived',
    'favorites_visibility',
    'living_visibility',
    'lived_visibility',
    'favorites_selected_user_ids',
    'living_selected_user_ids',
    'lived_selected_user_ids',
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
}

// Support both POST (legacy) and PATCH (current frontend) for updating profiles.
app.post('/profiles/:userId', handleProfileUpdate);
app.patch('/profiles/:userId', handleProfileUpdate);

// ---------------------------------------------------------------------------
// Story and chapter endpoints (for NewStoryTemplate and story editor UIs)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Screenplay endpoints
// ---------------------------------------------------------------------------

// Create screenplay title + initial scene and blocks in a single transaction.
// This is analogous to /stories/template but for screenplays.
app.post('/screenplays/template', async (req, res) => {
  const { title, formatType, userId } = req.body ?? {};

  const screenplayTitle = typeof title === 'string' && title.trim()
    ? title.trim()
    : 'Untitled Screenplay';

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertTitle = await client.query(
      'INSERT INTO screenplay_title (title, creator_id, format_type) VALUES ($1, $2, $3) RETURNING *',
      [screenplayTitle, userId, formatType || null],
    );
    const screenplayRow = insertTitle.rows[0];

    // Initial scene and a few demo blocks to show formatting.
    const insertScene = await client.query(
      'INSERT INTO screenplay_scene (screenplay_id, scene_index, slugline, location, time_of_day, is_interior) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [
        screenplayRow.screenplay_id,
        1,
        'INT. LOCATION - DAY',
        'LOCATION',
        'DAY',
        true,
      ],
    );
    const sceneRow = insertScene.rows[0];

    const initialBlocks = [
      {
        block_index: 1,
        block_type: 'action',
        text: 'This is where action description goes. Describe what the audience sees.',
      },
      {
        block_index: 2,
        block_type: 'character',
        text: 'CHARACTER NAME',
      },
      {
        block_index: 3,
        block_type: 'dialogue',
        text: "This is a sample line of dialogue.",
      },
      {
        block_index: 4,
        block_type: 'parenthetical',
        text: '(whispering)',
      },
      {
        block_index: 5,
        block_type: 'dialogue',
        text: 'Another line, with a parenthetical above it.',
      },
      {
        block_index: 6,
        block_type: 'transition',
        text: 'CUT TO:',
      },
    ];

    for (const b of initialBlocks) {
      await client.query(
        'INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text) VALUES ($1, $2, $3, $4, $5)',
        [
          screenplayRow.screenplay_id,
          sceneRow.scene_id,
          b.block_index,
          b.block_type,
          b.text,
        ],
      );
    }

    await client.query('COMMIT');

    // Best-effort: ensure the creator has an access row for this screenplay
    try {
      await ensureScreenplayAccessRow(screenplayRow.screenplay_id, userId, 'owner');
    } catch (accessErr) {
      console.error('[POST /screenplays/template] failed to insert screenplay_access row:', accessErr);
    }

    res.status(201).json({
      screenplayId: screenplayRow.screenplay_id,
      title: screenplayRow.title,
      formatType: screenplayRow.format_type,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /screenplays/template] failed:', err);
    res.status(500).json({ error: 'Failed to create screenplay template' });
  } finally {
    client.release();
  }
});

// List screenplay titles created by a user
app.get('/screenplays', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM screenplay_title WHERE creator_id = $1 ORDER BY created_at ASC',
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /screenplays] failed:', err);
    res.status(500).json({ error: 'Failed to fetch user screenplays' });
  }
});

// List newest screenplays across the platform.
// Uses screenplay_title.created_at and shows the first scene's slugline when available.
app.get('/screenplays/newest', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `SELECT
         st.screenplay_id,
         st.title,
         st.created_at,
         fs.slugline
       FROM screenplay_title st
       LEFT JOIN LATERAL (
         SELECT slugline
         FROM screenplay_scene ss
         WHERE ss.screenplay_id = st.screenplay_id
         ORDER BY ss.scene_index ASC, ss.created_at ASC
         LIMIT 1
       ) fs ON TRUE
       WHERE st.visibility = 'public' AND st.published = true
       ORDER BY st.created_at DESC
       LIMIT $1`,
      [limit],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /screenplays/newest] failed:', err);
    res.status(500).json({ error: 'Failed to fetch newest screenplays' });
  }
});

// List most active screenplays across the platform, ordered by recent activity
// and overall content volume (scenes and blocks).
app.get('/screenplays/most-active', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `WITH screenplay_stats AS (
         SELECT
           st.screenplay_id,
           st.title,
           GREATEST(
             MAX(st.created_at),
             MAX(st.updated_at),
             MAX(ss.created_at),
             MAX(ss.updated_at),
             MAX(sb.created_at),
             MAX(sb.updated_at)
           ) AS last_activity_at,
           COUNT(DISTINCT ss.scene_id) AS scene_count,
           COUNT(DISTINCT sb.block_id) AS block_count
         FROM screenplay_title st
         LEFT JOIN screenplay_scene ss ON ss.screenplay_id = st.screenplay_id
         LEFT JOIN screenplay_block sb ON sb.screenplay_id = st.screenplay_id
         WHERE st.visibility = 'public' AND st.published = true
         GROUP BY st.screenplay_id, st.title
       ),
       scored AS (
         SELECT
           screenplay_id,
           title,
           last_activity_at,
           scene_count,
           block_count,
           (scene_count + block_count) AS content_score
         FROM screenplay_stats
       ),
       first_scene AS (
         SELECT
           ss.screenplay_id,
           ss.slugline,
           ss.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY ss.screenplay_id
             ORDER BY ss.scene_index ASC, ss.created_at ASC
           ) AS rn
         FROM screenplay_scene ss
       )
       SELECT
         sc.screenplay_id,
         sc.title,
         sc.last_activity_at,
         fs.slugline,
         st.created_at
       FROM scored sc
       JOIN screenplay_title st ON st.screenplay_id = sc.screenplay_id
       LEFT JOIN first_scene fs ON fs.screenplay_id = sc.screenplay_id AND fs.rn = 1
       WHERE sc.last_activity_at IS NOT NULL
       ORDER BY sc.last_activity_at DESC, sc.content_score DESC, sc.title ASC
       LIMIT $1`,
      [limit],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /screenplays/most-active] failed:', err);
    res.status(500).json({ error: 'Failed to fetch most active screenplays' });
  }
});

// List most popular screenplays across the platform, ranked by likes and
// how many times they were saved to favorites.
app.get('/screenplays/most-popular', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `WITH reaction_counts AS (
         SELECT
           COALESCE(r.screenplay_id, ss.screenplay_id) AS screenplay_id,
           COUNT(*) FILTER (WHERE r.reaction_type = 'like') AS like_count
         FROM reactions r
         LEFT JOIN screenplay_scene ss ON ss.scene_id = r.screenplay_scene_id
         GROUP BY COALESCE(r.screenplay_id, ss.screenplay_id)
       ),
       favorite_counts AS (
         SELECT
           us.screenplay_id,
           COUNT(*) AS favorite_count
         FROM user_story_status us
         WHERE us.content_type = 'screenplay'
           AND us.is_favorite = true
         GROUP BY us.screenplay_id
       ),
       scores AS (
         SELECT
           st.screenplay_id,
           st.title,
           st.created_at,
           COALESCE(rc.like_count, 0) AS like_count,
           COALESCE(fc.favorite_count, 0) AS favorite_count,
           (COALESCE(rc.like_count, 0) * 2 + COALESCE(fc.favorite_count, 0)) AS popularity_score
         FROM screenplay_title st
         LEFT JOIN reaction_counts rc ON rc.screenplay_id = st.screenplay_id
         LEFT JOIN favorite_counts fc ON fc.screenplay_id = st.screenplay_id
         WHERE st.visibility = 'public' AND st.published = true
       ),
       first_scene AS (
         SELECT
           ss.screenplay_id,
           ss.slugline,
           ss.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY ss.screenplay_id
             ORDER BY ss.scene_index ASC, ss.created_at ASC
           ) AS rn
         FROM screenplay_scene ss
       )
       SELECT
         sc.screenplay_id,
         sc.title,
         sc.created_at,
         sc.like_count,
         sc.favorite_count,
         sc.popularity_score,
         fs.slugline
       FROM scores sc
       LEFT JOIN first_scene fs ON fs.screenplay_id = sc.screenplay_id AND fs.rn = 1
       WHERE sc.popularity_score > 0
       ORDER BY sc.popularity_score DESC,
                sc.like_count DESC,
                sc.favorite_count DESC,
                sc.title ASC
       LIMIT $1`,
      [limit],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /screenplays/most-popular] failed:', err);
    res.status(500).json({ error: 'Failed to fetch most popular screenplays' });
  }
});

// Get a single screenplay by ID (no visibility rules yet; keep simple for v1)
app.get('/screenplays/:screenplayId', async (req, res) => {
  const { screenplayId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM screenplay_title WHERE screenplay_id = $1',
      [screenplayId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /screenplays/:screenplayId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch screenplay' });
  }
});

// Update screenplay metadata
app.patch('/screenplays/:screenplayId', async (req, res) => {
  const { screenplayId } = req.params;
  const { title, visibility, published, genre, tags, formatType } = req.body ?? {};

  const fields = [];
  const values = [];
  let idx = 1;

  if (title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(title);
  }
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
  if (formatType !== undefined) {
    fields.push(`format_type = $${idx++}`);
    values.push(formatType || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  fields.push('updated_at = now()');
  values.push(screenplayId);

  const sql = `UPDATE screenplay_title SET ${fields.join(', ')} WHERE screenplay_id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /screenplays/:screenplayId] failed:', err);
    res.status(500).json({ error: 'Failed to update screenplay' });
  }
});

// Delete a screenplay and cascade to scenes/blocks
app.delete('/screenplays/:screenplayId', async (req, res) => {
  const { screenplayId } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM screenplay_title WHERE screenplay_id = $1',
      [screenplayId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Screenplay not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /screenplays/:screenplayId] failed:', err);
    res.status(500).json({ error: 'Failed to delete screenplay' });
  }
});

// Get scenes + (optionally) blocks for a screenplay
app.get('/screenplays/:screenplayId/scenes', async (req, res) => {
  const { screenplayId } = req.params;
  const includeBlocks = req.query.includeBlocks === 'true';

  try {
    const { rows: scenes } = await pool.query(
      'SELECT * FROM screenplay_scene WHERE screenplay_id = $1 ORDER BY scene_index ASC',
      [screenplayId],
    );

    if (!includeBlocks) {
      return res.json({ scenes });
    }

    const { rows: blocks } = await pool.query(
      'SELECT * FROM screenplay_block WHERE screenplay_id = $1 ORDER BY block_index ASC',
      [screenplayId],
    );

    res.json({ scenes, blocks });
  } catch (err) {
    console.error('[GET /screenplays/:screenplayId/scenes] failed:', err);
    res.status(500).json({ error: 'Failed to fetch screenplay scenes' });
  }
});

// Create a new scene
app.post('/screenplays/:screenplayId/scenes', async (req, res) => {
  const { screenplayId } = req.params;
  const { sceneIndex, slugline, location, timeOfDay, isInterior, synopsis, userId } = req.body ?? {};

  if (!slugline) {
    return res.status(400).json({ error: 'slugline is required' });
  }

  const index = Number.isInteger(sceneIndex) ? sceneIndex : 1;

  try {
    const { rows } = await pool.query(
      'INSERT INTO screenplay_scene (screenplay_id, scene_index, slugline, location, time_of_day, is_interior, synopsis) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [screenplayId, index, slugline, location || null, timeOfDay || null, isInterior ?? null, synopsis || null],
    );

    // Best-effort: mark this user as a contributor on the screenplay
    if (userId) {
      await ensureScreenplayAccessRow(screenplayId, userId, 'contributor');
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /screenplays/:screenplayId/scenes] failed:', err);
    res.status(500).json({ error: 'Failed to create scene' });
  }
});

// Update a scene
app.patch('/screenplay-scenes/:sceneId', async (req, res) => {
  const { sceneId } = req.params;
  const { sceneIndex, slugline, location, timeOfDay, isInterior, synopsis, userId } = req.body ?? {};

  const fields = [];
  const values = [];
  let idx = 1;

  if (sceneIndex !== undefined) {
    fields.push(`scene_index = $${idx++}`);
    values.push(sceneIndex);
  }
  if (slugline !== undefined) {
    fields.push(`slugline = $${idx++}`);
    values.push(slugline);
  }
  if (location !== undefined) {
    fields.push(`location = $${idx++}`);
    values.push(location || null);
  }
  if (timeOfDay !== undefined) {
    fields.push(`time_of_day = $${idx++}`);
    values.push(timeOfDay || null);
  }
  if (isInterior !== undefined) {
    fields.push(`is_interior = $${idx++}`);
    values.push(isInterior);
  }
  if (synopsis !== undefined) {
    fields.push(`synopsis = $${idx++}`);
    values.push(synopsis || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  fields.push('updated_at = now()');
  values.push(sceneId);

  const sql = `UPDATE screenplay_scene SET ${fields.join(', ')} WHERE scene_id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Best-effort: mark this user as a contributor on the screenplay
    if (userId) {
      const screenplayId = rows[0].screenplay_id;
      if (screenplayId) {
        await ensureScreenplayAccessRow(screenplayId, userId, 'contributor');
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /screenplay-scenes/:sceneId] failed:', err);
    res.status(500).json({ error: 'Failed to update scene' });
  }
});

// Delete a scene
app.delete('/screenplay-scenes/:sceneId', async (req, res) => {
  const { sceneId } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM screenplay_scene WHERE scene_id = $1',
      [sceneId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /screenplay-scenes/:sceneId] failed:', err);
    res.status(500).json({ error: 'Failed to delete scene' });
  }
});

// Create a new screenplay block
app.post('/screenplays/:screenplayId/blocks', async (req, res) => {
  const { screenplayId } = req.params;
  const { sceneId, blockIndex, blockType, text, metadata, userId } = req.body ?? {};

  if (!blockType || !text) {
    return res.status(400).json({ error: 'blockType and text are required' });
  }

  const index = Number.isInteger(blockIndex) ? blockIndex : 1;

  try {
    const { rows } = await pool.query(
      'INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [screenplayId, sceneId || null, index, blockType, text, metadata || null],
    );

    // Best-effort: mark this user as a contributor on the screenplay
    if (userId) {
      await ensureScreenplayAccessRow(screenplayId, userId, 'contributor');
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /screenplays/:screenplayId/blocks] failed:', err);
    res.status(500).json({ error: 'Failed to create block' });
  }
});

// Update a screenplay block
app.patch('/screenplay-blocks/:blockId', async (req, res) => {
  const { blockId } = req.params;
  const { sceneId, blockIndex, blockType, text, metadata, userId } = req.body ?? {};

  const fields = [];
  const values = [];
  let idx = 1;

  if (sceneId !== undefined) {
    fields.push(`scene_id = $${idx++}`);
    values.push(sceneId || null);
  }
  if (blockIndex !== undefined) {
    fields.push(`block_index = $${idx++}`);
    values.push(blockIndex);
  }
  if (blockType !== undefined) {
    fields.push(`block_type = $${idx++}`);
    values.push(blockType);
  }
  if (text !== undefined) {
    fields.push(`text = $${idx++}`);
    values.push(text);
  }
  if (metadata !== undefined) {
    fields.push(`metadata = $${idx++}`);
    values.push(metadata || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  fields.push('updated_at = now()');
  values.push(blockId);

  const sql = `UPDATE screenplay_block SET ${fields.join(', ')} WHERE block_id = $${idx} RETURNING *`;

  try {
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Best-effort: mark this user as a contributor on the screenplay
    if (userId) {
      const screenplayId = rows[0].screenplay_id;
      if (screenplayId) {
        await ensureScreenplayAccessRow(screenplayId, userId, 'contributor');
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /screenplay-blocks/:blockId] failed:', err);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

// Delete a screenplay block
app.delete('/screenplay-blocks/:blockId', async (req, res) => {
  const { blockId } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM screenplay_block WHERE block_id = $1',
      [blockId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Block not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /screenplay-blocks/:blockId] failed:', err);
    res.status(500).json({ error: 'Failed to delete block' });
  }
});

// Import/export endpoints (FDX, Fountain, ODT, PDF, DOCX) are stubbed for now
// to avoid breaking the API surface. They currently return 501 and can be
// filled in once shared parser/serializer logic is in place.
app.post('/screenplays/import/fdx', async (_req, res) => {
  res.status(501).json({ error: 'FDX import not implemented yet' });
});

app.post('/screenplays/import/fountain', async (_req, res) => {
  res.status(501).json({ error: 'Fountain import not implemented yet' });
});

app.post('/screenplays/import/odt', async (_req, res) => {
  res.status(501).json({ error: 'ODT import not implemented yet' });
});

app.post('/screenplays/import/docx', async (_req, res) => {
  res.status(501).json({ error: 'DOCX import not implemented yet' });
});

app.post('/screenplays/import/pdf', async (_req, res) => {
  res.status(501).json({ error: 'PDF import not implemented yet' });
});

// Desktop sync endpoint for screenplays. This replaces the full set of
// scenes and blocks for a screenplay based on a structured snapshot coming
// from the desktop editor. The operation is transactional: on success the
// database state matches the payload; on failure the previous state is
// preserved.
app.post('/screenplays/:screenplayId/sync-desktop', async (req, res) => {
  const { screenplayId } = req.params;
  const { userId, title, formatType, scenes, remoteUpdatedAt } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!screenplayId) {
    return res.status(400).json({ error: 'screenplayId is required' });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes[] is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const titleRes = await client.query(
      'SELECT screenplay_id, title, format_type, creator_id, updated_at FROM screenplay_title WHERE screenplay_id = $1 FOR UPDATE',
      [screenplayId],
    );
    if (titleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Screenplay not found' });
    }

    const row = titleRes.rows[0];

    // Conflict detection: if the client sent the last-seen updated_at and it
    // does not match the current DB value, refuse to overwrite and signal a
    // conflict back to the desktop app.
    try {
      if (remoteUpdatedAt && row.updated_at) {
        const clientTs = new Date(String(remoteUpdatedAt));
        const serverTs = new Date(String(row.updated_at));
        if (!Number.isNaN(clientTs.getTime()) && !Number.isNaN(serverTs.getTime())) {
          if (clientTs.getTime() < serverTs.getTime()) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              error: 'conflict',
              message: 'Screenplay has changed on the server since last desktop sync.',
              remoteUpdatedAt: row.updated_at,
            });
          }
        }
      }
    } catch (cmpErr) {
      console.error('[POST /screenplays/:screenplayId/sync-desktop] conflict check failed:', cmpErr);
      // On comparison failure, fall back to best-effort last-writer-wins.
    }

    const newTitle = title.trim();
    const newFormatType = formatType !== undefined ? formatType : row.format_type;

    await client.query(
      'UPDATE screenplay_title SET title = $1, format_type = $2, updated_at = now() WHERE screenplay_id = $3',
      [newTitle, newFormatType, screenplayId],
    );

    // Replace scenes and blocks in a simple, deterministic way.
    await client.query('DELETE FROM screenplay_block WHERE screenplay_id = $1', [screenplayId]);
    await client.query('DELETE FROM screenplay_scene WHERE screenplay_id = $1', [screenplayId]);

    let nextBlockIndex = 1;

    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i] || {};
      const rawIndex = scene.sceneIndex;
      const sceneIndex = Number.isInteger(rawIndex) ? rawIndex : i + 1;
      const slugline =
        typeof scene.slugline === 'string' && scene.slugline.trim()
          ? scene.slugline.trim()
          : `Scene ${sceneIndex}`;

      const sceneRes = await client.query(
        'INSERT INTO screenplay_scene (screenplay_id, scene_index, slugline, location, time_of_day, is_interior, synopsis) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING scene_id',
        [screenplayId, sceneIndex, slugline, null, null, null, null],
      );
      const sceneId = sceneRes.rows[0].scene_id;

      const paragraphs = Array.isArray(scene.paragraphs) ? scene.paragraphs : [];
      for (const para of paragraphs) {
        const text = typeof para === 'string' ? para : '';
        if (!text.trim()) continue;

        const blockIndex = nextBlockIndex;
        nextBlockIndex += 1;

        // Best-effort block type inference based on common screenplay
        // conventions so that the web UI can render richer element types.
        let blockType = 'action';
        const trimmed = text.trim();
        if (trimmed) {
          const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
          if (isAllCaps && !trimmed.endsWith(':')) {
            // CHARACTER NAME or similar.
            blockType = 'character';
          } else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            blockType = 'parenthetical';
          } else if (isAllCaps && trimmed.endsWith(':')) {
            blockType = 'transition';
          }
        }

        await client.query(
          'INSERT INTO screenplay_block (screenplay_id, scene_id, block_index, block_type, text, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
          [screenplayId, sceneId, blockIndex, blockType, text, null],
        );
      }
    }

    // Best-effort: ensure the syncing user shows up as a collaborator.
    try {
      await ensureScreenplayAccessRow(screenplayId, userId, 'contributor');
    } catch (errAccess) {
      console.error(
        '[POST /screenplays/:screenplayId/sync-desktop] failed to insert screenplay_access row:',
        errAccess,
      );
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      screenplayId,
      syncedScenes: scenes.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /screenplays/:screenplayId/sync-desktop] failed:', err);
    return res.status(500).json({
      error: 'Failed to sync screenplay from desktop',
      details: err?.message || String(err),
    });
  } finally {
    client.release();
  }
});

app.get('/screenplays/:screenplayId/export.fdx', async (_req, res) => {
  res.status(501).json({ error: 'FDX export not implemented yet' });
});

app.get('/screenplays/:screenplayId/export.fountain', async (_req, res) => {
  res.status(501).json({ error: 'Fountain export not implemented yet' });
});

app.get('/screenplays/:screenplayId/export.odt', async (_req, res) => {
  res.status(501).json({ error: 'ODT export not implemented yet' });
});

app.get('/screenplays/:screenplayId/export.docx', async (_req, res) => {
  res.status(501).json({ error: 'DOCX export not implemented yet' });
});

app.get('/screenplays/:screenplayId/export.pdf', async (_req, res) => {
  res.status(501).json({ error: 'PDF export not implemented yet' });
});

// Helper: fetch attachments for a story_title as a rich list including
// linked creative space items. Used by multiple endpoints.
async function loadStoryAttachments(storyTitleId) {
  const { rows } = await pool.query(
    `SELECT
       sa.id,
       sa.space_id,
       sa.item_id,
       sa.kind,
       sa.role,
       csi.relative_path,
       csi.name,
       csi.kind AS item_kind,
       csi.mime_type,
       csi.size_bytes
     FROM story_attachments sa
     JOIN creative_space_items csi ON csi.id = sa.item_id
     WHERE sa.story_title_id = $1 AND csi.deleted = false
     ORDER BY csi.relative_path ASC`,
    [storyTitleId],
  );
  return rows;
}

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

// List stories for a user that do not yet belong to any creative Space. This is
// used by the web admin/bulk migration UI to assign legacy web-only stories
// into Spaces without disturbing existing ones.
app.get('/stories/unbound', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT story_title_id, title, visibility, published, created_at, updated_at
       FROM story_title
       WHERE creator_id = $1 AND creative_space_id IS NULL
       ORDER BY created_at ASC`,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/unbound] failed:', err);
    res.status(500).json({ error: 'Failed to fetch unbound stories' });
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

    // Always attach Space-aware file attachments; this is additive metadata
    // and does not affect access control.
    let attachments = [];
    try {
      attachments = await loadStoryAttachments(storyTitleId);
    } catch (err) {
      console.error('[GET /story-titles/:storyTitleId] failed to load attachments:', err);
    }

    const payload = { ...story, attachments };

    if (visibility !== 'private') {
      return res.json(payload);
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
      return res.json(payload);
    }

    // Check story_access table; if it does not exist, fall back to creator-only access
    try {
      const access = await pool.query(
        'SELECT 1 FROM story_access WHERE story_title_id = $1 AND user_id = $2 LIMIT 1',
        [storyTitleId, userId],
      );
      if (access.rows.length > 0) {
        return res.json(payload);
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

// List attachments linked to a story, including creative_space_items data.
app.get('/stories/:storyTitleId/attachments', async (req, res) => {
  const { storyTitleId } = req.params;
  try {
    const attachments = await loadStoryAttachments(storyTitleId);
    res.json(attachments);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/attachments] failed:', err);
    res.status(500).json({ error: 'Failed to fetch story attachments' });
  }
});

// Attach a creative_space_items entry as a file belonging to a story.
app.post('/stories/:storyTitleId/attachments', async (req, res) => {
  const { storyTitleId } = req.params;
  const { spaceId, itemId, kind, role } = req.body ?? {};

  if (!storyTitleId || !spaceId || !itemId) {
    return res
      .status(400)
      .json({ error: 'storyTitleId, spaceId, and itemId are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const storyRes = await client.query(
      'SELECT story_title_id, creative_space_id FROM story_title WHERE story_title_id = $1 FOR UPDATE',
      [storyTitleId],
    );
    if (storyRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Story not found' });
    }
    const story = storyRes.rows[0];

    const itemRes = await client.query(
      'SELECT id, space_id FROM creative_space_items WHERE id = $1 AND deleted = false',
      [itemId],
    );
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Attachment item not found in Space' });
    }
    const item = itemRes.rows[0];

    if (String(item.space_id) !== String(spaceId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item does not belong to the specified Space' });
    }

    // If the story does not yet have a creative_space_id, adopt this Space
    // as its primary container. If it already has one and differs, log but
    // do not override to avoid surprising users.
    if (!story.creative_space_id) {
      try {
        await client.query(
          'UPDATE story_title SET creative_space_id = $1 WHERE story_title_id = $2',
          [spaceId, storyTitleId],
        );
      } catch (errSetSpace) {
        console.error('[POST /stories/:storyTitleId/attachments] failed to set creative_space_id:', errSetSpace);
      }
    } else if (String(story.creative_space_id) !== String(spaceId)) {
      console.warn(
        '[POST /stories/:storyTitleId/attachments] story already linked to a different creative_space_id',
        {
          storyTitleId,
          existingSpaceId: story.creative_space_id,
          requestedSpaceId: spaceId,
        },
      );
    }

    const { rows } = await client.query(
      `INSERT INTO story_attachments (story_title_id, space_id, item_id, kind, role)
       VALUES ($1, $2, $3, COALESCE($4, 'other'), $5)
       ON CONFLICT (story_title_id, item_id)
       DO UPDATE SET
         kind = COALESCE(EXCLUDED.kind, story_attachments.kind),
         role = COALESCE(EXCLUDED.role, story_attachments.role),
         updated_at = now()
       RETURNING *`,
      [storyTitleId, spaceId, itemId, kind || null, role || null],
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /stories/:storyTitleId/attachments] failed:', err);
    res.status(500).json({ error: 'Failed to attach file to story' });
  } finally {
    client.release();
  }
});

// Detach a file from a story (does not delete the underlying creative_space_item).
app.delete('/stories/:storyTitleId/attachments/:attachmentId', async (req, res) => {
  const { storyTitleId, attachmentId } = req.params;

  if (!storyTitleId || !attachmentId) {
    return res.status(400).json({ error: 'storyTitleId and attachmentId are required' });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM story_attachments WHERE id = $1 AND story_title_id = $2',
      [attachmentId, storyTitleId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Attachment not found for this story' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /stories/:storyTitleId/attachments/:attachmentId] failed:', err);
    res.status(500).json({ error: 'Failed to delete story attachment' });
  }
});

// Update or clear the primary creative space for a story. This keeps all
// existing story fields intact and simply changes story_title.creative_space_id.
app.patch('/story-titles/:storyTitleId/space', async (req, res) => {
  const { storyTitleId } = req.params;
  const { creativeSpaceId } = req.body ?? {};

  if (!storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId is required' });
  }

  try {
    // If a Space id was provided, best-effort validate that it exists. If not
    // found, treat this as a 400 to avoid dangling references.
    if (creativeSpaceId) {
      const spaceCheck = await pool.query(
        'SELECT id FROM creative_spaces WHERE id = $1 LIMIT 1',
        [creativeSpaceId],
      );
      if (spaceCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Creative Space not found' });
      }
    }

    const { rows } = await pool.query(
      'UPDATE story_title SET creative_space_id = $1, updated_at = now() WHERE story_title_id = $2 RETURNING *',
      [creativeSpaceId || null, storyTitleId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const updated = rows[0];

    // Best-effort: if a Space was provided, keep story_spaces in sync so that
    // downstream tools can reason about multi-Space membership.
    if (creativeSpaceId) {
      try {
        await pool.query(
          `INSERT INTO story_spaces (story_title_id, space_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (story_title_id, space_id)
           DO UPDATE SET role = COALESCE(EXCLUDED.role, story_spaces.role), updated_at = now()`,
          [storyTitleId, creativeSpaceId, 'primary'],
        );
      } catch (errSpaces) {
        console.error('[PATCH /story-titles/:storyTitleId/space] failed to upsert story_spaces row:', errSpaces);
      }
    }

    // Attachments are additive metadata; include them for convenience so the
    // frontend can refresh its view without an extra round-trip.
    let attachments = [];
    try {
      attachments = await loadStoryAttachments(storyTitleId);
    } catch (err) {
      console.error('[PATCH /story-titles/:storyTitleId/space] failed to load attachments:', err);
    }

    res.json({ ...updated, attachments });
  } catch (err) {
    console.error('[PATCH /story-titles/:storyTitleId/space] failed:', err);
    res.status(500).json({ error: 'Failed to update story creative space' });
  }
});

// Copy a story into an additional Space without changing its primary Space.
app.post('/stories/:storyTitleId/copy-to-space', async (req, res) => {
  const { storyTitleId } = req.params;
  const { targetSpaceId, role } = req.body ?? {};

  if (!storyTitleId || !targetSpaceId) {
    return res.status(400).json({ error: 'storyTitleId and targetSpaceId are required' });
  }

  try {
    const storyCheck = await pool.query(
      'SELECT story_title_id FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (storyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const spaceCheck = await pool.query(
      'SELECT id FROM creative_spaces WHERE id = $1',
      [targetSpaceId],
    );
    if (spaceCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Creative Space not found' });
    }

    await pool.query(
      `INSERT INTO story_spaces (story_title_id, space_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (story_title_id, space_id)
       DO UPDATE SET role = COALESCE(EXCLUDED.role, story_spaces.role), updated_at = now()`,
      [storyTitleId, targetSpaceId, role || 'secondary'],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[POST /stories/:storyTitleId/copy-to-space] failed:', err);
    return res.status(500).json({ error: 'Failed to copy story into Space' });
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
  const { title, chapterTitle, paragraphs, userId, creativeSpaceId } = req.body ?? {};

  if (!title || !chapterTitle || !Array.isArray(paragraphs) || !userId) {
    return res.status(400).json({ error: 'title, chapterTitle, paragraphs[], and userId are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertTitle = await client.query(
      'INSERT INTO story_title (title, creator_id, creative_space_id) VALUES ($1, $2, $3) RETURNING story_title_id, title, creative_space_id',
      [title, userId, creativeSpaceId || null],
    );
    const storyTitleRow = insertTitle.rows[0];

    // Best-effort: track the primary Space membership in story_spaces when a
    // creativeSpaceId was provided.
    if (creativeSpaceId) {
      try {
        await client.query(
          `INSERT INTO story_spaces (story_title_id, space_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (story_title_id, space_id)
           DO UPDATE SET role = COALESCE(EXCLUDED.role, story_spaces.role), updated_at = now()`,
          [storyTitleRow.story_title_id, creativeSpaceId, 'primary'],
        );
      } catch (errSpaces) {
        console.error('[POST /stories/template] failed to upsert story_spaces row:', errSpaces);
      }
    }

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

// List newest stories across the platform.
// Returns at most one chapter per story_title (the newest chapter),
// so the frontend shows distinct stories instead of multiple chapters
// from the same story.
app.get('/stories/newest', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `WITH latest_chapter AS (
         SELECT
           s.chapter_id,
           s.chapter_title,
           s.created_at,
           s.story_title_id,
           ROW_NUMBER() OVER (
             PARTITION BY s.story_title_id
             ORDER BY s.created_at DESC, s.chapter_index DESC
           ) AS rn
         FROM stories s
         JOIN story_title st ON st.story_title_id = s.story_title_id
         WHERE st.visibility = 'public' AND st.published = true
       )
       SELECT
         lc.chapter_id,
         lc.chapter_title,
         lc.created_at,
         lc.story_title_id,
         st.title AS story_title
       FROM latest_chapter lc
       JOIN story_title st ON st.story_title_id = lc.story_title_id
       WHERE lc.rn = 1
       ORDER BY lc.created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/newest] failed:', err);
    res.status(500).json({ error: 'Failed to fetch newest stories' });
  }
});

// List most active stories across the platform, ordered by recent activity
// and overall content volume (chapters, paragraphs, branches).
app.get('/stories/most-active', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `WITH story_stats AS (
         SELECT
           st.story_title_id,
           st.title,
           GREATEST(
             MAX(s.created_at),
             MAX(s.updated_at),
             MAX(cr.created_at),
             MAX(pr.created_at),
             MAX(cc.created_at),
             MAX(cl.created_at),
             MAX(r.created_at)
           ) AS last_activity_at,
           COUNT(DISTINCT s.chapter_id) AS chapter_count,
           COALESCE(SUM(COALESCE(cardinality(s.paragraphs), 0)), 0) AS paragraph_count,
           COUNT(DISTINCT pb.id) AS branch_count
         FROM story_title st
         JOIN stories s ON s.story_title_id = st.story_title_id
         LEFT JOIN chapter_revisions cr ON cr.chapter_id = s.chapter_id
         LEFT JOIN paragraph_revisions pr ON pr.chapter_id = s.chapter_id
         LEFT JOIN chapter_comments cc ON cc.chapter_id = s.chapter_id
         LEFT JOIN chapter_likes cl ON cl.chapter_id = s.chapter_id
         LEFT JOIN reactions r ON r.chapter_id = s.chapter_id
         LEFT JOIN paragraph_branches pb ON pb.chapter_id = s.chapter_id
         WHERE st.visibility = 'public' AND st.published = true
         GROUP BY st.story_title_id, st.title
       ),
       scored AS (
         SELECT
           story_title_id,
           title,
           last_activity_at,
           chapter_count,
           paragraph_count,
           branch_count,
           (chapter_count + paragraph_count + branch_count) AS content_score
         FROM story_stats
       ),
       latest_chapter AS (
         SELECT
           s.story_title_id,
           s.chapter_id,
           s.chapter_title,
           s.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.story_title_id
             ORDER BY s.created_at DESC, s.chapter_index DESC
           ) AS rn
         FROM stories s
       )
       SELECT
         sc.story_title_id,
         sc.title AS story_title,
         lc.chapter_id,
         lc.chapter_title,
         lc.created_at,
         sc.last_activity_at,
         sc.chapter_count,
         sc.paragraph_count,
         sc.branch_count,
         sc.content_score
       FROM scored sc
       JOIN latest_chapter lc ON lc.story_title_id = sc.story_title_id AND lc.rn = 1
       WHERE sc.last_activity_at IS NOT NULL
       ORDER BY sc.last_activity_at DESC, sc.content_score DESC, sc.title ASC
       LIMIT $1`,
      [limit],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/most-active] failed:', err);
    res.status(500).json({ error: 'Failed to fetch most active stories' });
  }
});

// List most popular stories across the platform, ranked by likes and how
// many times they were saved to favorites.
app.get('/stories/most-popular', async (req, res) => {
  const rawLimit = req.query.limit;
  const parsed = rawLimit ? parseInt(String(rawLimit), 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;

  try {
    const { rows } = await pool.query(
      `WITH reaction_counts AS (
         SELECT
           COALESCE(r.story_title_id, s.story_title_id) AS story_title_id,
           COUNT(*) FILTER (WHERE r.reaction_type = 'like') AS like_count
         FROM reactions r
         LEFT JOIN stories s ON s.chapter_id = r.chapter_id
         GROUP BY COALESCE(r.story_title_id, s.story_title_id)
       ),
       favorite_counts AS (
         SELECT
           us.story_title_id,
           COUNT(*) AS favorite_count
         FROM user_story_status us
         WHERE us.content_type = 'story'
           AND us.is_favorite = true
         GROUP BY us.story_title_id
       ),
       scores AS (
         SELECT
           st.story_title_id,
           st.title,
           COALESCE(rc.like_count, 0) AS like_count,
           COALESCE(fc.favorite_count, 0) AS favorite_count,
           (COALESCE(rc.like_count, 0) * 2 + COALESCE(fc.favorite_count, 0)) AS popularity_score
         FROM story_title st
         LEFT JOIN reaction_counts rc ON rc.story_title_id = st.story_title_id
         LEFT JOIN favorite_counts fc ON fc.story_title_id = st.story_title_id
         WHERE st.visibility = 'public' AND st.published = true
       ),
       latest_chapter AS (
         SELECT
           s.story_title_id,
           s.chapter_id,
           s.chapter_title,
           s.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.story_title_id
             ORDER BY s.created_at DESC, s.chapter_index DESC
           ) AS rn
         FROM stories s
       )
       SELECT
         sc.story_title_id,
         sc.title AS story_title,
         lc.chapter_id,
         lc.chapter_title,
         lc.created_at,
         sc.like_count,
         sc.favorite_count,
         sc.popularity_score
       FROM scores sc
       JOIN latest_chapter lc ON lc.story_title_id = sc.story_title_id AND lc.rn = 1
       WHERE sc.popularity_score > 0
       ORDER BY sc.popularity_score DESC,
                sc.like_count DESC,
                sc.favorite_count DESC,
                sc.title ASC
       LIMIT $1`,
      [limit],
    );

    res.json(rows);
  } catch (err) {
    console.error('[GET /stories/most-popular] failed:', err);
    res.status(500).json({ error: 'Failed to fetch most popular stories' });
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
      'SELECT story_title_id, title, created_at, visibility, published FROM story_title WHERE creator_id = $1',
      [userId],
    );

    // Stories the user has contributed to.
    // We support both legacy stories.contributor_id and new chapter_revisions.created_by.
    const contributed = await pool.query(
      `SELECT DISTINCT st.story_title_id,
              st.title,
              st.created_at,
              st.visibility,
              st.published
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
        visibility: row.visibility,
        published: row.published,
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
          visibility: row.visibility,
          published: row.published,
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

// List screenplays a user is creating or collaborating on
app.get('/users/:userId/screenplays', async (req, res) => {
  const { userId } = req.params;

  try {
    // Screenplays created by the user
    const created = await pool.query(
      'SELECT screenplay_id, title, created_at, visibility, published FROM screenplay_title WHERE creator_id = $1',
      [userId],
    );

    // Screenplays where the user has an access row (owner/editor/contributor)
    const access = await pool.query(
      `SELECT st.screenplay_id,
              st.title,
              st.created_at,
              st.visibility,
              st.published,
              sa.role
       FROM screenplay_access sa
       JOIN screenplay_title st ON st.screenplay_id = sa.screenplay_id
       WHERE sa.user_id = $1`,
      [userId],
    );

    const map = new Map();
    for (const row of created.rows) {
      map.set(row.screenplay_id, {
        screenplay_id: row.screenplay_id,
        title: row.title,
        created_at: row.created_at,
        visibility: row.visibility,
        published: row.published,
        roles: ['creator'],
      });
    }

    for (const row of access.rows) {
      const existing = map.get(row.screenplay_id);
      if (existing) {
        if (!existing.roles.includes(row.role)) {
          existing.roles.push(row.role);
        }
      } else {
        map.set(row.screenplay_id, {
          screenplay_id: row.screenplay_id,
          title: row.title,
          created_at: row.created_at,
          visibility: row.visibility,
          published: row.published,
          roles: [row.role],
        });
      }
    }

    const combined = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    res.json(combined);
  } catch (err) {
    console.error('[GET /users/:userId/screenplays] failed:', err);
    res.status(500).json({ error: 'Failed to fetch user screenplays' });
  }
});

// ---------------------------------------------------------------------------
// User experience endpoints (favorites / living / lived)
// ---------------------------------------------------------------------------

app.post('/users/:userId/story-status', async (req, res) => {
  const { userId } = req.params;
  const { contentType, storyTitleId, screenplayId, isFavorite, isLiving, isLived } =
    req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (contentType !== 'story' && contentType !== 'screenplay') {
    return res.status(400).json({ error: 'contentType must be "story" or "screenplay"' });
  }

  if (contentType === 'story' && !storyTitleId) {
    return res.status(400).json({ error: 'storyTitleId is required for contentType="story"' });
  }
  if (contentType === 'screenplay' && !screenplayId) {
    return res
      .status(400)
      .json({ error: 'screenplayId is required for contentType="screenplay"' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO user_story_status (user_id, content_type, story_title_id, screenplay_id,
                                      is_favorite, is_living, is_lived)
       VALUES ($1, $2, $3, $4,
               COALESCE($5, false), COALESCE($6, false), COALESCE($7, false))
       ON CONFLICT (user_id, content_type, story_title_id, screenplay_id)
       DO UPDATE SET
         is_favorite = COALESCE(EXCLUDED.is_favorite, user_story_status.is_favorite),
         is_living   = COALESCE(EXCLUDED.is_living,   user_story_status.is_living),
         is_lived    = COALESCE(EXCLUDED.is_lived,    user_story_status.is_lived),
         updated_at  = now()
       RETURNING *`,
      [
        userId,
        contentType,
        contentType === 'story' ? storyTitleId : null,
        contentType === 'screenplay' ? screenplayId : null,
        isFavorite,
        isLiving,
        isLived,
      ],
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /users/:userId/story-status] failed:', err);
    return res.status(500).json({ error: 'Failed to update story status' });
  }
});

async function fetchUserExperienceItems(userId, flagColumn) {
  // Stories
  const storyRowsPromise = pool.query(
    `SELECT
       us.id,
       us.content_type,
       us.story_title_id,
       st.title,
       st.created_at,
       us.is_favorite,
       us.is_living,
       us.is_lived
     FROM user_story_status us
     JOIN story_title st ON st.story_title_id = us.story_title_id
     WHERE us.user_id = $1
       AND us.content_type = 'story'
       AND us.${flagColumn} = true
       AND st.visibility = 'public'
       AND st.published = true`,
    [userId],
  );

  // Screenplays (include first scene slugline for context)
  const screenplayRowsPromise = pool.query(
    `SELECT
       us.id,
       us.content_type,
       us.screenplay_id,
       st.title,
       st.created_at,
       us.is_favorite,
       us.is_living,
       us.is_lived,
       fs.slugline
     FROM user_story_status us
     JOIN screenplay_title st ON st.screenplay_id = us.screenplay_id
     LEFT JOIN LATERAL (
       SELECT slugline
       FROM screenplay_scene ss
       WHERE ss.screenplay_id = st.screenplay_id
       ORDER BY ss.scene_index ASC, ss.created_at ASC
       LIMIT 1
     ) fs ON TRUE
     WHERE us.user_id = $1
       AND us.content_type = 'screenplay'
       AND us.${flagColumn} = true
       AND st.visibility = 'public'
       AND st.published = true`,
    [userId],
  );

  const [storyRowsResult, screenplayRowsResult] = await Promise.all([
    storyRowsPromise,
    screenplayRowsPromise,
  ]);

  // Build a flat list of items from stories + screenplays first.
  const rawItems = [];

  for (const row of storyRowsResult.rows) {
    rawItems.push({
      id: row.id,
      content_type: 'story',
      content_id: row.story_title_id,
      title: row.title,
      created_at: row.created_at,
      is_favorite: row.is_favorite,
      is_living: row.is_living,
      is_lived: row.is_lived,
      kind: 'novel',
    });
  }

  for (const row of screenplayRowsResult.rows) {
    rawItems.push({
      id: row.id,
      content_type: 'screenplay',
      content_id: row.screenplay_id,
      title: row.title,
      created_at: row.created_at,
      is_favorite: row.is_favorite,
      is_living: row.is_living,
      is_lived: row.is_lived,
      slugline: row.slugline,
      kind: 'screenplay',
    });
  }

  // Deduplicate by (content_type, content_id) so each story/screenplay
  // appears at most once per user and flag (favorites / living / lived).
  const uniqueMap = new Map();
  for (const item of rawItems) {
    const key = `${item.content_type}:${item.content_id}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }

  const items = Array.from(uniqueMap.values());

  // Sort newest first by created_at
  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return items;
}

app.get('/users/:userId/favorites', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  try {
    const items = await fetchUserExperienceItems(userId, 'is_favorite');
    return res.json(items);
  } catch (err) {
    console.error('[GET /users/:userId/favorites] failed:', err);
    return res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

app.get('/users/:userId/experiencing', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  try {
    const items = await fetchUserExperienceItems(userId, 'is_living');
    return res.json(items);
  } catch (err) {
    console.error('[GET /users/:userId/experiencing] failed:', err);
    return res.status(500).json({ error: 'Failed to fetch experiencing stories' });
  }
});

app.get('/users/:userId/experienced', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  try {
    const items = await fetchUserExperienceItems(userId, 'is_lived');
    return res.json(items);
  } catch (err) {
    console.error('[GET /users/:userId/experienced] failed:', err);
    return res.status(500).json({ error: 'Failed to fetch experienced stories' });
  }
});

// ---------------------------------------------------------------------------
// Creative spaces (project spaces) CRUD
// ---------------------------------------------------------------------------

function normalizeCreativeSpacePath(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  let path = value.replace(/\\/g, '/');
  path = path.replace(/\/+/g, '/');
  path = path.replace(/^\/+|\/+$/g, '');
  if (path === '.' || path === '/') return '';
  return path;
}

function buildCreativeSpaceBreadcrumbs(path) {
  const normalized = normalizeCreativeSpacePath(path);
  if (!normalized) return [];
  const segments = normalized.split('/');
  const crumbs = [];
  let acc = '';
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    crumbs.push({ name: seg, path: acc });
  }
  return crumbs;
}

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

// Get a single creative space by id (for detail page / ownership checks)
app.get('/creative-spaces/:spaceId', async (req, res) => {
  const { spaceId } = req.params;
  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /creative-spaces/:spaceId] failed:', err);
    res.status(500).json({ error: 'Failed to fetch creative space' });
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
      `INSERT INTO creative_spaces (
         id, user_id, name, visibility, published
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, userId, 'No name creative space', 'private', false],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/ensure-default] failed:', err);
    res.status(500).json({ error: 'Failed to ensure default creative space' });
  }
});

// Create a new creative space
app.post('/creative-spaces', async (req, res) => {
  const { userId, name, description, path, visibility, published } = req.body ?? {};

  console.error('[POST /creative-spaces] incoming body:', req.body);

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const finalName = trimmedName || 'No name creative space';

  // For now, anything created via API defaults to private/unpublished unless
  // the caller explicitly requests otherwise.
  const vis = typeof visibility === 'string' && visibility.trim() ? visibility.trim() : 'private';
  const pub = Boolean(published) && vis !== 'private';

  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO creative_spaces (
         id, user_id, name, description, path, visibility, published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, userId, finalName, description || null, path || null, vis, pub],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces] failed:', {
      error: err,
      userId,
      name,
      description,
      path,
      visibility,
      published,
    });
    res.status(500).json({ error: 'Failed to create creative space' });
  }
});

// Update (rename / edit) a creative space owned by the user
app.patch('/creative-spaces/:spaceId', async (req, res) => {
  const { spaceId } = req.params;
  const { userId, name, description, path, visibility, published, defaultItemVisibility } =
    req.body ?? {};

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
  if (visibility !== undefined) {
    fields.push(`visibility = $${idx++}`);
    values.push(visibility || 'private');
  }
  if (published !== undefined) {
    fields.push(`published = $${idx++}`);
    values.push(Boolean(published));
  }
  if (defaultItemVisibility !== undefined) {
    fields.push(`default_item_visibility = $${idx++}`);
    values.push(defaultItemVisibility || null);
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
      `INSERT INTO creative_spaces (
         user_id, name, description, path, visibility, published
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        cloneName,
        src.description || null,
        src.path || null,
        src.visibility || 'private',
        src.published || false,
      ],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/:spaceId/clone] failed:', err);
    res.status(500).json({ error: 'Failed to clone creative space' });
  }
});

// ---------------------------------------------------------------------------
// Creative space items (folders/files) within a space
// ---------------------------------------------------------------------------

// List direct child items under a given path within a space
app.get('/creative-spaces/:spaceId/items', async (req, res) => {
  const { spaceId } = req.params;
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  const path = normalizeCreativeSpacePath(rawPath);

  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM creative_space_items WHERE space_id = $1 AND deleted = false',
      [spaceId],
    );

    const items = [];
    for (const row of rows) {
      const rel = normalizeCreativeSpacePath(row.relative_path);
      if (!rel) {
        // We do not expose a synthetic root item for now.
        if (path === '') continue;
      }

      if (path === '') {
        if (!rel.includes('/')) {
          items.push(row);
        }
        continue;
      }

      if (!rel.startsWith(`${path}/`)) continue;
      const remainder = rel.slice(path.length + 1);
      if (!remainder || remainder.includes('/')) continue;
      items.push(row);
    }

    res.json({ path, items, breadcrumbs: buildCreativeSpaceBreadcrumbs(path) });
  } catch (err) {
    console.error('[GET /creative-spaces/:spaceId/items] failed:', err);
    res.status(500).json({ error: 'Failed to list creative space items' });
  }
});

// Create a folder inside a space
app.post('/creative-spaces/:spaceId/items/folder', async (req, res) => {
  const { spaceId } = req.params;
  const { parentPath, name, userId } = req.body ?? {};

  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const base = normalizeCreativeSpacePath(parentPath || '');
  const rawName = typeof name === 'string' ? name.trim() : '';
  const safeName = rawName.replace(/\//g, '');
  if (!safeName) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const relPath = base ? `${base}/${safeName}` : safeName;

  try {
    // Ensure the space exists
    const spaceRes = await pool.query('SELECT visibility FROM creative_spaces WHERE id = $1', [
      spaceId,
    ]);
    if (spaceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = false',
      [spaceId, relPath],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An item with that name already exists in this folder' });
    }

    const visibility = spaceRes.rows[0].visibility || 'private';

    const { rows } = await pool.query(
      `INSERT INTO creative_space_items (
         space_id, relative_path, name, kind, visibility, published, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [spaceId, relPath, safeName, 'folder', visibility, false, String(userId)],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/:spaceId/items/folder] failed:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Create a file metadata entry inside a space
app.post('/creative-spaces/:spaceId/items/file', async (req, res) => {
  const { spaceId } = req.params;
  const { parentPath, name, mimeType, sizeBytes, hash, userId } = req.body ?? {};

  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const base = normalizeCreativeSpacePath(parentPath || '');
  const rawName = typeof name === 'string' ? name.trim() : '';
  const safeName = rawName.replace(/\//g, '');
  if (!safeName) {
    return res.status(400).json({ error: 'File name is required' });
  }

  const relPath = base ? `${base}/${safeName}` : safeName;

  try {
    const spaceRes = await pool.query('SELECT visibility FROM creative_spaces WHERE id = $1', [
      spaceId,
    ]);
    if (spaceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND deleted = false',
      [spaceId, relPath],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An item with that name already exists in this folder' });
    }

    const visibility = spaceRes.rows[0].visibility || 'private';

    const { rows } = await pool.query(
      `INSERT INTO creative_space_items (
         space_id, relative_path, name, kind, mime_type, size_bytes, hash, visibility, published, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        spaceId,
        relPath,
        safeName,
        'file',
        mimeType || null,
        typeof sizeBytes === 'number' ? sizeBytes : null,
        hash || null,
        visibility,
        false,
        String(userId),
      ],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /creative-spaces/:spaceId/items/file] failed:', err);
    res.status(500).json({ error: 'Failed to create file metadata' });
  }
});

// Rename or move an item (and its descendants if it is a folder)
app.patch('/creative-space-items/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const { newName, newParentPath, userId } = req.body ?? {};

  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (newName === undefined && newParentPath === undefined) {
    return res.status(400).json({ error: 'newName or newParentPath must be provided' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingRes = await client.query(
      'SELECT * FROM creative_space_items WHERE id = $1 FOR UPDATE',
      [itemId],
    );
    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const item = existingRes.rows[0];
    const oldRel = normalizeCreativeSpacePath(item.relative_path);

    const currentParent = oldRel.includes('/')
      ? oldRel.slice(0, oldRel.lastIndexOf('/'))
      : '';

    const base =
      newParentPath !== undefined
        ? normalizeCreativeSpacePath(newParentPath || '')
        : currentParent;

    const rawName =
      newName !== undefined && typeof newName === 'string' && newName.trim()
        ? newName.trim()
        : item.name;
    const safeName = rawName.replace(/\//g, '');
    if (!safeName) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item name cannot be empty' });
    }

    const newRel = base ? `${base}/${safeName}` : safeName;

    // Prevent collisions with other live items
    const dupRes = await client.query(
      'SELECT id FROM creative_space_items WHERE space_id = $1 AND relative_path = $2 AND id <> $3 AND deleted = false',
      [item.space_id, newRel, itemId],
    );
    if (dupRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Another item with that name already exists' });
    }

    if (item.kind === 'folder') {
      // Update the folder itself
      await client.query(
        'UPDATE creative_space_items SET relative_path = $1, name = $2, updated_at = now(), updated_by = $3 WHERE id = $4',
        [newRel, safeName, String(userId), itemId],
      );

      const oldPrefix = oldRel ? `${oldRel}/` : '';
      const newPrefix = newRel ? `${newRel}/` : '';
      if (oldPrefix) {
        const childrenRes = await client.query(
          'SELECT id, relative_path FROM creative_space_items WHERE space_id = $1 AND relative_path LIKE $2',
          [item.space_id, `${oldPrefix}%`],
        );
        for (const child of childrenRes.rows) {
          const rel = normalizeCreativeSpacePath(child.relative_path);
          if (!rel.startsWith(oldPrefix)) continue;
          const suffix = rel.slice(oldPrefix.length);
          const updatedRel = newPrefix + suffix;
          await client.query(
            'UPDATE creative_space_items SET relative_path = $1, updated_at = now(), updated_by = $2 WHERE id = $3',
            [updatedRel, String(userId), child.id],
          );
        }
      }
    } else {
      await client.query(
        'UPDATE creative_space_items SET relative_path = $1, name = $2, updated_at = now(), updated_by = $3 WHERE id = $4',
        [newRel, safeName, String(userId), itemId],
      );
    }

    const updatedRes = await client.query('SELECT * FROM creative_space_items WHERE id = $1', [
      itemId,
    ]);
    await client.query('COMMIT');
    res.json(updatedRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /creative-space-items/:itemId] failed:', err);
    res.status(500).json({ error: 'Failed to update item' });
  } finally {
    client.release();
  }
});

// Soft-delete (or hard-delete) an item and its descendants when it is a folder
app.delete('/creative-space-items/:itemId', async (req, res) => {
  const { itemId } = req.params;
  const hard = String(req.query.hard ?? '').toLowerCase() === 'true';

  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingRes = await client.query(
      'SELECT * FROM creative_space_items WHERE id = $1 FOR UPDATE',
      [itemId],
    );
    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    const item = existingRes.rows[0];
    const rel = normalizeCreativeSpacePath(item.relative_path);

    if (hard) {
      if (item.kind === 'folder' && rel) {
        await client.query(
          'DELETE FROM creative_space_items WHERE space_id = $1 AND (id = $2 OR relative_path LIKE $3)',
          [item.space_id, itemId, `${rel}/%`],
        );
      } else {
        await client.query('DELETE FROM creative_space_items WHERE id = $1', [itemId]);
      }
    } else {
      if (item.kind === 'folder' && rel) {
        await client.query(
          'UPDATE creative_space_items SET deleted = true, updated_at = now() WHERE space_id = $1 AND (id = $2 OR relative_path LIKE $3)',
          [item.space_id, itemId, `${rel}/%`],
        );
      } else {
        await client.query(
          'UPDATE creative_space_items SET deleted = true, updated_at = now() WHERE id = $1',
          [itemId],
        );
      }
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DELETE /creative-space-items/:itemId] failed:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  } finally {
    client.release();
  }
});

// Web  desktop sync listing for creative spaces
app.get('/creative-spaces/:spaceId/sync', async (req, res) => {
  const { spaceId } = req.params;
  const sinceRaw = typeof req.query.since === 'string' ? req.query.since : null;

  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }

  try {
    const spaceRes = await pool.query('SELECT * FROM creative_spaces WHERE id = $1', [spaceId]);
    if (spaceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }

    const params = [spaceId];
    let where = 'space_id = $1';

    if (sinceRaw) {
      const since = new Date(sinceRaw);
      if (!Number.isNaN(since.getTime())) {
        where += ' AND updated_at > $2';
        params.push(since);
      }
    }

    const itemsRes = await pool.query(
      `SELECT * FROM creative_space_items WHERE ${where} ORDER BY updated_at ASC`,
      params,
    );

    return res.json({ space: spaceRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('[GET /creative-spaces/:spaceId/sync] failed:', err);
    return res.status(500).json({ error: 'Failed to load creative space changes' });
  }
});

// Desktop  web snapshot sync for creative spaces
app.post('/creative-spaces/:spaceId/sync', async (req, res) => {
  const { spaceId } = req.params;
  const { userId, snapshotGeneratedAt, items } = req.body ?? {};

  if (!spaceId) {
    return res.status(400).json({ error: 'spaceId is required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items[] snapshot is required' });
  }

  let spaceRow;
  try {
    const spaceRes = await pool.query(
      'SELECT id, user_id, visibility FROM creative_spaces WHERE id = $1',
      [spaceId],
    );
    if (spaceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Creative space not found' });
    }
    spaceRow = spaceRes.rows[0];
    if (String(spaceRow.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'You do not own this creative space' });
    }
  } catch (err) {
    console.error('[POST /creative-spaces/:spaceId/sync] failed to load space:', err);
    return res.status(500).json({ error: 'Failed to prepare sync' });
  }

  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  let deletedCount = 0;

  try {
    await client.query('BEGIN');

    for (const raw of items) {
      if (!raw || typeof raw.relativePath !== 'string') continue;
      const rel = normalizeCreativeSpacePath(raw.relativePath);
      if (!rel) continue;

      const kind = raw.kind === 'folder' ? 'folder' : 'file';
      const name = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
      const sizeBytes =
        typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes)
          ? raw.sizeBytes
          : null;
      const hash = typeof raw.hash === 'string' && raw.hash ? raw.hash : null;
      const isDeleted = Boolean(raw.deleted);

      const existingRes = await client.query(
        'SELECT id, kind, size_bytes, hash, deleted FROM creative_space_items WHERE space_id = $1 AND relative_path = $2',
        [spaceId, rel],
      );

      if (isDeleted) {
        if (existingRes.rows.length > 0) {
          await client.query(
            'UPDATE creative_space_items SET deleted = true, updated_at = now(), updated_by = $1 WHERE space_id = $2 AND relative_path = $3',
            [String(userId), spaceId, rel],
          );
          deletedCount += 1;
        }
        continue;
      }

      if (existingRes.rows.length === 0) {
        await client.query(
          `INSERT INTO creative_space_items (
             space_id, relative_path, name, kind, size_bytes, hash, visibility, published, deleted, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)`,
          [
            spaceId,
            rel,
            name,
            kind,
            sizeBytes,
            hash,
            spaceRow.visibility || 'private',
            false,
            String(userId),
          ],
        );
        created += 1;
      } else {
        const ex = existingRes.rows[0];
        const exSize = ex.size_bytes == null ? null : Number(ex.size_bytes);
        const exHash = ex.hash == null ? null : String(ex.hash);
        const needsUpdate =
          ex.kind !== kind || exSize !== sizeBytes || exHash !== hash || ex.deleted === true;

        if (needsUpdate) {
          await client.query(
            `UPDATE creative_space_items
               SET kind = $1,
                   size_bytes = $2,
                   hash = $3,
                   name = $4,
                   deleted = false,
                   updated_at = now(),
                   updated_by = $5
             WHERE space_id = $6 AND relative_path = $7`,
            [kind, sizeBytes, hash, name, String(userId), spaceId, rel],
          );
          updated += 1;
        }
      }
    }

    await client.query(
      'UPDATE creative_spaces SET last_synced_at = now(), sync_state = $1, updated_at = now() WHERE id = $2',
      ['idle', spaceId],
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      spaceId,
      created,
      updated,
      deleted: deletedCount,
      snapshotGeneratedAt: snapshotGeneratedAt || null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /creative-spaces/:spaceId/sync] failed:', err);
    return res.status(500).json({ error: 'Failed to sync creative space snapshot' });
  } finally {
    client.release();
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

// Helper to compute word count in SQL-compatible way for raw text
function countWordsFromText(text) {
  if (!text) return 0;
  const cleaned = String(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

// Helper: map DB contribution_status -> frontend-friendly status label
function mapDbStatusToFrontend(status) {
  if (status === 'rejected') return 'denied';
  return status || 'approved';
}

// List contributions for a story from the dedicated contributions table.
// Falls back to legacy aggregation if no rows exist yet, and seeds the
// contributions table best-effort so future reads are cheaper.
app.get('/stories/:storyTitleId/contributions', async (req, res) => {
  const { storyTitleId } = req.params;

  try {
    // First, try to read from the contributions table.
    const { rows: contribRows } = await pool.query(
      `SELECT c.*, st.title AS story_title, s.chapter_title
       FROM contributions c
       LEFT JOIN story_title st ON st.story_title_id = c.story_title_id
       LEFT JOIN stories s ON s.chapter_id = c.chapter_id
       WHERE c.story_title_id = $1
       ORDER BY c.created_at DESC, c.paragraph_index ASC`,
      [storyTitleId],
    );

    let rows = contribRows;

    if (rows.length === 0) {
      // Legacy fallback: derive contributions from revisions and legacy
      // contributor chapters, mark them as approved, and seed the
      // contributions table for this story.
      const { rows: legacyRows } = await pool.query(
        `WITH paragraph_contribs AS (
           SELECT
             cr.id::text AS id,
             s.story_title_id,
             s.chapter_id,
             st.title AS story_title,
             s.chapter_title,
             (t.idx - 1) AS paragraph_index,
             t.paragraph_text AS new_paragraph,
             cr.created_at,
             cr.revision_number,
             cr.created_by     AS author_user_id
           FROM chapter_revisions cr
           JOIN stories s ON s.chapter_id = cr.chapter_id
           JOIN story_title st ON st.story_title_id = s.story_title_id
           CROSS JOIN LATERAL unnest(cr.new_paragraphs) WITH ORDINALITY AS t(paragraph_text, idx)
           WHERE s.story_title_id = $1

           UNION ALL

           SELECT
             ('chapter-' || s.chapter_id::text || '-' || t.idx)::text AS id,
             s.story_title_id,
             s.chapter_id,
             st.title AS story_title,
             s.chapter_title,
             (t.idx - 1) AS paragraph_index,
             t.paragraph_text AS new_paragraph,
             s.created_at AS created_at,
             0::integer AS revision_number,
             s.contributor_id AS author_user_id
           FROM stories s
           JOIN story_title st ON st.story_title_id = s.story_title_id
           CROSS JOIN LATERAL unnest(s.paragraphs) WITH ORDINALITY AS t(paragraph_text, idx)
           WHERE s.story_title_id = $1
             AND s.contributor_id IS NOT NULL
         )
         SELECT * FROM paragraph_contribs
         ORDER BY created_at DESC, revision_number DESC, paragraph_index ASC`,
        [storyTitleId],
      );

      rows = legacyRows.map((row) => ({
        id: row.id,
        story_title_id: row.story_title_id,
        chapter_id: row.chapter_id,
        branch_id: null,
        paragraph_index: row.paragraph_index,
        target_type: 'paragraph',
        source: 'legacy-backfill',
        source_id: row.id,
        author_user_id: row.author_user_id,
        status: 'approved',
        words: countWordsFromText(row.new_paragraph),
        created_at: row.created_at,
        story_title: row.story_title,
        chapter_title: row.chapter_title,
        new_paragraph: row.new_paragraph,
      }));

      // Also include existing proposals for this story as contributions so
      // undecided/declined/approved proposals appear in the Contributions
      // tab. This is a one-time backfill for stories that predate the
      // dedicated contributions table.
      try {
        const { rows: proposalRows } = await pool.query(
          `SELECT p.id::text,
                  p.story_title_id,
                  p.target_chapter_id,
                  st.title AS story_title,
                  s.chapter_title,
                  p.target_type,
                  p.target_path,
                  p.proposed_text,
                  p.created_at,
                  p.author_user_id,
                  p.status
           FROM crdt_proposals p
           LEFT JOIN stories s ON s.chapter_id = p.target_chapter_id
           LEFT JOIN story_title st ON st.story_title_id = p.story_title_id
           WHERE p.story_title_id = $1`,
          [storyTitleId],
        );

        for (const p of proposalRows) {
          let paragraphIndex = null;
          if (p.target_type === 'paragraph' && typeof p.target_path === 'string') {
            const parsed = parseInt(p.target_path, 10);
            if (!Number.isNaN(parsed)) paragraphIndex = parsed;
          }

          const status =
            p.status === 'declined'
              ? 'rejected'
              : p.status === 'approved'
              ? 'approved'
              : 'undecided';

          rows.push({
            id: p.id,
            story_title_id: p.story_title_id,
            chapter_id: p.target_chapter_id,
            branch_id: null,
            paragraph_index: paragraphIndex,
            target_type: p.target_type,
            source: 'proposal-backfill',
            source_id: p.id,
            author_user_id: p.author_user_id,
            status,
            words: countWordsFromText(p.proposed_text),
            created_at: p.created_at,
            story_title: p.story_title,
            chapter_title: p.chapter_title,
            new_paragraph: p.proposed_text,
          });
        }
      } catch (propErr) {
        console.error('[GET /stories/:storyTitleId/contributions] failed to backfill proposals', propErr);
      }

      // Best-effort: seed contributions table with these rows.
      try {
        for (const row of rows) {
          await pool.query(
            `INSERT INTO contributions
               (id, story_title_id, chapter_id, branch_id, paragraph_index, target_type, source, source_id, author_user_id, status, words, new_paragraph, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::contribution_status, $11, $12, $13)
             ON CONFLICT (id) DO NOTHING`,
            [
              row.id,
              row.story_title_id,
              row.chapter_id,
              row.branch_id,
              row.paragraph_index,
              row.target_type,
              row.source,
              row.source_id,
              row.author_user_id,
              row.status,
              row.words,
              row.new_paragraph,
              row.created_at,
            ],
          );
        }
      } catch (seedErr) {
        console.error('[GET /stories/:storyTitleId/contributions] failed to seed contributions table', seedErr);
      }
    }

    // Attach reactions and comment counts
    const { rows: reactions } = await pool.query(
      `SELECT chapter_id, paragraph_index,
              COUNT(*) FILTER (WHERE reaction_type = 'like') AS likes,
              COUNT(*) FILTER (WHERE reaction_type = 'dislike') AS dislikes
       FROM reactions
       WHERE story_title_id = $1
       GROUP BY chapter_id, paragraph_index`,
      [storyTitleId],
    );
    const { rows: comments } = await pool.query(
      `SELECT chapter_id, paragraph_index, COUNT(*) AS comments
       FROM comments
       WHERE story_title_id = $1
       GROUP BY chapter_id, paragraph_index`,
      [storyTitleId],
    );

    const reactionKey = (r) => `${r.chapter_id ?? 'null'}:${r.paragraph_index ?? 'null'}`;
    const reactionMap = new Map(reactions.map((r) => [reactionKey(r), r]));
    const commentMap = new Map(comments.map((c) => [reactionKey(c), c]));

    const response = rows.map((row) => {
      const key = reactionKey(row);
      const r = reactionMap.get(key);
      const c = commentMap.get(key);
      return {
        id: row.id,
        story_title: row.story_title,
        chapter_title: row.chapter_title,
        paragraph_index: row.paragraph_index,
        new_paragraph: row.new_paragraph,
        created_at: row.created_at,
        revision_number: row.revision_number ?? 0,
        user_email: row.author_email || row.user_email || null,
        words: row.words ?? countWordsFromText(row.new_paragraph),
        likes: r ? Number(r.likes) : 0,
        dislikes: r ? Number(r.dislikes) : 0,
        comments: c ? Number(c.comments) : 0,
        status: mapDbStatusToFrontend(row.status || 'approved'),
      };
    });

    res.json(response);
  } catch (err) {
    console.error('[GET /stories/:storyTitleId/contributions] failed:', err);
    res.status(500).json({
      error: 'Failed to fetch story contributions',
      details: err?.message || String(err),
    });
  }
});

// List contributions for a user across all stories. We primarily match by
// author_user_id, but also allow an optional email hint so that existing
// rows can still be found even if the caller only knows the email.
app.get('/users/:userId/contributions', async (req, res) => {
  const { userId } = req.params;
  const { status, email } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const params = [userId, email || null];
    let where = '(c.author_user_id = $1 OR ($2::text IS NOT NULL AND u.email = $2))';

    if (status && typeof status === 'string') {
      params.push(status);
      where += ' AND c.status = $3::contribution_status';
    }

    const { rows } = await pool.query(
      `SELECT c.*, st.title AS story_title, s.chapter_title
       FROM contributions c
       LEFT JOIN story_title st ON st.story_title_id = c.story_title_id
       LEFT JOIN stories s ON s.chapter_id = c.chapter_id
       LEFT JOIN local_users u ON u.id = c.author_user_id
       WHERE ${where}
       ORDER BY c.created_at DESC, c.paragraph_index ASC
       LIMIT 500`,
      params,
    );

    const response = rows.map((row) => ({
      id: row.id,
      story_title: row.story_title,
      chapter_title: row.chapter_title,
      paragraph_index: row.paragraph_index,
      new_paragraph: row.new_paragraph,
      created_at: row.created_at,
      words: row.words,
      likes: 0,
      dislikes: 0,
      comments: 0,
      status: mapDbStatusToFrontend(row.status),
    }));

    res.json(response);
  } catch (err) {
    console.error('[GET /users/:userId/contributions] failed:', err);
    res.status(500).json({ error: 'Failed to fetch user contributions' });
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
  const {
    userId,
    storyTitleId,
    chapterId,
    paragraphIndex,
    screenplayId,
    screenplaySceneId,
    reactionType,
  } = req.body ?? {};

  if (!userId || !reactionType) {
    return res.status(400).json({ error: 'userId and reactionType are required' });
  }

  const hasStoryFields = !!storyTitleId || !!chapterId;
  const hasScreenplayFields = !!screenplayId || !!screenplaySceneId;

  if (hasStoryFields && hasScreenplayFields) {
    return res.status(400).json({
      error: 'Provide either storyTitleId/chapterId or screenplayId/screenplaySceneId, not both',
    });
  }

  if (!hasStoryFields && !hasScreenplayFields) {
    return res.status(400).json({
      error: 'storyTitleId/chapterId or screenplayId/screenplaySceneId is required',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Helper to implement toggle/update semantics for a given WHERE clause
    const handleToggle = async (whereSql, whereParams) => {
      const selectSql = `SELECT id, reaction_type FROM reactions WHERE user_id = $1 AND ${whereSql} ORDER BY id ASC`;
      const { rows } = await client.query(selectSql, [userId, ...whereParams]);

      if (rows.length > 0) {
        const existing = rows[0];
        if (existing.reaction_type === reactionType) {
          // Same reaction clicked again -> remove (toggle off)
          await client.query('DELETE FROM reactions WHERE id = $1', [existing.id]);
        } else {
          // Switch like <-> dislike
          await client.query(
            'UPDATE reactions SET reaction_type = $1 WHERE id = $2',
            [reactionType, existing.id],
          );
        }

        // Clean up any stray duplicates for this user/target
        if (rows.length > 1) {
          const extraIds = rows.slice(1).map((r) => r.id);
          await client.query('DELETE FROM reactions WHERE id = ANY($1::uuid[])', [extraIds]);
        }
      } else {
        // No existing reaction for this user/target -> insert new
        await client.query(
          `INSERT INTO reactions (user_id, story_title_id, chapter_id, paragraph_index, screenplay_id, screenplay_scene_id, reaction_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            storyTitleId || null,
            chapterId || null,
            paragraphIndex ?? null,
            screenplayId || null,
            screenplaySceneId || null,
            reactionType,
          ],
        );
      }
    };

    if (hasStoryFields) {
      // Story/chapter reactions: match on story_title_id + chapter_id + paragraph_index
      const whereSql =
        'COALESCE(story_title_id::text, \'\') = COALESCE($2::text, \'\') AND COALESCE(chapter_id::text, \'\') = COALESCE($3::text, \'\') AND COALESCE(paragraph_index, -1) = COALESCE($4, -1) AND screenplay_id IS NULL AND screenplay_scene_id IS NULL';
      const whereParams = [storyTitleId || null, chapterId || null, paragraphIndex ?? null];
      await handleToggle(whereSql, whereParams);
    } else {
      // Screenplay/scene reactions: match on screenplay_id + screenplay_scene_id
      if (!screenplayId) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ error: 'screenplayId is required for screenplay reactions' });
      }

      const whereSql =
        'COALESCE(screenplay_id::text, \'\') = COALESCE($2::text, \'\') AND COALESCE(screenplay_scene_id::text, \'\') = COALESCE($3::text, \'\') AND story_title_id IS NULL AND chapter_id IS NULL';
      const whereParams = [screenplayId || null, screenplaySceneId || null];
      await handleToggle(whereSql, whereParams);
    }

    await client.query('COMMIT');
    return res.status(201).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /reactions] failed:', err);
    res.status(500).json({ error: 'Failed to record reaction' });
  } finally {
    client.release();
  }
});

app.get('/reactions', async (req, res) => {
  const { storyTitleId, chapterId, screenplayId, screenplaySceneId } = req.query;

  const hasStory = !!storyTitleId || !!chapterId;
  const hasScreenplay = !!screenplayId || !!screenplaySceneId;

  if ((hasStory && hasScreenplay) || (!hasStory && !hasScreenplay)) {
    return res.status(400).json({
      error: 'Provide storyTitleId/chapterId or (screenplayId/screenplaySceneId)',
    });
  }

  let where = '';
  let param = null;

  if (hasStory) {
    if (chapterId) {
      where = 'chapter_id = $1';
      param = chapterId;
    } else {
      where = 'story_title_id = $1';
      param = storyTitleId;
    }
  } else if (screenplaySceneId) {
    where = 'screenplay_scene_id = $1';
    param = screenplaySceneId;
  } else {
    where = 'screenplay_id = $1';
    param = screenplayId;
  }

  try {
    const { rows } = await pool.query(
      `SELECT reaction_type, COUNT(*) as count
       FROM reactions
       WHERE ${where}
       GROUP BY reaction_type`,
      [param],
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

    const proposal = rows[0];

    // Best-effort: create a matching contribution row so profile/story
    // views can show this proposal under the "undecided" tab.
    try {
      let paragraphIndex = null;
      if (targetType === 'paragraph' && typeof targetPath === 'string') {
        const parsed = parseInt(targetPath, 10);
        if (!Number.isNaN(parsed)) paragraphIndex = parsed;
      }

      const words = countWordsFromText(proposedText);
      await pool.query(
        `INSERT INTO contributions
           (story_title_id, chapter_id, branch_id, paragraph_index, target_type, source, source_id, author_user_id, status, words, new_paragraph, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'undecided', $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          storyTitleId,
          targetChapterId || null,
          targetBranchId || null,
          paragraphIndex,
          targetType,
          'proposal',
          String(proposal.id),
          authorUserId,
          words,
          proposedText,
          proposal.created_at,
        ],
      );
    } catch (contribErr) {
      console.error('[POST /stories/:storyTitleId/proposals] failed to record contribution', contribErr);
    }

    res.status(201).json(proposal);
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

      // Best-effort: mark related contribution as approved.
      try {
        await client.query(
          `UPDATE contributions
           SET status = 'approved'
           WHERE source = 'proposal' AND source_id = $1`,
          [proposalId],
        );
      } catch (contribErr) {
        console.error('[POST /proposals/:proposalId/approve] failed to update contribution status', contribErr);
      }

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

    // Best-effort: mark related contribution as rejected.
    try {
      await pool.query(
        `UPDATE contributions
         SET status = 'rejected'
         WHERE source = 'proposal' AND source_id = $1`,
        [proposalId],
      );
    } catch (contribErr) {
      console.error('[POST /proposals/:proposalId/decline] failed to update contribution status', contribErr);
    }

    res.status(204).send();
  } catch (err) {
    console.error('[POST /proposals/:proposalId/decline] failed:', err);
    res.status(500).json({ error: 'Failed to decline proposal' });
  }
});

// Comments
app.post('/comments', async (req, res) => {
  const {
    userId,
    storyTitleId,
    screenplayId,
    chapterId,
    screenplaySceneId,
    paragraphIndex,
    body,
    parentCommentId,
  } = req.body ?? {};

  if (!userId || !body) {
    return res
      .status(400)
      .json({ error: 'userId and body are required to post a comment' });
  }

  const hasStoryFields = !!storyTitleId || !!chapterId;
  const hasScreenplayFields = !!screenplayId || !!screenplaySceneId;

  if (hasStoryFields && hasScreenplayFields) {
    return res.status(400).json({
      error: 'Provide either storyTitleId/chapterId or screenplayId/screenplaySceneId, not both',
    });
  }

  if (!hasStoryFields && !hasScreenplayFields) {
    return res.status(400).json({
      error: 'storyTitleId/chapterId or screenplayId/screenplaySceneId is required',
    });
  }

  try {
    // Story comments (optionally chapter/paragraph scoped)
    if (hasStoryFields) {
      let finalStoryTitleId = storyTitleId || null;

      // If only chapterId is provided, derive story_title_id from stories
      if (!finalStoryTitleId && chapterId) {
        try {
          const lookup = await pool.query(
            'SELECT story_title_id FROM stories WHERE chapter_id = $1',
            [chapterId],
          );
          if (lookup.rows.length > 0) {
            finalStoryTitleId = lookup.rows[0].story_title_id;
          }
        } catch (lookupErr) {
          console.error('[POST /comments] failed to derive story_title_id from chapterId:', lookupErr);
        }
      }

      if (!finalStoryTitleId) {
        return res.status(400).json({
          error: 'storyTitleId is required for story comments (directly or via chapterId lookup)',
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO comments (user_id, story_title_id, chapter_id, paragraph_index, body, parent_comment_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          userId,
          finalStoryTitleId,
          chapterId || null,
          paragraphIndex ?? null,
          body,
          parentCommentId || null,
        ],
      );
      return res.status(201).json(rows[0]);
    }

    // Screenplay comments (optionally scene-scoped). We require screenplayId
    // explicitly so callers cannot accidentally attach comments to a scene
    // from the wrong screenplay.
    if (!screenplayId) {
      return res
        .status(400)
        .json({ error: 'screenplayId is required for screenplay comments' });
    }

    const { rows } = await pool.query(
      `INSERT INTO comments (user_id, screenplay_id, screenplay_scene_id, chapter_id, paragraph_index, body, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        screenplayId,
        screenplaySceneId || null,
        chapterId || null,
        paragraphIndex ?? null,
        body,
        parentCommentId || null,
      ],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /comments] failed:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.get('/comments', async (req, res) => {
  const { storyTitleId, screenplayId, chapterId, screenplaySceneId } = req.query;

  const hasStoryFields = !!storyTitleId || !!chapterId;
  const hasScreenplayFields = !!screenplayId || !!screenplaySceneId;

  if (hasStoryFields && hasScreenplayFields) {
    return res.status(400).json({
      error: 'Provide either storyTitleId/chapterId or screenplayId/screenplaySceneId, not both',
    });
  }

  if (!hasStoryFields && !hasScreenplayFields) {
    return res.status(400).json({
      error: 'storyTitleId, chapterId, screenplayId, or screenplaySceneId is required',
    });
  }

  let where = '';
  let params = [];

  if (hasStoryFields) {
    if (chapterId) {
      where = 'chapter_id = $1';
      params = [chapterId];
    } else {
      where = 'story_title_id = $1';
      params = [storyTitleId];
    }
  } else if (hasScreenplayFields) {
    if (screenplaySceneId) {
      where = 'screenplay_scene_id = $1';
      params = [screenplaySceneId];
    } else {
      where = 'screenplay_id = $1';
      params = [screenplayId];
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM comments
       WHERE ${where}
       ORDER BY created_at ASC`,
      params,
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
  const { userId, title, metadata, chapters, bodyType, creativeSpaceId, spaceId } = req.body ?? {};

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
      'SELECT story_title_id, title, creator_id, genre, tags, creative_space_id FROM story_title WHERE story_title_id = $1 FOR UPDATE',
      [storyTitleId],
    );
    if (storyRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Story not found' });
    }

    const storyRow = storyRes.rows[0];
    const creatorId = storyRow.creator_id;

    // Optional Space-aware association: if the desktop client provided a
    // candidate creative Space for this story, adopt it on first sync. If the
    // story is already linked to a different Space, log but keep the existing
    // association to avoid surprising users.
    const candidateSpaceId = (creativeSpaceId || spaceId || null) && String(creativeSpaceId || spaceId);
    if (candidateSpaceId) {
      try {
        if (!storyRow.creative_space_id) {
          const spaceCheck = await client.query(
            'SELECT id FROM creative_spaces WHERE id = $1',
            [candidateSpaceId],
          );
          if (spaceCheck.rows.length > 0) {
            await client.query(
              'UPDATE story_title SET creative_space_id = $1 WHERE story_title_id = $2',
              [candidateSpaceId, storyTitleId],
            );
          } else {
            console.warn(
              '[POST /story-titles/:storyTitleId/sync-desktop] provided creativeSpaceId does not exist',
              { storyTitleId, creativeSpaceId: candidateSpaceId },
            );
          }
        } else if (String(storyRow.creative_space_id) !== String(candidateSpaceId)) {
          console.warn(
            '[POST /story-titles/:storyTitleId/sync-desktop] story already linked to different creative_space_id',
            {
              storyTitleId,
              existingSpaceId: storyRow.creative_space_id,
              requestedSpaceId: candidateSpaceId,
            },
          );
        }
      } catch (spaceErr) {
        console.error('[POST /story-titles/:storyTitleId/sync-desktop] failed to update creative_space_id:', spaceErr);
      }
    }

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
  const { userId, targetSpaceId } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'userId is required to clone a story' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceTitleRes = await client.query(
      'SELECT story_title_id, title, visibility, published, creative_space_id FROM story_title WHERE story_title_id = $1',
      [storyTitleId],
    );
    if (sourceTitleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Source story not found' });
    }
    const src = sourceTitleRes.rows[0];

    // Decide which Space (if any) the cloned story should belong to.
    let newCreativeSpaceId = src.creative_space_id || null;

    if (targetSpaceId) {
      const spaceCheck = await client.query(
        'SELECT id FROM creative_spaces WHERE id = $1',
        [targetSpaceId],
      );
      if (spaceCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Target Creative Space not found' });
      }
      newCreativeSpaceId = targetSpaceId;
    }

    const insertTitleRes = await client.query(
      'INSERT INTO story_title (title, creator_id, visibility, published, creative_space_id) VALUES ($1, $2, $3, $4, $5) RETURNING story_title_id, title, visibility, published, creative_space_id',
      [src.title, userId, src.visibility ?? 'public', src.published ?? true, newCreativeSpaceId],
    );
    const newTitle = insertTitleRes.rows[0];

    // Track cloned story membership in story_spaces as primary when we know
    // which Space should own it.
    if (newCreativeSpaceId) {
      try {
        await client.query(
          `INSERT INTO story_spaces (story_title_id, space_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (story_title_id, space_id)
           DO UPDATE SET role = COALESCE(EXCLUDED.role, story_spaces.role), updated_at = now()`,
          [newTitle.story_title_id, newCreativeSpaceId, 'primary'],
        );
      } catch (errSpaces) {
        console.error('[POST /stories/:storyTitleId/clone] failed to upsert story_spaces for clone:', errSpaces);
      }
    }

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
