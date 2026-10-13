import React from "react";
import { useParams } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ScreenplayPage from "@/modules/screenplay/ScreenplayPage";
import EditableText from "@/components/EditableText";

const Screenplay: React.FC = () => {
  const { screenplay_id, scene_id } = useParams<{ screenplay_id: string; scene_id?: string }>();

  if (!screenplay_id) {
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex flex-col justify-center items-center text-center px-4">
          <EditableText id="screenplay-not-found-heading" as="h1" className="text-4xl font-bold mb-4">Screenplay not found</EditableText>
          <EditableText id="screenplay-not-found-desc" as="p" className="text-xl text-gray-600 mb-4">
            The requested screenplay ID is missing or invalid.
          </EditableText>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        <ScreenplayPage screenplayId={screenplay_id} sceneId={scene_id} />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Screenplay;
