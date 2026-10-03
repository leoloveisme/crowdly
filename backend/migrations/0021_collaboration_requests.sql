-- "Ask to collaborate" (desktop Discovery → "I want to change this story"):
-- a reader asks a story's owner for direct editing rights. Approving one
-- adds the reader to story_access (backend/src/collaboration.js), which is
-- what lets them sync the story's text from the desktop app.

CREATE TABLE IF NOT EXISTS story_collaboration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES local_users(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_collaboration_requests_status_check') THEN
    ALTER TABLE story_collaboration_requests ADD CONSTRAINT story_collaboration_requests_status_check
      CHECK (status IN ('pending', 'approved', 'declined'));
  END IF;
END $$;

-- At most one open request per reader and story.
CREATE UNIQUE INDEX IF NOT EXISTS story_collaboration_requests_pending_uniq
  ON story_collaboration_requests (story_title_id, requester_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS story_collaboration_requests_story_idx
  ON story_collaboration_requests (story_title_id, created_at DESC);
