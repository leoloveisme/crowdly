-- Cover thumbnails of imported Discovery books (PUT/GET
-- /library/items/:id/cover in backend/src/library.js). The image sits next to
-- the private book file; cover_key is "<userId>/<itemId>.<png|jpg>".

ALTER TABLE library_items ADD COLUMN IF NOT EXISTS cover_key text;
