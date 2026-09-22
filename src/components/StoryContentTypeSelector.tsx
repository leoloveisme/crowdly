import React from "react";
import { FileAudio, Video, Image } from "lucide-react";
import EditableText from "@/components/EditableText";

/**
 * Checkbox row for choosing which content type(s) to show for the currently
 * active chapter (Text / Audio / Cartoon-Presentation / Video).
 *
 * Controlled: the Story page owns the selection and passes it to the chapter
 * reader, which renders the matching panels.
 */
export interface StoryContentTypes {
  text: boolean;
  audio: boolean;
  cartoon: boolean;
  video: boolean;
}

export const DEFAULT_STORY_CONTENT_TYPES: StoryContentTypes = {
  text: true,
  audio: false,
  cartoon: false,
  video: false,
};

interface StoryContentTypeSelectorProps {
  value: StoryContentTypes;
  onChange: (next: StoryContentTypes) => void;
}

const StoryContentTypeSelector: React.FC<StoryContentTypeSelectorProps> = ({ value, onChange }) => {
  const toggle = (type: keyof StoryContentTypes) => onChange({ ...value, [type]: !value[type] });

  return (
    <div className="flex flex-wrap -mx-2 gap-3 items-center mb-4">
      <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value.text}
          onChange={() => toggle("text")}
          className="accent-blue-500"
        />
        <EditableText id="story-content-type-text">Text</EditableText>
      </label>
      <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value.audio}
          onChange={() => toggle("audio")}
          className="accent-blue-500"
        />
        <FileAudio size={16} className="text-blue-300" />
        <EditableText id="story-content-type-audio">Audio</EditableText>
      </label>
      <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value.cartoon}
          onChange={() => toggle("cartoon")}
          className="accent-blue-500"
        />
        <Image size={16} className="text-pink-400" />
        <EditableText id="story-content-type-cartoon">Cartoon/Presentation</EditableText>
      </label>
      <label className="flex items-center gap-2 mx-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value.video}
          onChange={() => toggle("video")}
          className="accent-blue-500"
        />
        <Video size={16} className="text-green-400" />
        <EditableText id="story-content-type-video">Video</EditableText>
      </label>
    </div>
  );
};

export default StoryContentTypeSelector;
