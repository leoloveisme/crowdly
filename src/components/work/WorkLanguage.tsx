import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import EditableText from "@/components/EditableText";
import LanguageSwitcher from "@/components/story/LanguageSwitcher";
import TranslateStoryDialog from "@/components/story/TranslateStoryDialog";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import { connectionName, connectionsFor, type AiConnection } from "@/lib/aiApi";
import type { StoryTranslations } from "@/lib/translationsApi";
import {
  aiTranslatePart,
  createWorkTranslation,
  fetchWorkTranslations,
  setWorkOfficialTranslation,
  workPagePath,
  type WorkKind,
  type WorkPart,
} from "@/lib/workApi";

interface WorkLanguageProps {
  kind: WorkKind;
  workId: string;
  language: string;
  aiConnections: AiConnection[];
}

/**
 * Language badge + switcher between a screenplay's or comic's language
 * versions, and the "Translate…" dialog (blank / copy / AI draft) — the
 * story page's translation controls for other kinds.
 */
export const WorkLanguage: React.FC<WorkLanguageProps> = ({ kind, workId, language, aiConnections }) => {
  const navigate = useNavigate();
  const [translations, setTranslations] = useState<StoryTranslations | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetchWorkTranslations(kind, workId)
      .then(setTranslations)
      .catch(() => setTranslations(null));
  }, [kind, workId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <LanguageSwitcher
        storyTitleId={workId}
        language={language}
        translations={translations}
        versionPath={(id) => workPagePath(kind, id)}
        idPrefix={kind}
        noun={kind}
        onTranslate={() => setOpen(true)}
        onToggleOfficial={async (id, official) => {
          try {
            await setWorkOfficialTranslation(kind, id, official);
            load();
          } catch (err) {
            toast({ title: "Translation", description: errorMessage(err), variant: "destructive" });
          }
        }}
      />
      <TranslateStoryDialog
        open={open}
        onOpenChange={setOpen}
        sourceLanguage={language}
        idPrefix={kind}
        noun={kind}
        part={kind === "comic" ? "issue" : "scene"}
        parts={kind === "comic" ? "issues" : "scenes"}
        aiConnections={connectionsFor(aiConnections, "translate")}
        onCreate={async (lang, start, connectionId) => {
          try {
            const created = await createWorkTranslation(kind, workId, { language: lang, start, connectionId });
            if (created.ai_error) toast({ title: "AI draft", description: created.ai_error, variant: "destructive" });
            setOpen(false);
            navigate(`${workPagePath(kind, created.id)}?mode=edit`);
          } catch (err) {
            toast({ title: "Translation", description: errorMessage(err), variant: "destructive" });
          }
        }}
      />
    </>
  );
};

/** In a translation's Editing mode: machine-translate this scene / issue from its source. */
export const AiDraftButton: React.FC<{ kind: WorkKind; part: WorkPart; aiConnections: AiConnection[] }> = ({
  kind,
  part,
  aiConnections,
}) => {
  const options = connectionsFor(aiConnections, "translate");
  const [connectionId, setConnectionId] = useState("");
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs">
      <Sparkles className="h-3.5 w-3.5 text-sky-700" />
      <EditableText id={`${kind}-ai-draft-label`}>Draft this part from the original with AI</EditableText>
      <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="border rounded px-1 py-0.5 bg-white">
        <option value="">—</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {connectionName(c)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!connectionId || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await aiTranslatePart(part, connectionId);
            toast({ title: "AI draft queued", description: "The text appears here when it's ready; reload to see it." });
          } catch (err) {
            toast({ title: "AI draft", description: errorMessage(err), variant: "destructive" });
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 rounded bg-sky-700 px-2 py-0.5 text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        <EditableText id={`${kind}-ai-draft-btn`}>Draft</EditableText>
      </button>
    </div>
  );
};
