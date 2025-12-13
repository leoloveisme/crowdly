
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Database } from "@/integrations/supabase/types";

type StoryTitleRow = Database["public"]["Tables"]["story_title"]["Row"];

interface StorySelectorProps {
  stories: StoryTitleRow[];
  selectedStoryId: string | null;
  onSelect: (id: string) => void;
}

const StorySelector: React.FC<StorySelectorProps> = ({ stories, selectedStoryId, onSelect }) => {
  return (
    <Select value={selectedStoryId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Select a story..." />
      </SelectTrigger>
      <SelectContent>
        {stories.map((story) => (
          <SelectItem key={story.story_title_id} value={story.story_title_id}>
            {story.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default StorySelector;

