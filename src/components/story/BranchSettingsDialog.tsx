import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocales } from "./LanguageSwitcher";
import type { BranchSettingsPatch, InlineBranch } from "./types";

interface BranchSettingsDialogProps {
  branch: InlineBranch | null;
  onOpenChange: (open: boolean) => void;
  /** The chapter's current paragraph this branch replaces (for context). */
  originalParagraph: string;
  storyLanguage: string;
  /** Story owner or the branch's author: every field is editable. Others can only propose text. */
  canEditAll: boolean;
  canDelete: boolean;
  onSave: (patch: BranchSettingsPatch) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

/** metadata minus the fields this dialog edits directly. */
function otherMetadata(metadata: Record<string, unknown> | null) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { note, ...rest } = metadata ?? {};
  return rest;
}

/**
 * Settings of one paragraph branch — an alternative version of a paragraph.
 * Opens with the branch's current values; nothing is saved until Save.
 */
const BranchSettingsDialog: React.FC<BranchSettingsDialogProps> = ({
  branch,
  onOpenChange,
  originalParagraph,
  storyLanguage,
  canEditAll,
  canDelete,
  onSave,
  onDelete,
}) => {
  const locales = useLocales();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState(storyLanguage);
  const [note, setNote] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  // (Re)load the form whenever a branch is opened.
  useEffect(() => {
    if (!branch) return;
    setName(branch.name ?? "");
    setText(branch.text ?? "");
    setLanguage(branch.language || storyLanguage);
    setNote(typeof branch.metadata?.note === "string" ? (branch.metadata.note as string) : "");
    const rest = otherMetadata(branch.metadata);
    setAdvancedJson(Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "");
    setAdvancedOpen(false);
  }, [branch, storyLanguage]);

  const parsedAdvanced = useMemo((): { ok: true; value: Record<string, unknown> } | { ok: false } => {
    if (!advancedJson.trim()) return { ok: true, value: {} };
    try {
      const value = JSON.parse(advancedJson);
      return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false };
    } catch {
      return { ok: false };
    }
  }, [advancedJson]);

  if (!branch) return null;

  const buildMetadata = (): Record<string, unknown> | null => {
    const rest = parsedAdvanced.ok ? parsedAdvanced.value : {};
    const merged = { ...rest, ...(note.trim() ? { note: note.trim() } : {}) };
    return Object.keys(merged).length ? merged : null;
  };

  const dirty =
    text !== (branch.text ?? "") ||
    (canEditAll &&
      (name.trim() !== (branch.name ?? "") ||
        language !== (branch.language || storyLanguage) ||
        JSON.stringify(buildMetadata()) !== JSON.stringify(branch.metadata ?? null)));

  const canSave = dirty && text.trim().length > 0 && parsedAdvanced.ok && busy === null;

  const save = async () => {
    if (!canSave) return;
    setBusy("save");
    const ok = await onSave({
      text,
      name: canEditAll ? name.trim() || null : branch.name,
      language: canEditAll ? language : branch.language,
      metadata: canEditAll ? buildMetadata() : branch.metadata,
    });
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  const remove = async () => {
    if (!window.confirm("Delete this branch? This cannot be undone.")) return;
    setBusy("delete");
    const ok = await onDelete();
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  const field = "w-full border rounded px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500";
  const label = "text-xs font-medium text-gray-600";

  return (
    <Dialog open onOpenChange={(open) => busy === null && onOpenChange(open)}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="story-branch-settings-title">Branch settings</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="story-branch-settings-desc">
              A branch is an alternative version of one paragraph. Readers can choose it when building an edition.
            </EditableText>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className={label}>
              <EditableText id="story-branch-original">Original paragraph</EditableText>
            </div>
            <p className="text-sm text-gray-600 bg-gray-50 border rounded px-2 py-1.5 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {originalParagraph || branch.parentParagraphText || "—"}
            </p>
          </div>

          <label className="block space-y-1">
            <span className={label}>
              <EditableText id="story-branch-name">Name (optional)</EditableText>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEditAll}
              placeholder="e.g. “The darker version”"
              className={field}
            />
          </label>

          <label className="block space-y-1">
            <span className={label}>
              <EditableText id="story-branch-text">Branch text</EditableText>
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(14, Math.max(4, Math.ceil(text.length / 70) + 2))}
              placeholder="The alternative text for this paragraph…"
              className={`${field} leading-relaxed resize-y`}
            />
            <span className="block text-[11px] text-gray-500">
              <EditableText id="story-branch-text-hint">Leave a blank line between paragraphs to split the branch into several paragraphs.</EditableText>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={label}>
                <EditableText id="story-branch-language">Language</EditableText>
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={!canEditAll}
                className={`${field} bg-white`}
              >
                {!locales.some((l) => l.code === language) && <option value={language}>{language.toUpperCase()}</option>}
                {locales.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native_name || l.english_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 sm:col-span-1">
              <span className={label}>
                <EditableText id="story-branch-note">Note</EditableText>
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!canEditAll}
                placeholder="Why this branch exists, mood, ideas…"
                className={field}
              />
            </label>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
            >
              {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <EditableText id="story-branch-advanced">Advanced: metadata (JSON)</EditableText>
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-1">
                <textarea
                  value={advancedJson}
                  onChange={(e) => setAdvancedJson(e.target.value)}
                  disabled={!canEditAll}
                  rows={6}
                  placeholder='{"example": 42}'
                  className={`${field} font-mono text-xs`}
                />
                {!parsedAdvanced.ok && (
                  <p className="text-xs text-red-600">
                    <EditableText id="story-branch-json-error">This isn't a valid JSON object.</EditableText>
                  </p>
                )}
              </div>
            )}
          </div>

          {!canEditAll && (
            <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded px-2 py-1">
              <EditableText id="story-branch-proposal-note">
                Your text change is sent to the story owner as a proposal. Only the owner and the branch's author can
                change its name, language and note.
              </EditableText>
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:items-center gap-2">
          {canDelete && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={remove}
              className="sm:mr-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <EditableText id="story-branch-delete">Delete branch</EditableText>
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            <EditableText id="story-dialog-cancel">Cancel</EditableText>
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {canEditAll ? (
              <EditableText id="story-branch-save">Save</EditableText>
            ) : (
              <EditableText id="story-branch-propose">Propose change</EditableText>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BranchSettingsDialog;
