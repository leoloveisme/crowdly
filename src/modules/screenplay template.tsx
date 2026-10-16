import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EditableText from "@/components/EditableText";
import { errorMessage } from "@/lib/apiBase";
import { createScreenplayFromTemplate } from "@/lib/screenplayApi";

// "New screenplay" (/new-story-template?type=screenplay): creates a
// screenplay from the template — one scene with sample elements — and opens
// it in Editing mode on /screenplay/:id, where reading and editing live.

const FORMATS: { value: string; label: string }[] = [
  { value: "feature_film", label: "Feature film" },
  { value: "short_film", label: "Short film" },
  { value: "tv_episode", label: "TV episode" },
  { value: "web_series", label: "Web series" },
  { value: "stage_play", label: "Stage play" },
];

const ScreenplayTemplate: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [formatType, setFormatType] = useState("feature_film");
  const [creating, setCreating] = useState(false);

  if (!user) {
    return (
      <div className="border rounded-lg bg-white p-4 text-sm text-gray-600">
        <EditableText id="screenplay-login-required">You must be logged in to create a screenplay.</EditableText>
      </div>
    );
  }

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createScreenplayFromTemplate(title.trim() || "Untitled Screenplay", formatType);
      navigate(`/screenplay/${created.screenplayId}?mode=edit`);
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err) || "Failed to create screenplay", variant: "destructive" });
      setCreating(false);
    }
  };

  return (
    <div className="border rounded-lg bg-white p-6 space-y-4 max-w-xl">
      <EditableText id="screenplay-start-desc" as="p" className="text-sm text-gray-600">
        Start by creating a new screenplay. You will get an initial scene and a few sample elements that demonstrate
        the formatting.
      </EditableText>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter screenplay title"
        className="w-full border-b border-dashed border-blue-300 px-1 py-0.5 text-2xl font-bold focus:outline-none"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <EditableText id="screenplay-format-label">Format</EditableText>
        <select
          value={formatType}
          onChange={(e) => setFormatType(e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-white"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={create}
        disabled={creating}
        className="px-4 py-2 text-sm rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
      >
        {creating ? (
          <EditableText id="screenplay-creating">Creating screenplay...</EditableText>
        ) : (
          <EditableText id="screenplay-create-btn">Create screenplay from template</EditableText>
        )}
      </button>
    </div>
  );
};

export default ScreenplayTemplate;
