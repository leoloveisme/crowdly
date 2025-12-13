
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface RevisionCheckboxCellProps {
  revisionId: number;
  selectedRevisions: number[];
  setSelectedRevisions: (ids: number[]) => void;
  maxSelections?: number;
}

const RevisionCheckboxCell: React.FC<RevisionCheckboxCellProps> = ({
  revisionId,
  selectedRevisions,
  setSelectedRevisions,
  maxSelections = 4,
}) => {
  const checked = selectedRevisions.includes(revisionId);

  const toggle = () => {
    if (checked) {
      setSelectedRevisions(selectedRevisions.filter((id) => id !== revisionId));
    } else {
      if (selectedRevisions.length >= maxSelections) {
        // remove the first-selected and add new
        setSelectedRevisions([...selectedRevisions.slice(1), revisionId]);
      } else {
        setSelectedRevisions([...selectedRevisions, revisionId]);
      }
    }
  };

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={toggle}
      disabled={!checked && selectedRevisions.length >= maxSelections}
      aria-label={`Select revision ${revisionId} for comparison`}
    />
  );
};

export default RevisionCheckboxCell;
