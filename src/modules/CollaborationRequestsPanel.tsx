import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  CollaborationRequest,
  answerCollaborationRequest,
  listCollaborationRequests,
} from "@/lib/collaborationApi";

interface Props {
  storyTitleId: string;
  onChanged?: () => void;
}

/**
 * Pending "Ask to collaborate" requests for the story's owner. Approving one
 * makes the reader a collaborator who can change the story directly (also
 * from the desktop app).
 */
const CollaborationRequestsPanel: React.FC<Props> = ({ storyTitleId, onChanged }) => {
  const [requests, setRequests] = useState<CollaborationRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listCollaborationRequests(storyTitleId);
      setRequests(data.requests);
    } catch {
      setRequests([]);
    }
  }, [storyTitleId]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (request: CollaborationRequest, approve: boolean) => {
    setBusy(request.id);
    try {
      await answerCollaborationRequest(request.id, approve);
      setRequests((current) => current.filter((r) => r.id !== request.id));
      onChanged?.();
    } catch (err) {
      toast({ title: "Collaboration request", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 font-medium text-amber-900 mb-2">
        <UserPlus className="h-4 w-4" />
        <EditableText id="story-collab-requests-title">Requests to collaborate on this story</EditableText>
      </div>
      <ul className="space-y-2">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{request.requester?.displayName ?? ""}</span>
            {request.message && <span className="text-gray-600 italic">“{request.message}”</span>}
            <span className="flex-grow" />
            <Button size="sm" className="h-7" disabled={busy === request.id} onClick={() => answer(request, true)}>
              {busy === request.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              <EditableText id="story-collab-approve">Invite as collaborator</EditableText>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={busy === request.id}
              onClick={() => answer(request, false)}
            >
              <X className="h-3 w-3 mr-1" />
              <EditableText id="story-collab-decline">Decline</EditableText>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CollaborationRequestsPanel;
