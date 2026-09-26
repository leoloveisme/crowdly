import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { uploadGalleryImages, type GalleryImage, type GalleryImageKind } from "@/lib/galleryApi";
import { errorMessage } from "@/lib/apiBase";

interface GalleryUploadProps {
  storyTitleId: string;
  kind?: GalleryImageKind;
  chapterId?: string;
  anchorIndex?: number;
  onUploaded: (images: GalleryImage[]) => void;
  idPrefix?: string;
}

const GalleryUpload: React.FC<GalleryUploadProps> = ({
  storyTitleId,
  kind = "gallery",
  chapterId,
  anchorIndex,
  onUploaded,
  idPrefix = "gallery-upload",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList?: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const images = await uploadGalleryImages(storyTitleId, files, { kind, chapterId, anchorIndex });
      onUploaded(images);
    } catch (err) {
      setError(errorMessage(err) || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`border-2 border-dashed rounded-md p-4 flex flex-col items-center justify-center gap-2 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
        ) : (
          <Upload className="h-6 w-6 text-gray-400" />
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <EditableText id={`${idPrefix}-hint`}>Drag & drop images, or</EditableText>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <EditableText id={`${idPrefix}-browse`}>Browse</EditableText>
        </Button>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
};

export default GalleryUpload;
