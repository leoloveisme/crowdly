import React, { useCallback, useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Inbox } from "lucide-react";
import { approveProposal, declineProposal, decideCollaboration, listCollaborationRequests, listProposals, type CollabRequest, type Proposal } from "@web/lib/collab";
import type { Chapter } from "@web/lib/story";

// Owner's inbox: suggested changes (approve/decline) and requests to
// collaborate — the platform's proposals + CollaborationRequestsPanel.
export const ReviewPanel: React.FC<{ storyId: string; chapters: Chapter[]; onApplied: () => void }> = ({ storyId, chapters, onApplied }) => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [requests, setRequests] = useState<CollabRequest[]>([]);

  const load = useCallback(() => {
    listProposals(storyId).then(setProposals).catch(() => setProposals([]));
    listCollaborationRequests(storyId).then(setRequests);
  }, [storyId]);
  useEffect(load, [load]);

  const decide = async (p: Proposal, ok: boolean) => {
    try {
      await (ok ? approveProposal(p.id) : declineProposal(p.id));
      load();
      if (ok) onApplied();
    } catch (err) {
      toast({ title: "Couldn't do that", description: (err as Error).message, variant: "destructive" });
    }
  };

  const chapterTitle = (id: string | null) => chapters.find((c) => c.chapter_id === id)?.chapter_title ?? "";
  const original = (p: Proposal) => {
    const c = chapters.find((x) => x.chapter_id === p.target_chapter_id);
    if (!c) return "";
    if (p.target_type === "chapter_title") return c.chapter_title;
    return c.paragraphs?.[Number(p.target_path)] ?? "";
  };

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 font-medium">
        <Inbox className="h-4 w-4" />
        <EditableText id="webapp-review-title">Suggestions and requests</EditableText>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        {proposals.length === 0 && requests.length === 0 && (
          <EditableText id="webapp-review-empty" as="p" className="text-muted-foreground">
            Nothing waiting for you.
          </EditableText>
        )}
        {requests.map((r) => (
          <div key={r.id} className="space-y-1 rounded border p-2">
            <p className="font-medium">{r.requester?.name || r.requester?.username || r.requester?.email || "Someone"}</p>
            <EditableText id="webapp-review-wants" as="p" className="text-xs text-muted-foreground">
              wants to collaborate
            </EditableText>
            {r.message && <p className="whitespace-pre-wrap">{r.message}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="h-7" onClick={() => decideCollaboration(r.id, true).then(load)}>
                <EditableText id="webapp-review-accept">Accept</EditableText>
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => decideCollaboration(r.id, false).then(load)}>
                <EditableText id="webapp-review-decline">Decline</EditableText>
              </Button>
            </div>
          </div>
        ))}
        {proposals.map((p) => (
          <div key={p.id} className="space-y-1 rounded border p-2">
            <p className="text-xs text-muted-foreground">
              {p.author_email ?? ""} · {chapterTitle(p.target_chapter_id)} · {p.target_type === "chapter_title" ? "title" : `¶ ${Number(p.target_path) + 1}`}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground line-through">{original(p) || "∅"}</p>
            <p className="whitespace-pre-wrap">{p.proposed_text || <em>(delete)</em>}</p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7" onClick={() => decide(p, true)}>
                <EditableText id="webapp-review-approve">Approve</EditableText>
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => decide(p, false)}>
                <EditableText id="webapp-review-reject">Decline</EditableText>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
