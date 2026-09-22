import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import {
  aiComic,
  aiVideo,
  connectionName,
  connectionsFor,
  useAiConnections,
  type AiCapability,
  type AiConnection,
} from "@/lib/aiApi";

/** Pick one of the user's connections for a capability (hidden when there's only one). */
const ConnectionPicker: React.FC<{
  connections: AiConnection[];
  value: AiConnection | undefined;
  onChange: (id: string) => void;
  label: React.ReactNode;
}> = ({ connections, value, onChange, label }) =>
  connections.length > 1 ? (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      {label}
      <select
        value={value?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-1.5 py-1 bg-white text-sm"
      >
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {connectionName(c)}
          </option>
        ))}
      </select>
    </label>
  ) : null;

function usePicked(connections: AiConnection[], capability: AiCapability) {
  const list = connectionsFor(connections, capability);
  const [id, setId] = useState("");
  return { list, picked: list.find((c) => c.id === id) ?? list[0], setId };
}

const ConnectHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Link to="/profile" className="text-xs text-purple-700 hover:underline">
    {children}
  </Link>
);

// ---------------------------------------------------------------------------
// Comic
// ---------------------------------------------------------------------------

export const AiComicGenerator: React.FC<{
  chapterId: string;
  paragraphs: string[];
  onQueued?: () => void;
}> = ({ chapterId, paragraphs, onQueued }) => {
  const { toast } = useToast();
  const { connections } = useAiConnections(true);
  const text = usePicked(connections, "translate");
  const image = usePicked(connections, "image");
  const last = Math.max(0, paragraphs.length - 1);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(last, 3));
  const [frames, setFrames] = useState(4);
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!text.picked || !image.picked) return;
    setBusy(true);
    try {
      await aiComic(chapterId, {
        textConnectionId: text.picked.id,
        imageConnectionId: image.picked.id,
        anchorStart: from,
        anchorEnd: Math.max(from, to),
        frameCount: frames,
        style,
      });
      toast({
        title: "Drawing your comic",
        description: "Your AI writes a storyboard, then draws each frame. It appears here when it's done.",
      });
      onQueued?.();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not start", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const options = paragraphs.map((p, i) => (
    <option key={i} value={i}>
      {i + 1}. {p.slice(0, 40)}
      {p.length > 40 ? "…" : ""}
    </option>
  ));

  return (
    <div className="border rounded p-3 bg-purple-50/40 space-y-2">
      <div className="flex items-center gap-1 text-sm font-medium text-purple-900">
        <Sparkles className="h-3.5 w-3.5" />
        <EditableText id="story-comic-ai-heading">Generate a comic with your AI</EditableText>
      </div>
      {paragraphs.length === 0 ? (
        <p className="text-xs text-gray-500">
          <EditableText id="story-comic-ai-no-text">Write the chapter text first.</EditableText>
        </p>
      ) : text.list.length === 0 || image.list.length === 0 ? (
        <ConnectHint>
          <EditableText id="story-comic-ai-connect">
            Needs a text AI (Claude, OpenAI…) and an image AI (OpenAI) — connect them in your profile
          </EditableText>
        </ConnectHint>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <label className="space-y-0.5">
              <span className="text-xs text-gray-600">
                <EditableText id="story-comic-ai-from">From paragraph</EditableText>
              </span>
              <select
                value={from}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFrom(v);
                  if (to < v) setTo(v);
                }}
                className="w-full border rounded px-1.5 py-1 bg-white"
              >
                {options}
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-xs text-gray-600">
                <EditableText id="story-comic-ai-to">To paragraph</EditableText>
              </span>
              <select
                value={to}
                onChange={(e) => setTo(Number(e.target.value))}
                className="w-full border rounded px-1.5 py-1 bg-white"
              >
                {options.filter((_, i) => i >= from)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <EditableText id="story-comic-ai-frames">Frames</EditableText>
              <select
                value={frames}
                onChange={(e) => setFrames(Number(e.target.value))}
                className="border rounded px-1.5 py-1 bg-white text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Style (optional), e.g. “watercolour picture book”, “manga”"
              className="flex-1 min-w-[12rem] border rounded px-2 py-1.5"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <ConnectionPicker
              connections={text.list}
              value={text.picked}
              onChange={text.setId}
              label={<EditableText id="story-comic-ai-text-conn">Script:</EditableText>}
            />
            <ConnectionPicker
              connections={image.list}
              value={image.picked}
              onChange={image.setId}
              label={<EditableText id="story-comic-ai-image-conn">Drawing:</EditableText>}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <EditableText id="story-comic-ai-generate">Generate comic</EditableText>
          </button>
          <p className="text-[11px] text-gray-500">
            <EditableText id="story-comic-ai-note">
              Speech bubbles and captions are added as editable text, not drawn into the images. Uses your own provider
              accounts; each frame is one image request.
            </EditableText>
          </p>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Video (experimental)
// ---------------------------------------------------------------------------

export const AiVideoGenerator: React.FC<{
  chapterId: string;
  paragraphs: string[];
  onQueued?: () => void;
}> = ({ chapterId, paragraphs, onQueued }) => {
  const { toast } = useToast();
  const { connections } = useAiConnections(true);
  const video = usePicked(connections, "video");
  const [prompt, setPrompt] = useState(() => paragraphs.filter((p) => p.trim()).join("\n\n").slice(0, 1500));
  const [seconds, setSeconds] = useState(8);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!video.picked) return;
    setBusy(true);
    try {
      await aiVideo(chapterId, { connectionId: video.picked.id, prompt, seconds });
      toast({
        title: "Generating video",
        description: "Video takes a few minutes. It appears here when it's ready.",
      });
      onQueued?.();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not start", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded p-3 bg-purple-50/40 space-y-2">
      <div className="flex items-center gap-1 text-sm font-medium text-purple-900">
        <Sparkles className="h-3.5 w-3.5" />
        <EditableText id="story-video-ai-heading">Generate a video with your AI</EditableText>
        <span className="ml-1 text-[10px] uppercase tracking-wide text-purple-600">
          <EditableText id="story-video-ai-experimental">Experimental</EditableText>
        </span>
      </div>
      {video.list.length === 0 ? (
        <ConnectHint>
          <EditableText id="story-video-ai-connect">Connect a video AI (OpenAI) in your profile</EditableText>
        </ConnectHint>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe the scene: who, where, what happens, the mood and camera"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <EditableText id="story-video-ai-length">Length</EditableText>
              <select
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="border rounded px-1.5 py-1 bg-white text-sm"
              >
                {[4, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}s
                  </option>
                ))}
              </select>
            </label>
            <ConnectionPicker
              connections={video.list}
              value={video.picked}
              onChange={video.setId}
              label={<EditableText id="story-video-ai-conn">Using:</EditableText>}
            />
            <button
              type="button"
              disabled={busy || prompt.trim().length < 10}
              onClick={start}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <EditableText id="story-video-ai-generate">Generate video</EditableText>
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            <EditableText id="story-video-ai-note">
              Video generation can be expensive and takes minutes. The finished clip is stored on Crowdly (up to 200 MB).
            </EditableText>
          </p>
        </>
      )}
    </div>
  );
};
