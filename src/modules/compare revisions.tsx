import React from "react";
import RevisionComparison from "@/components/RevisionComparison";

// Generic container module for "Compare Revisions".
//
// This is intentionally thin for now and simply delegates to the
// existing RevisionComparison component that already implements:
// - Selecting a minimum of 2 and a maximum of 4 revisions.
// - Multiple layout options for how the tiles are arranged.
// - Resizable tiles via the ResizablePanelGroup UI.
//
// The idea is that pages (Profile, Story, etc.) can import this module
// and pass in the relevant revisions. In the future, this container can
// be extended to fetch revisions from different backends, handle
// permissions, or provide higher-level wiring without changing all call
// sites.

export interface CompareRevision {
  id: number;
  text: string;
  time: string;
}

export interface CompareRevisionsContainerProps {
  revisions: CompareRevision[];
  className?: string;
}

const CompareRevisionsContainer: React.FC<CompareRevisionsContainerProps> = ({
  revisions,
  className,
}) => {
  return <RevisionComparison revisions={revisions} className={className} />;
};

export default CompareRevisionsContainer;
