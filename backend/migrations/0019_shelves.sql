-- Shelves (Discovery mode + web /shelves) and a fix for user_story_status.
--
-- 1. user_story_status had one row per click instead of one per user and
--    item: its unique index includes a column that is always NULL
--    (screenplay_id for stories, story_title_id for screenplays), and NULLs
--    never conflict, so every "favorite / living / lived" change INSERTed a
--    new row. Merge the duplicates - a flag is kept if any row had it, which
--    is exactly what the favorites / living / lived lists show today - and
--    enforce one row per user and item with partial unique indexes
--    (setUserStoryStatus in backend/src/storyLists.js targets them).
--
-- 2. shelves / shelf_items: private, per-user shelves. A "manual" shelf holds
--    chosen items; a "smart" shelf has rules and is evaluated on request
--    (backend/src/shelves.js). Favorites / Living / Lived and the public
--    lists are system shelves computed on the fly, not stored here.

WITH grouped AS (
  SELECT
    id,
    ROW_NUMBER() OVER w AS rn,
    bool_or(is_favorite) OVER w AS any_favorite,
    bool_or(is_living) OVER w AS any_living,
    bool_or(is_lived) OVER w AS any_lived,
    max(updated_at) OVER w AS last_updated
  FROM user_story_status
  WINDOW w AS (
    PARTITION BY user_id, content_type, story_title_id, screenplay_id
    ORDER BY created_at, id
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  )
)
UPDATE user_story_status us
   SET is_favorite = g.any_favorite,
       is_living = g.any_living,
       is_lived = g.any_lived,
       updated_at = g.last_updated
  FROM grouped g
 WHERE us.id = g.id AND g.rn = 1
   AND EXISTS (
     SELECT 1 FROM user_story_status d
      WHERE d.user_id = us.user_id AND d.content_type = us.content_type
        AND d.story_title_id IS NOT DISTINCT FROM us.story_title_id
        AND d.screenplay_id IS NOT DISTINCT FROM us.screenplay_id
        AND d.id <> us.id
   );

DELETE FROM user_story_status us
 USING (
   SELECT id, ROW_NUMBER() OVER (
     PARTITION BY user_id, content_type, story_title_id, screenplay_id
     ORDER BY created_at, id
   ) AS rn
   FROM user_story_status
 ) ranked
 WHERE us.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_story_status_story_uniq
  ON user_story_status (user_id, story_title_id) WHERE content_type = 'story';
CREATE UNIQUE INDEX IF NOT EXISTS user_story_status_screenplay_uniq
  ON user_story_status (user_id, screenplay_id) WHERE content_type = 'screenplay';

CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'manual',
  rules jsonb,
  sort text NOT NULL DEFAULT 'manual',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shelves_kind_check') THEN
    ALTER TABLE shelves ADD CONSTRAINT shelves_kind_check CHECK (kind IN ('manual', 'smart'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shelves_sort_check') THEN
    ALTER TABLE shelves ADD CONSTRAINT shelves_sort_check
      CHECK (sort IN ('manual', 'title', 'added', 'progress', 'last_read'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shelves_user_position_idx ON shelves (user_id, position);

CREATE TABLE IF NOT EXISTS shelf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id uuid NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  library_item_id uuid REFERENCES library_items(id) ON DELETE CASCADE,
  story_title_id uuid REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  screenplay_id uuid REFERENCES screenplay_title(screenplay_id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shelf_items_target_check') THEN
    ALTER TABLE shelf_items ADD CONSTRAINT shelf_items_target_check CHECK (
      (item_type = 'library_item' AND library_item_id IS NOT NULL AND story_title_id IS NULL AND screenplay_id IS NULL)
      OR (item_type = 'story' AND story_title_id IS NOT NULL AND library_item_id IS NULL AND screenplay_id IS NULL)
      OR (item_type = 'screenplay' AND screenplay_id IS NOT NULL AND library_item_id IS NULL AND story_title_id IS NULL)
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_library_uniq
  ON shelf_items (shelf_id, library_item_id) WHERE item_type = 'library_item';
CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_story_uniq
  ON shelf_items (shelf_id, story_title_id) WHERE item_type = 'story';
CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_screenplay_uniq
  ON shelf_items (shelf_id, screenplay_id) WHERE item_type = 'screenplay';
CREATE INDEX IF NOT EXISTS shelf_items_shelf_position_idx ON shelf_items (shelf_id, position);
