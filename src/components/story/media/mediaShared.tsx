import React from "react";
import type { EditionSummary } from "@/lib/mediaApi";

export const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/webm,audio/flac,.mp3,.m4a,.ogg,.wav,.flac";

/** "Current text" (frozen at upload) or a named edition. */
export const EditionSelect: React.FC<{
  editions: EditionSummary[];
  value: string;
  onChange: (value: string) => void;
}> = ({ editions, value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full border rounded px-2 py-1.5 text-sm bg-white"
  >
    <option value="">Current text of the story (frozen at upload)</option>
    {editions.map((e) => (
      <option key={e.id} value={e.id}>
        Edition: {e.name}
        {e.status === "draft" ? " (draft)" : ""}
      </option>
    ))}
  </select>
);
