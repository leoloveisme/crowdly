import { useCallback, useEffect, useState } from "react";
import { listChapterMedia, type ChapterMediaList } from "@/lib/mediaApi";

/** Media of one chapter, with a reload function. */
export function useChapterMedia(chapterId: string | null | undefined) {
  const [list, setList] = useState<ChapterMediaList | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!chapterId) {
      setList(null);
      return;
    }
    setLoading(true);
    listChapterMedia(chapterId)
      .then(setList)
      .catch(() => setList({ can_moderate: false, can_narrate: false, media: [] }))
      .finally(() => setLoading(false));
  }, [chapterId]);

  useEffect(reload, [reload]);

  return { list, loading, reload };
}
