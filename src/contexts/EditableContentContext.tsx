
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface EditableContent {
  [key: string]: {
    content: string;
    original: string;
    isEditing: boolean;
  };
}

interface EditableContentContextType {
  contents: EditableContent;
  isEditingEnabled: boolean;
  toggleEditingMode: () => void;
  startEditing: (elementId: string, content: string, original: string) => void;
  updateContent: (elementId: string, content: string) => void;
  saveContent: (elementId: string, contentOverride?: string) => Promise<void>;
  cancelEditing: (elementId: string) => void;
  isAdmin: boolean;
  currentLanguage: string;
  setCurrentLanguage: (language: string) => void;
}

const EditableContentContext = createContext<EditableContentContextType | undefined>(undefined);

export const EditableContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [contents, setContents] = useState<EditableContent>({});
  const [isEditingEnabled, setIsEditingEnabled] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>("English");
  const { user, hasRole } = useAuth();
  const location = useLocation();
  const isAdmin = user !== null && (hasRole('platform_admin') || hasRole('ui_translator'));
  const currentPath = location.pathname;

  // Handle language change
  const handleLanguageChange = (language: string) => {
    // Clear existing content first
    setContents({});

    // Set the new language
    setCurrentLanguage(language);

    // Force a content refetch with the new language
    fetchEditableContent(currentPath, language);

    // Display toast notification about language change
    toast({
      title: "Language changed",
      description: `Content is now displayed in ${language}`,
      duration: 3000,
    });
  };

  // Fetch existing content from the database based on current path and language
  const fetchEditableContent = async (path: string, language: string) => {
    if (!path) return;

    try {
      const params = new URLSearchParams({ page_path: path, language });
      const res = await fetch(`${API_BASE}/interface-translations?${params}`);

      if (!res.ok) {
        console.error('Error fetching editable content:', res.status);
        return;
      }

      const data = await res.json();

      if (data && Array.isArray(data)) {
        setContents(prev => {
          const updated: EditableContent = {};
          data.forEach((item: { element_id: string; content: string; original_content: string | null }) => {
            updated[item.element_id] = {
              content: item.content,
              original: item.original_content || item.content,
              // Preserve isEditing flag if the element is currently being edited
              isEditing: prev[item.element_id]?.isEditing || false
            };
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error in fetchEditableContent:', error);
    }
  };

  // Fetch content whenever path or language changes
  useEffect(() => {
    fetchEditableContent(currentPath, currentLanguage);
  }, [currentPath, currentLanguage]);

  const toggleEditingMode = () => {
    if (!isAdmin) return;

    // Prevent enabling editing mode for English (source language)
    if (!isEditingEnabled && currentLanguage === "English") {
      toast({
        title: "English is protected",
        description: "English is the source language and cannot be edited. Switch to another language first.",
        variant: "destructive",
      });
      return;
    }

    setIsEditingEnabled(prev => !prev);

    // Exit all editing states when disabling editing mode
    if (isEditingEnabled) {
      setContents(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          updated[key].isEditing = false;
        });
        return updated;
      });
    }

    toast({
      title: isEditingEnabled ? "Editing mode disabled" : "Editing mode enabled",
      description: isEditingEnabled
        ? "Content is now in view-only mode"
        : "You can now edit content by clicking on text elements",
    });
  };

  const startEditing = (elementId: string, content: string, original: string) => {
    if (!isAdmin || !isEditingEnabled) return;
    // English is the source language — block editing to prevent accidental changes
    if (currentLanguage === "English") return;

    setContents(prev => ({
      ...prev,
      [elementId]: {
        content,
        original: prev[elementId]?.original || original,
        isEditing: true
      }
    }));
  };

  const updateContent = (elementId: string, content: string) => {
    if (!isAdmin) return;

    setContents(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        content
      }
    }));
  };

  const saveContent = async (elementId: string, contentOverride?: string) => {
    if (!isAdmin || !currentPath) return;

    try {
      const contentData = contents[elementId];
      if (!contentData) return;

      // Use contentOverride if provided (avoids async state timing issues)
      const finalContent = contentOverride ?? contentData.content;

      const res = await fetch(`${API_BASE}/interface-translations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          page_path: currentPath,
          element_id: elementId,
          language: currentLanguage,
          content: finalContent,
          original_content: contentData.original,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Error saving content",
          description: data.error || "Failed to save translation",
          variant: "destructive"
        });
        return;
      }

      // Update locally — no refetch needed, avoids wiping other elements' state
      setContents(prev => ({
        ...prev,
        [elementId]: {
          content: finalContent,
          original: prev[elementId]?.original || finalContent,
          isEditing: false
        }
      }));

      toast({
        title: "Content saved",
        description: `Your changes have been saved successfully in ${currentLanguage}`,
      });

    } catch (error) {
      console.error('Error in saveContent:', error);
      toast({
        title: "Error saving content",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const cancelEditing = (elementId: string) => {
    if (!isAdmin) return;

    setContents(prev => {
      const elementData = prev[elementId];
      if (!elementData) return prev;

      return {
        ...prev,
        [elementId]: {
          ...elementData,
          content: elementData.original, // Restore original on cancel
          isEditing: false
        }
      };
    });
  };

  const value = {
    contents,
    isEditingEnabled,
    toggleEditingMode,
    startEditing,
    updateContent,
    saveContent,
    cancelEditing,
    isAdmin,
    currentLanguage,
    setCurrentLanguage: handleLanguageChange
  };

  return (
    <EditableContentContext.Provider value={value}>
      {children}
    </EditableContentContext.Provider>
  );
};

export const useEditableContent = () => {
  const context = useContext(EditableContentContext);
  if (context === undefined) {
    throw new Error("useEditableContent must be used within an EditableContentProvider");
  }
  return context;
};
