
-- 1. Revisions for Story Titles
CREATE TABLE IF NOT EXISTS public.story_title_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_title_id uuid NOT NULL REFERENCES public.story_title(story_title_id) ON DELETE CASCADE,
  prev_title text,
  new_title text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_reason text,
  language text DEFAULT 'en',
  revision_number integer NOT NULL DEFAULT 1
);

-- 2. Revisions for Chapters
CREATE TABLE IF NOT EXISTS public.chapter_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.stories(chapter_id) ON DELETE CASCADE,
  prev_chapter_title text,
  new_chapter_title text NOT NULL,
  prev_paragraphs text[],
  new_paragraphs text[] NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_reason text,
  language text DEFAULT 'en',
  revision_number integer NOT NULL DEFAULT 1
);

-- 3. Revisions for Paragraphs
CREATE TABLE IF NOT EXISTS public.paragraph_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.stories(chapter_id) ON DELETE CASCADE,
  paragraph_index integer NOT NULL,
  prev_paragraph text,
  new_paragraph text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_reason text,
  language text DEFAULT 'en',
  revision_number integer NOT NULL DEFAULT 1
);

-- 4. Revisions for Branches
CREATE TABLE IF NOT EXISTS public.branch_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  prev_branch_name text,
  new_branch_name text NOT NULL,
  prev_branch_paragraphs text[],
  new_branch_paragraphs text[] NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_reason text,
  language text DEFAULT 'en',
  revision_number integer NOT NULL DEFAULT 1
);

-- Note: revision_number should be calculated by the application or set by an insert trigger.
-- Further trigger definitions for automatic increment are possible if you wish.

