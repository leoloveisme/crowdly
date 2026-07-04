import React, { useState } from "react";
import TagBadge from "@/components/TagBadge";
import { parseTags } from "@/lib/tag-utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = "#tag #'multi word'",
  className = "",
}) => {
  const [input, setInput] = useState("");

  const handleCommit = () => {
    const parsed = parseTags(input);
    if (parsed.length > 0) {
      const merged = [...tags];
      for (const t of parsed) {
        if (!merged.includes(t)) merged.push(t);
      }
      onChange(merged);
    }
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    }
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} onRemove={() => handleRemove(tag)} />
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="border-none outline-none bg-transparent text-sm min-w-[120px] flex-1 py-0.5"
      />
    </div>
  );
};

export default TagInput;
