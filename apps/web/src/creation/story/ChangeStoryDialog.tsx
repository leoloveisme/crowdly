import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { PencilLine, Copy, Languages, Handshake } from "lucide-react";
import { cloneStory, createTranslation, listLocales, myCollaborationRequest, requestCollaboration, type CollabRequest, type Locale } from "@web/lib/collab";

// "I want to change this story" (desktop: ui/change_story_dialog.py):
// suggest changes, make my own version, translate, or ask to collaborate.

export const ChangeStoryDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storyId: string;
  userId: string;
  onSuggest: () => void;
}> = ({ open, onOpenChange, storyId, userId, onSuggest }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<null | "translate" | "collaborate">(null);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [language, setLanguage] = useState("");
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<CollabRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(null);
    listLocales().then(setLocales).catch(() => setLocales([]));
    myCollaborationRequest(storyId).then(setExisting);
  }, [open, storyId]);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "That didn't work", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const Option: React.FC<{ icon: React.ReactNode; id: string; title: string; descId: string; desc: string; onClick: () => void }> = ({ icon, id, title, descId, desc, onClick }) => (
    <button onClick={onClick} disabled={busy} className="flex w-full items-start gap-3 rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50">
      <span className="mt-0.5">{icon}</span>
      <span>
        <EditableText id={id} className="block font-medium">
          {title}
        </EditableText>
        <EditableText id={descId} className="block text-sm text-muted-foreground">
          {desc}
        </EditableText>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <EditableText id="webapp-change-title">I want to change this story</EditableText>
          </DialogTitle>
          <DialogDescription>
            <EditableText id="webapp-change-desc">Choose how you'd like to contribute.</EditableText>
          </DialogDescription>
        </DialogHeader>
        {mode === null && (
          <div className="space-y-2">
            <Option
              icon={<PencilLine className="h-5 w-5" />}
              id="webapp-change-suggest"
              title="Suggest changes"
              descId="webapp-change-suggest-desc"
              desc="Edit a copy here; your changes are sent to the author as suggestions they can accept."
              onClick={() => {
                onSuggest();
                onOpenChange(false);
              }}
            />
            <Option
              icon={<Copy className="h-5 w-5" />}
              id="webapp-change-clone"
              title="Make my own version"
              descId="webapp-change-clone-desc"
              desc="Copy the story into a new one that you own."
              onClick={() =>
                go(async () => {
                  const r = await cloneStory(storyId, userId);
                  navigate(`/story/${r.storyTitleId}`);
                })
              }
            />
            <Option icon={<Languages className="h-5 w-5" />} id="webapp-change-translate" title="Translate" descId="webapp-change-translate-desc" desc="Start a translation linked to this story." onClick={() => setMode("translate")} />
            <Option
              icon={<Handshake className="h-5 w-5" />}
              id="webapp-change-collab"
              title="Ask to collaborate"
              descId="webapp-change-collab-desc"
              desc={existing ? `You already asked (${existing.status}).` : "Ask the author to add you to the story's team."}
              onClick={() => !existing && setMode("collaborate")}
            />
          </div>
        )}
        {mode === "translate" && (
          <div className="space-y-3">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-9 w-full rounded border bg-background px-2" aria-label="Language">
              <option value="">—</option>
              {locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native_name} ({l.english_name})
                </option>
              ))}
            </select>
            <Button
              disabled={!language || busy}
              onClick={() =>
                go(async () => {
                  const r = await createTranslation(storyId, language, "copy");
                  navigate(`/story/${r.story_title_id}`);
                })
              }
            >
              <EditableText id="webapp-change-translate-start">Start translating</EditableText>
            </Button>
          </div>
        )}
        {mode === "collaborate" && (
          <div className="space-y-3">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Tell the author what you'd like to work on" />
            <Button
              disabled={busy}
              onClick={() =>
                go(async () => {
                  await requestCollaboration(storyId, message);
                  toast({ title: "Request sent to the author" });
                })
              }
            >
              <EditableText id="webapp-change-collab-send">Send request</EditableText>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
