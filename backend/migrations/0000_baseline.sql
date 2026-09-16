-- Baseline migration — introduces backend/scripts/migrate.js's versioned
-- migration mechanism on top of a schema that, until now, was built by the
-- ensure*() functions in backend/src/server.js (and a handful of sibling
-- modules) running fire-and-forget on every process boot.
--
-- Every statement below is copied verbatim from those ensure*() functions,
-- in their original boot-time call order, and every one already guards
-- itself with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / a DO $$ existence
-- check. That means this file is a safe no-op against the current
-- production database (which already has every table/column below) and,
-- on a database that already has the pre-existing *base* schema (see note
-- below), builds the rest of the schema from scratch.
--
-- Note on scope: local_users, story_title, stories, profiles, comments,
-- reactions, and the app_role enum are NOT created anywhere in this
-- codebase — they predate the ensure*() pattern itself and were never
-- captured as code. This migration does not create them either, and a
-- database that doesn't already have them will fail here on a foreign-key
-- reference, exactly as the old ensure*() boot sequence already would have.
-- That's a pre-existing gap, not a regression introduced by this file.
--
-- Going forward, DO NOT add new ensure*() functions to server.js — add a
-- new backend/migrations/NNNN_description.sql file instead. See CLAUDE.md.

-- === ensurePgcryptoExtension (server.js) ===
-- Several tables below rely on gen_random_uuid(), which pgcrypto provides.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- === ensureStoryAccessTable (server.js) ===
CREATE TABLE IF NOT EXISTS story_access (
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_title_id, user_id)
);

-- === ensureStoryGalleryImagesTable (gallery.js) ===
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
);
CREATE INDEX IF NOT EXISTS story_gallery_images_story_status_idx ON story_gallery_images (story_title_id, status);

-- === ensureComicTables (comics.js) ===
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
);
CREATE TABLE IF NOT EXISTS comic_page (
  page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  page_index integer NOT NULL,
  image_url text NOT NULL,
  alt_text text,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comic_page_comic_index_idx ON comic_page (comic_id, page_index);
CREATE TABLE IF NOT EXISTS comic_access (
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'contributor',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comic_id, user_id)
);

-- === ensureStoryTitlePublishedColumn (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

-- === ensureStoryTitleGenreAndTagsColumns (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS tags text[];

-- === ensureStoryTitleUpdatedAtColumn (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === ensureStoryControlColumns (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'draft';
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS clone_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS export_policy text NOT NULL DEFAULT 'anyone';

-- === ensureStoryLanguageAndCoverColumns (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- === ensureGroupsTables (server.js) ===
CREATE TABLE IF NOT EXISTS user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  is_platform_group boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_group_members (
  group_id uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- === ensureStoryAccessRulesTable (server.js) ===
CREATE TABLE IF NOT EXISTS story_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  grantee_user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
  grantee_group_id uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_grantee CHECK (
    (grantee_user_id IS NOT NULL AND grantee_group_id IS NULL) OR
    (grantee_user_id IS NULL AND grantee_group_id IS NOT NULL)
  )
);

-- === ensureAuthorsTable (server.js) ===
-- Mapping tables for desktop story metadata.
-- Per spec:
-- - author_id is stored in table `authors`
-- - initiator_id is stored in table `story_initiators`
-- Both tables have creator_id as their primary key.
CREATE TABLE IF NOT EXISTS authors (
  creator_id uuid PRIMARY KEY REFERENCES local_users(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- === ensureStoryInitiatorsTable (server.js) ===
CREATE TABLE IF NOT EXISTS story_initiators (
  creator_id uuid PRIMARY KEY REFERENCES local_users(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- === ensureParagraphBranchesTable (server.js) ===
-- Paragraph branches table for story paragraph branching (moved from Supabase)
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
);

-- === ensureProfilesRealNicknameColumn (server.js) ===
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS real_nickname text;

-- === ensureProfilePageNameColumn (server.js) ===
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_page_name text;
-- Copy existing nickname data into the new column for rows that haven't been migrated yet.
UPDATE profiles SET profile_page_name = nickname WHERE nickname IS NOT NULL AND profile_page_name IS NULL;

-- === ensureProfilesVisibilityColumns (server.js) ===
-- Legacy boolean flags used by older frontends; kept for backward
-- compatibility alongside the newer per-container visibility fields below.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_stories boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_screenplays boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_favorites boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_living boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_public_lived boolean DEFAULT true;
-- Fine-grained per-container visibility controls: public / private / friends-only / selected-users-only.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorites_visibility text DEFAULT 'public';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS living_visibility text DEFAULT 'public';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lived_visibility text DEFAULT 'public';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stories_visibility text DEFAULT 'public';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS screenplays_visibility text DEFAULT 'public';
-- Selected-users-only audiences for each container (gating enforced in the web layer).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorites_selected_user_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS living_selected_user_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lived_selected_user_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stories_selected_user_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS screenplays_selected_user_ids uuid[] DEFAULT '{}'::uuid[];

-- === ensureProfilesSocialOtherLinksColumn (server.js) ===
-- JSONB column for multiple social links with name+address.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_other_links jsonb DEFAULT '[]'::jsonb;

-- === ensureLocalesTable (server.js) ===
-- Dedicated locales table to keep a single authoritative list of supported
-- interface languages across the web platform and the desktop editor.
CREATE TABLE IF NOT EXISTS locales (
  code         text PRIMARY KEY,
  english_name text NOT NULL,
  native_name  text,
  direction    text NOT NULL DEFAULT 'ltr',
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO locales (code, english_name, native_name, direction) VALUES
  ('en', 'English', 'English', 'ltr'),
  ('ru', 'Russian', 'Русский', 'ltr'),
  ('pt', 'Portuguese', 'Português', 'ltr'),
  ('kr', 'Korean', '한국어', 'ltr'),
  ('ar', 'Arabic', 'العربية', 'rtl'),
  ('zh-Hans', 'Chinese (Simplified)', '简体中文', 'ltr'),
  ('zh-Hant', 'Chinese (Traditional)', '繁體中文', 'ltr'),
  ('ja', 'Japanese', '日本語', 'ltr'),
  ('fr', 'French', 'Français', 'ltr'),
  ('es', 'Spanish', 'Español', 'ltr'),
  ('de', 'German', 'Deutsch', 'ltr'),
  ('hi', 'Hindi', 'हिन्दी', 'ltr'),
  ('other', 'Other', 'Other', 'ltr')
ON CONFLICT (code) DO UPDATE
SET english_name = EXCLUDED.english_name,
    native_name  = EXCLUDED.native_name,
    direction    = EXCLUDED.direction,
    updated_at   = now();
-- Remove the legacy "zh" (unspecified script) locale — Simplified and Traditional are sufficient.
UPDATE locales SET enabled = false, updated_at = now() WHERE code = 'zh';

-- === ensureCrdtDocumentsTables (server.js) ===
-- CRDT document catalog: maps a chapter/scene/story-title/screenplay-title
-- to an automerge-repo DocumentId (doc_key). Real-time sync, history, and
-- restore are implemented in src/crdt/repo.js and src/crdt/postgresStorageAdapter.js
-- — this migration only owns table/column bootstrapping.
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
);
CREATE INDEX IF NOT EXISTS crdt_documents_story_idx ON crdt_documents(story_title_id);
CREATE INDEX IF NOT EXISTS crdt_documents_chapter_idx ON crdt_documents(chapter_id);
CREATE INDEX IF NOT EXISTS crdt_documents_branch_idx ON crdt_documents(branch_id);
-- Real-time collaboration extension: chapter/story_title docs above
-- predate screenplays. Nullable FKs let a crdt_documents row also
-- catalog a screenplay scene or screenplay title doc.
ALTER TABLE crdt_documents ADD COLUMN IF NOT EXISTS screenplay_id uuid NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE;
ALTER TABLE crdt_documents ADD COLUMN IF NOT EXISTS scene_id uuid NULL REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS crdt_documents_screenplay_idx ON crdt_documents(screenplay_id);
CREATE INDEX IF NOT EXISTS crdt_documents_scene_idx ON crdt_documents(scene_id);
-- One live doc per entity: prevents POST /crdt/docs/ensure from racing
-- itself into two docs for the same chapter/scene/title.
CREATE UNIQUE INDEX IF NOT EXISTS crdt_documents_chapter_unique ON crdt_documents(chapter_id) WHERE doc_type = 'chapter';
CREATE UNIQUE INDEX IF NOT EXISTS crdt_documents_scene_unique ON crdt_documents(scene_id) WHERE doc_type = 'scene';
CREATE UNIQUE INDEX IF NOT EXISTS crdt_documents_story_title_unique ON crdt_documents(story_title_id) WHERE doc_type = 'story_title';
CREATE UNIQUE INDEX IF NOT EXISTS crdt_documents_screenplay_title_unique ON crdt_documents(screenplay_id) WHERE doc_type = 'screenplay_title';

-- === ensureCrdtDocChunksTable (crdt/postgresStorageAdapter.js) ===
-- Chunked binary doc storage for automerge-repo's PostgresStorageAdapter.
-- Supersedes crdt_changes (below) as the real storage path — that table's
-- flat ordered-log shape was never wired up (0 rows in production) and
-- doesn't fit automerge-repo's chunked snapshot + incremental-changes model.
CREATE TABLE IF NOT EXISTS crdt_doc_chunks (
  key_str    text PRIMARY KEY,
  key_path   text[] NOT NULL,
  data       bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crdt_doc_chunks_prefix_idx
  ON crdt_doc_chunks (key_str text_pattern_ops);

-- === ensureCrdtDocumentsTables continued (server.js) ===
CREATE TABLE IF NOT EXISTS crdt_changes (
  id           bigserial PRIMARY KEY,
  doc_id       uuid NOT NULL REFERENCES crdt_documents(id) ON DELETE CASCADE,
  actor_id     uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
  seq          integer NOT NULL,
  ts           timestamptz NOT NULL DEFAULT now(),
  patch        bytea NOT NULL,
  is_snapshot  boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS crdt_changes_doc_ts_idx ON crdt_changes(doc_id, ts);

-- === ensureProposalsTable (server.js) ===
-- Lightweight version of the CRDT plan that lets us attach proposed text
-- and an approval status to chapters and branches.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
    CREATE TYPE proposal_status AS ENUM ('undecided', 'approved', 'declined');
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_target') THEN
    CREATE TYPE proposal_target AS ENUM ('story_title', 'chapter', 'paragraph', 'branch');
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS crdt_proposals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id    uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  target_type       proposal_target NOT NULL,
  target_chapter_id uuid NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
  -- No FK here: paragraph_branches.id's type may differ between
  -- deployments (uuid vs bigint). Identifier stored and validated at the
  -- application level only.
  target_branch_id  uuid NULL,
  target_path       text NULL,
  proposed_text     text NOT NULL,
  author_user_id    uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  status            proposal_status NOT NULL DEFAULT 'undecided',
  decided_by        uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
  decided_at        timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS doc_id uuid NULL;
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
CREATE INDEX IF NOT EXISTS crdt_proposals_story_idx ON crdt_proposals(story_title_id);
CREATE INDEX IF NOT EXISTS crdt_proposals_status_idx ON crdt_proposals(story_title_id, status);

-- === ensureCreativeSpacesTable (server.js) ===
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
);
-- In case the table was created earlier with a foreign key to
-- local_users(id), drop that constraint so user_id can store both local
-- and Supabase user ids without FK violations.
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
ALTER TABLE creative_spaces ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS default_item_visibility text;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS sync_state text;
CREATE INDEX IF NOT EXISTS creative_spaces_user_idx ON creative_spaces(user_id);

-- === ensureContributionsTable (server.js) ===
-- Records per-paragraph and proposal-based contributions in a dedicated
-- table so contributions can be queried per story and per user.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_status') THEN
    CREATE TYPE contribution_status AS ENUM ('approved', 'rejected', 'undecided');
  END IF;
END
$$;
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
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS new_paragraph text;
CREATE INDEX IF NOT EXISTS contributions_story_idx ON contributions(story_title_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS contributions_user_idx ON contributions(author_user_id, status, created_at DESC);

-- === ensureScreenplayTables (server.js) ===
-- Screenplay tables: title, scenes, blocks, and linking table between
-- stories and screenplays. These mirror the story tables but are kept
-- separate to avoid breaking existing story functionality.
CREATE TABLE IF NOT EXISTS screenplay_title (
  screenplay_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  -- Loose uuid like story_title.creator_id (no strict FK) so it can store
  -- Supabase user IDs or local user IDs without FK violations.
  creator_id    uuid NULL,
  visibility    text NOT NULL DEFAULT 'public',
  published     boolean NOT NULL DEFAULT true,
  genre         text NULL,
  tags          text[] NULL,
  format_type   text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- If an earlier version created a FK to local_users, drop it so that
-- creator_id matches the semantics of story_title.creator_id.
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
);
CREATE INDEX IF NOT EXISTS screenplay_scene_screenplay_idx ON screenplay_scene(screenplay_id, scene_index);
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
);
CREATE INDEX IF NOT EXISTS screenplay_block_screenplay_idx ON screenplay_block(screenplay_id, block_index);
CREATE TABLE IF NOT EXISTS story_screenplay_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  screenplay_id  uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  relation_type  text NOT NULL DEFAULT 'adaptation',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_screenplay_unique ON story_screenplay_links(story_title_id, screenplay_id, relation_type);
CREATE TABLE IF NOT EXISTS screenplay_access (
  screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  role          text NOT NULL DEFAULT 'owner',
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (screenplay_id, user_id)
);
CREATE INDEX IF NOT EXISTS screenplay_access_user_idx ON screenplay_access(user_id);

-- === ensureScreenplayRevisionsTable (server.js) ===
CREATE TABLE IF NOT EXISTS screenplay_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenplay_title_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  scene_id uuid NULL REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE,
  prev_content jsonb,
  new_content jsonb,
  created_by uuid NULL REFERENCES local_users(id) ON DELETE SET NULL,
  revision_number integer NOT NULL DEFAULT 1,
  revision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screenplay_revisions_title_idx ON screenplay_revisions(screenplay_title_id);
CREATE INDEX IF NOT EXISTS screenplay_revisions_scene_idx ON screenplay_revisions(scene_id);

-- === ensureUserStoryStatusTable (server.js) ===
-- Tracks per-user experience state (favorites / living / lived) for both
-- stories and screenplays without disturbing existing story tables.
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
);
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
CREATE UNIQUE INDEX IF NOT EXISTS user_story_status_unique ON user_story_status(user_id, content_type, story_title_id, screenplay_id);
CREATE INDEX IF NOT EXISTS user_story_status_user_idx ON user_story_status(user_id, content_type);

-- === ensureCommentsScreenplayColumn (server.js) ===
-- Extends comments to support screenplay-level comments alongside
-- story-level comments.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS screenplay_scene_id uuid;
CREATE INDEX IF NOT EXISTS comments_screenplay_idx ON comments(screenplay_id);
CREATE INDEX IF NOT EXISTS comments_screenplay_scene_idx ON comments(screenplay_scene_id);
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

-- === ensureReactionsScreenplayColumns (server.js) ===
-- Extends reactions to support screenplay-level and scene-level reactions
-- in addition to story/paragraph reactions.
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS screenplay_scene_id uuid;
CREATE INDEX IF NOT EXISTS reactions_screenplay_idx ON reactions(screenplay_id);
CREATE INDEX IF NOT EXISTS reactions_screenplay_scene_idx ON reactions(screenplay_scene_id);

-- === ensureCreativeSpaceItemsTable (server.js) ===
-- Items (folders/files) inside creative spaces.
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
);
CREATE UNIQUE INDEX IF NOT EXISTS creative_space_items_space_path_idx ON creative_space_items(space_id, relative_path);
CREATE INDEX IF NOT EXISTS creative_space_items_space_idx ON creative_space_items(space_id);
CREATE INDEX IF NOT EXISTS creative_space_items_space_updated_idx ON creative_space_items(space_id, updated_at);
-- Tracks whether/where actual file bytes have been uploaded or edited
-- through the web UI, separately from the sync-protocol manifest columns
-- above (relative_path/size/hash) — see creativeSpaceFiles.js.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS storage_path text;

-- === ensureGithubSyncTables (githubSync.js) ===
-- Must run after ensureCreativeSpaceItemsTable — it adds a column onto creative_space_items.
CREATE TABLE IF NOT EXISTS github_installations (
  installation_id bigint PRIMARY KEY,
  account_login   text,
  connected_by    text,
  connected_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_installation_id bigint;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_repo text;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_branch text NOT NULL DEFAULT 'master';
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS github_last_commit_sha text;
-- Per-item loop guard, separate from the metadata-manifest `hash` column
-- the desktop/web snapshot sync protocol already owns.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS github_blob_sha text;
CREATE TABLE IF NOT EXISTS github_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  direction     text NOT NULL,
  level         text NOT NULL DEFAULT 'info',
  message       text NOT NULL,
  relative_path text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS github_sync_log_space_idx ON github_sync_log(space_id, created_at DESC);

-- === ensureGithubContentLinksTable (githubSync.js) ===
-- Must run after ensureCreativeSpacesTable (FK) and ensureCrdtDocumentsTables
-- (conceptually references crdt_documents.doc_key, though not FK-enforced
-- to avoid first-boot ordering issues).
CREATE TABLE IF NOT EXISTS github_content_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  relative_path   text NOT NULL,
  doc_type        text NOT NULL DEFAULT 'chapter',
  entity_id       uuid NOT NULL,
  doc_key         text NOT NULL,
  github_blob_sha text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);
CREATE UNIQUE INDEX IF NOT EXISTS github_content_links_space_path_idx ON github_content_links(space_id, relative_path);
CREATE UNIQUE INDEX IF NOT EXISTS github_content_links_doc_key_idx ON github_content_links(doc_key);

-- === ensureGoogleDriveSyncTables (googleDriveSync.js) ===
-- Must run after ensureCreativeSpaceItemsTable — it adds a column onto creative_space_items.
CREATE TABLE IF NOT EXISTS google_drive_accounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 text NOT NULL UNIQUE,
  google_email            text,
  access_token_encrypted  text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at        timestamptz NOT NULL,
  start_page_token        text,
  channel_id              text,
  channel_resource_id     text,
  channel_expires_at      timestamptz,
  connected_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_account_id uuid REFERENCES google_drive_accounts(id);
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_folder_id text;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_folder_name text;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_last_synced_at timestamptz;
-- Per-item loop guard, separate from the metadata-manifest `hash` column and from github_blob_sha.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS google_drive_file_id text;
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS google_drive_md5 text;
CREATE TABLE IF NOT EXISTS google_drive_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id      uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  direction     text NOT NULL,
  level         text NOT NULL DEFAULT 'info',
  message       text NOT NULL,
  relative_path text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS google_drive_sync_log_space_idx ON google_drive_sync_log(space_id, created_at DESC);

-- === ensureStoryCreativeSpaceColumnsAndAttachments (server.js) ===
-- Story/screenplay Space association and attachment tables.
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS creative_space_id uuid NULL REFERENCES creative_spaces(id) ON DELETE SET NULL;
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS creative_space_id uuid NULL REFERENCES creative_spaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS story_title_space_idx ON story_title(creative_space_id);
CREATE INDEX IF NOT EXISTS screenplay_title_space_idx ON screenplay_title(creative_space_id);
CREATE TABLE IF NOT EXISTS story_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id  uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  space_id        uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES creative_space_items(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'other',
  role            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_attachments_story_item_idx ON story_attachments(story_title_id, item_id);
CREATE INDEX IF NOT EXISTS story_attachments_space_idx ON story_attachments(space_id);

-- === ensureStorySpacesTable (server.js) ===
-- Join table for associating stories with multiple Spaces (primary + copies).
CREATE TABLE IF NOT EXISTS story_spaces (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  space_id       uuid NOT NULL REFERENCES creative_spaces(id) ON DELETE CASCADE,
  role           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_spaces_story_space_idx ON story_spaces(story_title_id, space_id);
CREATE INDEX IF NOT EXISTS story_spaces_space_idx ON story_spaces(space_id);

-- === ensureAlphaInvitationsTable (server.js) ===
CREATE TABLE IF NOT EXISTS alpha_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_code text UNIQUE NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  invited_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ensureAlphaApplicationsTable (server.js) ===
CREATE TABLE IF NOT EXISTS alpha_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  motivation_letter text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES local_users(id) ON DELETE SET NULL
);

-- === ensureUserBannedColumn (server.js) ===
ALTER TABLE local_users ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- === ensureAdminMessagesTable (server.js) ===
CREATE TABLE IF NOT EXISTS admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ensureSessionsTable (sessions.js) ===
CREATE TABLE IF NOT EXISTS sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- === ensureFriendRequestsTable (friends.js) ===
CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id != addressee_id)
);
-- Only one active (pending/accepted) row per pair, regardless of direction
-- — prevents duplicate requests and crossed requests in both directions at
-- once. Excluding 'declined' rows lets a fresh request be sent (or an
-- unfriended pair reconnect) later.
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_active_pair_idx
ON friend_requests (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
WHERE status != 'declined';
CREATE INDEX IF NOT EXISTS friend_requests_addressee_idx ON friend_requests(addressee_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_requester_idx ON friend_requests(requester_id, status);

-- === ensureFollowsTable (follows.js) ===
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_id);

-- === ensureConversationsTable (messaging.js) ===
-- One conversation per accepted friend request, created lazily the first
-- time either side opens the thread (not eagerly on accept).
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_request_id uuid NOT NULL UNIQUE REFERENCES friend_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ensureMessagesTable (messaging.js) ===
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);

-- === ensureConversationReadsTable (messaging.js) ===
CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- === ensureNotificationsTable (notifications.js) ===
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('friend_request', 'friend_accept', 'follow')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at DESC);
-- Widen the type CHECK for databases where the table already existed
-- before 'follow' was added to the allowed list above.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_type_check' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('friend_request', 'friend_accept', 'follow'));
END
$$;

-- === ensureUserTranslatorLanguagesTable (server.js) ===
CREATE TABLE IF NOT EXISTS user_translator_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  locale_code text NOT NULL REFERENCES locales(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, locale_code)
);
CREATE INDEX IF NOT EXISTS user_translator_langs_user_idx ON user_translator_languages(user_id);

-- === ensureInterfaceTranslationsTable (server.js) ===
CREATE TABLE IF NOT EXISTS interface_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text NOT NULL,
  element_id text NOT NULL,
  language text NOT NULL DEFAULT 'English',
  content text NOT NULL,
  original_content text,
  updated_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS interface_translations_unique_idx
ON interface_translations (page_path, element_id, language);

-- === ensureStoryTitleDescriptionColumn (server.js) ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS description text;

-- === ensureScreenplayTitleDescriptionColumn (server.js) ===
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS description text;

-- === ensureChapterTagsColumns (server.js) ===
ALTER TABLE stories ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE stories ADD COLUMN IF NOT EXISTS paragraph_tags jsonb;

-- === ensureStoryCollaboratorsTable (server.js) ===
-- Per-story authors and co-authors.
CREATE TABLE IF NOT EXISTS story_collaborators (
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('author', 'coauthor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_title_id, user_id)
);

-- === ensureStoryInitiatorColumn (server.js) ===
-- initiator_id on story_title — permanent original creator (never changes on transfer).
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS initiator_id uuid REFERENCES local_users(id) ON DELETE SET NULL;
-- The original ensure*() ran this as a single bare UPDATE, which silently
-- no-ops (via its outer try/catch) on any database with a story_title row
-- whose creator_id no longer matches a local_users row (observed in local
-- dev: rows left over from a deleted account). A single UPDATE is atomic in
-- Postgres, so that dangling row didn't just skip its own backfill — it
-- blocked every row in the statement. Since this migration runs the whole
-- file in one transaction, the same unguarded UPDATE would roll back the
-- entire baseline instead of just failing to backfill three rows. The
-- `AND creator_id IN (...)` guard reproduces the original's effective,
-- if accidental, behavior (best-effort backfill, skip what would violate
-- the FK) without taking the rest of the migration down with it.
UPDATE story_title SET initiator_id = creator_id
WHERE initiator_id IS NULL AND creator_id IS NOT NULL
  AND creator_id IN (SELECT id FROM local_users);

-- === ensureUiTranslatorRole (server.js) ===
-- IF NOT EXISTS is supported for ALTER TYPE ... ADD VALUE since PG 9.3+.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'ui_translator';
