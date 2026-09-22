import React, { useEffect, useState } from "react";
import { BookAudio, Loader2, Sparkles, Timer, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { aiNarrateChapter, connectionName, connectionsFor, useAiConnections } from "@/lib/aiApi";
import EditableText from "@/components/EditableText";
import { useToast } from "@/hooks/use-toast";
import {
  listEditions,
  readAudioDuration,
  uploadNarration,
  type ChapterMedia,
  type ChapterMediaList,
  type EditionSummary,
} from "@/lib/mediaApi";
import MediaItemControls, { ProgressBar } from "./MediaItemControls";
import { AUDIO_ACCEPT, EditionSelect } from "./mediaShared";
import { narrationTitle } from "./AudioPanel";
import TimingSyncDialog from "./TimingSyncDialog";
import AudiobookUploadDialog from "./AudiobookUploadDialog";

interface AudioMediaEditorProps {
  storyTitleId: string;
  chapterId: string;
  chapterParagraphs: string[];
  chapters: { chapter_id: string; chapter_title: string }[];
  list: ChapterMediaList;
  onChanged: () => void;
  /** Called after an AI narration job is queued (so the page starts watching it). */
  onAiJobQueued?: () => void;
}

const AudioMediaEditor: React.FC<AudioMediaEditorProps> = ({
  storyTitleId,
  chapterId,
  chapterParagraphs,
  chapters,
  list,
  onChanged,
  onAiJobQueued,
}) => {
  const { toast } = useToast();
  const { connections } = useAiConnections(true);
  const ttsConnections = connectionsFor(connections, "tts");
  const [aiConnectionId, setAiConnectionId] = useState("");
  const [aiVoice, setAiVoice] = useState("");
  const [aiQueuing, setAiQueuing] = useState(false);
  const aiConnection = ttsConnections.find((c) => c.id === aiConnectionId) ?? ttsConnections[0];

  const handleGenerate = async () => {
    if (!aiConnection) return;
    setAiQueuing(true);
    try {
      await aiNarrateChapter(chapterId, {
        connectionId: aiConnection.id,
        editionId: editionId || null,
        voice: aiVoice.trim() || undefined,
      });
      toast({
        title: "Generating narration",
        description: "Your AI is narrating this chapter in the background — it appears here when ready.",
      });
      onAiJobQueued?.();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not start", variant: "destructive" });
    } finally {
      setAiQueuing(false);
    }
  };
  const narrations = list.media.filter((m) => m.kind === "audio");
  const [editions, setEditions] = useState<EditionSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [editionId, setEditionId] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [syncing, setSyncing] = useState<ChapterMedia | null>(null);
  const [audiobookOpen, setAudiobookOpen] = useState(false);

  useEffect(() => {
    listEditions(storyTitleId)
      .then(setEditions)
      .catch(() => setEditions([]));
  }, [storyTitleId]);

  const handleUpload = async () => {
    if (!file) return;
    setProgress(0);
    try {
      const durationSeconds = await readAudioDuration(file);
      const created = await uploadNarration(chapterId, file, { label, editionId: editionId || null, durationSeconds }, setProgress);
      setFile(null);
      setLabel("");
      toast({
        title: created.status === "pending" ? "Narration submitted" : "Narration added",
        description:
          created.status === "pending"
            ? "The story owner will review it."
            : "Use “Sync to paragraphs” to enable read-along.",
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {narrations.length > 0 && (
        <ul className="space-y-2">
          {narrations.map((m) => (
            <li key={m.id} className="border rounded p-2 bg-white space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{narrationTitle(m)}</span>
                  {m.creator_name && <span className="text-gray-500"> · {m.creator_name}</span>}
                  <span className="block text-xs text-gray-500">
                    {m.edition_is_auto_snapshot
                      ? `Text as of ${m.edition_snapshot_at ? new Date(m.edition_snapshot_at).toLocaleDateString() : "upload"}`
                      : m.edition_name
                      ? `Edition: ${m.edition_name}`
                      : "Not tied to a text version"}
                    {m.timings && m.timings.length > 0 ? ` · synced (${m.timings.length} paragraphs)` : ""}
                  </span>
                </div>
                <MediaItemControls media={m} canModerate={list.can_moderate} onChanged={onChanged}>
                  {(list.can_moderate || m.is_mine) && (
                    <button
                      type="button"
                      onClick={() => setSyncing(m)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border hover:bg-gray-50"
                    >
                      <Timer className="h-3 w-3" />
                      <EditableText id="story-audio-sync-btn">Sync to paragraphs</EditableText>
                    </button>
                  )}
                </MediaItemControls>
              </div>
              <audio controls preload="none" src={m.url ?? undefined} className="w-full h-9" />
            </li>
          ))}
        </ul>
      )}

      {!list.can_narrate ? (
        <p className="text-sm text-gray-500">
          <EditableText id="story-audio-closed">The story owner hasn't opened this story for narration.</EditableText>
        </p>
      ) : (
        <div className="border rounded p-3 bg-gray-50 space-y-2">
          <div className="text-sm font-medium">
            <EditableText id="story-audio-add-heading">Add a narration of this chapter</EditableText>
          </div>
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. “Narrated by Anna”"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="space-y-1">
            <span className="text-xs text-gray-600">
              <EditableText id="story-audio-which-text">Which text did you read?</EditableText>
            </span>
            <EditionSelect editions={editions} value={editionId} onChange={setEditionId} />
          </div>
          <ProgressBar value={progress} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!file || progress !== null}
              onClick={handleUpload}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <EditableText id="story-audio-upload-btn">Upload narration</EditableText>
            </button>
            <button
              type="button"
              onClick={() => setAudiobookOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
            >
              <BookAudio className="h-3.5 w-3.5" />
              <EditableText id="story-audio-audiobook-btn">Upload a whole audiobook…</EditableText>
            </button>
          </div>
          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-purple-900">
              <Sparkles className="h-3.5 w-3.5" />
              <EditableText id="story-audio-ai-heading">Or generate a narration with your AI</EditableText>
            </div>
            {ttsConnections.length === 0 ? (
              <Link to="/profile" className="text-xs text-purple-700 hover:underline">
                <EditableText id="story-audio-ai-connect">Connect a text-to-speech provider (OpenAI or ElevenLabs) in your profile</EditableText>
              </Link>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {ttsConnections.length > 1 && (
                  <select
                    value={aiConnection?.id ?? ""}
                    onChange={(e) => setAiConnectionId(e.target.value)}
                    className="border rounded px-2 py-1.5 text-sm bg-white"
                  >
                    {ttsConnections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {connectionName(c)}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={aiVoice}
                  onChange={(e) => setAiVoice(e.target.value)}
                  placeholder={`Voice (default: ${aiConnection?.settings?.tts?.voice || "provider default"})`}
                  className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[10rem]"
                />
                <button
                  type="button"
                  disabled={aiQueuing}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-purple-300 bg-white text-purple-800 hover:bg-purple-50 disabled:opacity-50"
                >
                  {aiQueuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  <EditableText id="story-audio-ai-generate">Generate narration</EditableText>
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              <EditableText id="story-audio-ai-note">
                Uses the text chosen above and bills your own provider account. Labelled as an AI narration.
              </EditableText>
            </p>
          </div>
          <p className="text-[11px] text-gray-500">
            <EditableText id="story-audio-formats">MP3, M4A, OGG, WAV, WEBM or FLAC, up to 200 MB per chapter.</EditableText>{" "}
            <EditableText id="story-audio-record-hint">
              Record with any app you like (e.g. Audacity or your phone), then upload here.
            </EditableText>
          </p>
        </div>
      )}

      {syncing && (
        <TimingSyncDialog
          media={syncing}
          fallbackParagraphs={chapterParagraphs}
          onClose={() => setSyncing(null)}
          onSaved={() => {
            setSyncing(null);
            onChanged();
          }}
        />
      )}
      <AudiobookUploadDialog
        open={audiobookOpen}
        onOpenChange={setAudiobookOpen}
        storyTitleId={storyTitleId}
        chapters={chapters}
        editions={editions}
        onDone={onChanged}
      />
    </div>
  );
};

export default AudioMediaEditor;
