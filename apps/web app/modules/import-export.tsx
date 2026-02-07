import React, { useCallback, useEffect, useRef, useState } from "react";
import { CreativeSpace } from "./spaces";

// ---------------------------------------------------------------------------
// API base – same pattern used across the web app
// ---------------------------------------------------------------------------
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

// ---------------------------------------------------------------------------
// Shared modal primitives (inline-styled for this standalone app)
// ---------------------------------------------------------------------------
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  padding: "24px 28px",
  maxWidth: 460,
  width: "100%",
  boxSizing: "border-box",
  boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 18,
  fontWeight: 500,
  color: "#111",
};

const descStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 13,
  color: "#555",
};

const optionBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.15)",
  textDecoration: "none",
  color: "#111",
  fontSize: 14,
  cursor: "pointer",
  background: "#fff",
  textAlign: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "6px 16px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.2)",
  backgroundColor: "#f5f5f5",
  cursor: "pointer",
  fontSize: 13,
};

const dropzoneStyle: React.CSSProperties = {
  border: "2px dashed rgba(0,0,0,0.2)",
  borderRadius: 12,
  padding: "28px 16px",
  textAlign: "center",
  cursor: "pointer",
  transition: "border-color 150ms, background 150ms",
};

const dropzoneActiveStyle: React.CSSProperties = {
  ...dropzoneStyle,
  borderColor: "#4a9eff",
  background: "#f0f7ff",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getUserFromStorage(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem("crowdly_auth_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.email) return parsed;
  } catch {
    // ignore
  }
  return null;
}

/** Strip HTML tags for plain-text extraction. */
function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Parse an HTML file into { title, chapters } where each chapter has a title
 * and array of paragraph strings.
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
        // Treat subsequent h1s as chapter titles
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

    // Lines starting with "Chapter" or all-uppercase become chapter headings
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

  // Put all content into one scene as action blocks
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
// IMPORT POPUP
// ===========================================================================

type ImportStep = "choose-type" | "upload-file";
type ImportKind = "story" | "screenplay";

interface ImportPopupProps {
  open: boolean;
  onClose: () => void;
}

export const ImportPopup: React.FC<ImportPopupProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<ImportStep>("choose-type");
  const [importKind, setImportKind] = useState<ImportKind>("story");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Reset state when popup opens
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
      const user = getUserFromStorage();
      if (!user) {
        setError("You must be logged in to import.");
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

          // Create the story with the first chapter via backend
          const firstChapter = parsed.chapters[0];
          const res = await fetch(`${API_BASE}/stories/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.title,
              chapterTitle: firstChapter.chapterTitle,
              paragraphs: firstChapter.paragraphs,
              userId: user.id,
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

          // If there are additional chapters, create them too
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

          // Navigate to the new story
          window.location.href = `/story/${encodeURIComponent(storyTitleId)}`;
        } else {
          // Screenplay import
          const parsed = parseForScreenplay(text, isHtml);

          // Create screenplay on backend
          const res = await fetch(`${API_BASE}/screenplays/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.title,
              formatType: "feature_film",
              userId: user.id,
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

          // Navigate to the new screenplay
          window.location.href = `/screenplay/${encodeURIComponent(screenplayId)}`;
        }
      } catch (err) {
        console.error("[ImportPopup] error:", err);
        setError("An unexpected error occurred. Please try again.");
        setImporting(false);
      }
    },
    [importKind]
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

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {step === "choose-type" && (
          <>
            <p style={titleStyle}>Import</p>
            <p style={descStyle}>What would you like to import the file as?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => handleChooseType("story")}
              >
                Import as regular (novel) story
              </button>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => handleChooseType("screenplay")}
              >
                Import as screenplay
              </button>
            </div>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "upload-file" && (
          <>
            <p style={titleStyle}>
              Import as {importKind === "story" ? "regular (novel) story" : "screenplay"}
            </p>
            <p style={descStyle}>
              Select a file to import. A new {importKind} will be created with the
              imported content. Supported formats: .txt, .html
            </p>

            {importing ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <p style={{ fontSize: 14, color: "#333" }}>Importing...</p>
              </div>
            ) : (
              <div
                style={dragOver ? dropzoneActiveStyle : dropzoneStyle}
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
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Drag and drop a file here, or click to browse
                </div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>.txt, .html</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.html,.htm"
                  style={{ display: "none" }}
                  onChange={handleFileInput}
                />
              </div>
            )}

            {error && (
              <div style={{ marginTop: 10, color: "#b00020", fontSize: 13 }}>{error}</div>
            )}

            <div style={{ textAlign: "center", display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => {
                  setStep("choose-type");
                  setError(null);
                }}
              >
                Back
              </button>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// EXPORT POPUP
// ===========================================================================

type ExportStep = "choose-action" | "choose-format" | "choose-space" | "create-space";

interface ExportPopupProps {
  open: boolean;
  onClose: () => void;
  /** Called to get the current document content as HTML string. */
  getContentHtml: () => string;
  /** Called to get a suggested filename. */
  getTitle: () => string;
  /** "story" or "screenplay" – used for labelling. */
  contentType?: "story" | "screenplay";
  /** The ID of the current story/screenplay (for space linking). */
  contentId?: string;
}

export const ExportPopup: React.FC<ExportPopupProps> = ({
  open,
  onClose,
  getContentHtml,
  getTitle,
  contentType = "story",
  contentId,
}) => {
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

  const loadSpaces = useCallback(async () => {
    const user = getUserFromStorage();
    if (!user) {
      setSpacesError("You must be logged in to see your spaces.");
      return;
    }
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const res = await fetch(
        `${API_BASE}/creative-spaces?userId=${encodeURIComponent(user.id)}`
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
  }, []);

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
      // Convert HTML to plain text
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
    onClose();
  };

  // --------------- Save to Space ---------------
  const handleSaveToSpace = async (spaceId: string) => {
    const user = getUserFromStorage();
    if (!user) {
      setSaveError("You must be logged in.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const html = getContentHtml();
      const title = getTitle() || "Exported document";
      const safeName = title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "export";

      // Create a file item in the space
      const res = await fetch(`${API_BASE}/creative-spaces/${spaceId}/items/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: "",
          name: `${safeName}.html`,
          mimeType: "text/html",
          sizeBytes: new Blob([html]).size,
          userId: user.id,
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
      onClose();
      window.alert(`Saved "${safeName}.html" to the selected space.`);
    } catch (err) {
      console.error("[ExportPopup] save to space error:", err);
      setSaveError("An unexpected error occurred.");
      setSaving(false);
    }
  };

  const handleCreateSpace = async () => {
    const user = getUserFromStorage();
    if (!user) {
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
          userId: user.id,
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
      // Now save the file to the newly created space
      await handleSaveToSpace(space.id);
    } catch (err) {
      console.error("[ExportPopup] create space error:", err);
      setSaveError("An unexpected error occurred.");
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* Step 1: Choose action */}
        {step === "choose-action" && (
          <>
            <p style={titleStyle}>Export</p>
            <p style={descStyle}>
              How would you like to export this {contentType}?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => setStep("choose-format")}
              >
                Save file on this device
              </button>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => {
                  setStep("choose-space");
                  loadSpaces();
                }}
              >
                Save to a Space
              </button>
            </div>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step 2a: Choose file format for device save */}
        {step === "choose-format" && (
          <>
            <p style={titleStyle}>Save to device</p>
            <p style={descStyle}>Choose a file format:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => handleSaveToDevice("html")}
              >
                HTML (web page with formatting)
              </button>
              <button
                type="button"
                style={optionBtnStyle}
                onClick={() => handleSaveToDevice("txt")}
              >
                Plain Text (simple text without formatting)
              </button>
            </div>
            <div style={{ textAlign: "center", display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => setStep("choose-action")}
              >
                Back
              </button>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step 2b: Choose space to save to */}
        {step === "choose-space" && (
          <>
            <p style={titleStyle}>Save to a Space</p>
            <p style={descStyle}>
              Choose an existing space or create a new one:
            </p>

            {spacesLoading ? (
              <div style={{ padding: 12, textAlign: "center", fontSize: 13, color: "#666" }}>
                Loading spaces...
              </div>
            ) : spacesError ? (
              <div style={{ padding: 12, color: "#b00020", fontSize: 13 }}>
                {spacesError}
              </div>
            ) : spaces.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: "#666" }}>
                You have no spaces yet. Create one below.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveToSpace(space.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      textAlign: "left",
                      border: "none",
                      borderBottom: "1px solid #f0f0f0",
                      background: "transparent",
                      cursor: saving ? "default" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{space.name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>
                      {space.visibility || "private"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              style={{ ...optionBtnStyle, marginTop: 8, fontSize: 13 }}
              onClick={() => {
                setNewSpaceName("");
                setSaveError(null);
                setStep("create-space");
              }}
            >
              + Create a new Space
            </button>

            {saveError && (
              <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>
                {saveError}
              </div>
            )}

            {saving && (
              <div style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: "#333" }}>
                Saving...
              </div>
            )}

            <div style={{ textAlign: "center", display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => setStep("choose-action")}
              >
                Back
              </button>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step 3: Create a new space */}
        {step === "create-space" && (
          <>
            <p style={titleStyle}>Create a new Space</p>
            <p style={descStyle}>
              Enter a name for the new space. The exported file will be saved to
              it.
            </p>
            <input
              type="text"
              placeholder="Space name"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                fontSize: 14,
                boxSizing: "border-box",
                marginBottom: 12,
              }}
              autoFocus
            />

            <button
              type="button"
              disabled={saving || !newSpaceName.trim()}
              style={{
                ...optionBtnStyle,
                background: saving ? "#555" : "#111",
                color: "#fff",
                border: "1px solid #111",
                opacity: saving || !newSpaceName.trim() ? 0.6 : 1,
                cursor: saving || !newSpaceName.trim() ? "default" : "pointer",
              }}
              onClick={handleCreateSpace}
            >
              {saving ? "Creating & Saving..." : "Create Space & Save"}
            </button>

            {saveError && (
              <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>
                {saveError}
              </div>
            )}

            <div style={{ textAlign: "center", display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => {
                  setSaveError(null);
                  setStep("choose-space");
                }}
              >
                Back
              </button>
              <button type="button" style={cancelBtnStyle} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
