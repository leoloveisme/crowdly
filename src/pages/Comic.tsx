import React from "react";
import { useParams } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ComicReader from "@/modules/comic reader";
import EditableText from "@/components/EditableText";

const Comic: React.FC = () => {
  const { comic_id } = useParams<{ comic_id: string }>();

  if (!comic_id) {
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex flex-col justify-center items-center text-center px-4">
          <EditableText id="comic-not-found-heading" as="h1" className="text-4xl font-bold mb-4">Comic not found</EditableText>
          <EditableText id="comic-not-found-desc" as="p" className="text-xl text-gray-600 mb-4">
            The requested comic ID is missing or invalid.
          </EditableText>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-1 p-4">
        <div className="container mx-auto space-y-6 max-w-4xl">
          <ComicReader comicId={comic_id} />
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Comic;
