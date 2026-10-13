import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type { DocActions, ExportFormat, SaveAsFormat } from "@web/shell/workspace";
import { exportWork, loadWorkDoc, saveAsDownload, toNativeFile, type WorkKind } from "./io";
import { SaveToSpaceDialog } from "./SaveToSpaceDialog";

const EXPORTS: Record<WorkKind, ExportFormat[]> = {
  story: ["pdf", "epub", "docx", "odt", "html", "md", "txt"],
  screenplay: ["pdf", "fdx", "fountain", "docx", "odt", "html", "md", "txt"],
  comic: ["html", "md"],
};
const SAVE_AS: Record<WorkKind, SaveAsFormat[]> = {
  story: ["story", "md"],
  screenplay: ["screenplay", "md"],
  comic: ["comic", "md"],
};

/**
 * Export / Save as / Save to a Space for a story, screenplay or comic —
 * spread the returned `actions` into useDocActions and render `dialog`.
 * Always works from the saved server copy, so call the editor's flush first
 * (passed as `beforeRead`).
 */
export function useWorkFileActions(kind: WorkKind, id: string, beforeRead?: () => Promise<void> | void) {
  const { user } = useAuth();
  const [spaceOpen, setSpaceOpen] = useState(false);

  const doc = async () => {
    await beforeRead?.();
    return loadWorkDoc(kind, id, user?.id);
  };
  const run = (label: string, fn: () => Promise<void>) =>
    fn().catch((err) => toast({ title: `Couldn't ${label}`, description: (err as Error).message, variant: "destructive" }));

  const actions: Partial<DocActions> = {
    exportFormats: EXPORTS[kind],
    exportAs: (f) => run("export", async () => exportWork(kind, await doc(), f)),
    saveAsFormats: SAVE_AS[kind],
    saveAs: (f) => run("save", async () => saveAsDownload(kind, await doc(), f)),
    saveToSpace: user ? () => setSpaceOpen(true) : undefined,
  };
  const dialog = <SaveToSpaceDialog open={spaceOpen} onOpenChange={setSpaceOpen} file={async () => toNativeFile(kind, await doc(), SAVE_AS[kind][0])} />;
  return { actions, dialog };
}
