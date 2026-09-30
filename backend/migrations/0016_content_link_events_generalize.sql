-- chapter_link_events becomes content_link_events: the automatic
-- relink/reconciliation machinery now covers screenplay scenes and comic
-- pages too, not just chapters, so its audit trail needs an entity_type
-- instead of an FK straight to stories(chapter_id). Guarded so this is a
-- no-op if already applied.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chapter_link_events')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_link_events') THEN
    ALTER TABLE chapter_link_events RENAME TO content_link_events;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_link_events' AND column_name = 'chapter_id'
  ) THEN
    ALTER TABLE content_link_events RENAME COLUMN chapter_id TO entity_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'content_link_events' AND constraint_name = 'chapter_link_events_chapter_id_fkey'
  ) THEN
    ALTER TABLE content_link_events DROP CONSTRAINT chapter_link_events_chapter_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_link_events' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE content_link_events ADD COLUMN entity_type text NOT NULL DEFAULT 'chapter';
    ALTER TABLE content_link_events ALTER COLUMN entity_type DROP DEFAULT;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'chapter_link_events_space_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'content_link_events_space_idx') THEN
    ALTER INDEX chapter_link_events_space_idx RENAME TO content_link_events_space_idx;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS content_link_events_space_idx ON content_link_events(space_id, created_at DESC);
