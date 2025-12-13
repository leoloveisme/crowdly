
import React, { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface EditableBioProps {
  initialValue: string;
  isPreviewMode: boolean;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const EditableBio: React.FC<EditableBioProps> = ({
  initialValue,
  isPreviewMode,
  onSave,
  className = "",
  placeholder = "Tell us a bit about yourself..."
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  
  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);
  
  const handleStartEdit = () => {
    if (!isPreviewMode) {
      setIsEditing(true);
    }
  };
  
  const handleSave = () => {
    onSave(value);
    setIsEditing(false);
    toast({
      title: "Bio saved",
      description: "Your bio has been updated successfully",
      duration: 3000,
    });
  };
  
  const handleCancel = () => {
    setValue(initialValue);
    setIsEditing(false);
  };
  
  if (isEditing) {
    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`p-3 border-2 border-blue-400 ${className}`}
          placeholder={placeholder}
          rows={4}
        />
        <div className="absolute right-2 top-2 flex space-x-2">
          <Button 
            size="sm" 
            variant="ghost"
            onClick={handleCancel}
            className="h-8 w-8 p-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={handleSave}
            className="h-8 w-8 p-0 rounded-full text-green-600"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div
      onClick={handleStartEdit}
      className={`p-3 rounded-md border ${
        !isPreviewMode ? "hover:bg-gray-50 cursor-pointer" : ""
      } ${className}`}
    >
      {value ? (
        <p className="whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-gray-400 italic">{placeholder}</p>
      )}
    </div>
  );
};

export default EditableBio;
