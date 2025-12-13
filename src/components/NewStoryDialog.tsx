
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewStoryDialogProps {
  onCreate: (storyTitle: string) => Promise<void>;
}

const NewStoryDialog: React.FC<NewStoryDialogProps> = ({ onCreate }) => {
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    await onCreate(newTitle.trim());
    setSaving(false);
    setNewTitle("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">+ New Story</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a New Story</DialogTitle>
        </DialogHeader>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Enter story title"
        />
        <DialogFooter>
          <Button disabled={saving || !newTitle.trim()} onClick={handleCreate}>
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewStoryDialog;

