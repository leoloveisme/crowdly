
import React from "react";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { Button } from "@/components/ui/button";
import { Edit, Eye } from "lucide-react";

const EditingModeToggle: React.FC = () => {
  const { isAdmin, isEditingEnabled, toggleEditingMode, currentLanguage } = useEditableContent();

  if (!isAdmin) return null;

  return (
    <Button
      onClick={toggleEditingMode}
      variant={isEditingEnabled ? "destructive" : "default"}
      className="fixed bottom-4 right-4 z-50 shadow-lg"
    >
      {isEditingEnabled ? (
        <>
          <Eye className="mr-2 h-4 w-4" />
          Exit Editing Mode ({currentLanguage})
        </>
      ) : (
        <>
          <Edit className="mr-2 h-4 w-4" />
          Enable Editing Mode ({currentLanguage})
        </>
      )}
    </Button>
  );
};

export default EditingModeToggle;
