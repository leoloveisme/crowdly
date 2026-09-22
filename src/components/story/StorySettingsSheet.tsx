import React, { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import StoryLanguageSelect from "@/components/StoryLanguageSelect";
import CoverImageUpload from "@/components/CoverImageUpload";
import DescriptionEditor from "@/components/DescriptionEditor";
import TagInput from "@/components/TagInput";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type StoryVisibility = "public" | "unlisted" | "private";
export type StoryPolicy = "anyone" | "restricted" | "none";

export interface StorySettingsValues {
  visibility?: string | null;
  published?: boolean | null;
  completion_status?: string | null;
  clone_policy?: string | null;
  export_policy?: string | null;
  translation_policy?: string | null;
  narration_policy?: string | null;
  /** Set on translations — who may translate is decided by the original story. */
  source_story_title_id?: string | null;
  language?: string | null;
  cover_image_url?: string | null;
  description?: string | null;
  tags?: string[] | null;
}

interface StorySettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: StorySettingsValues;
  onSetVisibility: (v: StoryVisibility) => void;
  onTogglePublished: () => void;
  onSetCompletion: (v: "draft" | "completed") => void;
  onSetClonePolicy: (v: StoryPolicy) => void;
  onSetExportPolicy: (v: StoryPolicy) => void;
  onSetTranslationPolicy: (v: StoryPolicy) => void;
  onSetNarrationPolicy: (v: StoryPolicy) => void;
  onOpenAccessPicker: (rule: "view" | "clone" | "export" | "translate" | "narrate") => void;
  onUpdateSetting: (field: string, value: string | boolean | string[]) => void;
  onOpenDetails: () => void;
  /** Transfer ownership / authors / co-authors / contributors UI. */
  peopleSection: React.ReactNode;
  canDelete: boolean;
  onDelete: () => void;
}

const Section: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3 py-4 border-b last:border-b-0">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
    {children}
  </section>
);

const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-gray-700">{label}</span>
    {children}
  </div>
);

const RulesButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs text-blue-700 hover:underline"
  >
    {children}
  </button>
);

/**
 * Owner-only story settings, grouped in one side sheet (replaces the old
 * hover-revealed button row and the owner blocks of the contribute section).
 */
const StorySettingsSheet: React.FC<StorySettingsSheetProps> = ({
  open,
  onOpenChange,
  story,
  onSetVisibility,
  onTogglePublished,
  onSetCompletion,
  onSetClonePolicy,
  onSetExportPolicy,
  onSetTranslationPolicy,
  onSetNarrationPolicy,
  onOpenAccessPicker,
  onUpdateSetting,
  onOpenDetails,
  peopleSection,
  canDelete,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const visibility = (story.visibility ?? "public") as StoryVisibility;
  const clonePolicy = (story.clone_policy ?? "anyone") as StoryPolicy;
  const exportPolicy = (story.export_policy ?? "anyone") as StoryPolicy;
  const translationPolicy = (story.translation_policy ?? "anyone") as StoryPolicy;
  const narrationPolicy = (story.narration_policy ?? "anyone") as StoryPolicy;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              <EditableText id="story-settings-title">Story settings</EditableText>
            </SheetTitle>
            <SheetDescription>
              <EditableText id="story-settings-desc">Only you, as the story owner, can change these.</EditableText>
            </SheetDescription>
          </SheetHeader>

          <Section title={<EditableText id="story-settings-publishing">Publishing</EditableText>}>
            <Row label={<EditableText id="story-settings-visibility">Visibility</EditableText>}>
              <div className="flex items-center gap-2">
                {visibility === "unlisted" && (
                  <RulesButton onClick={() => onOpenAccessPicker("view")}>
                    <EditableText id="story-settings-viewers">Viewers</EditableText>
                  </RulesButton>
                )}
                <Select value={visibility} onValueChange={(v) => onSetVisibility(v as StoryVisibility)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Row>
            <Row label={<EditableText id="story-settings-published">Published in listings</EditableText>}>
              <Switch checked={story.published !== false} onCheckedChange={onTogglePublished} />
            </Row>
            <Row label={<EditableText id="story-settings-completed">Story is completed</EditableText>}>
              <Switch
                checked={(story.completion_status ?? "draft") === "completed"}
                onCheckedChange={(checked) => onSetCompletion(checked ? "completed" : "draft")}
              />
            </Row>
          </Section>

          <Section title={<EditableText id="story-settings-permissions">Permissions</EditableText>}>
            <Row label={<EditableText id="story-settings-clone">Who can clone</EditableText>}>
              <div className="flex items-center gap-2">
                {clonePolicy === "restricted" && (
                  <RulesButton onClick={() => onOpenAccessPicker("clone")}>
                    <EditableText id="story-settings-cloners">Cloners</EditableText>
                  </RulesButton>
                )}
                <Select value={clonePolicy} onValueChange={(v) => onSetClonePolicy(v as StoryPolicy)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anyone">Anyone</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="none">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Row>
            <Row label={<EditableText id="story-settings-export">Who can export</EditableText>}>
              <div className="flex items-center gap-2">
                {exportPolicy === "restricted" && (
                  <RulesButton onClick={() => onOpenAccessPicker("export")}>
                    <EditableText id="story-settings-exporters">Exporters</EditableText>
                  </RulesButton>
                )}
                <Select value={exportPolicy} onValueChange={(v) => onSetExportPolicy(v as StoryPolicy)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anyone">Anyone</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="none">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Row>
            {!story.source_story_title_id && (
            <Row label={<EditableText id="story-settings-translate">Who can translate</EditableText>}>
              <div className="flex items-center gap-2">
                {translationPolicy === "restricted" && (
                  <RulesButton onClick={() => onOpenAccessPicker("translate")}>
                    <EditableText id="story-settings-translators">Translators</EditableText>
                  </RulesButton>
                )}
                <Select value={translationPolicy} onValueChange={(v) => onSetTranslationPolicy(v as StoryPolicy)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anyone">Anyone</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="none">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Row>
            )}
            <Row label={<EditableText id="story-settings-narrate">Who can narrate</EditableText>}>
              <div className="flex items-center gap-2">
                {narrationPolicy === "restricted" && (
                  <RulesButton onClick={() => onOpenAccessPicker("narrate")}>
                    <EditableText id="story-settings-narrators">Narrators</EditableText>
                  </RulesButton>
                )}
                <Select value={narrationPolicy} onValueChange={(v) => onSetNarrationPolicy(v as StoryPolicy)}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anyone">Anyone</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="none">Nobody</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Row>
          </Section>

          <Section title={<EditableText id="story-settings-details">Details</EditableText>}>
            {/* Both components render their own labels */}
            <StoryLanguageSelect
              value={story.language || "en"}
              onChange={(code) => onUpdateSetting("language", code)}
            />
            <CoverImageUpload
              value={story.cover_image_url || null}
              onChange={(url) => onUpdateSetting("cover_image_url", url || "")}
            />
            <div className="space-y-1">
              <span className="text-sm text-gray-700">
                <EditableText id="story-description-label">Description</EditableText>
              </span>
              <DescriptionEditor
                description={story.description || null}
                onSave={async (desc) => {
                  onUpdateSetting("description", desc);
                }}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm text-gray-700">
                <EditableText id="story-tags-label">Tags</EditableText>
              </span>
              <TagInput
                tags={story.tags || []}
                onChange={(newTags) => onUpdateSetting("tags", newTags)}
                className="mt-1 border border-gray-200 rounded-md p-2"
              />
            </div>
            <button
              type="button"
              onClick={onOpenDetails}
              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              <EditableText id="story-settings-details-space">Details & Space</EditableText>
            </button>
          </Section>

          <Section title={<EditableText id="story-collaborators-label">Collaborators</EditableText>}>
            {peopleSection}
          </Section>

          {canDelete && (
            <Section title={<EditableText id="story-settings-danger">Danger zone</EditableText>}>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-500 text-white text-xs font-semibold hover:bg-red-700 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <EditableText id="story-delete-btn">Delete Story</EditableText>
              </button>
            </Section>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <EditableText id="story-delete-confirm-title">Permanently delete this story?</EditableText>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <EditableText id="story-delete-confirm-desc">
                All chapters, revisions and comments will be removed. This cannot be undone.
              </EditableText>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <EditableText id="story-dialog-cancel">Cancel</EditableText>
            </AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={onDelete}>
              <EditableText id="story-delete-btn">Delete Story</EditableText>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StorySettingsSheet;
