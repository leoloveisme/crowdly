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
  /**
   * Which formats the current chapter actually has. A format that's missing
   * is shown disabled (still visible, so readers know it exists as a format).
   * Omitted = everything enabled.
   */
  available?: Partial<Record<keyof StoryContentTypes, boolean>>;
}

const StoryContentTypeSelector: React.FC<StoryContentTypeSelectorProps> = ({ value, onChange, available }) => {
  const toggle = (type: keyof StoryContentTypes) => onChange({ ...value, [type]: !value[type] });
  const isOff = (type: keyof StoryContentTypes) => available !== undefined && available[type] === false;
  const labelClass = (type: keyof StoryContentTypes) =>
    `flex items-center gap-2 mx-2 text-sm ${isOff(type) ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`;
  const offTitle: Record<keyof StoryContentTypes, string | undefined> = {
    text: undefined,
    audio: isOff("audio") ? "No narration for this chapter yet" : undefined,
    cartoon: isOff("cartoon") ? "No cartoon or presentation for this chapter yet" : undefined,
    video: isOff("video") ? "No video for this chapter yet" : undefined,
  };

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
      <label className={labelClass("audio")} title={offTitle.audio}>
        <input
          type="checkbox"
          checked={value.audio && !isOff("audio")}
          disabled={isOff("audio")}
          onChange={() => toggle("audio")}
          className="accent-blue-500"
        />
        <FileAudio size={16} className="text-blue-300" />
        <EditableText id="story-content-type-audio">Audio</EditableText>
      </label>
      <label className={labelClass("cartoon")} title={offTitle.cartoon}>
        <input
          type="checkbox"
          checked={value.cartoon && !isOff("cartoon")}
          disabled={isOff("cartoon")}
          onChange={() => toggle("cartoon")}
          className="accent-blue-500"
        />
        <Image size={16} className="text-pink-400" />
        <EditableText id="story-content-type-cartoon">Cartoon/Presentation</EditableText>
      </label>
      <label className={labelClass("video")} title={offTitle.video}>
        <input
          type="checkbox"
          checked={value.video && !isOff("video")}
          disabled={isOff("video")}
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
