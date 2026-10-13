import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EditableText from "@/components/EditableText";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChapterMediaEditor from "@/components/story/media/ChapterMediaEditor";
import LanguageSwitcher from "@/components/story/LanguageSwitcher";
import TranslateStoryDialog from "@/components/story/TranslateStoryDialog";
import AiJobsStrip, { useAiJobs } from "@/components/story/AiJobsStrip";
import { listChapterMedia, type ChapterMediaList } from "@/lib/mediaApi";
import { createStoryTranslation, fetchStoryTranslations, setOfficialTranslation, type StoryTranslations } from "@/lib/translationsApi";
import { connectionsFor, useAiConnections } from "@/lib/aiApi";
import { Film } from "lucide-react";
import type { Chapter } from "@web/lib/story";

// Story formats (audio / cartoon / video per chapter), translations and
// bring-your-own-AI jobs — the platform's own components, so the web app
// and the story page stay identical (Documentation/Story_formats_...md).
export const FormatsPanel: React.FC<{
  storyId: string;
  language: string;
  chapter: Chapter | null;
  chapters: Chapter[];
  paragraphs: string[];
  canEdit: boolean;
}> = ({ storyId, language, chapter, chapters, paragraphs, canEdit }) => {
  const navigate = useNavigate();
  const [media, setMedia] = useState<ChapterMediaList | null>(null);
  const [translations, setTranslations] = useState<StoryTranslations | null>(null);
  const [translateOpen, setTranslateOpen] = useState(false);
  const ai = useAiConnections(true);

  const loadMedia = useCallback(() => {
    if (chapter) listChapterMedia(chapter.chapter_id).then(setMedia).catch(() => setMedia(null));
  }, [chapter]);
  useEffect(loadMedia, [loadMedia]);
  const loadTranslations = useCallback(() => fetchStoryTranslations(storyId).then(setTranslations).catch(() => setTranslations(null)), [storyId]);
  useEffect(() => {
    loadTranslations();
  }, [loadTranslations]);

  const jobs = useAiJobs(storyId, canEdit, () => loadMedia());

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 font-medium">
        <Film className="h-4 w-4" />
        <EditableText id="webapp-formats-title">Formats and translations</EditableText>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        <LanguageSwitcher
          storyTitleId={storyId}
          language={language || "en"}
          translations={translations}
          onTranslate={() => setTranslateOpen(true)}
          onToggleOfficial={async (id, official) => {
            await setOfficialTranslation(id, official).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
            loadTranslations();
          }}
          versionPath={(id) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/story/${id}`}
        />
        <AiJobsStrip jobs={jobs.jobs} onChanged={jobs.refresh} />
        {chapter ? (
          <Tabs defaultValue="audio">
            <TabsList className="w-full">
              <TabsTrigger value="audio" className="flex-1">
                <EditableText id="webapp-formats-audio">Audio</EditableText>
              </TabsTrigger>
              <TabsTrigger value="visual" className="flex-1">
                <EditableText id="webapp-formats-cartoon">Cartoon</EditableText>
              </TabsTrigger>
              <TabsTrigger value="video" className="flex-1">
                <EditableText id="webapp-formats-video">Video</EditableText>
              </TabsTrigger>
            </TabsList>
            {(["audio", "visual", "video"] as const).map((k) => (
              <TabsContent key={k} value={k}>
                <ChapterMediaEditor
                  kind={k}
                  storyTitleId={storyId}
                  chapterId={chapter.chapter_id}
                  chapterParagraphs={paragraphs}
                  chapters={chapters.map((c) => ({ chapter_id: c.chapter_id, chapter_title: c.chapter_title }))}
                  list={media}
                  onChanged={loadMedia}
                  onAiJobQueued={jobs.refresh}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : null}
      </div>
      <TranslateStoryDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        sourceLanguage={language || "en"}
        aiConnections={connectionsFor(ai.connections, "translate")}
        onCreate={async (lang, start, connectionId) => {
          const created = await createStoryTranslation(storyId, lang, start, connectionId);
          if (created.ai_error) toast({ title: "Translation created, but AI drafting didn't start", description: created.ai_error, variant: "destructive" });
          navigate(`/story/${created.story_title_id}`);
        }}
      />
    </div>
  );
};
