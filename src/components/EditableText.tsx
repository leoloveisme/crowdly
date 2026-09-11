
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { cn } from "@/lib/utils";
import { Edit } from "lucide-react";

interface EditableTextProps {
  id: string;
  className?: string;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

/** Extract plain text from React children */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (React.isValidElement(children) && typeof children.props.children === 'string') {
    return children.props.children;
  }
  return children?.toString() || '';
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
    saveContent,
    cancelEditing
  } = useEditableContent();

  const editableRef = useRef<HTMLDivElement>(null);
  // Refs for tracking content during editing — avoids stale closures & re-renders
  const contentBeforeEdit = useRef<string>("");
  const currentEditContent = useRef<string>("");

  const elementData = contents[id];
  const isEditing = elementData?.isEditing || false;

  // Only set dir attribute for actual RTL languages
  const rtlLanguages = ["Arabic", "Hebrew"];
  const isRTL = rtlLanguages.includes(currentLanguage);
  const dirAttr = isRTL ? "rtl" : undefined;

  // The display text: saved translation > original children
  const displayText = elementData?.content || extractText(children);

  // When entering edit mode, record the starting text and focus with cursor at end
  useEffect(() => {
    if (isEditing && editableRef.current) {
      const text = editableRef.current.innerText || '';
      contentBeforeEdit.current = text;
      currentEditContent.current = text;

      editableRef.current.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isAdmin && isEditingEnabled) {
      // Prevent parent <Link> from navigating when in editing mode
      e.preventDefault();
      e.stopPropagation();
      if (!isEditing) {
        const text = elementData?.content || extractText(children);
        startEditing(id, text, extractText(children));
      }
    }
  }, [isAdmin, isEditingEnabled, isEditing, id, elementData, children, startEditing]);

  const handleInput = useCallback(() => {
    // Read directly from DOM, store in ref only — no state updates, no re-renders
    if (editableRef.current) {
      currentEditContent.current = editableRef.current.innerText || '';
    }
  }, []);

  const handleBlur = useCallback(() => {
    const current = currentEditContent.current;
    const before = contentBeforeEdit.current;
    if (current !== before) {
      saveContent(id, current);
    } else {
      cancelEditing(id);
    }
  }, [id, saveContent, cancelEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Blur will trigger save
      editableRef.current?.blur();
    } else if (e.key === 'Escape') {
      // Prevent blur from saving — reset content to original first
      currentEditContent.current = contentBeforeEdit.current;
      cancelEditing(id);
    }
  }, [id, cancelEditing]);

  // Non-admin or editing mode disabled — plain display
  if (!isAdmin || !isEditingEnabled) {
    const isSimpleChild = typeof children === "string";
    if (isSimpleChild) {
      return (
        <Component className={className} dir={dirAttr}>
          {displayText}
        </Component>
      );
    }
    return (
      <Component className={className} dir={dirAttr}>
        {elementData?.content ?? children}
      </Component>
    );
  }

  // Currently editing this element.
  // Pass displayText as children for the initial render. No state updates happen
  // during typing (only refs), so React won't re-render and fight the browser.
  if (isEditing) {
    return React.createElement(Component as string, {
      ref: editableRef,
      contentEditable: true,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onBlur: handleBlur,
      className: cn(
        className,
        "border-2 border-blue-400 p-1 focus:outline-none min-h-[1em] min-w-[1em]",
        isRTL && "text-right"
      ),
      dir: dirAttr,
      suppressContentEditableWarning: true,
    }, displayText);
  }

  // Admin with editing enabled, but not editing this specific element
  return (
    <Component
      className={cn(
        className,
        "hover:bg-blue-50 hover:outline-dashed hover:outline-1 hover:outline-blue-300 cursor-pointer relative group"
      )}
      onClick={handleClick}
      dir={dirAttr}
    >
      {displayText}
      <Edit
        size={12}
        className={`absolute opacity-0 group-hover:opacity-100 ${isRTL ? 'left-0' : 'right-0'} top-0 text-blue-400`}
      />
    </Component>
  );
};

export default EditableText;
