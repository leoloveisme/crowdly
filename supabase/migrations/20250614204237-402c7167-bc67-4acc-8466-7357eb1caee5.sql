
-- Insert a story title for "Story of my life" (if it doesn't exist already)
INSERT INTO public.story_title (title)
SELECT 'Story of my life'
WHERE NOT EXISTS (
  SELECT 1 FROM public.story_title WHERE title = 'Story of my life'
);

-- Get the story_title_id we just inserted (or the existing one)
WITH story_title_row AS (
  SELECT story_title_id FROM public.story_title WHERE title = 'Story of my life' LIMIT 1
),
new_story_attributes AS (
  -- Insert into story_attributes & return its id
  INSERT INTO public.story_attributes (
    story_id, story_creator, new
  )
  VALUES (
    gen_random_uuid(),
    gen_random_uuid(), -- Demo creator
    'YES'
  )
  RETURNING id
)
-- Insert seed chapters into stories table
INSERT INTO public.stories (
  story_id,
  story_title_id,
  chapter_id,
  paragraph_id,
  is_text,
  is_images,
  is_audio,
  is_video,
  contributors_ids,
  revision_nr,
  revision_id,
  branch_nr,
  branch_id,
  comments,
  comment_id,
  like_nr,
  dislike_nr,
  clone_story_nr,
  clone_story_id,
  clone_chapter_nr,
  clone_chapter_id
)
SELECT
  new_story_attributes.id AS story_id,
  story_title_row.story_title_id,
  gen_random_uuid(), -- chapter_id
  gen_random_uuid(), -- paragraph_id
  'YES', -- is_text
  'YES', -- is_images
  'YES', -- is_audio
  'YES', -- is_video
  NULL,  -- contributors_ids
  0,     -- revision_nr
  gen_random_uuid(), -- revision_id
  0,     -- branch_nr
  gen_random_uuid(), -- branch_id
  'No comments yet. Be the first to share your thoughts.', -- comments
  gen_random_uuid(), -- comment_id
  0,     -- like_nr
  0,     -- dislike_nr
  0,     -- clone_story_nr
  NULL,  -- clone_story_id
  0,     -- clone_chapter_nr
  NULL   -- clone_chapter_id
FROM story_title_row, new_story_attributes
UNION ALL
SELECT
  new_story_attributes.id AS story_id,
  story_title_row.story_title_id,
  gen_random_uuid(), -- chapter_id
  gen_random_uuid(), -- paragraph_id
  'YES',
  'YES',
  'YES',
  'YES',
  NULL,
  0,
  gen_random_uuid(),
  0,
  gen_random_uuid(),
  'No comments yet. Be the first to share your thoughts.',
  gen_random_uuid(),
  0,
  0,
  0,
  NULL,
  0,
  NULL
FROM story_title_row, new_story_attributes
UNION ALL
SELECT
  new_story_attributes.id AS story_id,
  story_title_row.story_title_id,
  gen_random_uuid(),
  gen_random_uuid(),
  'YES',
  'YES',
  'YES',
  'YES',
  NULL,
  0,
  gen_random_uuid(),
  0,
  gen_random_uuid(),
  'No comments yet. Be the first to share your thoughts.',
  gen_random_uuid(),
  0,
  0,
  0,
  NULL,
  0,
  NULL
FROM story_title_row, new_story_attributes;
