import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { X, PencilLine, Smartphone, Languages, Facebook, Instagram, User } from "lucide-react";
import EditableText from "@/components/EditableText";
import ProfilePictureUpload from "@/components/ProfilePictureUpload";

export interface ProfileInformationProps {
  profile: any;
  previewMode: boolean;
  onSaveField: (field: string, value: any) => void | Promise<void>;
}

const ProfileInformation: React.FC<ProfileInformationProps> = ({
  profile,
  previewMode,
  onSaveField,
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");

  const startEditing = (field: string, value: string | null | undefined) => {
    if (previewMode) return;
    setEditingField(field);
    setTempValue(value ?? "");
  };

  const handleBlur = async (field: string) => {
    if (editingField !== field) return;
    const original = (profile && profile[field]) ?? "";
    const next = tempValue;

    setEditingField(null);

    // If nothing was entered and/or value did not change, just close.
    if (String(next ?? "").trim() === String(original ?? "").trim()) {
      return;
    }

    try {
      await onSaveField(field, next);
    } catch (err) {
      console.error("[ProfileInformation] Failed to save field", field, err);
    }
  };

  const handleProfileImageChange = async (imageUrl: string) => {
    try {
      await onSaveField("profile_image_url", imageUrl);
      setIsUploadDialogOpen(false);
    } catch (err) {
      console.error("[ProfileInformation] Failed to save profile_image_url", err);
    }
  };

  const handleAddLanguage = async () => {
    const lang = newLanguage.trim();
    if (!lang) return;
    const existing: string[] = Array.isArray(profile?.languages) ? profile.languages : [];
    if (existing.includes(lang)) {
      setNewLanguage("");
      return;
    }
    const updated = [...existing, lang];
    setNewLanguage("");
    try {
      await onSaveField("languages", updated);
    } catch (err) {
      console.error("[ProfileInformation] Failed to save languages", err);
    }
  };

  const handleRemoveLanguage = async (lang: string) => {
    const existing: string[] = Array.isArray(profile?.languages) ? profile.languages : [];
    const updated = existing.filter((l) => l !== lang);
    try {
      await onSaveField("languages", updated);
    } catch (err) {
      console.error("[ProfileInformation] Failed to save languages", err);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center mb-4">
        <h2 className="text-xl font-bold mr-2">
          <EditableText id="profile-information-heading">Profile information</EditableText>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column for profile picture */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative">
            <Avatar className="h-32 w-32 border-2 border-gray-200">
              {profile?.profile_image_url ? (
                <AvatarImage src={profile.profile_image_url} alt={profile.first_name || "Avatar"} />
              ) : (
                <AvatarFallback className="bg-purple-100 text-purple-600 text-4xl">
                  <User className="h-16 w-16" />
                </AvatarFallback>
              )}
            </Avatar>
            {!previewMode && (
              <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="absolute bottom-0 right-0 rounded-full w-8 h-8 p-0 bg-purple-600 hover:bg-purple-700"
                    onClick={() => setIsUploadDialogOpen(true)}
                  >
                    <PencilLine className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <ProfilePictureUpload onImageChange={handleProfileImageChange} />
              </Dialog>
            )}
          </div>
          {!previewMode && (
            <Button
              variant="outline"
              className="text-purple-600 border-purple-600 hover:bg-purple-50"
              onClick={() => setIsUploadDialogOpen(true)}
            >
              <EditableText id="change-photo-text">Change photo</EditableText>
            </Button>
          )}
        </div>

        {/* Right: profile details */}
        <div className="md:col-span-2 space-y-6">
          {/* First Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-gray-500">
                <EditableText id="first-name">First name</EditableText>
              </Label>
              {!previewMode && !editingField && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditing("first_name", profile?.first_name)}
                  className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                >
                  <EditableText id="edit-button">Edit</EditableText>
                </Button>
              )}
            </div>
            {editingField === "first_name" ? (
              <Input
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleBlur("first_name")}
                className="mt-1"
                autoFocus
              />
            ) : (
              <div
                className="font-medium cursor-text"
                onClick={() => !previewMode && startEditing("first_name", profile?.first_name)}
              >
                {profile?.first_name || (
                  <span className="text-gray-400 italic">No first name set</span>
                )}
              </div>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-gray-500">
                <EditableText id="last-name">Last name</EditableText>
              </Label>
              {!previewMode && !editingField && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditing("last_name", profile?.last_name)}
                  className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                >
                  <EditableText id="edit-button">Edit</EditableText>
                </Button>
              )}
            </div>
            {editingField === "last_name" ? (
              <Input
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleBlur("last_name")}
                className="mt-1"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-gray-800 cursor-text"
                onClick={() => !previewMode && startEditing("last_name", profile?.last_name)}
              >
                {profile?.last_name || (
                  <span className="text-gray-400 italic">No last name set</span>
                )}
              </div>
            )}
          </div>

          {/* Nickname */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-gray-500">
                <EditableText id="nickname-label">Nickname</EditableText>
              </Label>
              {!previewMode && !editingField && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditing("nickname", profile?.nickname)}
                  className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                >
                  <EditableText id="edit-button">Edit</EditableText>
                </Button>
              )}
            </div>
            {editingField === "nickname" ? (
              <Input
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleBlur("nickname")}
                className="mt-1"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-gray-800 cursor-text"
                onClick={() => !previewMode && startEditing("nickname", profile?.nickname)}
              >
                {profile?.nickname ? (
                  profile.nickname
                ) : (
                  <span className="text-gray-400 italic">
                    <EditableText id="no-nickname-text">No nickname set</EditableText>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Birthday */}
          <div className="space-y-1">
            <Label className="text-sm text-gray-500">Birthday (optional)</Label>
            {editingField === "birthday" ? (
              <Input
                type="date"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleBlur("birthday")}
                autoFocus
              />
            ) : (
              <div className="flex items-center justify-between">
                <div
                  className="font-medium text-gray-800 cursor-text"
                  onClick={() => !previewMode && startEditing("birthday", profile?.birthday || "")}
                >
                  {profile?.birthday ? (
                    new Date(profile.birthday).toLocaleDateString()
                  ) : (
                    <span className="text-gray-400 italic">No birthday set</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Telephone */}
          <div className="space-y-1">
            <Label className="text-sm text-gray-500">
              <Smartphone className="w-4 h-4 inline mb-1 mr-1" /> Telephone (optional)
            </Label>
            {editingField === "telephone" ? (
              <Input
                type="tel"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleBlur("telephone")}
                autoFocus
              />
            ) : (
              <div className="flex items-center justify-between">
                <div
                  className="font-medium text-gray-800 cursor-text"
                  onClick={() => !previewMode && startEditing("telephone", profile?.telephone || "")}
                >
                  {profile?.telephone ? (
                    profile.telephone
                  ) : (
                    <span className="text-gray-400 italic">No telephone set</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Languages */}
          <div className="space-y-1">
            <Label className="text-sm text-gray-500">
              <Languages className="w-4 h-4 inline mb-1 mr-1" /> Languages (optional)
            </Label>
            {!previewMode && (
              <div className="flex gap-2">
                <Input
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  placeholder="Add language"
                  className="flex-grow"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLanguage();
                    }
                  }}
                />
                <Button onClick={handleAddLanguage} size="sm">
                  <EditableText id="add-language">Add</EditableText>
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {(Array.isArray(profile?.languages) ? profile.languages : []).map(
                (lang: string, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-100 rounded-full px-3 py-1 flex items-center gap-1"
                  >
                    <span>{lang}</span>
                    {!previewMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => handleRemoveLanguage(lang)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Socials */}
          <div className="space-y-1">
            <Label className="text-sm text-gray-500">
              <Facebook className="w-4 h-4 inline mb-1 mr-1" /> Facebook
            </Label>
            <Input
              value={profile?.social_facebook || ""}
              onChange={(e) => onSaveField("social_facebook", e.target.value)}
              placeholder="Facebook username/url"
              disabled={previewMode}
            />
            <Label className="text-sm text-gray-500">
              <Instagram className="w-4 h-4 inline mb-1 mr-1" /> Instagram
            </Label>
            <Input
              value={profile?.social_instagram || ""}
              onChange={(e) => onSaveField("social_instagram", e.target.value)}
              placeholder="Instagram username/url"
              disabled={previewMode}
            />
            <Label className="text-sm text-gray-500">Snapchat</Label>
            <Input
              value={profile?.social_snapchat || ""}
              onChange={(e) => onSaveField("social_snapchat", e.target.value)}
              placeholder="Snapchat"
              disabled={previewMode}
            />
            <Label className="text-sm text-gray-500">Other Social</Label>
            <Input
              value={profile?.social_other || ""}
              onChange={(e) => onSaveField("social_other", e.target.value)}
              placeholder="Other social"
              disabled={previewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileInformation;
