
-- Create stories table linked to story_title
CREATE TABLE public.stories (
  chapter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id UUID NOT NULL REFERENCES public.story_title(story_title_id) ON DELETE CASCADE,
  chapter_title TEXT NOT NULL,
  paragraphs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (Optional, but recommended) Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stories_story_title_id ON public.stories(story_title_id);

-- (Optional) Make it easy to update updated_at on change
CREATE TRIGGER update_stories_updated_at
BEFORE UPDATE ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
