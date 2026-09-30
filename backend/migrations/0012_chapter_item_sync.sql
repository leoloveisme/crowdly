-- Continuous bidirectional sync between a story chapter and a linked
-- creative_space_items file (which may itself already be syncing to GitHub
-- and/or Google Drive) — see backend/src/chapterSpaceSync.js.
--
-- linked_chapter_id already exists (added ad hoc for the one-time import
-- wizard, which copies a Space file's text into a chapter once and stamps
-- this FK as provenance only). chapter_sync_enabled is a separate, explicit
-- opt-in so those pre-existing import-provenance links don't suddenly start
-- live bidirectional sync without the user asking for it.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS chapter_sync_enabled boolean NOT NULL DEFAULT false;

-- Loop guard for the item<->chapter direction (independent of github_blob_sha
-- / google_drive_md5, which already loop-guard the item<->external-file
-- direction): lets us tell "this pulled file is just the echo of our own
-- last chapter push" without re-deriving it from GitHub/Drive state.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS chapter_content_hash text;
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS chapter_last_synced_at timestamptz;

-- Sync-originated chapter revisions have no human author.
ALTER TABLE chapter_revisions ALTER COLUMN created_by DROP NOT NULL;
