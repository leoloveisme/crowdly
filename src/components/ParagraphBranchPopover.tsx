
import React, { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Trash2, Save, X } from "lucide-react";
import { Label } from "@/components/ui/label";

/**
 * Adds support for language and metadata inputs.
 * - language: dropdown for a few languages.
 * - metadata: free-form JSON textarea (optional).
 */

type BranchParagraph = {
  id: string;
  text: string;
};

type Props = {
  trigger: React.ReactNode;
  // Now returns language + metadata as well
  onCreateBranch: (data: { branchName: string; paragraphs: string[]; language: string; metadata: any }) => void;
};

const languageLabels: { [key: string]: string } = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  zh: "中文",
  ar: "العربية",
  ru: "Русский",
  hi: "हिन्दी",
};

const languages = Object.keys(languageLabels);

const ParagraphBranchPopover: React.FC<Props> = ({ trigger, onCreateBranch }) => {
  const [open, setOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [paragraphs, setParagraphs] = useState<BranchParagraph[]>([
    { id: Math.random().toString(), text: "" },
  ]);
  const [editingParagraphId, setEditingParagraphId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [language, setLanguage] = useState("en");
  const [metadataText, setMetadataText] = useState("");
  const [metadataError, setMetadataError] = useState("");

  // Add a new paragraph
  const handleAddParagraph = () => {
    setParagraphs([...paragraphs, { id: Math.random().toString(), text: "" }]);
    setEditingParagraphId(null);
    setNewText("");
  };

  // Delete a paragraph
  const handleDeleteParagraph = (id: string) => {
    setParagraphs(paragraphs.filter((p) => p.id !== id));
  };

  // Start editing a paragraph
  const handleEditParagraph = (id: string, text: string) => {
    setEditingParagraphId(id);
    setNewText(text);
  };

  // Save edited paragraph
  const handleSaveParagraph = (id: string) => {
    setParagraphs(paragraphs.map((p) => (p.id === id ? { ...p, text: newText } : p)));
    setEditingParagraphId(null);
    setNewText("");
  };

  // Create the branch!
  const handleCreate = () => {
    // Don’t allow empty paragraphs
    if (paragraphs.some((p) => !p.text.trim())) return;
    let parsedMetadata: any = null;
    if (metadataText.trim()) {
      try {
        parsedMetadata = JSON.parse(metadataText);
        setMetadataError("");
      } catch (e) {
        setMetadataError("Invalid JSON.");
        return;
      }
    }
    onCreateBranch({ branchName, paragraphs: paragraphs.map((p) => p.text), language, metadata: parsedMetadata });
    setOpen(false);
    setBranchName("");
    setParagraphs([{ id: Math.random().toString(), text: "" }]);
    setLanguage("en");
    setMetadataText("");
    setMetadataError("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="max-w-lg w-96 z-[50] bg-white">
        <div className="mb-2">
          <Label htmlFor="branch-name" className="mb-1 font-semibold block">
            Branch Name (optional)
          </Label>
          <Input
            id="branch-name"
            value={branchName}
            placeholder="Enter branch name"
            onChange={(e) => setBranchName(e.target.value)}
            className="mb-4"
          />
        </div>

        <div>
          <Label className="mb-1 font-semibold block">Branch Paragraphs</Label>
          <div className="space-y-3">
            {paragraphs.map((p, idx) => (
              <div key={p.id} className="flex items-start gap-1">
                <span className="mt-2 mr-1 text-xs text-gray-400">{idx + 1}.</span>
                {editingParagraphId === p.id ? (
                  <Textarea
                    value={newText}
                    autoFocus
                    onChange={(e) => setNewText(e.target.value)}
                    className="min-h-[62px] flex-1"
                  />
                ) : (
                  <p className="min-h-[46px] flex-1 text-gray-900 bg-gray-50 rounded px-2 py-2">
                    {p.text || <span className="text-gray-400 italic">Empty paragraph</span>}
                  </p>
                )}
                <div className="ml-2 flex flex-col gap-1">
                  {editingParagraphId === p.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => handleSaveParagraph(p.id)}>
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => setEditingParagraphId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => handleEditParagraph(p.id, p.text)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => handleDeleteParagraph(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-3" onClick={handleAddParagraph}>
            <Plus className="mr-1 w-4 h-4" />
            Add Paragraph
          </Button>
        </div>
        {/* Language selection */}
        <div className="mt-5">
          <Label htmlFor="lang-select" className="mb-1 font-semibold block">Language</Label>
          <select
            id="lang-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full border rounded px-2 py-1 bg-white text-gray-700"
          >
            {languages.map(code => (
              <option key={code} value={code}>{languageLabels[code]}</option>
            ))}
          </select>
        </div>
        {/* Metadata input */}
        <div className="mt-5">
          <Label htmlFor="branch-metadata" className="mb-1 font-semibold block">Metadata (optional, JSON)</Label>
          <Textarea
            id="branch-metadata"
            value={metadataText}
            placeholder='{"example": 42}'
            onChange={e => setMetadataText(e.target.value)}
            className="min-h-[45px]"
          />
          {metadataError && <div className="text-red-500 text-xs mt-1">{metadataError}</div>}
        </div>
        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={paragraphs.some((p) => !p.text.trim()) || !!metadataError}>
            Create Branch
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ParagraphBranchPopover;

