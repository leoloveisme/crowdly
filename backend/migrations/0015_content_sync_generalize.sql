-- The chapter<->Space sync columns are about to gate/track sync for
-- screenplay scenes and comic pages too, not just chapters. Renaming them
-- avoids "chapter_*" columns governing non-chapter content going forward.
-- Pure rename — no data loss, existing chapter links keep working. Guarded
-- so re-running this file (or running against a DB some other path already
-- renamed these on) is a no-op rather than an error.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'creative_space_items' AND column_name = 'chapter_sync_enabled'
  ) THEN
    ALTER TABLE creative_space_items RENAME COLUMN chapter_sync_enabled TO content_sync_enabled;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'creative_space_items' AND column_name = 'chapter_content_hash'
  ) THEN
    ALTER TABLE creative_space_items RENAME COLUMN chapter_content_hash TO content_hash;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'creative_space_items' AND column_name = 'chapter_last_synced_at'
  ) THEN
    ALTER TABLE creative_space_items RENAME COLUMN chapter_last_synced_at TO content_last_synced_at;
  END IF;
END $$;
