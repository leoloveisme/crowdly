
import React, { useState, useEffect, useRef } from "react";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { cn } from "@/lib/utils";
import { Edit, Check, X } from "lucide-react";

interface EditableTextProps {
  id: string;
  className?: string;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

const EditableText: React.FC<EditableTextProps> = ({
  id,
  className = "",
  children,
  as: Component = "span"
}) => {
  const {
    contents,
    isEditingEnabled,
    isAdmin,
    currentLanguage,
    startEditing,
    updateContent,
    saveContent,
    cancelEditing
  } = useEditableContent();
  
  const [localContent, setLocalContent] = useState<string>("");
  const editableRef = useRef<HTMLDivElement>(null);
  const elementData = contents[id];
  const isEditing = elementData?.isEditing || false;
  
  // Define RTL languages - Arabic and Hebrew only
  const rtlLanguages = ["Arabic", "Hebrew"];
  const isRTL = rtlLanguages.includes(currentLanguage);
  
  // Initialize content from children when the component mounts
  useEffect(() => {
    // If children is a string, use it directly
    if (typeof children === 'string') {
      setLocalContent(children);
    } 
    // If children is a React element, try to extract text content
    else if (React.isValidElement(children) && typeof children.props.children === 'string') {
      setLocalContent(children.props.children);
    } 
    // Fallback for complex children
    else {
      try {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = children?.toString() || '';
        setLocalContent(tempContainer.textContent || '');
      } catch (e) {
        console.error('Could not extract text from children:', e);
        setLocalContent(children?.toString() || '');
      }
    }
  }, [children]);
  
  // Update localContent when elementData changes or currentLanguage changes
  useEffect(() => {
    if (elementData && elementData.content) {
      setLocalContent(elementData.content);
    }
  }, [elementData, currentLanguage]);

  // When editing status changes, focus the content editable div
  useEffect(() => {
    if (isEditing && editableRef.current) {
      // Focus the editable div
      editableRef.current.focus();
      
      // Place cursor at the end of the text
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        range.collapse(false); // false means collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing]);

  const handleClick = () => {
    if (isAdmin && isEditingEnabled && !isEditing) {
      startEditing(id, localContent, typeof children === 'string' ? children : '');
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const value = (e.target as HTMLDivElement).textContent || '';
    setLocalContent(value);
    updateContent(id, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleSave = async () => {
    await saveContent(id);
  };

  const handleCancel = () => {
    cancelEditing(id);
  };

  // If not admin or not in editing mode, just render the content
  if (!isAdmin || !isEditingEnabled) {
    return (
      <Component 
        className={className} 
        dir={isRTL ? "rtl" : "ltr"}
      >
        {elementData?.content || localContent || children}
      </Component>
    );
  }

  // For admins in editing mode
  if (isEditing) {
    return (
      <div className="relative group">
        <div
          ref={editableRef}
          contentEditable="true"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={(e) => e.stopPropagation()} // Prevent immediate save on blur
          className={cn(
            className,
            "border-2 border-blue-400 p-1 focus:outline-none min-h-[1em] min-w-[1em]",
            isRTL ? "text-right" : "text-left"
          )}
          dir={isRTL ? "rtl" : "ltr"}
          suppressContentEditableWarning={true}
        >
          {elementData?.content || localContent}
        </div>
        <div className="absolute right-0 top-0 space-x-1 bg-white shadow-sm border border-gray-200 rounded-md p-1">
          <button 
            onClick={handleSave}
            className="p-1 text-green-600 hover:bg-green-50 rounded"
            title={`Save (${currentLanguage})`}
          >
            <Check size={16} />
          </button>
          <button 
            onClick={handleCancel}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Admin in edit mode but not currently editing this element
  return (
    <Component
      className={cn(
        className,
        "hover:bg-blue-50 hover:outline-dashed hover:outline-1 hover:outline-blue-300 cursor-pointer relative group"
      )}
      onClick={handleClick}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {elementData?.content || localContent || children}
      <Edit 
        size={12} 
        className={`absolute opacity-0 group-hover:opacity-100 ${isRTL ? 'left-0' : 'right-0'} top-0 text-blue-400`}
        aria-label={`Click to edit (${currentLanguage})`} 
      />
    </Component>
  );
};

export default EditableText;
