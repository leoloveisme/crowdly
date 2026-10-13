import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import StorySettingsSheet, { type StorySettingsValues } from "@/components/story/StorySettingsSheet";
import UserGroupPicker from "@/modules/user-group-picker";
import WorkPeopleSection from "@/components/work/WorkPeopleSection";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  deleteWork,
  updateWorkSettings,
  workPath,
  type WorkKind,
  type WorkRuleType,
  type WorkSettings as WorkSettingsPatch,
} from "@/lib/workApi";

interface WorkSettingsProps<T extends StorySettingsValues> {
  kind: WorkKind;
  workId: string;
  work: T;
  /** Receives the updated row after every saved change. */
  onWorkChange: (work: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner lost ownership (transfer): reload access. */
  onOwnershipTransferred: () => void;
  extraDetails?: React.ReactNode;
}

/**
 * The story settings sheet, access-rule picker and people management wired to
 * a screenplay's or comic's settings endpoints (owner-only).
 */
function WorkSettings<T extends StorySettingsValues>({
  kind,
  workId,
  work,
  onWorkChange,
  open,
  onOpenChange,
  onOwnershipTransferred,
  extraDetails,
}: WorkSettingsProps<T>) {
  const navigate = useNavigate();
  const [pickerRule, setPickerRule] = useState<WorkRuleType | null>(null);
  const noun = kind === "comic" ? "Comic" : "Screenplay";

  const save = async (patch: WorkSettingsPatch) => {
    try {
      const updated = await updateWorkSettings<T>(kind, workId, patch);
      onWorkChange({ ...work, ...updated });
    } catch (err) {
      toast({ title: "Settings", description: errorMessage(err) ?? "Failed to save", variant: "destructive" });
    }
  };

  // Choosing "restricted" opens the picker for who that applies to, as on stories.
  const setPolicy = (column: keyof WorkSettingsPatch, rule: WorkRuleType) => (value: string) => {
    save({ [column]: value } as WorkSettingsPatch);
    if (value === "restricted") setPickerRule(rule);
  };

  return (
    <>
      <StorySettingsSheet
        open={open}
        onOpenChange={onOpenChange}
        story={work}
        idPrefix={kind}
        noun={noun}
        extraDetails={extraDetails}
        onSetVisibility={(v) => {
          save({ visibility: v });
          if (v === "unlisted") setPickerRule("view");
        }}
        onTogglePublished={() => save({ published: work.published === false })}
        onSetCompletion={(v) => save({ completion_status: v })}
        onSetClonePolicy={setPolicy("clone_policy", "clone")}
        onSetExportPolicy={setPolicy("export_policy", "export")}
        onSetTranslationPolicy={setPolicy("translation_policy", "translate")}
        onSetNarrationPolicy={setPolicy("narration_policy", "narrate")}
        onOpenAccessPicker={(rule) => setPickerRule(rule)}
        onUpdateSetting={(field, value) => save({ [field]: value } as WorkSettingsPatch)}
        peopleSection={
          <WorkPeopleSection kind={kind} workId={workId} onOwnershipTransferred={onOwnershipTransferred} />
        }
        canDelete
        onDelete={async () => {
          try {
            await deleteWork(kind, workId);
            toast({ title: `${noun} deleted` });
            navigate("/");
          } catch (err) {
            toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
          }
        }}
      />
      {pickerRule && (
        <UserGroupPicker
          storyTitleId={workId}
          rulesBasePath={workPath(kind, workId)}
          noun={kind}
          ruleType={pickerRule}
          open={!!pickerRule}
          onClose={() => setPickerRule(null)}
        />
      )}
    </>
  );
}

export default WorkSettings;
