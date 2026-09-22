import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cancelAiJob, listStoryAiJobs, type AiJob } from "@/lib/aiApi";

const POLL_MS = 4000;
const isOpen = (j: AiJob) => j.status === "queued" || j.status === "running";

/**
 * Background AI jobs on this story (yours, or everyone's for the story team).
 * Polls while anything is queued/running and reports finished jobs so the page
 * can reload the chapters / media they changed.
 */
export function useAiJobs(storyTitleId: string | undefined, enabled: boolean, onFinished: (job: AiJob) => void) {
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const known = useRef<Map<string, AiJob["status"]>>(new Map());
  const initialized = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const refresh = useCallback(async () => {
    if (!storyTitleId || !enabled) return setJobs([]);
    try {
      const rows = await listStoryAiJobs(storyTitleId);
      for (const job of rows) {
        const before = known.current.get(job.id);
        const finishedNow = before !== undefined && before !== job.status && !isOpen(job);
        // A quick job can start and finish between two polls; after the first
        // load, treat a never-seen, recently finished job as just finished.
        const finishedUnseen =
          before === undefined && initialized.current && !isOpen(job) && job.status === "succeeded" &&
          Date.now() - new Date(job.finished_at ?? job.created_at).getTime() < 60_000;
        if (finishedNow || finishedUnseen) onFinishedRef.current(job);
        known.current.set(job.id, job.status);
      }
      initialized.current = true;
      setJobs(rows);
    } catch {
      setJobs([]);
    }
  }, [storyTitleId, enabled]);

  useEffect(() => {
    known.current = new Map();
    initialized.current = false;
    refresh();
  }, [refresh]);

  const anyOpen = jobs.some(isOpen);
  useEffect(() => {
    if (!anyOpen) return;
    const t = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(t);
  }, [anyOpen, refresh]);

  return { jobs, refresh };
}

const KIND_LABEL: Record<AiJob["kind"], React.ReactNode> = {
  translate_chapter: <EditableText id="story-ai-job-translate">Translation draft</EditableText>,
  tts_chapter: <EditableText id="story-ai-job-tts">AI narration</EditableText>,
};

/** Compact status line + expandable list of recent AI jobs. */
const AiJobsStrip: React.FC<{ jobs: AiJob[]; onChanged: () => void }> = ({ jobs, onChanged }) => {
  const [expanded, setExpanded] = useState(false);
  const open = jobs.filter(isOpen);
  const failed = jobs.filter((j) => j.status === "failed");
  if (open.length === 0 && failed.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-purple-200 bg-purple-50 text-sm text-purple-900">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {open.length > 0 && (
          <span>
            <EditableText id="story-ai-working">AI is working:</EditableText> {open.length}{" "}
            <EditableText id="story-ai-jobs-open">job(s) in progress</EditableText>
          </span>
        )}
        {failed.length > 0 && (
          <span className="inline-flex items-center gap-1 text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {failed.length} <EditableText id="story-ai-jobs-failed">failed</EditableText>
          </span>
        )}
        <span className="ml-auto">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {expanded && (
        <ul className="border-t border-purple-200 max-h-60 overflow-y-auto divide-y divide-purple-100">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-start gap-2 px-3 py-1.5 text-xs">
              <span className="w-20 shrink-0 font-medium capitalize">{j.status}</span>
              <span className="flex-1 min-w-0">
                {KIND_LABEL[j.kind]} · {j.chapter_title || "—"}
                {j.error && <span className="block text-red-700">{j.error}</span>}
              </span>
              {j.status === "queued" && j.is_mine && (
                <button
                  type="button"
                  title="Cancel"
                  onClick={async () => {
                    await cancelAiJob(j.id).catch(() => {});
                    onChanged();
                  }}
                  className="p-0.5 rounded hover:bg-purple-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AiJobsStrip;
