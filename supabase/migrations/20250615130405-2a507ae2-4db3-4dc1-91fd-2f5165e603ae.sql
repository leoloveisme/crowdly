
-- Allow authenticated users to insert a new story_title as themselves
CREATE POLICY "Creator can insert their own story title"
  ON story_title FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- (Optional) Also allow admins/editors to insert (if you want)
-- Uncomment below if needed:
-- CREATE POLICY "Admins and editors can insert any story title"
--   ON story_title FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     public.has_role(auth.uid(), 'platform_admin') OR
--     public.has_role(auth.uid(), 'editor')
--   );
