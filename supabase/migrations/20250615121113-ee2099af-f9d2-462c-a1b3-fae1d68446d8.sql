
-- Enable Row Level Security if not already enabled
ALTER TABLE story_title ENABLE ROW LEVEL SECURITY;

-- Allow the story creator to update the title
CREATE POLICY "Creator can update their own story title"
  ON story_title FOR UPDATE
  TO authenticated
  USING (creator_id = auth.uid());

-- Also allow admins and editors to update any story title
CREATE POLICY "Admins and editors can update any story title"
  ON story_title FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_admin') OR
    public.has_role(auth.uid(), 'editor')
  );
