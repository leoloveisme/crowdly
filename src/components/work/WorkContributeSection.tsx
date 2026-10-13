import React, { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  myWorkCollaborationRequest,
  requestWorkCollaboration,
  type WorkCollaborationRequest,
  type WorkKind,
} from "@/lib/workApi";

interface Props {
  kind: WorkKind;
  workId: string;
  /** Switches the page into suggestion mode (edits become proposals). */
  onSuggestChanges?: () => void;
}

/**
 * "I want to contribute" for readers outside the team: suggest changes (they
 * go to the owner as proposals) or ask the owner to be invited to the team.
 */
const WorkContributeSection: React.FC<Props> = ({ kind, workId, onSuggestChanges }) => {
  const { user } = useAuth();
  const p = kind;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState<WorkCollaborationRequest | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    myWorkCollaborationRequest(kind, workId)
      .then((data) => setRequest(data.request))
      .catch(() => setRequest(null));
  }, [user, open, kind, workId]);

  const start = () => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to contribute.", variant: "destructive" });
      return;
    }
    setOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const data = await requestWorkCollaboration(kind, workId, message);
      setRequest(data.request);
      setMessage("");
      toast({ title: "Request sent", description: "The owner will be notified." });
    } catch (err) {
      toast({ title: "Error", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="pt-4">
        <button
          type="button"
          onClick={start}
          className="px-4 py-2 text-xs md:text-sm rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          <EditableText id={`${p}-contribute-btn`}>{`I want to contribute to the ${kind}`}</EditableText>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3 text-sm">
      {onSuggestChanges && (
        <div className="space-y-1">
          <EditableText id={`${p}-contribute-suggest-desc`} as="p" className="text-gray-700">
            Suggest changes right on the page. The owner reviews each suggestion.
          </EditableText>
          <button
            type="button"
            onClick={onSuggestChanges}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
          >
            <EditableText id={`${p}-contribute-suggest-btn`}>Suggest changes</EditableText>
          </button>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-medium text-gray-800">
          <UserPlus className="h-4 w-4" />
          <EditableText id={`${p}-contribute-ask-title`}>Ask to join the team</EditableText>
        </div>
        {request?.status === "pending" ? (
          <EditableText id={`${p}-contribute-pending`} as="p" className="text-gray-600">
            Your request is waiting for the owner's answer.
          </EditableText>
        ) : (
          <>
            {request?.status === "declined" && (
              <EditableText id={`${p}-contribute-declined`} as="p" className="text-gray-600">
                The owner declined your last request. You can ask again.
              </EditableText>
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Tell the owner how you'd like to help (optional)"
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-blue-300 bg-white text-blue-700 text-xs hover:bg-blue-50 disabled:opacity-60"
            >
              {sending && <Loader2 className="h-3 w-3 animate-spin" />}
              <EditableText id={`${p}-contribute-ask-btn`}>Send request</EditableText>
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:underline">
        <EditableText id={`${p}-contribute-close`}>Close</EditableText>
      </button>
    </div>
  );
};

export default WorkContributeSection;
