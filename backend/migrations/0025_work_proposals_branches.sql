-- Screenplay & comic parity with stories (phase 2): proposals, branches,
-- comic text layers and a comic revision log.
--
-- 1. crdt_proposals can target a screenplay (title / scene slugline / block /
--    block branch) or a comic (title / issue title / page text layers), not
--    only a story. Readers outside the team suggest; the owner approves.
-- 2. Branches: alternative versions of one screenplay block (like paragraph
--    branches) and alternative images of one comic page.
-- 3. comic_page.overlays: speech bubbles / captions stored as positioned
--    text (same shape as chapter_media_frames.overlays), so they stay
--    editable and translatable.
-- 4. comic_revisions: who changed which page or issue, and how.

-- === 1. Proposals for screenplays and comics =================================
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'chapter_title';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'screenplay_title';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'scene';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'block';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'block_branch';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'comic_title';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'issue';
ALTER TYPE proposal_target ADD VALUE IF NOT EXISTS 'page_layer';

ALTER TABLE crdt_proposals ALTER COLUMN story_title_id DROP NOT NULL;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS target_scene_id uuid;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS target_block_id uuid;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS target_issue_id uuid;
ALTER TABLE crdt_proposals ADD COLUMN IF NOT EXISTS target_page_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_screenplay_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_screenplay_id_fkey
      FOREIGN KEY (screenplay_id) REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_comic_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_target_scene_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_target_scene_id_fkey
      FOREIGN KEY (target_scene_id) REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_target_block_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_target_block_id_fkey
      FOREIGN KEY (target_block_id) REFERENCES screenplay_block(block_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_target_issue_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_target_issue_id_fkey
      FOREIGN KEY (target_issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_target_page_id_fkey') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_target_page_id_fkey
      FOREIGN KEY (target_page_id) REFERENCES comic_page(page_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crdt_proposals_one_work') THEN
    ALTER TABLE crdt_proposals ADD CONSTRAINT crdt_proposals_one_work
      CHECK (num_nonnulls(story_title_id, screenplay_id, comic_id) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crdt_proposals_screenplay_idx ON crdt_proposals (screenplay_id, status) WHERE screenplay_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crdt_proposals_comic_idx ON crdt_proposals (comic_id, status) WHERE comic_id IS NOT NULL;

-- === 2. Branches =============================================================
CREATE TABLE IF NOT EXISTS screenplay_block_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES screenplay_block(block_id) ON DELETE CASCADE,
  screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  branch_text text NOT NULL,
  block_type text,
  name text,
  language text NOT NULL DEFAULT 'en',
  metadata jsonb,
  user_id uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screenplay_block_branches_block_idx ON screenplay_block_branches (block_id);
CREATE INDEX IF NOT EXISTS screenplay_block_branches_screenplay_idx ON screenplay_block_branches (screenplay_id);

CREATE TABLE IF NOT EXISTS comic_page_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES comic_page(page_id) ON DELETE CASCADE,
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  image_url text NOT NULL,
  overlays jsonb NOT NULL DEFAULT '[]'::jsonb,
  name text,
  language text NOT NULL DEFAULT 'en',
  user_id uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comic_page_branches_page_idx ON comic_page_branches (page_id);
CREATE INDEX IF NOT EXISTS comic_page_branches_comic_idx ON comic_page_branches (comic_id);

-- === 3. Comic text layers ====================================================
ALTER TABLE comic_page ADD COLUMN IF NOT EXISTS overlays jsonb NOT NULL DEFAULT '[]'::jsonb;

-- === 4. Comic revision log ===================================================
CREATE TABLE IF NOT EXISTS comic_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  issue_id uuid,
  page_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comic_revisions_comic_idx ON comic_revisions (comic_id, created_at DESC);
