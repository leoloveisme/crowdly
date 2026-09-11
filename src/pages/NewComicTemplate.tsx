import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createComic } from "@/lib/comicsApi";
import { errorMessage } from "@/lib/apiBase";

const DEFAULT_COMIC_TITLE = "Untitled comic";

const NewComicTemplate: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState(DEFAULT_COMIC_TITLE);
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">("ltr");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [creating, setCreating] = useState(false);

  if (!user) {
    return (
      <div className="flex justify-center items-center h-32">
        <EditableText id="new-comic-template-login-required">
          You must be logged in to use this template.
        </EditableText>
      </div>
    );
  }

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast({
        title: "No title entered",
        description: "Please provide a non-empty title.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const comic = await createComic({ title: trimmed, reading_direction: readingDirection, visibility });
      navigate(`/comic/${comic.comic_id}`);
    } catch (err) {
      toast({ title: "Failed to create comic", description: errorMessage(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <CrowdlyHeader />
      <main className="flex-1 p-4">
        <div className="container mx-auto max-w-xl space-y-6">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-bold">
                <EditableText id="new-comic-template-heading">Create a comic or manga</EditableText>
              </h1>
              <p className="text-sm text-muted-foreground">
                <EditableText id="new-comic-template-subheading">
                  Give it a title and reading direction — you'll upload pages on the next screen.
                </EditableText>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">
                  <EditableText id="new-comic-template-title-label">Title</EditableText>
                </label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={DEFAULT_COMIC_TITLE} />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">
                    <EditableText id="new-comic-template-direction-label">Reading direction</EditableText>
                  </label>
                  <Select value={readingDirection} onValueChange={(v) => setReadingDirection(v as "ltr" | "rtl")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ltr">
                        <EditableText id="new-comic-template-direction-ltr">Left to right (comic)</EditableText>
                      </SelectItem>
                      <SelectItem value="rtl">
                        <EditableText id="new-comic-template-direction-rtl">Right to left (manga)</EditableText>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">
                    <EditableText id="new-comic-template-visibility-label">Visibility</EditableText>
                  </label>
                  <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "unlisted" | "private")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">
                        <EditableText id="new-comic-template-visibility-public">Public</EditableText>
                      </SelectItem>
                      <SelectItem value="unlisted">
                        <EditableText id="new-comic-template-visibility-unlisted">Unlisted</EditableText>
                      </SelectItem>
                      <SelectItem value="private">
                        <EditableText id="new-comic-template-visibility-private">Private</EditableText>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={creating || !title.trim()} className="w-full">
                <EditableText id="new-comic-template-create-btn">Create</EditableText>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default NewComicTemplate;
