-- Chapter media: the non-text formats of a chapter (Audio, Cartoon/
-- Presentation, Video). Media belongs to a chapter — and so, through its
-- story, to a language: a Russian narration lives on the Russian
-- translation's chapter.
--
--   kind   audio   — a narration / audiobook chapter file (upload or AI)
--          visual  — a Cartoon/Presentation: an ordered set of frames
--                    (chapter_media_frames), each an image with text overlays
--          video   — a YouTube/Vimeo embed (file uploads: coming soon)
--   source upload | embed | ai
--
-- Audio narrations reference the edition whose frozen text they read
-- (edition_id), and timings index into that edition's snapshot_paragraphs.
-- Moderation mirrors story_gallery_images: owner/contributors publish
-- directly, everyone else's submissions start as 'pending'.

CREATE TABLE IF NOT EXISTS chapter_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES story_title(story_title_id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES stories(chapter_id) ON DELETE CASCADE,
  edition_id uuid REFERENCES story_editions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  source text NOT NULL DEFAULT 'upload',
  label text,
  url text,
  mime text,
  size_bytes bigint,
  duration_seconds numeric,
  -- audio: [{ "paragraph": <index>, "start": <seconds> }, ...]
  timings jsonb,
  status text NOT NULL DEFAULT 'approved',
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES local_users(id) ON DELETE SET NULL,
  ai_provider text,
  ai_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_kind_check') THEN
    ALTER TABLE chapter_media
      ADD CONSTRAINT chapter_media_kind_check CHECK (kind IN ('audio', 'visual', 'video'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_source_check') THEN
    ALTER TABLE chapter_media
      ADD CONSTRAINT chapter_media_source_check CHECK (source IN ('upload', 'embed', 'ai'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapter_media_status_check') THEN
    ALTER TABLE chapter_media
      ADD CONSTRAINT chapter_media_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chapter_media_chapter_idx ON chapter_media (chapter_id, kind, status);
CREATE INDEX IF NOT EXISTS chapter_media_story_idx ON chapter_media (story_title_id);
CREATE INDEX IF NOT EXISTS chapter_media_edition_idx ON chapter_media (edition_id) WHERE edition_id IS NOT NULL;

-- Frames of a Cartoon/Presentation. Speech bubbles / captions are stored as
-- positioned TEXT (overlays), not baked into the image, so they stay
-- editable and translatable.
CREATE TABLE IF NOT EXISTS chapter_media_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES chapter_media(id) ON DELETE CASCADE,
  frame_index integer NOT NULL,
  image_url text NOT NULL,
  caption text,
  -- [{ "text": "...", "x": 0-100, "y": 0-100, "style": "bubble" | "box" }, ...] (percent of the image)
  overlays jsonb NOT NULL DEFAULT '[]'::jsonb,
  anchor_start integer,
  anchor_end integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chapter_media_frames_media_idx ON chapter_media_frames (media_id, frame_index);
