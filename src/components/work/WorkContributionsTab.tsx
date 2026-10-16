import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import ContributionsModule, { type ContributionRow, type ContributionStatus } from "@/modules/contributions";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import { decideProposal, listWorkProposals, type WorkKind, type WorkProposal } from "@/lib/workApi";

interface Props {
  kind: WorkKind;
  workId: string;
  workTitle: string;
  /** Owner or platform staff: may merge or deny pending suggestions. */
  canReview: boolean;
  /** Called after a suggestion was merged, so the page reloads content. */
  onMerged: () => void;
}

const TARGET_LABELS: Record<string, { id: string; text: string }> = {
  screenplay_title: { id: "target-title", text: "Title" },
  comic_title: { id: "target-title", text: "Title" },
  scene: { id: "target-scene", text: "Scene heading" },
  block: { id: "target-block", text: "Element" },
  block_branch: { id: "target-branch", text: "Branch" },
  issue: { id: "target-issue", text: "Issue title" },
  page_layer: { id: "target-page-layer", text: "Page text" },
};

/** Proposed text as readable text: page layers are JSON overlays. */
function proposalText(p: Pick<WorkProposal, "target_type" | "proposed_text">): string {
  if (p.target_type !== "page_layer") return p.proposed_text;
  try {
    return (JSON.parse(p.proposed_text) as { text: string }[]).map((o) => o.text).join(" / ");
  } catch {
    return p.proposed_text;
  }
}

const STATUS: Record<WorkProposal["status"], ContributionStatus> = {
  undecided: "undecided",
  approved: "approved",
  declined: "denied",
};

/**
 * Contributions tab for screenplays and comics: every suggestion with its
 * status, plus the owner's review list (merge / deny) on top.
 */
const WorkContributionsTab: React.FC<Props> = ({ kind, workId, workTitle, canReview, onMerged }) => {
  const [proposals, setProposals] = useState<WorkProposal[] | null>(null);
  const [filter, setFilter] = useState<"total" | ContributionStatus>("total");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listWorkProposals(kind, workId)
      .then(setProposals)
      .catch(() => setProposals([]));
  }, [kind, workId]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (proposal: WorkProposal, approve: boolean) => {
    setBusy(proposal.id);
    try {
      await decideProposal(proposal.id, approve);
      load();
      if (approve) onMerged();
    } catch (err) {
      toast({ title: "Suggestion", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (proposals === null) {
    return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;
  }

  const pending = proposals.filter((p) => p.status === "undecided");
  const rows: ContributionRow[] = proposals.map((p) => ({
    id: p.id,
    story_title: workTitle,
    chapter_title: p.part_title ?? "",
    paragraph: proposalText(p),
    user: p.author_email ?? "",
    date: new Date(p.created_at).toLocaleString(),
    words: p.words,
    likes: 0,
    dislikes: 0,
    comments: 0,
    status: STATUS[p.status],
  }));

  return (
    <div className="space-y-6">
      {canReview && pending.length > 0 && (
        <section className="rounded-lg border border-purple-200 bg-purple-50/60 p-4 space-y-3">
          <h3 className="font-semibold text-purple-900">
            <EditableText id={`${kind}-proposals-pending-title`}>Suggestions waiting for your review</EditableText>
          </h3>
          <ul className="space-y-3">
            {pending.map((p) => {
              const label = TARGET_LABELS[p.target_type] ?? { id: "target-other", text: p.target_type };
              return (
                <li key={p.id} className="rounded border bg-white p-3 text-sm space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">
                      <EditableText id={`${kind}-${label.id}`}>{label.text}</EditableText>
                    </span>
                    {p.part_title && <span className="font-mono">{p.part_title}</span>}
                    <span>· {p.author_email}</span>
                  </div>
                  {p.current_text && p.target_type !== "page_layer" && (
                    <p className="text-gray-500 line-through whitespace-pre-wrap">{p.current_text}</p>
                  )}
                  <p className="text-purple-900 whitespace-pre-wrap">{proposalText(p)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7" disabled={busy === p.id} onClick={() => decide(p, true)}>
                      <Check className="h-3 w-3 mr-1" />
                      <EditableText id={`${kind}-proposal-merge`}>OK & merge</EditableText>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={busy === p.id}
                      onClick={() => decide(p, false)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      <EditableText id={`${kind}-proposal-deny`}>Deny</EditableText>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ContributionsModule
        contributions={rows}
        currentFilter={filter}
        onFilterChange={setFilter}
        titleId={`${kind}-contributions-heading`}
        columnLabels={
          kind === "comic"
            ? { idPrefix: kind, work: "Comic", part: "Issue", text: "Suggestion" }
            : { idPrefix: kind, work: "Screenplay", part: "Scene", text: "Suggestion" }
        }
      />
    </div>
  );
};

export default WorkContributionsTab;
