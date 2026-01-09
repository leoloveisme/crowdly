
import React from "react";
import InteractionsWidget from "@/modules/InteractionsWidget";

interface ChapterInteractionsProps {
  chapterId: string;
}

const ChapterInteractions: React.FC<ChapterInteractionsProps> = ({ chapterId }) => {
  return <InteractionsWidget kind="chapter" chapterId={chapterId} />;
};

export default ChapterInteractions;
