
import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { getPageKey, LAYOUT_PAGE_KEY } from "@/lib/pageKey";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const LANGUAGE_STORAGE_KEY = "crowdly_ui_language";

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
  startEditing: (elementId: string, content: string, original: string, layoutScoped?: boolean) => void;
  updateContent: (elementId: string, content: string, layoutScoped?: boolean) => void;
  saveContent: (elementId: string, contentOverride?: string, layoutScoped?: boolean) => Promise<void>;
  cancelEditing: (elementId: string, layoutScoped?: boolean) => void;
  isAdmin: boolean;
  currentLanguage: string;
  setCurrentLanguage: (language: string) => void;
}

const EditableContentContext = createContext<EditableContentContextType | undefined>(undefined);

export const EditableContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Layout content (Header/Footer) is scoped independently of the current
  // page — it's the same on every route — while page content is scoped to
  // the current page's canonical key. Kept as two maps so navigating between
  // pages never clobbers Header/Footer translations, and vice versa.
  const [layoutContents, setLayoutContents] = useState<EditableContent>({});
  const [pageContents, setPageContents] = useState<EditableContent>({});
  const [isEditingEnabled, setIsEditingEnabled] = useState(false);
  const [currentLanguage, setCurrentLanguageState] = useState<string>(
    () => localStorage.getItem(LANGUAGE_STORAGE_KEY) || "English"
  );
  const { user, hasRole } = useAuth();
  const location = useLocation();
  const isAdmin = user !== null && (hasRole('platform_admin') || hasRole('ui_translator'));

  // Canonical key for the current page (route pattern, not literal URL) —
  // e.g. "/story/:story_id" regardless of which story is being viewed.
  const pageKey = useMemo(() => getPageKey(location.pathname), [location.pathname]);

  const contents = useMemo(
    () => ({ ...layoutContents, ...pageContents }),
    [layoutContents, pageContents]
  );

  // Handle language change
  const handleLanguageChange = (language: string) => {
    // Clear existing content first — the two effects below will repopulate
    // both maps for the new language.
    setLayoutContents({});
    setPageContents({});

    setCurrentLanguageState(language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);

    // Display toast notification about language change
    toast({
      title: "Language changed",
      description: `Content is now displayed in ${language}`,
      duration: 3000,
    });
  };

  // Fetch existing content from the database for a given key/language into a given setter.
  const fetchContentInto = async (
    path: string,
    language: string,
    setter: React.Dispatch<React.SetStateAction<EditableContent>>
  ) => {
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
        setter(prev => {
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
      console.error('Error in fetchContentInto:', error);
    }
  };

  // Layout content only depends on language — Header/Footer render on every page.
  useEffect(() => {
    fetchContentInto(LAYOUT_PAGE_KEY, currentLanguage, setLayoutContents);
  }, [currentLanguage]);

  // Page content depends on the canonical page key and language. Navigating
  // between two pages that share a route pattern (e.g. two different
  // stories) keeps pageKey identical, so this does not redundantly refetch.
  useEffect(() => {
    fetchContentInto(pageKey, currentLanguage, setPageContents);
  }, [pageKey, currentLanguage]);

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
      const clearEditing = (prev: EditableContent) => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          updated[key] = { ...updated[key], isEditing: false };
        });
        return updated;
      };
      setLayoutContents(clearEditing);
      setPageContents(clearEditing);
    }

    toast({
      title: isEditingEnabled ? "Editing mode disabled" : "Editing mode enabled",
      description: isEditingEnabled
        ? "Content is now in view-only mode"
        : "You can now edit content by clicking on text elements",
    });
  };

  const startEditing = (elementId: string, content: string, original: string, layoutScoped = false) => {
    if (!isAdmin || !isEditingEnabled) return;
    // English is the source language — block editing to prevent accidental changes
    if (currentLanguage === "English") return;

    const setter = layoutScoped ? setLayoutContents : setPageContents;
    setter(prev => ({
      ...prev,
      [elementId]: {
        content,
        original: prev[elementId]?.original || original,
        isEditing: true
      }
    }));
  };

  const updateContent = (elementId: string, content: string, layoutScoped = false) => {
    if (!isAdmin) return;

    const setter = layoutScoped ? setLayoutContents : setPageContents;
    setter(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        content
      }
    }));
  };

  const saveContent = async (elementId: string, contentOverride?: string, layoutScoped = false) => {
    const key = layoutScoped ? LAYOUT_PAGE_KEY : pageKey;
    if (!isAdmin || !key) return;

    try {
      const source = layoutScoped ? layoutContents : pageContents;
      const contentData = source[elementId];
      if (!contentData) return;

      // Use contentOverride if provided (avoids async state timing issues)
      const finalContent = contentOverride ?? contentData.content;

      const res = await fetch(`${API_BASE}/interface-translations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          page_path: key,
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
      const setter = layoutScoped ? setLayoutContents : setPageContents;
      setter(prev => ({
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

  const cancelEditing = (elementId: string, layoutScoped = false) => {
    if (!isAdmin) return;

    const setter = layoutScoped ? setLayoutContents : setPageContents;
    setter(prev => {
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
