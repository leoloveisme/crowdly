-- Desktop (and later mobile) comic sync: page images are uploaded one by one
-- (POST /comics/:id/page-images) before the comic's structure is synced
-- (POST /comics/:id/sync-desktop) or an alternative is added through
-- POST /comics/:id/branches/sync. This table remembers which uploaded images
-- belong to which comic, so a sync can only reference images actually
-- uploaded for that comic (or already used by it).

CREATE TABLE IF NOT EXISTS comic_uploaded_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES comic_title(comic_id) ON DELETE CASCADE,
  url text NOT NULL,
  uploaded_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comic_uploaded_images_comic_url_idx ON comic_uploaded_images (comic_id, url);
