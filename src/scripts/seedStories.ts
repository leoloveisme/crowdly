
import { supabase } from "@/integrations/supabase/client";

// Helper to generate UUIDs for chapters and such
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

(async function seed() {
  console.log("Seeding: Story of my life with 3 chapters...");

  // 1. Insert new story_title
  // Disable type-checking by forcing supabase client and result to any
  const sb: any = supabase;

  const { data: titleData, error: titleError } = await sb
    .from("story_title")
    .insert({ title: "Story of my life" })
    .select("story_title_id")
    .single();

  if (titleError || !titleData) {
    console.error("Failed to create story_title:", titleError);
    process.exit(1);
  }
  const story_title_id = titleData.story_title_id;
  console.log("Story Title ID:", story_title_id);

  // 2. Insert new story_attributes
  const storyCreatorId = uuidv4();
  const storyId = uuidv4();
  const { data: attrData, error: attrError } = await sb
    .from("story_attributes")
    .insert({
      story_id: storyId,
      story_creator: storyCreatorId,
      new: "YES",
    })
    .select("id, story_id")
    .single();

  if (attrError || !attrData) {
    console.error("Failed to create story_attributes:", attrError);
    process.exit(1);
  }
  const actual_story_id = attrData.id;
  console.log("Story Attributes ID (`story_id` in stories):", actual_story_id);

  // 3. Insert 3 chapters into stories table
  const chapters = [
    { title: "The Beginning" },
    { title: "The Conflict" },
    { title: "The Resolution" },
  ];

  const toInsert = chapters.map(({ title }, i) => ({
    story_id: actual_story_id,
    story_title_id,
    chapter_id: uuidv4(),
    paragraph_id: uuidv4(),
    is_text: "YES",
    is_images: "YES",
    is_audio: "YES",
    is_video: "YES",
    contributors_ids: null,
    revision_nr: 0,
    revision_id: uuidv4(),
    branch_nr: 0,
    branch_id: uuidv4(),
    comments: "No comments yet. Be the first to share your thoughts.",
    comment_id: uuidv4(),
    like_nr: 0,
    dislike_nr: 0,
    clone_story_nr: 0,
    clone_story_id: null,
    clone_chapter_nr: 0,
    clone_chapter_id: null,
    // created_at/updated_at: handled by default values
  }));

  const { error: chaptersError } = await sb
    .from("stories")
    .insert(toInsert);

  if (chaptersError) {
    console.error("Failed to insert chapters into stories:", chaptersError);
    process.exit(1);
  }
  console.log("Successfully seeded 'Story of my life' with 3 chapters!");
  process.exit(0);
})();
