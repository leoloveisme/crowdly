-- Keep git-ignored and dot-file junk (.git/, .DS_Store, ...) out of Spaces.
--
-- sync_ignored hides a row from Crowdly and makes every sync engine skip it
-- in both directions. It is deliberately NOT `deleted`: a soft-deleted row
-- makes Google Drive sync move the real Drive file to the trash, and Drive
-- folders get "undeleted" on every sync anyway (see googleDriveSync.js).
--
-- sync_ignore_rules caches the Space's .gitignore files as last seen on
-- GitHub/Drive ([{ "dir": "", "content": "..." }, ...]) so paths with no
-- remote tree at hand (desktop manifest sync, pushes) apply the same rules.

ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS sync_ignored boolean NOT NULL DEFAULT false;
ALTER TABLE creative_spaces ADD COLUMN IF NOT EXISTS sync_ignore_rules jsonb;

-- One-time, flag-only cleanup: hide every existing dot-file/dot-folder row
-- (the .git/ checkout, .gitignore, .DS_Store, ...). Never touches `deleted`.
UPDATE creative_space_items
SET sync_ignored = true
WHERE sync_ignored = false AND relative_path ~ '(^|/)\.';
