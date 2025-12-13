
import React, { useState, useRef } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Upload } from "lucide-react";

interface ProfilePictureUploadProps {
  onImageChange: (imageUrl: string) => void;
}

const ProfilePictureUpload: React.FC<ProfilePictureUploadProps> = ({ onImageChange }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    handleFile(file);
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
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleFile = (file?: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (selectedImage) {
      onImageChange(selectedImage);
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-center">Upload Profile Picture</DialogTitle>
      </DialogHeader>
      <div 
        className={`mt-4 border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center bg-gray-100 transition-colors
          ${isDragging ? "border-purple-500 bg-purple-50" : "border-gray-300"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedImage ? (
          <div className="flex flex-col items-center space-y-4">
            <img 
              src={selectedImage} 
              alt="Selected preview" 
              className="max-w-full max-h-64 rounded-md"
            />
            <div className="flex space-x-4">
              <Button 
                onClick={() => setSelectedImage(null)} 
                variant="outline"
                className="flex items-center gap-2"
              >
                <X className="w-4 h-4" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="rounded-full bg-gray-200 p-4">
              <Upload className="h-8 w-8 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Drag and drop an image here, or</p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                ref={fileInputRef}
              />
            </div>
          </div>
        )}
      </div>
      
      <div className="flex justify-center space-x-4 mt-4">
        {!selectedImage && (
          <Button 
            onClick={handleClickUpload} 
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Browse Files
          </Button>
        )}
        
        {selectedImage && (
          <Button 
            onClick={handleSave}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Save
          </Button>
        )}
      </div>
    </DialogContent>
  );
};

export default ProfilePictureUpload;
