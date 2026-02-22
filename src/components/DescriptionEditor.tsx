import React, { useState, useRef, useEffect } from "react";

interface DescriptionEditorProps {
  description: string | null;
  onSave: (desc: string) => Promise<void>;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

const DescriptionEditor: React.FC<DescriptionEditorProps> = ({
  description,
  onSave,
  readOnly = false,
  placeholder = "Add a description...",
  className = "",
}) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description || "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(description || "");
  }, [description]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [editing]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (trimmed !== (description || "").trim()) {
      setSaving(true);
      try {
        await onSave(trimmed);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setValue(description || "");
      setEditing(false);
    }
  };

  if (readOnly) {
    if (!description) return null;
    return (
      <p className={`text-sm text-gray-600 whitespace-pre-wrap ${className}`}>
        {description}
      </p>
    );
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={placeholder}
        className={`w-full text-sm border border-gray-300 rounded-md p-2 resize-none outline-none focus:border-blue-400 ${className}`}
        rows={3}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`text-sm cursor-pointer rounded-md p-2 hover:bg-gray-50 min-h-[2rem] ${
        description ? "text-gray-600 whitespace-pre-wrap" : "text-gray-400 italic"
      } ${className}`}
    >
      {description || placeholder}
    </div>
  );
};

export default DescriptionEditor;
