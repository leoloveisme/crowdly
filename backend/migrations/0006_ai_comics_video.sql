-- AI comics and AI video (phase 4 of story formats).
--
-- New job kinds:
--   comic_frames  — storyboard a paragraph range with a text AI, then draw each
--                   frame with an image AI; frames land in chapter_media_frames
--                   with their captions / speech bubbles as editable text.
--   video_chapter — submit a clip to a video AI, then poll until it's ready.
--
-- run_after lets a job wait without holding the worker: a video job re-queues
-- itself with run_after = now() + a few seconds between status checks.

ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS run_after timestamptz;

ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_kind_check;
ALTER TABLE ai_jobs
  ADD CONSTRAINT ai_jobs_kind_check
  CHECK (kind IN ('translate_chapter', 'tts_chapter', 'comic_frames', 'video_chapter'));

DROP INDEX IF EXISTS ai_jobs_queue_idx;
CREATE INDEX IF NOT EXISTS ai_jobs_queue_idx ON ai_jobs (status, run_after, created_at) WHERE status IN ('queued', 'running');
