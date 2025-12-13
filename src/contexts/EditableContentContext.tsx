
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";

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
  saveContent: (elementId: string) => Promise<void>;
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
  const isAdmin = user !== null && hasRole('platform_admin');
  const currentPath = location.pathname;

  // Handle language change
  const handleLanguageChange = (language: string) => {
    console.log(`Language changed to: ${language}`);
    
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
      console.log(`Fetching content for path: ${path}, language: ${language}`);
      const { data, error } = await supabase
        .from('editable_content')
        .select('*')
        .eq('page_path', path)
        .eq('language', language);

      if (error) {
        console.error('Error fetching editable content:', error);
        return;
      }

      if (data) {
        console.log(`Retrieved ${data.length} content items for ${language}`, data);
        const contentMap: EditableContent = {};
        data.forEach(item => {
          contentMap[item.element_id] = {
            content: item.content,
            original: item.original_content || item.content,
            isEditing: false
          };
        });
        setContents(contentMap);
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

  const saveContent = async (elementId: string) => {
    if (!isAdmin || !currentPath) return;
    
    try {
      const contentData = contents[elementId];
      if (!contentData) return;
      
      console.log(`Saving content for ${elementId} in ${currentLanguage}`);

      // First try to delete any existing record to avoid duplicate key errors
      await supabase
        .from('editable_content')
        .delete()
        .eq('page_path', currentPath)
        .eq('element_id', elementId)
        .eq('language', currentLanguage);
        
      // Then insert the new record
      const { error: insertError } = await supabase
        .from('editable_content')
        .insert({
          page_path: currentPath,
          element_id: elementId,
          content: contentData.content,
          original_content: contentData.original,
          updated_by: user?.id,
          language: currentLanguage
        });
      
      if (insertError) {
        console.error('Error saving content:', insertError);
        toast({
          title: "Error saving content",
          description: insertError.message,
          variant: "destructive"
        });
        return;
      }

      // Turn off editing for this element
      setContents(prev => ({
        ...prev,
        [elementId]: {
          ...prev[elementId],
          isEditing: false
        }
      }));

      toast({
        title: "Content saved",
        description: `Your changes have been saved successfully in ${currentLanguage}`,
      });
      
      // Refresh content to ensure we have the latest
      fetchEditableContent(currentPath, currentLanguage);
      
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
          content: elementData.content, // Keep the current content
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
