import React, { useCallback, useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Inbox } from "lucide-react";
import {
  decideProposal,
  listWorkCollaborationRequests,
  listWorkProposals,
  type WorkCollaborationRequest,
  type WorkKind,
  type WorkProposal,
} from "@/lib/workApi";
import { decideCollaboration } from "@web/lib/collab";

// Owner's inbox for a screenplay or comic: suggested changes (approve /
// decline) and requests to join the team — the story editor's ReviewPanel
// for the other kinds (same backend routes as the platform's Contributions tab).

const TARGET: Record<string, string> = {
  screenplay_title: "title",
  comic_title: "title",
  scene: "scene heading",
  block: "element",
  block_branch: "branch",
  issue: "issue title",
  page_layer: "page text",
};

/** Page-layer suggestions carry overlays as JSON: show their texts. */
const readable = (p: Pick<WorkProposal, "target_type" | "proposed_text">) => {
  if (p.target_type !== "page_layer") return p.proposed_text;
  try {
    return (JSON.parse(p.proposed_text) as { text: string }[]).map((o) => o.text).join(" / ");
  } catch {
    return p.proposed_text;
  }
};

export const WorkReviewPanel: React.FC<{ kind: WorkKind; workId: string; onApplied: () => void }> = ({ kind, workId, onApplied }) => {
  const [proposals, setProposals] = useState<WorkProposal[]>([]);
  const [requests, setRequests] = useState<WorkCollaborationRequest[]>([]);

  const load = useCallback(() => {
    listWorkProposals(kind, workId, "undecided").then(setProposals).catch(() => setProposals([]));
    listWorkCollaborationRequests(kind, workId)
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  }, [kind, workId]);
  useEffect(load, [load]);

  const decide = async (p: WorkProposal, ok: boolean) => {
    try {
      await decideProposal(p.id, ok);
      load();
      if (ok) onApplied();
    } catch (err) {
      toast({ title: "Couldn't do that", description: (err as Error).message, variant: "destructive" });
    }
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
            <p className="font-medium">{r.requester?.displayName || r.requester?.email || "Someone"}</p>
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
              {p.author_email ?? ""} · {TARGET[p.target_type] ?? p.target_type}
              {p.part_title ? ` · ${p.part_title}` : ""}
            </p>
            {p.current_text && p.target_type !== "page_layer" && (
              <p className="whitespace-pre-wrap text-muted-foreground line-through">{p.current_text}</p>
            )}
            <p className="whitespace-pre-wrap">{readable(p)}</p>
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
