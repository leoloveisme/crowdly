-- Direct browser → object-storage uploads (presigned PUT URLs).
--
-- When a user asks to upload a large file (narration audio, a video file) the
-- backend issues a presigned URL for a fresh object key and records the
-- intent here. The follow-up "complete" request must name a key from this
-- table that belongs to the same user, chapter and purpose; the backend then
-- checks the object's real size / type in the bucket before creating the
-- chapter_media row. Rows (and their objects, if never completed) are cleaned
-- up after a day.

CREATE TABLE IF NOT EXISTS pending_uploads (
  storage_key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES stories(chapter_id) ON DELETE CASCADE,
  purpose text NOT NULL,
  content_type text NOT NULL,
  max_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_uploads_purpose_check') THEN
    ALTER TABLE pending_uploads ADD CONSTRAINT pending_uploads_purpose_check CHECK (purpose IN ('audio', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pending_uploads_created_idx ON pending_uploads (created_at);
