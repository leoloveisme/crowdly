import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// API base – same pattern used across the platform
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags for plain-text extraction. */
function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Parse an HTML file into { title, chapters }.
 */
function parseHtmlFile(html: string): {
  title: string;
  chapters: Array<{ chapterTitle: string; paragraphs: string[] }>;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  let title = "";
  const chapters: Array<{ chapterTitle: string; paragraphs: string[] }> = [];
  let currentChapter: { chapterTitle: string; paragraphs: string[] } | null = null;

  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").trim();
      if (text) {
        if (!currentChapter) {
          currentChapter = { chapterTitle: "Chapter 1", paragraphs: [] };
          chapters.push(currentChapter);
        }
        currentChapter.paragraphs.push(text);
      }
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      if (!title) {
        title = stripHtml(el.innerHTML);
      } else {
        currentChapter = { chapterTitle: stripHtml(el.innerHTML), paragraphs: [] };
        chapters.push(currentChapter);
      }
    } else if (tag === "h2" || tag === "h3") {
      currentChapter = { chapterTitle: stripHtml(el.innerHTML), paragraphs: [] };
      chapters.push(currentChapter);
    } else {
      const text = stripHtml(el.innerHTML).trim();
      if (text) {
        if (!currentChapter) {
          currentChapter = { chapterTitle: "Chapter 1", paragraphs: [] };
          chapters.push(currentChapter);
        }
        currentChapter.paragraphs.push(text);
      }
    }
  }

  if (!title) title = "Imported Story";
  if (chapters.length === 0) {
    chapters.push({ chapterTitle: "Chapter 1", paragraphs: ["(empty)"] });
  }

  return { title, chapters };
}

/**
 * Parse a plain-text file into { title, chapters }.
 */
function parseTxtFile(text: string): {
  title: string;
  chapters: Array<{ chapterTitle: string; paragraphs: string[] }>;
} {
  const lines = text.split(/\n/);
  let title = "";
  const chapters: Array<{ chapterTitle: string; paragraphs: string[] }> = [];
  let currentChapter: { chapterTitle: string; paragraphs: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!title) {
      title = trimmed;
      continue;
    }

    if (
      /^chapter\s/i.test(trimmed) ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !/^\d/.test(trimmed))
    ) {
      currentChapter = { chapterTitle: trimmed, paragraphs: [] };
      chapters.push(currentChapter);
    } else {
      if (!currentChapter) {
        currentChapter = { chapterTitle: "Chapter 1", paragraphs: [] };
        chapters.push(currentChapter);
      }
      currentChapter.paragraphs.push(trimmed);
    }
  }

  if (!title) title = "Imported Story";
  if (chapters.length === 0) {
    chapters.push({ chapterTitle: "Chapter 1", paragraphs: ["(empty)"] });
  }

  return { title, chapters };
}

/** Parse file into screenplay blocks (simplified). */
function parseForScreenplay(text: string, isHtml: boolean): {
  title: string;
  scenes: Array<{
    slugline: string;
    blocks: Array<{ block_type: string; text: string }>;
  }>;
} {
  let lines: string[];
  let title = "";

  if (isHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const body = doc.body;
    lines = [];
    for (const node of Array.from(body.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "h1" && !title) {
          title = stripHtml(el.innerHTML);
          continue;
        }
        lines.push(stripHtml(el.innerHTML).trim());
      } else if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || "").trim();
        if (t) lines.push(t);
      }
    }
  } else {
    lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && !title) {
      title = lines.shift()!;
    }
  }

  if (!title) title = "Imported Screenplay";

  const blocks: Array<{ block_type: string; text: string }> = lines
    .filter((l) => l.length > 0)
    .map((l) => ({ block_type: "action", text: l }));

  if (blocks.length === 0) {
    blocks.push({ block_type: "action", text: "(empty)" });
  }

  return {
    title,
    scenes: [{ slugline: "INT. LOCATION - DAY", blocks }],
  };
}

// ===========================================================================
// IMPORT DIALOG (Platform version using shadcn/ui)
// ===========================================================================

type ImportStep = "choose-type" | "upload-file";
type ImportKind = "story" | "screenplay";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<ImportStep>("choose-type");
  const [importKind, setImportKind] = useState<ImportKind>("story");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep("choose-type");
      setError(null);
      setImporting(false);
      setDragOver(false);
    }
  }, [open]);

  const handleChooseType = (kind: ImportKind) => {
    setImportKind(kind);
    setError(null);
    setStep("upload-file");
  };

  const processFile = useCallback(
    async (file: File) => {
      if (!user) {
        setError("You must be logged in to import.");
        return;
      }

      const userId = (user as any).id ?? (user as any).user_id;
      if (!userId) {
        setError("Unable to determine user ID.");
        return;
      }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        setError("File is too large (max 10 MB).");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["txt", "html", "htm"].includes(ext)) {
        setError("Unsupported file format. Please use .txt or .html files.");
        return;
      }

      setError(null);
      setImporting(true);

      try {
        const text = await file.text();
        if (!text.trim()) {
          setError("The file appears to be empty.");
          setImporting(false);
          return;
        }

        const isHtml = ext === "html" || ext === "htm";

        if (importKind === "story") {
          const parsed = isHtml ? parseHtmlFile(text) : parseTxtFile(text);
          const firstChapter = parsed.chapters[0];
          const res = await fetch(`${API_BASE}/stories/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.title,
              chapterTitle: firstChapter.chapterTitle,
              paragraphs: firstChapter.paragraphs,
              userId,
            }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(
              (body && (body.error || body.message)) ||
                "Failed to create story. Please try again."
            );
            setImporting(false);
            return;
          }

          const result = await res.json();
          const storyTitleId = result.storyTitleId;

          // Create additional chapters
          for (let i = 1; i < parsed.chapters.length; i++) {
            const ch = parsed.chapters[i];
            try {
              await fetch(`${API_BASE}/chapters`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  storyTitleId,
                  chapterTitle: ch.chapterTitle,
                  paragraphs: ch.paragraphs,
                  chapterIndex: i + 1,
                }),
              });
            } catch {
              // Best effort for additional chapters
            }
          }

          onOpenChange(false);
          navigate(`/story/${encodeURIComponent(storyTitleId)}`);
        } else {
          // Screenplay import
          const parsed = parseForScreenplay(text, isHtml);
          const res = await fetch(`${API_BASE}/screenplays/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.title,
              formatType: "feature_film",
              userId,
            }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(
              (body && (body.error || body.message)) ||
                "Failed to create screenplay. Please try again."
            );
            setImporting(false);
            return;
          }

          const result = await res.json();
          const screenplayId = result.screenplayId;

          onOpenChange(false);
          navigate(`/screenplay/${encodeURIComponent(screenplayId)}`);
        }
      } catch (err) {
        console.error("[ImportDialog] error:", err);
        setError("An unexpected error occurred. Please try again.");
        setImporting(false);
      }
    },
    [importKind, user, navigate, onOpenChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) processFile(files[0]);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) processFile(files[0]);
      e.target.value = "";
    },
    [processFile]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {step === "choose-type" && (
          <>
            <DialogHeader>
              <DialogTitle>Import</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">
              What would you like to import the file as?
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleChooseType("story")}
              >
                Import as regular (novel) story
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleChooseType("screenplay")}
              >
                Import as screenplay
              </Button>
            </div>
          </>
        )}

        {step === "upload-file" && (
          <>
            <DialogHeader>
              <DialogTitle>
                Import as {importKind === "story" ? "regular (novel) story" : "screenplay"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">
              Select a file to import. A new {importKind} will be created with the
              imported content. Supported formats: .txt, .html
            </p>

            {importing ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-600">Importing...</p>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                }}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="text-3xl mb-2">&#128196;</div>
                <div className="text-sm text-gray-600">
                  Drag and drop a file here, or click to browse
                </div>
                <div className="text-xs text-gray-400 mt-1">.txt, .html</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.html,.htm"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            )}

            {error && (
              <div className="mt-2 text-sm text-red-600">{error}</div>
            )}

            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep("choose-type");
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ===========================================================================
// EXPORT DIALOG (Platform version using shadcn/ui)
// ===========================================================================

type ExportStep = "choose-action" | "choose-format" | "choose-space" | "create-space";

interface CreativeSpace {
  id: string;
  name: string;
  visibility?: string;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called to get the current document content as HTML string. */
  getContentHtml: () => string;
  /** Called to get a suggested filename. */
  getTitle: () => string;
  /** "story" or "screenplay" – used for labelling. */
  contentType?: "story" | "screenplay";
  /** The ID of the current story/screenplay (for space linking). */
  contentId?: string;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  getContentHtml,
  getTitle,
  contentType = "story",
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<ExportStep>("choose-action");
  const [spaces, setSpaces] = useState<CreativeSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("choose-action");
      setSaveError(null);
      setSaving(false);
      setNewSpaceName("");
    }
  }, [open]);

  const userId = user ? ((user as any).id ?? (user as any).user_id) : null;

  const loadSpaces = useCallback(async () => {
    if (!userId) {
      setSpacesError("You must be logged in to see your spaces.");
      return;
    }
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const res = await fetch(
        `${API_BASE}/creative-spaces?userId=${encodeURIComponent(userId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSpacesError(body.error || "Failed to load spaces.");
        setSpaces([]);
        return;
      }
      const data = await res.json().catch(() => []);
      setSpaces(Array.isArray(data) ? data : []);
    } catch {
      setSpacesError("Failed to load spaces.");
      setSpaces([]);
    } finally {
      setSpacesLoading(false);
    }
  }, [userId]);

  // --------------- Save to device ---------------
  const handleSaveToDevice = (format: "html" | "txt") => {
    const html = getContentHtml();
    const title = getTitle() || "crowdly-export";
    const safeTitle = title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "crowdly-export";

    let content: string;
    let mimeType: string;
    let ext: string;

    if (format === "html") {
      content = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${html}\n</body>\n</html>`;
      mimeType = "text/html";
      ext = "html";
    } else {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      content = tmp.textContent || tmp.innerText || "";
      mimeType = "text/plain";
      ext = "txt";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onOpenChange(false);
  };

  // --------------- Save to Space ---------------
  const handleSaveToSpace = async (spaceId: string) => {
    if (!userId) {
      setSaveError("You must be logged in.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const html = getContentHtml();
      const title = getTitle() || "Exported document";
      const safeName = title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "export";

      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: "",
          name: `${safeName}.html`,
          mimeType: "text/html",
          sizeBytes: new Blob([html]).size,
          userId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(
          (body && (body.error || body.message)) || "Failed to save to space."
        );
        setSaving(false);
        return;
      }

      setSaving(false);
      onOpenChange(false);
      window.alert(`Saved "${safeName}.html" to the selected space.`);
    } catch (err) {
      console.error("[ExportDialog] save to space error:", err);
      setSaveError("An unexpected error occurred.");
      setSaving(false);
    }
  };

  const handleCreateSpace = async () => {
    if (!userId) {
      setSaveError("You must be logged in.");
      return;
    }
    if (!newSpaceName.trim()) {
      setSaveError("Please enter a name for the new space.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`${API_BASE}/creative-spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: newSpaceName.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(
          (body && (body.error || body.message)) || "Failed to create space."
        );
        setSaving(false);
        return;
      }

      const space = await res.json();
      await handleSaveToSpace(space.id);
    } catch (err) {
      console.error("[ExportDialog] create space error:", err);
      setSaveError("An unexpected error occurred.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {/* Step 1: Choose action */}
        {step === "choose-action" && (
          <>
            <DialogHeader>
              <DialogTitle>Export</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">
              How would you like to export this {contentType}?
            </p>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setStep("choose-format")}
              >
                Save file on this device
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setStep("choose-space");
                  loadSpaces();
                }}
              >
                Save to a Space
              </Button>
            </div>
          </>
        )}

        {/* Step 2a: Choose file format for device save */}
        {step === "choose-format" && (
          <>
            <DialogHeader>
              <DialogTitle>Save to device</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">Choose a file format:</p>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleSaveToDevice("html")}
              >
                HTML (web page with formatting)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleSaveToDevice("txt")}
              >
                Plain Text (simple text without formatting)
              </Button>
            </div>
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("choose-action")}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {/* Step 2b: Choose space to save to */}
        {step === "choose-space" && (
          <>
            <DialogHeader>
              <DialogTitle>Save to a Space</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">
              Choose an existing space or create a new one:
            </p>

            {spacesLoading ? (
              <div className="py-3 text-center text-sm text-gray-500">
                Loading spaces...
              </div>
            ) : spacesError ? (
              <div className="py-3 text-sm text-red-600">{spacesError}</div>
            ) : spaces.length === 0 ? (
              <div className="py-3 text-sm text-gray-500">
                You have no spaces yet. Create one below.
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto border rounded-lg mb-2">
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveToSpace(space.id)}
                    className="block w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium">{space.name}</div>
                    <div className="text-xs text-gray-400">
                      {space.visibility || "private"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                setNewSpaceName("");
                setSaveError(null);
                setStep("create-space");
              }}
            >
              + Create a new Space
            </Button>

            {saveError && (
              <div className="mt-2 text-sm text-red-600">{saveError}</div>
            )}

            {saving && (
              <div className="mt-2 text-center text-sm text-gray-600">
                Saving...
              </div>
            )}

            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("choose-action")}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Create a new space */}
        {step === "create-space" && (
          <>
            <DialogHeader>
              <DialogTitle>Create a new Space</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-4">
              Enter a name for the new space. The exported file will be saved to it.
            </p>
            <Input
              placeholder="Space name"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              autoFocus
              className="mb-3"
            />

            <Button
              className="w-full"
              disabled={saving || !newSpaceName.trim()}
              onClick={handleCreateSpace}
            >
              {saving ? "Creating & Saving..." : "Create Space & Save"}
            </Button>

            {saveError && (
              <div className="mt-2 text-sm text-red-600">{saveError}</div>
            )}

            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaveError(null);
                  setStep("choose-space");
                }}
              >
                Back
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
