
-- Table for comments on chapters
CREATE TABLE public.chapter_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (chapter_id) REFERENCES public.stories (chapter_id) ON DELETE CASCADE
);

-- Table for likes/dislikes on chapters
CREATE TABLE public.chapter_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL,
  user_id UUID NOT NULL,
  is_like BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (chapter_id) REFERENCES public.stories (chapter_id) ON DELETE CASCADE,
  UNIQUE (chapter_id, user_id)
);

-- Table for contributors for chapters
CREATE TABLE public.chapter_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL,
  user_id UUID NOT NULL,
  added_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (chapter_id) REFERENCES public.stories (chapter_id) ON DELETE CASCADE
);

-- Table for paragraph branches
CREATE TABLE public.paragraph_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL,
  parent_paragraph_index INTEGER NOT NULL,
  parent_paragraph_text TEXT NOT NULL,
  branch_text TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (chapter_id) REFERENCES public.stories (chapter_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.chapter_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragraph_branches ENABLE ROW LEVEL SECURITY;

-- RLS for chapter_comments
CREATE POLICY "Users can view their own comments"
  ON public.chapter_comments FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own comments"
  ON public.chapter_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments"
  ON public.chapter_comments FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments"
  ON public.chapter_comments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS for chapter_likes
CREATE POLICY "Users can view their own likes"
  ON public.chapter_likes FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own likes"
  ON public.chapter_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own likes"
  ON public.chapter_likes FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own likes"
  ON public.chapter_likes FOR DELETE
  USING (auth.uid() = user_id);

-- For chapter_contributors: managed by story initiator or admins/editors
CREATE POLICY "Platform admins, editors, or story initiator can manage contributors"
  ON public.chapter_contributors FOR INSERT
  WITH CHECK (
    (
      SELECT story_creator FROM public.story_attributes
      WHERE public.story_attributes.story_id = (
        SELECT s.story_title_id FROM public.stories AS s
        WHERE s.chapter_id = chapter_id
        LIMIT 1
      )
    ) = auth.uid()
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'chief_editor')
  );
CREATE POLICY "Contributors can view their own records"
  ON public.chapter_contributors FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contributor record"
  ON public.chapter_contributors FOR DELETE
  USING (
    auth.uid() = user_id
    OR
    (
      (
        SELECT story_creator FROM public.story_attributes
        WHERE public.story_attributes.story_id = (
          SELECT s.story_title_id FROM public.stories AS s
          WHERE s.chapter_id = chapter_id
          LIMIT 1
        )
      ) = auth.uid()
      OR public.has_role(auth.uid(), 'platform_admin')
      OR public.has_role(auth.uid(), 'editor')
      OR public.has_role(auth.uid(), 'chief_editor')
    )
  );

-- RLS for paragraph_branches
CREATE POLICY "Users can view their own paragraph branches"
  ON public.paragraph_branches FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own paragraph branches"
  ON public.paragraph_branches FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own paragraph branches"
  ON public.paragraph_branches FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own paragraph branches"
  ON public.paragraph_branches FOR DELETE
  USING (auth.uid() = user_id);

