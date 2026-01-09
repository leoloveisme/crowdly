import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Popover,
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Settings,
  Edit, 
  X, 
  Check,
  Upload,
  PencilLine,
  User,
  Globe,
  Users,
  FileText,
  BookOpen,
  Award,
  Eye,
  EyeOff,
  Info,
  HelpCircle,
  Heart,
  MessageSquare,
  Gift,
  Smartphone,
  Instagram,
  Facebook,
  Zap,
  Languages
} from "lucide-react";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ProfilePictureUpload from "@/components/ProfilePictureUpload";
import EditableText from "@/components/EditableText";
import EditableBio from "@/components/EditableBio";
import { useToast } from "@/hooks/use-toast";
import ResponsiveTabsTrigger from "@/components/ResponsiveTabsTrigger";
import { useIsMobile } from "@/hooks/use-mobile";
import RevisionComparison from "@/components/RevisionComparison";
import CommunicationsSection from "@/components/CommunicationsSection";
import StatsDisplay from "@/components/StatsDisplay";
import CreativeSpacesModule, { CreativeSpace } from "@/modules/creative spaces";
import ProfileInformation from "@/modules/profile information";
import ContributionsModule, { ContributionRow as ProfileContributionRow } from "@/modules/contributions";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const INITIAL_PROFILE = {
  first_name: "",
  last_name: "",
  nickname: "",
  about: "",
  bio: "",
  interests: [],
  profile_image_url: null,
  birthday: "",
  languages: [],
  social_facebook: "",
  social_snapchat: "",
  social_instagram: "",
  social_other: "",
  telephone: "",
  notify_phone: false,
  notify_app: true,
  notify_email: true,
  username: "",    // <-- Add this line
  show_public_stories: true,
  show_public_screenplays: true,
};

const Profile = () => {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState({ ...INITIAL_PROFILE });
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Stories the user is creating / co-creating
  const [userStories, setUserStories] = useState<{
    story_title_id: string;
    title: string;
    created_at: string;
    roles: string[];
  }[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);

  // Screenplays the user is creating or collaborating on
  const [userScreenplays, setUserScreenplays] = useState<{
    screenplay_id: string;
    title: string;
    created_at: string;
    roles: string[];
  }[]>([]);
  const [screenplaysLoading, setScreenplaysLoading] = useState(false);

  // Creative spaces: for now, this is just a placeholder list. In a
  // later step we will fetch real creative spaces from the backend and
  // keep them in sync with the desktop app's project spaces.
  const [creativeSpaces, setCreativeSpaces] = useState<CreativeSpace[]>([]);
  const [creativeSpacesLoading, setCreativeSpacesLoading] = useState(false);

  // Legacy state starts, merged for compatibility
  const [newInterest, setNewInterest] = useState("");
  const [newLanguage, setNewLanguage] = useState(""); // Separate state for new language
  const [isPrivate, setIsPrivate] = useState(false); // Legacy, not mapped
  const [canBeTagged, setCanBeTagged] = useState(true);
  const [anyoneCanEdit, setAnyoneCanEdit] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [visibilityOption, setVisibilityOption] = useState("public");
  const [editField, setEditField] = useState<string | null>(null);
  const [tempFieldValue, setTempFieldValue] = useState("");
  const [activeTab, setActiveTab] = useState("author");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const { toast } = useToast();

  // Responsive design
  const isMobile = useIsMobile();

  // For the revision history
  const revisions = [
    { id: 1, text: "Text 1", time: "11:28" },
    { id: 2, text: "Text 2", time: "12:15" },
    { id: 3, text: "Text 3", time: "14:30" },
  ];

  // Add contribution filter state
  const [contributionFilter, setContributionFilter] = useState<"total" | "approved" | "denied" | "undecided">("total");

  // User contributions loaded from backend
  const [contributions, setContributions] = useState<ProfileContributionRow[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);

  // Stats for the stats display component (derive contributions count from data)
  const statsOverview = {
    stories: 5,
    views: 50,
    likes: 10,
    contributions: contributions.length,
  };

  // Stats for stories and contributions (placeholder numbers for now)
  const stats = {
    author: {
      text: 5,
      images: 50,
      audio: 10,
      video: 5
    },
    consumer: {
      text: 5,
      images: 50,
      audio: 10,
      video: 5
    },
    producer: {
      story: 5
    },
    community: {
      contributing: {
        text: 5,
        images: 50,
        audio: 10,
        video: 5
      },
      sentFeedback: 5,
      suggestedFeatures: 50,
      submittedBugReports: 10,
      contactRequests: 5
    }
  };

  // Load contributions for this user from backend when userId changes
  useEffect(() => {
    const loadContributions = async () => {
      if (!userId) {
        setContributions([]);
        return;
      }
      try {
        setContributionsLoading(true);
        const params = new URLSearchParams();
        if (userEmail) {
          params.set("email", userEmail);
        }
        const query = params.toString();
        const url = query
          ? `${API_BASE}/users/${userId}/contributions?${query}`
          : `${API_BASE}/users/${userId}/contributions`;
        const res = await fetch(url);
        if (!res.ok) {
          console.error('[Profile] Failed to load contributions', res.status);
          setContributions([]);
          return;
        }
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data)) {
          setContributions([]);
          return;
        }
        const mapped: ProfileContributionRow[] = data.map((row: any, index: number) => ({
          id: row.id ?? index,
          story_title: row.story_title ?? '',
          chapter_title: row.chapter_title ?? '',
          paragraph: row.new_paragraph ?? '',
          user: userEmail || '',
          date: row.created_at ? new Date(row.created_at).toLocaleString() : '',
          words: typeof row.words === 'number' ? row.words : 0,
          likes: typeof row.likes === 'number' ? row.likes : 0,
          dislikes: typeof row.dislikes === 'number' ? row.dislikes : 0,
          comments: typeof row.comments === 'number' ? row.comments : 0,
          status: (row.status as ProfileContributionRow['status']) || 'approved',
        }));
        setContributions(mapped);
      } catch (err) {
        console.error('[Profile] Error loading contributions', err);
        setContributions([]);
      } finally {
        setContributionsLoading(false);
      }
    };
    loadContributions();
  }, [userId, userEmail]);

  // Load screenplays the user is creating or collaborating on
  useEffect(() => {
    const loadScreenplays = async () => {
      if (!authUser?.id) {
        setUserScreenplays([]);
        return;
      }
      try {
        setScreenplaysLoading(true);
        const res = await fetch(`${API_BASE}/users/${authUser.id}/screenplays`);
        if (!res.ok) {
          console.error('[Profile] Failed to load user screenplays', res.status);
          setUserScreenplays([]);
          return;
        }
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data)) {
          setUserScreenplays([]);
          return;
        }
        setUserScreenplays(data);
      } catch (err) {
        console.error('[Profile] Error loading user screenplays', err);
        setUserScreenplays([]);
      } finally {
        setScreenplaysLoading(false);
      }
    };

    loadScreenplays();
  }, [authUser]);

  // Toggle preview mode function
  const togglePreviewMode = () => {
    const newPreviewMode = !previewMode;
    setPreviewMode(newPreviewMode);
    // Close the settings popover when entering preview mode
    if (newPreviewMode) {
      setIsSettingsOpen(false);
    }
    toast({
      title: newPreviewMode ? "Preview Mode Activated" : "Edit Mode Activated",
      description: newPreviewMode ? "Viewing profile as others see it" : "You can now edit your profile",
      duration: 2000,
    });
  };

  // Authentication: get current logged-in user id (if any)
  useEffect(() => {
    const getUser = async () => {
      // Prefer AuthContext user (local backend auth)
      if (authUser) {
        setUserId(authUser.id ?? null);
        setUserEmail(authUser.email ?? null);
        return;
      }

      // Fallback: Supabase auth (legacy)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
    };
    getUser();
  }, [authUser]);

  // Load or create profile for current user.
  // Prefer the local backend (/profiles/:userId) when using local auth.
  // Fall back to Supabase-only profiles when there is no local auth user.
  useEffect(() => {
    const loadProfile = async () => {
      // Local auth: use backend profiles table
      if (authUser?.id && authUser?.email) {
        try {
          setIsLoading(true);
          const res = await fetch(`${API_BASE}/profiles/${authUser.id}`);
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.error('[Profile] Failed to load profile from backend', { status: res.status, body });
            toast({
              title: "Failed to load profile",
              description: body.error || "Could not load profile from database.",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
          setProfile({
            ...INITIAL_PROFILE,
            ...body,
            interests: body.interests || [],
            languages: body.languages || [],
          });
        } catch (err) {
          console.error('[Profile] Failed to load profile from backend', err);
          toast({
            title: "Failed to load profile",
            description: "Could not connect to the profile service.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Legacy Supabase profile flow (no local auth user)
      if (!userId || !userEmail) return;

      const fetchOrCreateProfile = async () => {
        try {
          setIsLoading(true);
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
          if (error) {
            console.error('[Profile] Failed to load profile from Supabase', error);
            if (!String(error.message).includes('Failed to fetch')) {
              toast({
                title: "Failed to load profile",
                description: error.message,
                variant: "destructive",
              });
            }
            setIsLoading(false);
            return;
          }
          if (data) {
            setProfile({
              ...INITIAL_PROFILE,
              ...data,
              interests: data.interests || [],
              languages: data.languages || [],
            });
          } else {
            const { error: insertError } = await supabase
              .from("profiles")
              .insert([{ id: userId, username: userEmail }]);
            if (insertError) {
              console.error('[Profile] Failed to create Supabase profile', insertError);
              if (!String(insertError.message).includes('Failed to fetch')) {
                toast({
                  title: "Failed to create user profile",
                  description: insertError.message,
                  variant: "destructive",
                });
              }
            } else {
              setProfile({ ...INITIAL_PROFILE, username: userEmail });
            }
          }
        } finally {
          setIsLoading(false);
        }
      };

      fetchOrCreateProfile();
    };

    loadProfile();
  }, [authUser, userId, userEmail, toast]);

  // Load creative spaces for the current user
  useEffect(() => {
    const fetchSpaces = async () => {
      if (!authUser?.id) return;
      setCreativeSpacesLoading(true);
      try {
        const res = await fetch(`${API_BASE}/creative-spaces?userId=${authUser.id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('Failed to fetch creative spaces', { status: res.status, body });
          setCreativeSpaces([]);
        } else {
          const data = await res.json();
          setCreativeSpaces(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch creative spaces', err);
        setCreativeSpaces([]);
      } finally {
        setCreativeSpacesLoading(false);
      }
    };

    fetchSpaces();
  }, [authUser]);

  // Load stories the user is creating / co-creating
  useEffect(() => {
    const fetchUserStories = async () => {
      if (!authUser?.id) return;
      setStoriesLoading(true);
      try {
        const res = await fetch(`${API_BASE}/users/${authUser.id}/stories`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('Failed to fetch user stories', { status: res.status, body });
          setUserStories([]);
        } else {
          const data = await res.json();
          setUserStories(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch user stories', err);
        setUserStories([]);
      } finally {
        setStoriesLoading(false);
      }
    };

    fetchUserStories();
  }, [authUser]);

  // Legacy effect previously used /screenplays?userId=; kept for reference but no-op now
  // Screenplays are loaded via /users/:userId/screenplays above.

  // Save profile field (generic handler). When using local auth, this writes
  // to the backend /profiles/:userId endpoint. For legacy Supabase-only
  // users, it still updates Supabase.
  const saveProfileField = async (key: keyof typeof profile, value: any) => {
    // Local backend profile (preferred)
    if (authUser?.id) {
      setProfile((prev) => ({ ...prev, [key]: value }));
      try {
        const res = await fetch(`${API_BASE}/profiles/${authUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[Profile] Failed to update profile field", key, { status: res.status, body });
          toast({
            title: "Failed to update",
            description: body.error || "Could not save your profile information.",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("[Profile] Failed to update profile field", key, err);
        toast({
          title: "Failed to update",
          description: "Network error while saving profile information.",
          variant: "destructive",
        });
      }
      return;
    }

    // Supabase legacy path
    if (!userId) return;
    setProfile((prev) => ({ ...prev, [key]: value }));
    const updateObj: any = {};
    updateObj[key] = value;
    const { error } = await supabase.from("profiles").update(updateObj).eq("id", userId);
    if (error) {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Saved",
        description: `Your ${key.replace(/_/g, " ")} has been updated.`,
        duration: 1500,
      });
    }
  };

  // Interests management
  const handleAddInterest = () => {
    const interest = newInterest.trim();
    if (!interest || profile.interests.includes(interest)) return;
    const updated = [...profile.interests, interest];
    saveProfileField("interests", updated);
    setProfile((p) => ({ ...p, interests: updated }));
    setNewInterest("");
  };
  const handleRemoveInterest = (interest: string) => {
    const updated = profile.interests.filter((i: string) => i !== interest);
    saveProfileField("interests", updated);
    setProfile((p) => ({ ...p, interests: updated }));
  };

  // Avatar/image (legacy for sections outside ProfileInformation)
  const handleProfileImageChange = (imageUrl: string) => {
    saveProfileField("profile_image_url", imageUrl);
  };

  // Bio/about
  const handleBioSave = (bio: string) => {
    saveProfileField("bio", bio);
    setProfile((p) => ({ ...p, bio }));
  };

  // Inline editing for Profile Information fields is now handled inside the
  // ProfileInformation module via blur-to-save behaviour.

  // Languages are now managed inside the ProfileInformation module via
  // saveProfileField.

  // Social links
  const handleSocialChange = (key: keyof typeof profile, value: string) => {
    saveProfileField(key, value);
    setProfile((p) => ({ ...p, [key]: value }));
  };
  // Birthday, telephone
  const handleBirthdayChange = (date: string) => {
    saveProfileField("birthday", date);
    setProfile((p) => ({ ...p, birthday: date }));
  };
  const handleTelephoneChange = (tel: string) => {
    saveProfileField("telephone", tel);
    setProfile((p) => ({ ...p, telephone: tel }));
  };

  // Notifications
  const handleNotifChange = (key: keyof typeof profile, val: boolean) => {
    saveProfileField(key, val);
    setProfile((p) => ({ ...p, [key]: val }));
  };

  // Creative space CRUD handlers
  const handleCreateCreativeSpace = async () => {
    if (!authUser?.id) return;
    const name = window.prompt(
      "Name of the new creative space (leave blank for 'No name creative space')",
      "",
    );

    try {
      const res = await fetch(`${API_BASE}/creative-spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUser.id,
          // backend will substitute default if name is missing/empty
          name: name ?? "",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Failed to create creative space", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to create creative space.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => [...prev, body]);
    } catch (err) {
      console.error("Failed to create creative space", err);
      toast({
        title: "Error",
        description: "Failed to create creative space.",
        variant: "destructive",
      });
    }
  };

  const handleRenameCreativeSpace = async (space: CreativeSpace) => {
    if (!authUser?.id) return;
    const newName = window.prompt("Rename creative space", space.name || "");
    if (newName === null) return; // cancelled

    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, name: newName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Failed to rename creative space", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to rename creative space.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => prev.map((s) => (s.id === space.id ? body : s)));
    } catch (err) {
      console.error("Failed to rename creative space", err);
      toast({
        title: "Error",
        description: "Failed to rename creative space.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCreativeSpace = async (space: CreativeSpace) => {
    if (!authUser?.id) return;
    const ok = window.confirm("Delete this creative space? This cannot be undone.");
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${space.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to delete creative space", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to delete creative space.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => prev.filter((s) => s.id !== space.id));
    } catch (err) {
      console.error("Failed to delete creative space", err);
      toast({
        title: "Error",
        description: "Failed to delete creative space.",
        variant: "destructive",
      });
    }
  };

  const handleCloneCreativeSpace = async (space: CreativeSpace) => {
    if (!authUser?.id) return;

    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${space.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Failed to clone creative space", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to clone creative space.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => [...prev, body]);
    } catch (err) {
      console.error("Failed to clone creative space", err);
      toast({
        title: "Error",
        description: "Failed to clone creative space.",
        variant: "destructive",
      });
    }
  };

  // Only render the UI after loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">Loading profile...</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <div className="container mx-auto px-4 pt-8 pb-16 flex-grow">
        <div className="flex justify-between items-start mb-8">
          <h1 className="text-3xl font-bold">
            <EditableText id="profile-title">Profile</EditableText> 
            {!previewMode && (
              <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4" align="start">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-sm">
                      <EditableText id="visibility-popup-label">Visibility</EditableText>
                    </h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 -mt-1 -mr-1"
                      onClick={() => setIsSettingsOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-500 flex items-center gap-1 mb-3">
                    <Info className="h-4 w-4" />
                    <EditableText id="can-be-changed-text-popup">Can be changed any time</EditableText>
                  </div>
                  
                  <RadioGroup 
                    value={visibilityOption} 
                    onValueChange={setVisibilityOption}
                    className="space-y-2 mb-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="public" id="public-popup" />
                      <Label htmlFor="public-popup" className="flex items-center gap-2 cursor-pointer">
                        <Globe className="h-4 w-4 text-purple-600" />
                        <EditableText id="public-option-popup">Public</EditableText>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="private" id="private-popup" />
                      <Label htmlFor="private-popup" className="flex items-center gap-2 cursor-pointer">
                        <User className="h-4 w-4 text-purple-600" />
                        <EditableText id="private-option-popup">Private</EditableText>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="friends" id="friends-popup" />
                      <Label htmlFor="friends-popup" className="flex items-center gap-2 cursor-pointer">
                        <Users className="h-4 w-4 text-purple-600" />
                        <EditableText id="friends-option-popup">Friends only</EditableText>
                      </Label>
                    </div>
                  </RadioGroup>

                  <div className="mt-2 border-t pt-2 space-y-1">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      <EditableText id="section-visibility-heading">
                        Sections visible on your public profile
                      </EditableText>
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Checkbox
                        id="show-public-stories"
                        checked={(profile as any).show_public_stories !== false}
                        onCheckedChange={(checked) =>
                          saveProfileField(
                            "show_public_stories" as any,
                            Boolean(checked),
                          )
                        }
                      />
                      <Label htmlFor="show-public-stories" className="cursor-pointer">
                        Show my stories
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Checkbox
                        id="show-public-screenplays"
                        checked={(profile as any).show_public_screenplays !== false}
                        onCheckedChange={(checked) =>
                          saveProfileField(
                            "show_public_screenplays" as any,
                            Boolean(checked),
                          )
                        }
                      />
                      <Label htmlFor="show-public-screenplays" className="cursor-pointer">
                        Show my screenplays
                      </Label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className={`p-1 ${previewMode ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
              onClick={togglePreviewMode}
            >
              {previewMode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
          </h1>
        </div>
        
        {/* Profile Information Section */}
        <ProfileInformation
          profile={profile}
          previewMode={previewMode}
          onSaveField={(field, value) => saveProfileField(field as keyof typeof profile, value)}
        />

        <div className="mb-8">
          <p className="text-xl text-gray-600 mb-4">
            <EditableText id="main-subtitle">
              About
            </EditableText>
          </p>

          {/* Bio section */}
          <EditableBio 
            initialValue={profile.bio} 
            isPreviewMode={previewMode} 
            onSave={handleBioSave}
            className="mb-8"
          />
        </div>
        {/* Creative space(s) */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-2">
            Creative space(s)
          </h2>
          <CreativeSpacesModule
            spaces={creativeSpaces}
            isLoading={creativeSpacesLoading}
            onCreate={handleCreateCreativeSpace}
            onRename={handleRenameCreativeSpace}
            onDelete={handleDeleteCreativeSpace}
            onClone={handleCloneCreativeSpace}
          />
        </div>
        
        {/* Stories the user is creating / co-creating */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-600" />
            Stories I'm creating / co-creating
          </h2>
          {storiesLoading ? (
            <div className="text-gray-500 text-sm">Loading your stories...</div>
          ) : userStories.length === 0 ? (
            <div className="text-gray-400 text-sm italic">You are not yet creating or co-creating any stories.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {userStories.map((s) => (
                <li key={s.story_title_id} className="flex items-center gap-2">
                  <Link
                    to={`/story/${s.story_title_id}`}
                    className="text-purple-700 hover:underline"
                  >
                    {s.title}
                  </Link>
                  <span className="text-[11px] text-gray-500">
                    ({s.roles.includes('creator') ? 'creator' : 'contributor'})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Screenplays the user is creating / co-creating */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            Screenplays I'm creating / co-creating
          </h2>
          {screenplaysLoading ? (
            <div className="text-gray-500 text-sm">Loading your screenplays...</div>
          ) : userScreenplays.length === 0 ? (
            <div className="text-gray-400 text-sm italic">You are not yet creating any screenplays.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {userScreenplays.map((sp) => (
                <li key={sp.screenplay_id} className="flex items-center gap-2">
                  <Link
                    to={`/screenplay/${sp.screenplay_id}`}
                    className="text-purple-700 hover:underline"
                  >
                    {sp.title}
                  </Link>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <span>
                      ({new Date(sp.created_at).toLocaleString()})
                    </span>
                    {Array.isArray(sp.roles) && sp.roles.length > 0 && (
                      <span>
                        
                        {sp.roles.includes('creator') ? 'creator' : sp.roles.join(', ')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Interests/Hobbies Section */}
        <div className="mb-8">
          <div className="flex items-center mb-2">
            <h2 className="text-xl font-bold mr-2">
              <EditableText id="interests-heading">Interests/Hobbies</EditableText>
            </h2>
            <Info className="h-5 w-5 text-gray-400" />            
          </div>
          
          {!previewMode && (
            <div className="mb-3">
              <div className="flex gap-2">
                <Input 
                  id="interests-input"
                  value={newInterest} 
                  onChange={(e) => setNewInterest(e.target.value)} 
                  placeholder="Add interests..." 
                  className="flex-grow" 
                />
                <Button onClick={handleAddInterest} size="sm">
                  <EditableText id="add-interest">Add</EditableText>
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 mb-4">
            {profile.interests.map((interest, index) => (
              <div key={index} className="bg-gray-100 rounded-full px-3 py-1 flex items-center gap-1">
                <span>{interest}</span>
                {!previewMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0"
                    onClick={() => handleRemoveInterest(interest)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
 
        {/* Stats & Activity Section - Only shown when not in preview mode */}
        {!previewMode && (
          <div className="mb-12 space-y-6">
            <StatsDisplay stats={statsOverview} />

            <div>
              {contributionsLoading ? (
                <div className="text-sm text-gray-500">Loading contributions...</div>
              ) : (
                <ContributionsModule
                  contributions={contributions}
                  currentFilter={contributionFilter}
                  onFilterChange={setContributionFilter}
                  titleId="profile-contributions-heading"
                />
              )}
            </div>
          </div>
        )}

        {/* Hide editing features in preview mode */}
        {!previewMode && (
          <>
            {/* Revisions Section */}
            <div className="mb-12">
              <RevisionComparison revisions={revisions} />
            </div>
          </>
        )}

        {/* Communications Section */}
        <div className="mb-12">
          <CommunicationsSection />
        </div>

        {/* Notifications Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-6 text-[#1A1F2C]">
            <EditableText id="notifications">
              Notifications
            </EditableText>
          </h1>
          <div className="mb-6">
            {/* MOVED: Notification checkboxes inline & styled horizontally */}
            <Label className="text-sm text-gray-500 flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 inline mb-1 mr-1" />
              Notifications
            </Label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={profile.notify_phone}
                  disabled={previewMode}
                  onCheckedChange={val => handleNotifChange("notify_phone", Boolean(val))}
                />
                Phone
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={profile.notify_app}
                  disabled={previewMode}
                  onCheckedChange={val => handleNotifChange("notify_app", Boolean(val))}
                />
                App
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={profile.notify_email}
                  disabled={previewMode}
                  onCheckedChange={val => handleNotifChange("notify_email", Boolean(val))}
                />
                Email
              </label>
            </div>
          </div>
          <div className="space-y-4">
            <p className="mb-2">
              <EditableText id="notifications_messages_placeholder">
                 Here will be your notifications about deletions, branch activity, etc which you can delete or archive
              </EditableText>
            </p>           
          </div>
        </div>

        {/* Original Tabs Section for detailed stats */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">
            <EditableText id="stats-heading">Story(-ies) & activity stats</EditableText>
          </h2>
          
          <Tabs defaultValue="author" className="w-full">
            <TabsList className="bg-gray-100 p-1 mb-6 w-full md:w-auto overflow-x-auto flex">
              <ResponsiveTabsTrigger
                value="author"
                icon={<FileText className="h-5 w-5" />}
                text="Author"
                onClick={() => setActiveTab("author")}
              />
              <ResponsiveTabsTrigger
                value="consumer"
                icon={<BookOpen className="h-5 w-5" />}
                text="Consumer"
                onClick={() => setActiveTab("consumer")}
              />
              <ResponsiveTabsTrigger
                value="producer"
                icon={<Award className="h-5 w-5" />}
                text="Producer"
                onClick={() => setActiveTab("producer")}
              />
              <ResponsiveTabsTrigger
                value="community"
                icon={<Users className="h-5 w-5" />}
                text="Community"
                onClick={() => setActiveTab("community")}
              />
            </TabsList>
            
            {/* Tab contents for each role */}
            <TabsContent value="author" className="space-y-4">
              <h3 className="text-lg font-semibold">
                <EditableText id="author-contributions">Authoring</EditableText>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.author.text}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="author-text-count">Text</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.author.images}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="author-images-count">Images</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.author.audio}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="author-audio-count">Audio</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.author.video}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="author-video-count">Video</EditableText>
                    </p>
                  </CardContent>
                </Card>
              </div>
              
            {/* Author tab additional content */}
            <h3 className="text-lg font-semibold mt-6">
              <EditableText id="author-contributions-heading">Contributions</EditableText>
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              <EditableText id="author-contributions-help">
                Below is a list of your contributions across all stories. Use the tabs above the table to filter by status.
              </EditableText>
            </p>
            </TabsContent>
            
            {/* Consumer Tab Content */}
            <TabsContent value="consumer" className="space-y-4">
              <h3 className="text-lg font-semibold">
                <EditableText id="consumer-stats">Consumer Stats</EditableText>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.consumer.text}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="consumer-text-count">Text</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.consumer.images}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="consumer-images-count">Images</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.consumer.audio}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="consumer-audio-count">Audio</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.consumer.video}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="consumer-video-count">Video</EditableText>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            {/* Producer Tab Content */}
            <TabsContent value="producer" className="space-y-4">
              <h3 className="text-lg font-semibold">
                <EditableText id="producer-stats">Producer Stats</EditableText>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.producer.story}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="producer-story-count">Stories</EditableText>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            {/* Community Tab Content */}
            <TabsContent value="community" className="space-y-4">
              <h3 className="text-lg font-semibold">
                <EditableText id="community-contributing">Contributing</EditableText>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.contributing.text}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="community-text-count">Text</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.contributing.images}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="community-images-count">Images</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.contributing.audio}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="community-audio-count">Audio</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.contributing.video}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="community-video-count">Video</EditableText>
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              <h3 className="text-lg font-semibold mt-6">
                <EditableText id="community-engagement">Community Engagement</EditableText>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.sentFeedback}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="sent-feedback-count">Sent Feedback</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.suggestedFeatures}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="suggested-features-count">Suggested Features</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.submittedBugReports}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="submitted-bug-reports">Submitted Bug Reports</EditableText>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-2xl font-bold">{stats.community.contactRequests}</p>
                    <p className="text-sm text-muted-foreground">
                      <EditableText id="contact-requests-count">Contact Requests</EditableText>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {!previewMode && (
          <Link 
            to="/account-administration" 
            className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <EditableText id="account-administration">
              Account Administration
            </EditableText>
          </Link>
        )}
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default Profile;
