import React, { useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { parseTags, formatTags } from "@/lib/tag-utils";
import { platformLink } from "@web/lib/api";

// Story settings → metadata, genre, description and #tags (desktop: "View
// story metadata", "Add genre", "Edit description"), plus visibility and
// published. Policies and people stay on the platform's settings sheet.

export interface MetadataValue {
  title: string;
  description: string;
  genre: string;
  tags: string[];
  visibility: string;
  published: boolean;
}

export const StoryMetadataDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: MetadataValue;
  canEdit: boolean;
  platformPath: string;
  onSave: (v: MetadataValue) => Promise<void>;
}> = ({ open, onOpenChange, value, canEdit, platformPath, onSave }) => {
  const [v, setV] = useState(value);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setV(value);
      setTagText(formatTags(value.tags));
    }
  }, [open, value]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ ...v, tags: parseTags(tagText) });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't save", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-meta-title">Story metadata</EditableText>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-meta-name">Title</EditableText>
            </Label>
            <Input value={v.title} disabled={!canEdit} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-meta-genre">Genre</EditableText>
            </Label>
            <Input value={v.genre} disabled={!canEdit} onChange={(e) => setV({ ...v, genre: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-meta-description">Description</EditableText>
            </Label>
            <Textarea value={v.description} disabled={!canEdit} rows={4} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>
              <EditableText id="webapp-meta-tags">Tags</EditableText>
            </Label>
            <Input value={tagText} disabled={!canEdit} onChange={(e) => setTagText(e.target.value)} placeholder="#fantasy #'slow burn'" />
          </div>
          <div className="flex items-center justify-between">
            <Label>
              <EditableText id="webapp-meta-public">Public (anyone can read it)</EditableText>
            </Label>
            <Switch checked={v.visibility === "public"} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, visibility: c ? "public" : "private" })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>
              <EditableText id="webapp-meta-published">Published</EditableText>
            </Label>
            <Switch checked={v.published} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, published: c })} />
          </div>
          <a href={platformLink(platformPath)} target="_blank" rel="noreferrer" className="block text-sm underline">
            <EditableText id="webapp-meta-more">More settings (people, policies, cover) on the platform</EditableText>
          </a>
        </div>
        {canEdit && (
          <DialogFooter>
            <Button onClick={save} disabled={busy}>
              <EditableText id="webapp-meta-save">Save</EditableText>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
