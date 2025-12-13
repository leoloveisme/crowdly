
-- Add new and missing fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS about TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS social_facebook TEXT,
  ADD COLUMN IF NOT EXISTS social_snapchat TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS social_other TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS notify_phone BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notify_app BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT TRUE;

-- Enable RLS if not enabled already
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Each user can SELECT their own profile
CREATE POLICY "Users can SELECT their own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Policy: Each user can UPDATE their own profile
CREATE POLICY "Users can UPDATE their own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid());

-- Policy: Each user can INSERT their own profile (if not already present)
CREATE POLICY "Users can INSERT their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());
