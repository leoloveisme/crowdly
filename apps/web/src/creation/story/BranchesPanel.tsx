import React, { useMemo, useState } from "react";
import { askConfirm, askText } from "@web/shell/ask";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { GitBranch, Trash2, Save } from "lucide-react";
import { createBranch, deleteBranch, updateBranch, type Branch } from "@web/lib/story";

// Paragraph branches for the open chapter (platform: ParagraphBranchPopover +
// BranchSettingsDialog). Pick a paragraph, see its branches, add or
// configure one. "Configure" loads the existing branch and never overwrites
// the parent paragraph (see Documentation/Rework_Configure_branch_...).

interface Props {
  chapterId: string;
  paragraphs: string[];
  branches: Branch[];
  userId?: string;
  canBranch: boolean;
  isOwner: boolean;
  onChanged: () => void;
}

export const BranchesPanel: React.FC<Props> = ({ chapterId, paragraphs, branches, userId, canBranch, isOwner, onChanged }) => {
  const [paragraph, setParagraph] = useState(0);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [editing, setEditing] = useState<Record<string, { name: string; text: string }>>({});
  const [busy, setBusy] = useState(false);

  const byParagraph = useMemo(() => {
    const m = new Map<number, Branch[]>();
    for (const b of branches.filter((x) => x.chapter_id === chapterId)) {
      const k = b.parent_paragraph_index;
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return m;
  }, [branches, chapterId]);

  const here = byParagraph.get(paragraph) ?? [];

  const add = async () => {
    setBusy(true);
    try {
      await createBranch({ chapterId, parentParagraphIndex: paragraph, parentParagraphText: paragraphs[paragraph] ?? "", branchText: draftText, branchName: draftName || undefined });
      setDraftName("");
      setDraftText("");
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't create the branch", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const save = async (b: Branch) => {
    const e = editing[b.id];
    if (!e) return;
    try {
      await updateBranch(b.id, { branchText: e.text, branchName: e.name });
      setEditing(({ [b.id]: _drop, ...rest }) => rest);
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't save the branch", description: (err as Error).message, variant: "destructive" });
    }
  };

  const remove = async (b: Branch) => {
    if (!await askConfirm("Delete this branch?")) return;
    try {
      await deleteBranch(b.id);
      onChanged();
    } catch (err) {
      toast({ title: "Couldn't delete the branch", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 font-medium">
        <GitBranch className="h-4 w-4" />
        <EditableText id="webapp-branches-title">Paragraph branches</EditableText>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        <ol className="space-y-0.5">
          {paragraphs.map((p, i) => (
            <li key={i}>
              <button onClick={() => setParagraph(i)} className={`flex w-full gap-2 rounded px-1.5 py-1 text-left ${i === paragraph ? "bg-primary/10" : "hover:bg-muted"}`}>
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                <span className="line-clamp-2 flex-1">{p || "…"}</span>
                {byParagraph.get(i)?.length ? <span className="rounded bg-muted px-1 text-xs">{byParagraph.get(i)!.length}</span> : null}
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-2 border-t pt-2">
          {here.length === 0 && (
            <p className="text-xs text-muted-foreground">
              <EditableText id="webapp-branches-none">No branches on this paragraph yet.</EditableText>
            </p>
          )}
          {here.map((b) => {
            const e = editing[b.id];
            const mine = b.user_id === userId || isOwner;
            return (
              <div key={b.id} className="space-y-1 rounded border p-2">
                {e ? (
                  <>
                    <Input value={e.name} onChange={(ev) => setEditing({ ...editing, [b.id]: { ...e, name: ev.target.value } })} placeholder="Branch name" className="h-7" />
                    <Textarea value={e.text} onChange={(ev) => setEditing({ ...editing, [b.id]: { ...e, text: ev.target.value } })} rows={4} />
                    <Button size="sm" className="h-7 gap-1" onClick={() => save(b)}>
                      <Save className="h-3.5 w-3.5" />
                      <EditableText id="webapp-branches-save">Save</EditableText>
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b.branch_name || "Branch"}</span>
                      {mine && (
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEditing({ ...editing, [b.id]: { name: b.branch_name ?? "", text: b.branch_text ?? "" } })}>
                            <EditableText id="webapp-branches-configure">Configure</EditableText>
                          </Button>
                          <button onClick={() => remove(b)} aria-label="Delete branch" className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{b.branch_text || "…"}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {canBranch && (
          <div className="space-y-1 border-t pt-2">
            <EditableText id="webapp-branches-new" as="p" className="text-xs font-medium">
              New branch from this paragraph
            </EditableText>
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Branch name (optional)" className="h-7" />
            <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={4} placeholder="How else could this go?" />
            <Button size="sm" className="h-7" onClick={add} disabled={busy}>
              <EditableText id="webapp-branches-create">Create branch</EditableText>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
