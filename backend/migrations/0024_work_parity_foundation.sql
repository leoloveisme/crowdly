-- Screenplay & comic parity with stories (phase 1): the settings, people,
-- access-rule and engagement plumbing the story page already has.
--
-- 1. screenplay_title / comic_title gain story_title's settings columns
--    (completion status, clone/export/translate/narrate policies, language,
--    cover/description, translation lineage).
-- 2. Scenes can be unpublished like chapters; comics gain issues (episodes)
--    that group their pages the way chapters group a story's text.
-- 3. Access rules (viewers / cloners / exporters ...) and authors/co-authors
--    for screenplays and comics.
-- 4. Comics join favorites/living/lived, shelves, comments and reactions.
-- 5. "Ask to collaborate" requests can target a screenplay or a comic.

-- === 1. Settings columns =====================================================
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'draft';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS clone_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS export_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS translation_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS narration_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS translation_group_id uuid;
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS source_screenplay_id uuid;
ALTER TABLE screenplay_title ADD COLUMN IF NOT EXISTS is_official_translation boolean NOT NULL DEFAULT false;

ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'draft';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS clone_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS export_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS translation_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS narration_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS translation_group_id uuid;
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS source_comic_id uuid;
ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS is_official_translation boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  t text;
  col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['screenplay_title', 'comic_title'] LOOP
    FOREACH col IN ARRAY ARRAY['clone_policy', 'export_policy', 'translation_policy', 'narration_policy'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_' || col || '_check') THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IN (''anyone'', ''restricted'', ''none''))',
          t, t || '_' || col || '_check', col
        );
      END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_completion_status_check') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (completion_status IN (''draft'', ''completed''))',
        t, t || '_completion_status_check'
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'screenplay_title_source_screenplay_id_fkey') THEN
    ALTER TABLE screenplay_title
      ADD CONSTRAINT screenplay_title_source_screenplay_id_fkey
      FOREIGN KEY (source_screenplay_id) REFERENCES screenplay_title(screenplay_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comic_title_source_comic_id_fkey') THEN
    ALTER TABLE comic_title
      ADD CONSTRAINT comic_title_source_comic_id_fkey
      FOREIGN KEY (source_comic_id) REFERENCES comic_title(comic_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS screenplay_title_translation_group_idx
  ON screenplay_title (translation_group_id) WHERE translation_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comic_title_translation_group_idx
  ON comic_title (translation_group_id) WHERE translation_group_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS screenplay_title_one_official_translation_per_language
  ON screenplay_title (translation_group_id, language) WHERE is_official_translation;
CREATE UNIQUE INDEX IF NOT EXISTS comic_title_one_official_translation_per_language
  ON comic_title (translation_group_id, language) WHERE is_official_translation;

-- === 2. Scene publishing, comic issues =======================================
ALTER TABLE screenplay_scene ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS comic_issue (
  issue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  issue_index integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comic_issue_comic_idx ON comic_issue (comic_id, issue_index);

ALTER TABLE comic_page ADD COLUMN IF NOT EXISTS issue_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comic_page_issue_id_fkey') THEN
    ALTER TABLE comic_page
      ADD CONSTRAINT comic_page_issue_id_fkey
      FOREIGN KEY (issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS comic_page_issue_idx ON comic_page (issue_id, page_index);

-- Every existing comic gets one issue holding all of its pages.
INSERT INTO comic_issue (comic_id, issue_index, title)
SELECT ct.comic_id, 0, 'Issue 1'
  FROM comic_title ct
 WHERE NOT EXISTS (SELECT 1 FROM comic_issue ci WHERE ci.comic_id = ct.comic_id);

UPDATE comic_page cp
   SET issue_id = (
     SELECT ci.issue_id FROM comic_issue ci
      WHERE ci.comic_id = cp.comic_id
      ORDER BY ci.issue_index ASC, ci.created_at ASC
      LIMIT 1
   )
 WHERE cp.issue_id IS NULL;

-- === 3. Access rules and authors/co-authors ==================================
CREATE TABLE IF NOT EXISTS screenplay_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  grantee_user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
  grantee_group_id uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screenplay_access_rules_valid_grantee CHECK (
    (grantee_user_id IS NOT NULL AND grantee_group_id IS NULL) OR
    (grantee_user_id IS NULL AND grantee_group_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS screenplay_access_rules_idx ON screenplay_access_rules (screenplay_id, rule_type);

CREATE TABLE IF NOT EXISTS comic_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  grantee_user_id uuid REFERENCES local_users(id) ON DELETE CASCADE,
  grantee_group_id uuid REFERENCES user_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comic_access_rules_valid_grantee CHECK (
    (grantee_user_id IS NOT NULL AND grantee_group_id IS NULL) OR
    (grantee_user_id IS NULL AND grantee_group_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS comic_access_rules_idx ON comic_access_rules (comic_id, rule_type);

-- Authors / co-authors (credit only — editing rights live in *_access).
CREATE TABLE IF NOT EXISTS work_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenplay_id uuid REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  comic_id uuid REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_collaborators_role_check CHECK (role IN ('author', 'coauthor')),
  CONSTRAINT work_collaborators_one_work CHECK (num_nonnulls(screenplay_id, comic_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS work_collaborators_screenplay_uniq
  ON work_collaborators (screenplay_id, user_id) WHERE screenplay_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS work_collaborators_comic_uniq
  ON work_collaborators (comic_id, user_id) WHERE comic_id IS NOT NULL;

-- === 4. Comics in favorites / shelves / comments / reactions =================
ALTER TABLE user_story_status ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE user_story_status DROP CONSTRAINT IF EXISTS user_story_status_type_check;
ALTER TABLE user_story_status
  ADD CONSTRAINT user_story_status_type_check CHECK (content_type IN ('story', 'screenplay', 'comic'));
CREATE UNIQUE INDEX IF NOT EXISTS user_story_status_comic_uniq
  ON user_story_status (user_id, comic_id) WHERE content_type = 'comic';

ALTER TABLE shelf_items ADD COLUMN IF NOT EXISTS comic_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shelf_items_comic_id_fkey') THEN
    ALTER TABLE shelf_items
      ADD CONSTRAINT shelf_items_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE shelf_items DROP CONSTRAINT IF EXISTS shelf_items_target_check;
ALTER TABLE shelf_items ADD CONSTRAINT shelf_items_target_check CHECK (
  (item_type = 'library_item' AND library_item_id IS NOT NULL AND num_nonnulls(story_title_id, screenplay_id, comic_id) = 0)
  OR (item_type = 'story' AND story_title_id IS NOT NULL AND num_nonnulls(library_item_id, screenplay_id, comic_id) = 0)
  OR (item_type = 'screenplay' AND screenplay_id IS NOT NULL AND num_nonnulls(library_item_id, story_title_id, comic_id) = 0)
  OR (item_type = 'comic' AND comic_id IS NOT NULL AND num_nonnulls(library_item_id, story_title_id, screenplay_id) = 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_comic_uniq
  ON shelf_items (shelf_id, comic_id) WHERE item_type = 'comic';

ALTER TABLE comments ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS comic_issue_id uuid;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS comic_issue_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_comic_id_fkey') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_comic_issue_id_fkey') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_comic_issue_id_fkey
      FOREIGN KEY (comic_issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactions_comic_id_fkey') THEN
    ALTER TABLE reactions ADD CONSTRAINT reactions_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reactions_comic_issue_id_fkey') THEN
    ALTER TABLE reactions ADD CONSTRAINT reactions_comic_issue_id_fkey
      FOREIGN KEY (comic_issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS comments_comic_idx ON comments (comic_id);
CREATE INDEX IF NOT EXISTS comments_comic_issue_idx ON comments (comic_issue_id);
CREATE INDEX IF NOT EXISTS reactions_comic_idx ON reactions (comic_id);
CREATE INDEX IF NOT EXISTS reactions_comic_issue_idx ON reactions (comic_issue_id);

-- === 5. Collaboration requests for screenplays and comics ====================
ALTER TABLE story_collaboration_requests ALTER COLUMN story_title_id DROP NOT NULL;
ALTER TABLE story_collaboration_requests ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE story_collaboration_requests ADD COLUMN IF NOT EXISTS comic_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_collaboration_requests_screenplay_id_fkey') THEN
    ALTER TABLE story_collaboration_requests ADD CONSTRAINT story_collaboration_requests_screenplay_id_fkey
      FOREIGN KEY (screenplay_id) REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_collaboration_requests_comic_id_fkey') THEN
    ALTER TABLE story_collaboration_requests ADD CONSTRAINT story_collaboration_requests_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_collaboration_requests_one_target') THEN
    ALTER TABLE story_collaboration_requests ADD CONSTRAINT story_collaboration_requests_one_target
      CHECK (num_nonnulls(story_title_id, screenplay_id, comic_id) = 1);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS story_collaboration_requests_screenplay_pending_uniq
  ON story_collaboration_requests (screenplay_id, requester_id) WHERE status = 'pending' AND screenplay_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS story_collaboration_requests_comic_pending_uniq
  ON story_collaboration_requests (comic_id, requester_id) WHERE status = 'pending' AND comic_id IS NOT NULL;
