
-- 1. Add creator_id to story_title if not already present
ALTER TABLE story_title
ADD COLUMN IF NOT EXISTS creator_id uuid;

-- 2. Enable RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_title ENABLE ROW LEVEL SECURITY;
ALTER TABLE paragraph_branches ENABLE ROW LEVEL SECURITY;

-- 3. Only logged-in users can INSERT chapters
CREATE POLICY "Logged-in users can insert chapters"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. Only logged-in users can UPDATE chapters
CREATE POLICY "Logged-in users can update chapters"
  ON stories FOR UPDATE
  TO authenticated
  USING (true);

-- 5. Only logged-in users can DELETE chapters
CREATE POLICY "Logged-in users can delete chapters"
  ON stories FOR DELETE
  TO authenticated
  USING (true);

-- 6. Only logged-in users can INSERT paragraph branches
CREATE POLICY "Logged-in users can insert branches"
  ON paragraph_branches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 7. Only logged-in users can UPDATE paragraph branches
CREATE POLICY "Logged-in users can update branches"
  ON paragraph_branches FOR UPDATE
  TO authenticated
  USING (true);

-- 8. Only logged-in users can DELETE paragraph branches
CREATE POLICY "Logged-in users can delete branches"
  ON paragraph_branches FOR DELETE
  TO authenticated
  USING (true);

-- 9. Only initiator/admins/editors can DELETE a story (story_title)
CREATE POLICY "Initiator, admins, or editors can delete story"
  ON story_title FOR DELETE
  TO authenticated
  USING (
    (creator_id = auth.uid()) OR
    public.has_role(auth.uid(), 'platform_admin') OR
    public.has_role(auth.uid(), 'editor')
  );

-- 10. (Optional) Anyone can SELECT stories, title, branches
CREATE POLICY "Anyone can read stories"
  ON stories FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read story title"
  ON story_title FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read branches"
  ON paragraph_branches FOR SELECT
  USING (true);
