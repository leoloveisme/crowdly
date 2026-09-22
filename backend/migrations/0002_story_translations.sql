-- Story translations: every language version is its own story_title row,
-- linked to the others through translation_group_id (= the original story's
-- id). Chapters of a translation point at the chapter they translate via
-- source_chapter_id, so translations stay aligned even if the original is
-- reordered, and can be flagged "out of date" when the source changes.

-- === story_title: translation lineage + policy ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS translation_group_id uuid;
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS source_story_title_id uuid;
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS is_official_translation boolean NOT NULL DEFAULT false;
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS translation_policy text NOT NULL DEFAULT 'anyone';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_title_source_story_title_id_fkey'
  ) THEN
    ALTER TABLE story_title
      ADD CONSTRAINT story_title_source_story_title_id_fkey
      FOREIGN KEY (source_story_title_id) REFERENCES story_title(story_title_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_title_translation_policy_check'
  ) THEN
    ALTER TABLE story_title
      ADD CONSTRAINT story_title_translation_policy_check
      CHECK (translation_policy IN ('anyone', 'restricted', 'none'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS story_title_translation_group_idx
  ON story_title (translation_group_id)
  WHERE translation_group_id IS NOT NULL;

-- At most one official translation per language within a group.
CREATE UNIQUE INDEX IF NOT EXISTS story_title_one_official_translation_per_language
  ON story_title (translation_group_id, language)
  WHERE is_official_translation;

-- === stories (chapters): link to the source chapter ===
ALTER TABLE stories ADD COLUMN IF NOT EXISTS source_chapter_id uuid;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_source_chapter_id_fkey'
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_source_chapter_id_fkey
      FOREIGN KEY (source_chapter_id) REFERENCES stories(chapter_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stories_source_chapter_idx
  ON stories (source_chapter_id)
  WHERE source_chapter_id IS NOT NULL;

-- === stories: reliable "content last changed" timestamp ===
-- stories.updated_at exists but no code path maintains it. A trigger stamps
-- content_updated_at whenever a chapter's title or text actually changes,
-- which is what "translation is out of date" compares against.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION stories_touch_content_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.chapter_title IS DISTINCT FROM OLD.chapter_title
     OR NEW.paragraphs IS DISTINCT FROM OLD.paragraphs THEN
    NEW.content_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'stories_touch_content_updated_at_trg'
  ) THEN
    CREATE TRIGGER stories_touch_content_updated_at_trg
      BEFORE UPDATE ON stories
      FOR EACH ROW EXECUTE FUNCTION stories_touch_content_updated_at();
  END IF;
END $$;
