
import React, { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Card, 
  CardContent, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
Settings, 
Eye, 
EyeClosed,
EyeOff,  
HelpCircle, 
CircleX, 
LayoutTemplate, 
Heart, 
Columns2, 
Columns3, 
LayoutGrid, 
LayoutList, 
LayoutDashboard 
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  DropdownMenu,
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel 
} from "@/components/ui/form";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Edit, 
  Info, 
  X, 
  Plus,
  Check,
  ChevronDown,
  Upload,
  Grid2x2,
  Columns4
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ProfilePictureUpload from "@/components/ProfilePictureUpload";
import { useToast } from "@/hooks/use-toast";
import EditableText from "@/components/EditableText";
import ChapterEditor from "@/components/ChapterEditor";
import LayoutOptionButtons from "@/components/LayoutOptionButtons";
import RevisionCheckboxCell from "@/components/RevisionCheckboxCell";
import { useAuth } from "@/contexts/AuthContext";
import StorySelector from "@/components/StorySelector";
import NewStoryDialog from "@/components/NewStoryDialog";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;
const DEFAULT_STORY_TITLE = "Story of my life";
const DEFAULT_CHAPTER_TITLE = "Chapter 1 - The day I was conceived";
const showAdvanced = false; // hide advanced controls/cards for now

const NewStoryTemplate = () => {
  const [storyTitleId, setStoryTitleId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<any[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [addChapterMode, setAddChapterMode] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState(DEFAULT_CHAPTER_TITLE);
  const [newChapterParagraphs, setNewChapterParagraphs] = useState<string[]>([""]);
  const [initialParagraphText, setInitialParagraphText] = useState("");
  const [mainTitle, setMainTitle] = useState(DEFAULT_STORY_TITLE);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [intro, setIntro] = useState("");
  const [comments, setComments] = useState<string[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [contributorsOpen, setContributorsOpen] = useState(true);
  const [revisionsOpen, setRevisionsOpen] = useState(true);
  const [layoutOptionsOpen, setLayoutOptionsOpen] = useState(true);
  const [branchesOpen, setBranchesOpen] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedRevisions, setSelectedRevisions] = useState<number[]>([]);
  const [columnChecked, setColumnChecked] = useState<number[]>([]);
  const [activeLayoutOption, setActiveLayoutOption] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [storyTitleRevisions, setStoryTitleRevisions] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]); // List of all user's stories

  const togglePreview = () => setPreview((p) => !p);

  const hasMeaningfulChange = () => {
    const titleChanged = mainTitle.trim() !== DEFAULT_STORY_TITLE;
    const chapterTitleChanged = newChapterTitle.trim() !== DEFAULT_CHAPTER_TITLE;
    const textChanged = initialParagraphText.trim().length > 0;
    return titleChanged || chapterTitleChanged || textChanged;
  };

  const toggleSection = (section: string) => {
    switch(section) {
      case 'visibility':
        setVisibilityOpen(!visibilityOpen);
        break;
      case 'contributors':
        setContributorsOpen(!contributorsOpen);
        break;
      case 'revisions':
        setRevisionsOpen(!revisionsOpen);
        break;
      case 'layoutOptions':
        setLayoutOptionsOpen(!layoutOptionsOpen);
        break;
      case 'branches':
        setBranchesOpen(!branchesOpen);
        break;
    }
  };

  const togglePublishStatus = () => {
    setIsPublished(!isPublished);
    toast({
      title: isPublished ? "Story unpublished" : "Story published",
      description: isPublished 
        ? "Your story is no longer visible to others" 
        : "Your story is now visible to others",
      duration: 3000,
    });
  };

  const toggleCompare = () => {
    setCompareOpen(!compareOpen);
  };

  const toggleRevisionSelection = (revisionId: number) => {
    setSelectedRevisions(prev => {
      if (prev.includes(revisionId)) {
        return prev.filter(id => id !== revisionId);
      } else {
        if (prev.length >= 4) {
          return [...prev.slice(1), revisionId];
        }
        return [...prev, revisionId];
      }
    });
  };

  const toggleColumnCheckbox = (revisionId: number) => {
    setColumnChecked(prev => {
      if (prev.includes(revisionId)) {
        return prev.filter(id => id !== revisionId);
      } else {
        return [...prev, revisionId];
      }
    });
  };
  
  const handleEditClick = (section: string) => {
    toast({
      title: "Edit mode activated",
      description: `You are now editing ${section}`,
      duration: 3000,
    });
  };
  
  const handleSettingsClick = (section: string) => {
    setSettingsOpen(!settingsOpen);
    toast({
      title: settingsOpen ? "Settings closed" : "Settings opened",
      description: settingsOpen ? `Settings for ${section} closed` : `Settings for ${section} opened`,
      duration: 3000,
    });
  };

  const handleEyeClick = (section: string) => {
    toast({
      title: "Preview mode activated",
      description: `Previewing ${section}`,
      duration: 3000,
    });
  };

  const handleLayoutOptionClick = (layoutIndex: number) => {
    setActiveLayoutOption(layoutIndex);
    toast({
      title: "Layout changed",
      description: `Layout option ${layoutIndex + 1} selected`,
      duration: 3000,
    });
  };

  // Autosave for initial story + first chapter (and title)
  useEffect(() => {
    if (!dirty) return;

    const handle = setTimeout(async () => {
      if (!hasMeaningfulChange()) {
        setDirty(false);
        return;
      }
      if (!user) {
        setDirty(false);
        return;
      }

      try {
        if (!storyTitleId || !chapterId) {
          // First save: create story + first chapter
          const res = await fetch(`${API_BASE}/stories/template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: mainTitle,
              chapterTitle: newChapterTitle,
              paragraphs: [initialParagraphText],
              userId: user.id,
            }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast({
              title: "Failed to create story",
              description: body.error || body.details || "Unknown error",
              variant: "destructive",
            });
            setDirty(false);
            return;
          }

          const data = await res.json();
          setStoryTitleId(data.storyTitleId);
          setChapterId(data.chapterId);
          setMainTitle(data.title);

          await fetchAllUserStories();
          fetchStoryTitleRevisions(data.storyTitleId);

          const params = new URLSearchParams({ storyTitleId: data.storyTitleId });
          const chaptersRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
          if (chaptersRes.ok) {
            const updated = await chaptersRes.json();
            setChapters(updated || []);
          }
        } else {
          // Subsequent saves: update story title and first chapter
          // 1) Update story title
          const titleRes = await fetch(`${API_BASE}/story-titles/${storyTitleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: mainTitle, userId: user.id }),
          });

          if (!titleRes.ok) {
            const body = await titleRes.json().catch(() => ({}));
            console.error('Autosave failed to update story title', { status: titleRes.status, body });
            toast({
              title: "Failed to autosave title",
              description: body.error || body.details || "Unknown error",
              variant: "destructive",
            });
          }

          // 2) Update first chapter
          const chapterRes = await fetch(`${API_BASE}/chapters/${chapterId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapterTitle: newChapterTitle,
              paragraphs: [initialParagraphText],
            }),
          });

          if (!chapterRes.ok) {
            const body = await chapterRes.json().catch(() => ({}));
            console.error('Autosave failed to update chapter', { status: chapterRes.status, body });
            toast({
              title: "Failed to autosave chapter",
              description: body.error || body.details || "Unknown error",
              variant: "destructive",
            });
          }
        }
      } catch (err) {
        console.error('Autosave failed', err);
        toast({
          title: "Autosave failed",
          description: 'Unexpected error while saving your story',
          variant: "destructive",
        });
      } finally {
        setDirty(false);
      }
    }, 2000);

    return () => clearTimeout(handle);
  }, [dirty, storyTitleId, chapterId, newChapterTitle, initialParagraphText, mainTitle, user]);
  
  // Fetch story title revisions
  const fetchStoryTitleRevisions = async (storyTitleId: string) => {
    try {
      const res = await fetch(`${API_BASE}/story-title-revisions/${storyTitleId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStoryTitleRevisions(data || []);
    } catch (err) {
      console.error('Failed to fetch story title revisions', err);
    }
  };

  // Fetch all user stories (Story List)
  const fetchAllUserStories = async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({ userId: user.id });
      const res = await fetch(`${API_BASE}/story-titles?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setStories(data || []);
    } catch (err) {
      console.error('Failed to fetch user stories', err);
    }
  };

  // Create a new story, set as selected & navigate
  const handleCreateNewStory = async (title: string) => {
    if (!user) return;

    try {
      const res = await fetch(`${API_BASE}/stories/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          chapterTitle: "Intro",
          paragraphs: ["This is the beginning!"],
          userId: user.id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to create story",
          description: body.error || body.details || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      const inserted = await res.json();

      await fetchAllUserStories();
      setStoryTitleId(inserted.storyTitleId);
      setMainTitle(inserted.title);
      fetchStoryTitleRevisions(inserted.storyTitleId);
      navigate(`/story/${inserted.storyTitleId}`);
    } catch (err) {
      console.error('Failed to create story', err);
      toast({
        title: "Failed to create story",
        description: "Unexpected error while creating story",
        variant: "destructive",
      });
    }
  };

  // On mount or when user changes, fetch all stories (for future advanced UI)
  useEffect(() => {
    if (!user) return;
    const fetchForUser = async () => {
      await fetchAllUserStories();
      setLoading(false);
    };
    fetchForUser();
  }, [user]);

  // On storyTitleId change, load that story's title and revisions
  useEffect(() => {
    if (!storyTitleId) return;
    const story = stories.find((s) => s.story_title_id === storyTitleId);
    if (story) setMainTitle(story.title);
    fetchStoryTitleRevisions(storyTitleId);
  }, [storyTitleId]);

  // Helper: fetch story title by ID and update mainTitle state
  const fetchStoryTitleById = async (id: string) => {
    try {
      const params = new URLSearchParams({ userId: user?.id ?? "" });
      // Reuse /story-titles and filter client-side as a simple implementation
      const res = await fetch(`${API_BASE}/story-titles?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as any[];
      const match = data.find((s) => s.story_title_id === id);
      if (match?.title) {
        setMainTitle(match.title);
      }
    } catch (err) {
      console.error('Failed to fetch story title by id', err);
    }
  };

  // CRUD: Load All Chapters when story changes
  useEffect(() => {
    if (!storyTitleId) return;
    setChaptersLoading(true);

    const params = new URLSearchParams({ storyTitleId });
    fetch(`${API_BASE}/chapters?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to fetch chapters');
        }
        return res.json();
      })
      .then((data) => {
        setChapters(data || []);
        setChaptersLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch chapters', err);
        toast({
          title: "Failed to fetch chapters",
          description: err.message,
          variant: "destructive",
        });
        setChaptersLoading(false);
      });
  }, [storyTitleId]);

  // CRUD: Add Chapter
  const handleCreateChapter = async (data: { chapter_title: string; paragraphs: string[] }) => {
    if (!storyTitleId) return;

    try {
      const res = await fetch(`${API_BASE}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyTitleId,
          chapterTitle: data.chapter_title,
          paragraphs: data.paragraphs,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to add chapter",
          description: body.error || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Chapter added!" });

      // reload
      const params = new URLSearchParams({ storyTitleId });
      const updatedRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
      if (updatedRes.ok) {
        const updated = await updatedRes.json();
        setChapters(updated || []);
      }
    } catch (err) {
      console.error('Failed to add chapter', err);
      toast({
        title: "Failed to add chapter",
        description: 'Unexpected error while adding chapter',
        variant: "destructive",
      });
    }
  };

  // CRUD: Update Chapter (fix type: return void instead of boolean)
  const handleUpdateChapter = async (
    chapter_id: string,
    patch: { chapter_title?: string; paragraphs?: string[] }
  ): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle: patch.chapter_title,
          paragraphs: patch.paragraphs,
          userId: user?.id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to update chapter",
          description: body.error || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Chapter updated!" });

      // reload
      if (storyTitleId) {
        const params = new URLSearchParams({ storyTitleId });
        const updatedRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          setChapters(updated || []);
        }
      }
    } catch (err) {
      console.error('Failed to update chapter', err);
      toast({
        title: "Failed to update chapter",
        description: 'Unexpected error while updating chapter',
        variant: "destructive",
      });
    }
  };

  // CRUD: Delete Chapter
  const handleDeleteChapter = async (chapter_id: string) => {
    try {
      const res = await fetch(`${API_BASE}/chapters/${chapter_id}`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to delete chapter",
          description: body.error || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Chapter deleted!" });

      // reload
      if (storyTitleId) {
        const params = new URLSearchParams({ storyTitleId });
        const updatedRes = await fetch(`${API_BASE}/chapters?${params.toString()}`);
        if (updatedRes.ok) {
          const updated = await updatedRes.json();
          setChapters(updated || []);
        }
      }
    } catch (err) {
      console.error('Failed to delete chapter', err);
      toast({
        title: "Failed to delete chapter",
        description: 'Unexpected error while deleting chapter',
        variant: "destructive",
      });
    }
  };

  // CRUD: Update Story Title (template-level)
  // Treat the title like the textarea: update local state and let
  // autosave create/update the story.
  const handleUpdateStoryTitle = async (updatedTitle: string) => {
    if (!updatedTitle.trim()) {
      toast({
        title: "No title entered",
        description: "Please provide a non-empty title.",
        variant: "destructive",
      });
      return;
    }

    const trimmed = updatedTitle.trim();
    setMainTitle(trimmed);
    setNewTitle(trimmed);
    setEditingTitle(false);
    setDirty(true);
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center h-32">You must be logged in to use this template.</div>
    );
  }

  if (loading) {
    return <div className="flex justify-center items-center h-32">Loading...</div>;
  }

  return (
    <>
      <div className="flex flex-col min-h-screen">
        <header>
          <CrowdlyHeader />
        </header>

        <main className="flex-1 p-4">
          <div className="container mx-auto space-y-6">
            {/* Top bar: story title (left) + Preview toggle (right) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  {/* Story title + inline edit */}
                  <div className="flex-1">
                    {editingTitle ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onBlur={() => {
                            setEditingTitle(false);
                            setNewTitle(mainTitle);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateStoryTitle(newTitle);
                              setEditingTitle(false);
                            } else if (e.key === "Escape") {
                              setEditingTitle(false);
                              setNewTitle(mainTitle);
                            }
                          }}
                          placeholder="Enter new title"
                        />
                        <Button onClick={() => handleUpdateStoryTitle(newTitle)}>
                          {savingTitle ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CardTitle>{mainTitle}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingTitle(true);
                            setNewTitle(mainTitle);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Preview toggle (Eye / EyeOff) */}
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={togglePreview}>
                      {preview ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Primary chapter editor area */}
            <Card>
              <CardHeader>
                <div className="space-y-4">
                  {/* Chapter title */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Chapter title</h4>
                    </div>
                    <Input
                      placeholder="Enter chapter title"
                      value={newChapterTitle}
                      onChange={(e) => {
                        setNewChapterTitle(e.target.value);
                        setDirty(true);
                      }}
                      className="max-w-sm"
                    />
                  </div>

                  {/* Chapter content: textarea or preview, depending on state */}
                  <div className="flex flex-col gap-2">
                    <h4 className="font-medium">Chapter content</h4>

                    {!storyTitleId ? (
                      preview ? (
                        <div className="mt-2 border rounded p-3 min-h-[8rem] bg-muted">
                          {initialParagraphText.trim() ? (
                            <p>{initialParagraphText}</p>
                          ) : (
                            <div className="text-muted-foreground text-sm space-y-2">
                              <p>
                                It is a sample story, which you can start (re)-writing.
                              </p>
                              <p>
                                Once you do any changes on this page a new story will be created and your story will get a unique story ID
                                which you can change to by clicking the storyID at the bottom of this page. Providing you change something.
                              </p>
                              <p>
                                Happy creative creating!
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <textarea
                          className="mt-2 w-full min-h-[8rem] border rounded p-2 text-sm"
                          placeholder="Start writing your story..."
                          value={initialParagraphText}
                          onChange={(e) => {
                            setInitialParagraphText(e.target.value);
                            setDirty(true);
                          }}
                        />
                      )
                    ) : preview ? (
                      <div className="mt-2 border rounded p-3 min-h-[8rem] bg-muted space-y-4">
                        {chapters.length === 0 ? (
                          <span className="text-muted-foreground text-sm">
                            No chapters yet
                          </span>
                        ) : (
                          chapters.map((chapter) => (
                            <div key={chapter.chapter_id}>
                              <h5 className="font-semibold mb-1">{chapter.chapter_title}</h5>
                              {chapter.paragraphs && chapter.paragraphs.map((p: string, idx: number) => (
                                <p key={idx} className="mb-2 text-sm leading-relaxed">{p}</p>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      // Once the story exists and not in preview, use the richer ChapterEditor
                      <ChapterEditor
                        chapters={chapters}
                        onCreate={handleCreateChapter}
                        onUpdate={handleUpdateChapter}
                        onDelete={handleDeleteChapter}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Story ID display once a story exists */}
            {storyTitleId && (
              <div className="text-center text-xs text-muted-foreground">
                Story ID:{" "}
                <Link
                  to={`/story/${storyTitleId}`}
                  className="underline hover:text-primary"
                >
                  {storyTitleId}
                </Link>
              </div>
            )}

            {/* Advanced UI (visibility, contributors, revisions, layout, branches, extra cards, etc.) */}
            {showAdvanced && (
              <>
                <div className="mt-4 flex flex-wrap gap-4 items-center">
                  <StorySelector
                    stories={stories}
                    selectedStoryId={storyTitleId}
                    onSelect={(id) => setStoryTitleId(id)}
                  />
                  <NewStoryDialog onCreate={handleCreateNewStory} />
                </div>
                {/* Original advanced cards would be re-inserted here, wrapped in showAdvanced */}
              </>
            )}
          </div>
        </main>

        <footer>
          <CrowdlyFooter />
        </footer>
      </div>
    </>
  );
};

export default NewStoryTemplate;
