import React from "react";
import { useSearchParams } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import CommunicationsSection from "@/components/CommunicationsSection";

const Communications: React.FC = () => {
  const [searchParams] = useSearchParams();
  const withFriendId = searchParams.get("with") ?? undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        <CommunicationsSection initialFriendId={withFriendId} />
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Communications;
