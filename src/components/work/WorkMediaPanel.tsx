import React, { useCallback, useEffect, useState } from "react";
import { Check, Headphones, Loader2, Trash2, Video, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import { connectionName, connectionsFor, type AiConnection } from "@/lib/aiApi";
import {
  aiNarratePart,
  aiVideoPart,
  cancelWorkAiJob,
  deleteWorkMedia,
  embedPartVideo,
  listPartMedia,
  listWorkAiJobs,
  updateWorkMedia,
  uploadPartMedia,
  type WorkAiJob,
  type WorkKind,
  type WorkMediaItem,
  type WorkPart,
} from "@/lib/workApi";

interface Props {
  kind: WorkKind;
  workId: string;
  part: WorkPart;
  aiConnections: AiConnection[];
}

const MediaPlayer: React.FC<{ item: WorkMediaItem }> = ({ item }) => {
  if (item.kind === "audio") return <audio controls src={item.url} className="w-full" preload="none" />;
  if (item.source === "embed") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded">
        <iframe
          src={item.url}
          title={item.label ?? "Video"}
          className="h-full w-full"
          allow="accelerometer; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <video controls src={item.url} className="w-full rounded" preload="metadata" />;
};

/**
 * Audio and Video of one scene or issue — narrations / table reads, video
 * links and uploads, AI generation — with team moderation of others'
 * submissions. The story page's Audio and Video formats, for other kinds.
 */
const WorkMediaPanel: React.FC<Props> = ({ kind, workId, part, aiConnections }) => {
  const { user } = useAuth();
  const p = kind;
  const [items, setItems] = useState<WorkMediaItem[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [canNarrate, setCanNarrate] = useState(false);
  const [jobs, setJobs] = useState<WorkAiJob[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [ttsConnection, setTtsConnection] = useState("");
  const [videoConnection, setVideoConnection] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");

  const ttsConnections = connectionsFor(aiConnections, "tts");
  const videoConnections = connectionsFor(aiConnections, "video");

  const load = useCallback(() => {
    listPartMedia(part)
      .then((data) => {
        setItems(data.items);
        setCanModerate(data.can_moderate);
        setCanNarrate(data.can_narrate);
      })
      .catch(() => setItems([]));
    if (user) {
      listWorkAiJobs(kind, workId)
        .then((rows) => setJobs(rows.filter((j) => j.part_id === part.id)))
        .catch(() => setJobs([]));
    }
  }, [part, kind, workId, user]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while AI jobs for this part are still running.
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [active, load]);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) toast({ title: done });
      load();
    } catch (err) {
      toast({ title: "Media", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const audio = items.filter((i) => i.kind === "audio");
  const video = items.filter((i) => i.kind === "video");

  const itemRow = (item: WorkMediaItem) => (
    <li key={item.id} className="space-y-1 rounded border bg-white p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{item.label || (item.source === "ai" ? "AI" : item.creator_name)}</span>
        {item.status !== "approved" && (
          <span className="rounded bg-amber-100 px-1.5 text-amber-800">
            {item.status === "pending" ? (
              <EditableText id={`${p}-media-pending`}>waiting for review</EditableText>
            ) : (
              <EditableText id={`${p}-media-rejected`}>rejected</EditableText>
            )}
          </span>
        )}
        <span className="flex-1" />
        {canModerate && item.status !== "approved" && (
          <button type="button" onClick={() => run(() => updateWorkMedia(item.id, { status: "approved" }))} className="text-green-700" aria-label="Approve">
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        {canModerate && item.status === "pending" && (
          <button type="button" onClick={() => run(() => updateWorkMedia(item.id, { status: "rejected" }))} className="text-gray-500" aria-label="Reject">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {(canModerate || item.is_mine) && (
          <button type="button" onClick={() => run(() => deleteWorkMedia(item.id))} className="text-red-500" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <MediaPlayer item={item} />
    </li>
  );

  if (!user && items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border bg-gray-50/60 p-3">
      {audio.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <Headphones className="h-3.5 w-3.5" />
            <EditableText id={`${p}-media-audio`}>Audio</EditableText>
          </h4>
          <ul className="space-y-2">{audio.map(itemRow)}</ul>
        </div>
      )}
      {video.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <Video className="h-3.5 w-3.5" />
            <EditableText id={`${p}-media-video`}>Video</EditableText>
          </h4>
          <ul className="space-y-2">{video.map(itemRow)}</ul>
        </div>
      )}
      {jobs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 text-gray-600">
              {(j.status === "queued" || j.status === "running") && <Loader2 className="h-3 w-3 animate-spin" />}
              <span>
                {j.kind.startsWith("tts") ? "AI narration" : j.kind.startsWith("video") ? "AI video" : "AI translation"} · {j.status}
                {j.error ? ` — ${j.error}` : ""}
              </span>
              {j.is_mine && j.status === "queued" && (
                <button type="button" onClick={() => run(() => cancelWorkAiJob(j.id))} className="text-blue-700 hover:underline">
                  <EditableText id={`${p}-ai-cancel`}>Cancel</EditableText>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {user &&
        (adding ? (
          <div className="space-y-3 border-t pt-3 text-xs">
            {canNarrate ? (
              <label className="block space-y-1">
                <span className="font-medium text-gray-700">
                  <EditableText id={`${p}-media-upload-audio`}>Upload a narration (audio file)</EditableText>
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) run(() => uploadPartMedia(part, "audio", file), "Narration uploaded");
                  }}
                />
              </label>
            ) : (
              <EditableText id={`${p}-media-no-narration`} as="p" className="text-gray-500">
                The owner hasn't opened this work for narration.
              </EditableText>
            )}
            <div className="space-y-1">
              <span className="font-medium text-gray-700">
                <EditableText id={`${p}-media-add-video`}>Add a video (YouTube / Vimeo link or a file)</EditableText>
              </span>
              <div className="flex gap-2">
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtu.be/…"
                  className="flex-1 border rounded px-2 py-1"
                />
                <Button
                  size="sm"
                  className="h-7"
                  disabled={busy || !videoUrl.trim()}
                  onClick={() => run(async () => {
                    await embedPartVideo(part, videoUrl.trim());
                    setVideoUrl("");
                  }, "Video added")}
                >
                  <EditableText id={`${p}-media-add-btn`}>Add</EditableText>
                </Button>
              </div>
              <input
                type="file"
                accept="video/*"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) run(() => uploadPartMedia(part, "video", file), "Video uploaded");
                }}
              />
            </div>
            {canNarrate && ttsConnections.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-700">
                  <EditableText id={`${p}-ai-narrate`}>Generate narration with AI</EditableText>
                </span>
                <select value={ttsConnection} onChange={(e) => setTtsConnection(e.target.value)} className="border rounded px-1 py-0.5 bg-white">
                  <option value="">—</option>
                  {ttsConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {connectionName(c)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  className="h-7"
                  disabled={busy || !ttsConnection}
                  onClick={() => run(() => aiNarratePart(part, { connectionId: ttsConnection }), "Narration queued")}
                >
                  <EditableText id={`${p}-ai-start`}>Start</EditableText>
                </Button>
              </div>
            )}
            {videoConnections.length > 0 && (
              <div className="space-y-1">
                <span className="font-medium text-gray-700">
                  <EditableText id={`${p}-ai-video`}>Generate a video with AI (experimental)</EditableText>
                </span>
                <textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={2}
                  placeholder="Describe what the video should show"
                  className="w-full border rounded px-2 py-1"
                />
                <div className="flex items-center gap-2">
                  <select value={videoConnection} onChange={(e) => setVideoConnection(e.target.value)} className="border rounded px-1 py-0.5 bg-white">
                    <option value="">—</option>
                    {videoConnections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {connectionName(c)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={busy || !videoConnection || videoPrompt.trim().length < 10}
                    onClick={() =>
                      run(async () => {
                        await aiVideoPart(part, { connectionId: videoConnection, prompt: videoPrompt.trim(), seconds: 8 });
                        setVideoPrompt("");
                      }, "Video queued")
                    }
                  >
                    <EditableText id={`${p}-ai-start`}>Start</EditableText>
                  </Button>
                </div>
              </div>
            )}
            {!canModerate && (
              <EditableText id={`${p}-media-review-hint`} as="p" className="text-gray-500">
                What you add is shown to readers once the team approves it.
              </EditableText>
            )}
            <button type="button" onClick={() => setAdding(false)} className="text-gray-500 hover:underline">
              <EditableText id={`${p}-media-close`}>Close</EditableText>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-xs text-blue-700 hover:underline">
            <EditableText id={`${p}-media-add-own`}>Add your own: narration · video</EditableText>
          </button>
        ))}
    </section>
  );
};

export default WorkMediaPanel;
