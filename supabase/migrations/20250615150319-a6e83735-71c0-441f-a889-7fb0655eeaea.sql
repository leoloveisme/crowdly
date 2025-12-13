
-- Create a new enum type for contribution status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_status') THEN
    CREATE TYPE contribution_status AS ENUM ('approved', 'rejected', 'undecided');
  END IF;
END
$$;

-- Add contribution_status and contributor_id columns to chapters (stories table)
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS contribution_status contribution_status DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS contributor_id uuid REFERENCES profiles(id);

-- Optional: If you want per-paragraph status in the future, you’ll need to add a paragraph_contributions table or similar.

-- Policy: Only allow contributor, story creator, admins, or editors to read undecided chapters.
-- (Policies to be added once base schema is approved and roles logic is confirmed)
