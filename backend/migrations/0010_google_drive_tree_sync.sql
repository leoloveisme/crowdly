-- Google Drive sync, Phase 2: recursive (folder + subfolders) sync and
-- diff-based three-way merge — see backend/src/googleDriveSync.js.

-- Last content both Crowdly and Drive agreed on for a text file; the merge
-- base when both sides changed since. Only kept for small text files.
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS google_drive_base_content bytea;

-- Cached { driveFolderId: relativePath } for every folder under the
-- connected root, so the webhook can map a change to a Space through any
-- ancestor folder, not just the root.
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS google_drive_folder_ids jsonb;
