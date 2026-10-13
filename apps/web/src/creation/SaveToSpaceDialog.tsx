import React, { useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSpaces, listSharedSpaces, type Space } from "@web/lib/docs";
import { saveFileToSpace } from "@web/lib/spaces";
import { useWorkspace } from "@web/shell/workspace";

// "Save to a Space" — writes the file *with its content* (the old web app
// only created an empty item) into a chosen Space folder.
export const SaveToSpaceDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  file: () => Promise<{ name: string; content: string | Blob; mime: string }>;
}> = ({ open, onOpenChange, file }) => {
  const { user } = useAuth();
  const { prefs } = useWorkspace();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    Promise.all([listSpaces(user.id), listSharedSpaces()]).then(([mine, shared]) => {
      const all = [...mine, ...shared.filter((s) => !mine.some((m) => m.id === s.id))];
      setSpaces(all);
      setSpaceId((cur) => cur || prefs.activeSpaceId || all[0]?.id || "");
    });
    file().then((f) => setName(f.name)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const save = async () => {
    if (!user || !spaceId || !name.trim()) return;
    setBusy(true);
    try {
      const f = await file();
      await saveFileToSpace(spaceId, folder.replace(/^\/+|\/+$/g, ""), name.trim(), f.content, user.id, f.mime);
      toast({ title: `Saved ${name.trim()} to the Space` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't save to the Space", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-s2s-title">Save to a Space</EditableText>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-s2s-space">Space</EditableText>
            </Label>
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="h-9 w-full rounded border bg-background px-2">
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-s2s-folder">Folder (empty = top level)</EditableText>
            </Label>
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="drafts/2026" />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-s2s-name">File name</EditableText>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy || !spaceId || !name.trim()}>
            <EditableText id="webapp-s2s-save">Save</EditableText>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
