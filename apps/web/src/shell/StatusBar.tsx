import React from "react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { Cloud, CloudOff, Loader2, Check, AlertTriangle, Users, Clock } from "lucide-react";
import { useWorkspace } from "./workspace";

// Desktop status bar: current Space · Words / Paragraphs / Chapters · sync · user.
export const StatusBar: React.FC<{ spaceName?: string }> = ({ spaceName }) => {
  const { status, online } = useWorkspace();
  const { user } = useAuth();
  const sync = !online ? "offline" : status.sync;

  return (
    <footer className="flex shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t bg-muted/40 px-3 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
      <span>
        <EditableText id="webapp-status-space">Space:</EditableText> {spaceName ?? "—"}
      </span>
      {status.words !== undefined && (
        <span>
          <EditableText id="webapp-status-words">Words:</EditableText> {status.words}
        </span>
      )}
      {status.paragraphs !== undefined && (
        <span>
          <EditableText id="webapp-status-paragraphs">Paragraphs:</EditableText> {status.paragraphs}
        </span>
      )}
      {status.chapters !== undefined && (
        <span>
          <EditableText id="webapp-status-chapters">Chapters:</EditableText> {status.chapters}
        </span>
      )}
      <span className="flex-1" />
      {status.peers ? (
        <span className="flex items-center gap-1 text-emerald-600">
          <Users className="h-3 w-3" /> {status.peers}
        </span>
      ) : null}
      {sync && (
        <span className="flex items-center gap-1">
          {sync === "offline" && (
            <>
              <CloudOff className="h-3 w-3" /> <EditableText id="webapp-status-offline">Offline — changes are kept on this device</EditableText>
            </>
          )}
          {sync === "queued" && (
            <>
              <Clock className="h-3 w-3" /> <EditableText id="webapp-status-queued">Waiting to sync</EditableText>
            </>
          )}
          {sync === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> <EditableText id="webapp-status-saving">Saving…</EditableText>
            </>
          )}
          {sync === "saved" && (
            <>
              <Check className="h-3 w-3" /> <EditableText id="webapp-status-saved">Saved</EditableText>
            </>
          )}
          {sync === "live" && (
            <>
              <Cloud className="h-3 w-3 text-emerald-600" /> <EditableText id="webapp-status-live">Live</EditableText>
            </>
          )}
          {sync === "error" && (
            <>
              <AlertTriangle className="h-3 w-3 text-destructive" /> <EditableText id="webapp-status-error">Not saved</EditableText>
            </>
          )}
        </span>
      )}
      {status.message && <span>{status.message}</span>}
      <span>{user ? user.email : <EditableText id="webapp-status-guest">Not logged in</EditableText>}</span>
    </footer>
  );
};
