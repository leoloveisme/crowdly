import React from "react";
import { useParams } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ScreenplayTemplate from "@/modules/screenplay template";

const Screenplay: React.FC = () => {
  const { screenplay_id } = useParams<{ screenplay_id: string }>();

  if (!screenplay_id) {
    return (
      <div className="flex flex-col min-h-screen">
        <CrowdlyHeader />
        <div className="flex-grow flex flex-col justify-center items-center text-center px-4">
          <h1 className="text-4xl font-bold mb-4">Screenplay not found</h1>
          <p className="text-xl text-gray-600 mb-4">
            The requested screenplay ID is missing or invalid.
          </p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-1 p-4">
        <div className="container mx-auto space-y-6">
          <ScreenplayTemplate initialScreenplayId={screenplay_id} />
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Screenplay;
