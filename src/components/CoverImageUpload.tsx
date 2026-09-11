import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Upload } from "lucide-react";
import EditableText from "@/components/EditableText";

interface CoverImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

function resizeImage(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      const ratio = maxWidth / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

const CoverImageUpload: React.FC<CoverImageUploadProps> = ({ value, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const resized = await resizeImage(reader.result as string, 800);
      onChange(resized);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">
        <EditableText id="cover-image-label">Cover Image</EditableText>
      </label>
      <div
        className={`border-2 border-dashed rounded-md p-4 flex flex-col items-center justify-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {value ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={value}
              alt="Cover preview"
              className="max-w-full max-h-48 rounded-md object-contain"
            />
            <Button
              type="button"
              onClick={() => onChange(null)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <EditableText id="cover-image-remove">Remove</EditableText>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="h-6 w-6 text-gray-400" />
            <p className="text-xs text-gray-500">
              <EditableText id="cover-image-hint">Drag & drop an image, or</EditableText>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <EditableText id="cover-image-browse">Browse</EditableText>
            </Button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
              ref={fileInputRef}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverImageUpload;
