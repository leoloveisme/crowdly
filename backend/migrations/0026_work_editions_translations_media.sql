-- Screenplay & comic parity with stories (phase 3): editions, translations,
-- audio/video media and AI jobs.
--
-- 1. Editions: a named, frozen version of a screenplay (per element: the base
--    text or one of its branches) or of a comic (per page: the page or one of
--    its alternatives), like story_editions.
-- 2. Translations: every language version is its own screenplay_title /
--    comic_title row in a translation group (columns added in 0024); scenes,
--    issues and pages point at what they translate.
-- 3. chapter_media holds the Audio / Video of a screenplay scene or a comic
--    issue too, not only of a story chapter.
-- 4. ai_jobs can work on scenes and issues (translation drafts, narration,
--    video).

-- === 1. Editions =============================================================
CREATE TABLE IF NOT EXISTS screenplay_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenplay_id uuid NOT NULL REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screenplay_editions_status_check CHECK (status IN ('draft', 'published'))
);
CREATE INDEX IF NOT EXISTS screenplay_editions_screenplay_idx ON screenplay_editions (screenplay_id);

CREATE TABLE IF NOT EXISTS screenplay_edition_scenes (
  edition_id uuid NOT NULL REFERENCES screenplay_editions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  scene_id uuid REFERENCES screenplay_scene(scene_id) ON DELETE SET NULL,
  slugline text NOT NULL DEFAULT '',
  -- { "<block_id>": "<screenplay_block_branches.id>" } — blocks not listed use the base text
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "block_id", "block_type", "text" }, ...] frozen at snapshot time
  snapshot_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (edition_id, position)
);

CREATE TABLE IF NOT EXISTS comic_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comic_editions_status_check CHECK (status IN ('draft', 'published'))
);
CREATE INDEX IF NOT EXISTS comic_editions_comic_idx ON comic_editions (comic_id);

CREATE TABLE IF NOT EXISTS comic_edition_issues (
  edition_id uuid NOT NULL REFERENCES comic_editions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  issue_id uuid REFERENCES comic_issue(issue_id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  -- { "<page_id>": "<comic_page_branches.id>" } — pages not listed use the page itself
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "page_id", "image_url", "overlays", "alt_text" }, ...] frozen at snapshot time
  snapshot_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (edition_id, position)
);

-- === 2. Translation lineage ==================================================
ALTER TABLE screenplay_scene ADD COLUMN IF NOT EXISTS source_scene_id uuid;
ALTER TABLE screenplay_scene ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;
ALTER TABLE comic_issue ADD COLUMN IF NOT EXISTS source_issue_id uuid;
ALTER TABLE comic_page ADD COLUMN IF NOT EXISTS source_page_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'screenplay_scene_source_scene_id_fkey') THEN
    ALTER TABLE screenplay_scene ADD CONSTRAINT screenplay_scene_source_scene_id_fkey
      FOREIGN KEY (source_scene_id) REFERENCES screenplay_scene(scene_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comic_issue_source_issue_id_fkey') THEN
    ALTER TABLE comic_issue ADD CONSTRAINT comic_issue_source_issue_id_fkey
      FOREIGN KEY (source_issue_id) REFERENCES comic_issue(issue_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comic_page_source_page_id_fkey') THEN
    ALTER TABLE comic_page ADD CONSTRAINT comic_page_source_page_id_fkey
      FOREIGN KEY (source_page_id) REFERENCES comic_page(page_id) ON DELETE SET NULL;
  END IF;
END $$;

-- === 3. Media for scenes and issues ==========================================
ALTER TABLE chapter_media ALTER COLUMN story_title_id DROP NOT NULL;
ALTER TABLE chapter_media ALTER COLUMN chapter_id DROP NOT NULL;
ALTER TABLE chapter_media ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE chapter_media ADD COLUMN IF NOT EXISTS scene_id uuid;
ALTER TABLE chapter_media ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE chapter_media ADD COLUMN IF NOT EXISTS comic_issue_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_screenplay_id_fkey') THEN
    ALTER TABLE chapter_media ADD CONSTRAINT chapter_media_screenplay_id_fkey
      FOREIGN KEY (screenplay_id) REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_scene_id_fkey') THEN
    ALTER TABLE chapter_media ADD CONSTRAINT chapter_media_scene_id_fkey
      FOREIGN KEY (scene_id) REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_comic_id_fkey') THEN
    ALTER TABLE chapter_media ADD CONSTRAINT chapter_media_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_comic_issue_id_fkey') THEN
    ALTER TABLE chapter_media ADD CONSTRAINT chapter_media_comic_issue_id_fkey
      FOREIGN KEY (comic_issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
  -- Exactly one parent: a chapter (with its story), a scene (with its
  -- screenplay) or an issue (with its comic).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_one_parent') THEN
    ALTER TABLE chapter_media ADD CONSTRAINT chapter_media_one_parent CHECK (
      (chapter_id IS NOT NULL AND story_title_id IS NOT NULL AND num_nonnulls(scene_id, comic_issue_id) = 0)
      OR (scene_id IS NOT NULL AND screenplay_id IS NOT NULL AND num_nonnulls(chapter_id, comic_issue_id) = 0)
      OR (comic_issue_id IS NOT NULL AND comic_id IS NOT NULL AND num_nonnulls(chapter_id, scene_id) = 0)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS chapter_media_scene_idx ON chapter_media (scene_id, kind, status) WHERE scene_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chapter_media_issue_idx ON chapter_media (comic_issue_id, kind, status) WHERE comic_issue_id IS NOT NULL;

-- === 4. AI jobs for scenes and issues ========================================
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS screenplay_id uuid;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS scene_id uuid;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS comic_id uuid;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS comic_issue_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_screenplay_id_fkey') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_screenplay_id_fkey
      FOREIGN KEY (screenplay_id) REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_scene_id_fkey') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_scene_id_fkey
      FOREIGN KEY (scene_id) REFERENCES screenplay_scene(scene_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_comic_id_fkey') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_comic_id_fkey
      FOREIGN KEY (comic_id) REFERENCES comic_title(comic_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_comic_issue_id_fkey') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_comic_issue_id_fkey
      FOREIGN KEY (comic_issue_id) REFERENCES comic_issue(issue_id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_kind_check;
ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_kind_check CHECK (kind IN (
  'translate_chapter', 'tts_chapter', 'comic_frames', 'video_chapter',
  'translate_scene', 'tts_scene', 'video_scene',
  'translate_issue', 'tts_issue', 'video_issue'
));
CREATE INDEX IF NOT EXISTS ai_jobs_screenplay_idx ON ai_jobs (screenplay_id) WHERE screenplay_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_jobs_comic_idx ON ai_jobs (comic_id) WHERE comic_id IS NOT NULL;
