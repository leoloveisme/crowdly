import React, { useEffect, useRef, useState } from "react";
import { Download, Mic, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import EditableText from "@/components/EditableText";
import { baseMime } from "@/lib/mediaApi";

// Formats the backend accepts, in order of preference. Chrome/Firefox record
// WebM/Opus; Safari records MP4/AAC.
const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const EXTENSIONS: Record<string, string> = { "audio/webm": ".webm", "audio/mp4": ".m4a", "audio/ogg": ".ogg" };

const pickMimeType = () =>
  typeof MediaRecorder === "undefined" ? null : CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type State = { phase: "idle" } | { phase: "recording"; startedAt: number } | { phase: "recorded"; file: File; url: string };

interface QuickTakeRecorderProps {
  /** Upload the take through the same path as a chosen file (label, text version…); resolves true on success. */
  onUpload: (file: File) => Promise<boolean>;
  uploading: boolean;
}

/**
 * A small in-browser recorder for a quick narration take: record, listen
 * back, re-take, then upload — or download the take to keep or edit it in
 * Audacity, or delete it. No editing tools on purpose.
 */
const QuickTakeRecorder: React.FC<QuickTakeRecorderProps> = ({ onUpload, uploading }) => {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const supported = pickMimeType() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Free the microphone and the preview URL when leaving.
  useEffect(
    () => () => {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      releaseMic();
    },
    [],
  );
  useEffect(() => () => {
    if (state.phase === "recorded") URL.revokeObjectURL(state.url);
  }, [state]);

  useEffect(() => {
    if (state.phase !== "recording") return;
    const t = window.setInterval(() => setElapsed((Date.now() - state.startedAt) / 1000), 250);
    return () => window.clearInterval(t);
  }, [state]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType() || undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        releaseMic();
        const type = baseMime(recorder.mimeType || mimeType || "audio/webm");
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const file = new File(chunks, `narration-take-${stamp}${EXTENSIONS[type] ?? ".webm"}`, { type });
        setState({ phase: "recorded", file, url: URL.createObjectURL(file) });
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setElapsed(0);
      setState({ phase: "recording", startedAt: Date.now() });
    } catch (err) {
      releaseMic();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked — allow it in your browser to record."
          : "Could not start recording on this device.",
      );
    }
  };

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();
  const discard = () => setState({ phase: "idle" });

  if (!supported) {
    return (
      <p className="text-[11px] text-gray-500">
        <EditableText id="story-recorder-unsupported">This browser can't record audio — upload a file instead.</EditableText>
      </p>
    );
  }

  const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-600">
        <EditableText id="story-recorder-heading">Or record a quick take here</EditableText>
      </div>
      {state.phase === "idle" && (
        <button type="button" onClick={start} className={btn}>
          <Mic className="h-3.5 w-3.5 text-red-600" />
          <EditableText id="story-recorder-start">Record</EditableText>
        </button>
      )}
      {state.phase === "recording" && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-red-700">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
            {fmt(elapsed)}
          </span>
          <button type="button" onClick={stop} className={btn}>
            <Square className="h-3.5 w-3.5" />
            <EditableText id="story-recorder-stop">Stop</EditableText>
          </button>
        </div>
      )}
      {state.phase === "recorded" && (
        <div className="space-y-2">
          <audio controls src={state.url} className="w-full h-9" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={uploading} onClick={() => onUpload(state.file).then((ok) => ok && discard())} className={btn}>
              <Upload className="h-3.5 w-3.5" />
              <EditableText id="story-recorder-upload">Upload this take</EditableText>
            </button>
            <a href={state.url} download={state.file.name} className={btn}>
              <Download className="h-3.5 w-3.5" />
              <EditableText id="story-recorder-download">Download</EditableText>
            </a>
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                discard();
                start();
              }}
              className={btn}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <EditableText id="story-recorder-retake">Re-take</EditableText>
            </button>
            <button type="button" disabled={uploading} onClick={discard} className={`${btn} text-red-700`}>
              <Trash2 className="h-3.5 w-3.5" />
              <EditableText id="story-recorder-delete">Delete take</EditableText>
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
};

export default QuickTakeRecorder;
