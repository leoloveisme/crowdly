-- Lets the Space import wizard target a Screenplay or a Comic, not just a
-- Story. comic_title gets the same creative_space_id link story_title and
-- screenplay_title already have; creative_space_items gets provenance
-- columns for scenes/pages, parallel to the pre-existing linked_chapter_id.
--
-- linked_scene_id/linked_page_id are import provenance only — they are NOT
-- wired into the chapter<->Space bidirectional GitHub/Drive sync added in
-- 0012/0013, which remains story/chapter-specific.

ALTER TABLE comic_title ADD COLUMN IF NOT EXISTS creative_space_id uuid REFERENCES creative_spaces(id) ON DELETE SET NULL;

ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS linked_scene_id uuid REFERENCES screenplay_scene(scene_id) ON DELETE SET NULL;
ALTER TABLE creative_space_items ADD COLUMN IF NOT EXISTS linked_page_id uuid REFERENCES comic_page(page_id) ON DELETE SET NULL;
