
-- Add `language` column to support multilingual branches (default "en")
ALTER TABLE public.paragraph_branches
ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- Add `metadata` column for extensible structure (JSONB)
ALTER TABLE public.paragraph_branches
ADD COLUMN IF NOT EXISTS metadata JSONB;
