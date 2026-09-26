-- Editions: a named, saved path through a story's paragraph branches.
--
-- For every chapter an edition records, per paragraph position, whether the
-- base text or a specific paragraph_branches row is used, and freezes the
-- resolved text (snapshot_paragraphs). The snapshot is what audiobooks and
-- read-along timings refer to, so they don't drift when the live story or its
-- branches change (branches are anchored by paragraph *index*).
--
-- Auto-snapshot editions ("Original · as of <date>") are created
-- automatically when someone uploads an audiobook of the current text without
-- choosing an edition; they're hidden from edition pickers.

-- === Who may narrate (upload audiobooks) — same shape as clone/export/translate ===
ALTER TABLE story_title ADD COLUMN IF NOT EXISTS narration_policy text NOT NULL DEFAULT 'anyone';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_title_narration_policy_check'
  ) THEN
    ALTER TABLE story_title
      ADD CONSTRAINT story_title_narration_policy_check
      CHECK (narration_policy IN ('anyone', 'restricted', 'none'));
  END IF;
END $$;

-- === Editions ===
CREATE TABLE IF NOT EXISTS story_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  is_auto_snapshot boolean NOT NULL DEFAULT false,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_editions_status_check'
  ) THEN
    ALTER TABLE story_editions
      ADD CONSTRAINT story_editions_status_check CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS story_editions_story_idx ON story_editions (story_title_id);

-- One row per chapter of an edition, in reading order. chapter_id is kept
-- (SET NULL on delete) only as a link back; the snapshot stands on its own.
CREATE TABLE IF NOT EXISTS story_edition_chapters (
  edition_id uuid NOT NULL REFERENCES story_editions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  chapter_id uuid REFERENCES stories(chapter_id) ON DELETE SET NULL,
  chapter_title text NOT NULL DEFAULT '',
  -- { "<paragraph index>": <paragraph_branches.id> } — indexes not listed use the base text
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_paragraphs text[] NOT NULL DEFAULT ARRAY[]::text[],
  PRIMARY KEY (edition_id, position)
);

CREATE INDEX IF NOT EXISTS story_edition_chapters_chapter_idx ON story_edition_chapters (chapter_id);
