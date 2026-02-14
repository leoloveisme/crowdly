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
  Cloud,
  Check,
  Upload,
  PencilLine,
  User,
  Globe,
  Users,
  FileText,
  BookOpen,
  Bookmark,
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
import FavoriteStories from "@/modules/favorite stories";
import LivingExperiencingStories from "@/modules/living-experiencing stories";
import LivedExperiencedStories from "@/modules/lived-experienced stories";
import UserInteractionsWidget from "@/modules/UserInteractionsWidget";
import GroupsManager from "@/modules/groups";

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
  show_public_favorites: true,
  show_public_living: true,
  show_public_lived: true,
  // Fine-grained per-container visibility and selected user lists
  favorites_visibility: "public" as "public" | "private" | "friends" | "selected",
  living_visibility: "public" as "public" | "private" | "friends" | "selected",
  lived_visibility: "public" as "public" | "private" | "friends" | "selected",
  // New containers: stories the user is creating and screenplays they are creating
  stories_visibility: "public" as "public" | "private" | "friends" | "selected",
  screenplays_visibility: "public" as "public" | "private" | "friends" | "selected",
  favorites_selected_user_ids: [] as string[],
  living_selected_user_ids: [] as string[],
  lived_selected_user_ids: [] as string[],
  stories_selected_user_ids: [] as string[],
  screenplays_selected_user_ids: [] as string[],
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

  // Creative spaces: these mirror project spaces on the desktop app.
  const [creativeSpaces, setCreativeSpaces] = useState<CreativeSpace[]>([]);
  const [creativeSpacesLoading, setCreativeSpacesLoading] = useState(false);
  const [activeSpaceForStats, setActiveSpaceForStats] = useState<CreativeSpace | null>(null);

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

  // Per-container visibility popovers
  const [favoritesSettingsOpen, setFavoritesSettingsOpen] = useState(false);
  const [livingSettingsOpen, setLivingSettingsOpen] = useState(false);
  const [livedSettingsOpen, setLivedSettingsOpen] = useState(false);
  const [storiesSettingsOpen, setStoriesSettingsOpen] = useState(false);
  const [screenplaysSettingsOpen, setScreenplaysSettingsOpen] = useState(false);

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
          const mapped = (Array.isArray(data) ? data : []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? null,
            path: row.path ?? null,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
            visibility: (row.visibility as any) ?? 'private',
            published: Boolean(row.published),
            default_item_visibility: row.default_item_visibility ?? null,
            last_synced_at: row.last_synced_at ?? null,
            sync_state: row.sync_state ?? null,
          } satisfies CreativeSpace));
          setCreativeSpaces(mapped);
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

  // Helper: resolve current visibility mode for a given experience container,
  // falling back to legacy boolean flags when the newer fields are not set.
  type VisibilityContainer =
    | "favorites"
    | "living"
    | "lived"
    | "stories"
    | "screenplays";

  const getContainerVisibility = (
    container: VisibilityContainer,
  ): "public" | "private" | "friends" | "selected" => {
    const field =
      container === "favorites"
        ? "favorites_visibility"
        : container === "living"
        ? "living_visibility"
        : container === "lived"
        ? "lived_visibility"
        : container === "stories"
        ? "stories_visibility"
        : "screenplays_visibility";
    const raw = (profile as any)[field];
    if (raw === "public" || raw === "private" || raw === "friends" || raw === "selected") {
      return raw;
    }
    const legacyFlag =
      container === "favorites"
        ? (profile as any).show_public_favorites
        : container === "living"
        ? (profile as any).show_public_living
        : container === "lived"
        ? (profile as any).show_public_lived
        : container === "stories"
        ? (profile as any).show_public_stories
        : (profile as any).show_public_screenplays;
    return legacyFlag === false ? "private" : "public";
  };

  const setContainerVisibility = (
    container: VisibilityContainer,
    mode: "public" | "private" | "friends" | "selected",
  ) => {
    const field =
      container === "favorites"
        ? "favorites_visibility"
        : container === "living"
        ? "living_visibility"
        : container === "lived"
        ? "lived_visibility"
        : container === "stories"
        ? "stories_visibility"
        : "screenplays_visibility";
    saveProfileField(field as keyof typeof profile, mode);

    // For backward compatibility with older public profile consumers, keep the
    // legacy boolean flags roughly in sync (public vs non-public).
    const boolField =
      container === "favorites"
        ? "show_public_favorites"
        : container === "living"
        ? "show_public_living"
        : container === "lived"
        ? "show_public_lived"
        : container === "stories"
        ? "show_public_stories"
        : "show_public_screenplays";
    const isPublic = mode === "public";
    saveProfileField(boolField as keyof typeof profile, isPublic);
  };

  const handleSelectedUsersChange = (
    container: VisibilityContainer,
    ids: string[],
  ) => {
    const field =
      container === "favorites"
        ? "favorites_selected_user_ids"
        : container === "living"
        ? "living_selected_user_ids"
        : container === "lived"
        ? "lived_selected_user_ids"
        : container === "stories"
        ? "stories_selected_user_ids"
        : "screenplays_selected_user_ids";
    saveProfileField(field as keyof typeof profile, ids);
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
      setCreativeSpaces((prev) => [...prev, body as CreativeSpace]);
    } catch (err) {
      console.error("Failed to clone creative space", err);
      toast({
        title: "Error",
        description: "Failed to clone creative space.",
        variant: "destructive",
      });
    }
  };

  const handleToggleSpaceVisibility = async (
    space: CreativeSpace,
    nextVisibility: CreativeSpace["visibility"],
  ) => {
    if (!authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, visibility: nextVisibility }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Failed to update creative space visibility", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to update creative space visibility.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => prev.map((s) => (s.id === space.id ? (body as CreativeSpace) : s)));
    } catch (err) {
      console.error("Failed to update creative space visibility", err);
      toast({
        title: "Error",
        description: "Failed to update creative space visibility.",
        variant: "destructive",
      });
    }
  };

  const handleToggleSpacePublished = async (space: CreativeSpace, nextPublished: boolean) => {
    if (!authUser?.id) return;
    try {
      const res = await fetch(`${API_BASE}/creative-spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, published: nextPublished }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Failed to update creative space publish state", { status: res.status, body });
        toast({
          title: "Error",
          description: body.error || "Failed to update creative space publish state.",
          variant: "destructive",
        });
        return;
      }
      setCreativeSpaces((prev) => prev.map((s) => (s.id === space.id ? (body as CreativeSpace) : s)));
    } catch (err) {
      console.error("Failed to update creative space publish state", err);
      toast({
        title: "Error",
        description: "Failed to update creative space publish state.",
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
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="selected-only" id="friends-popup" />
                      <Label htmlFor="selected-only-popup" className="flex items-center gap-2 cursor-pointer">
                        <Users className="h-4 w-4 text-purple-600" />
                        <EditableText id="selected-only-option-popup">Selected users only</EditableText>
                      </Label>
                    </div>
                  </RadioGroup>

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

        {/* Creative space(s) */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-purple-600" />
            Space(s)
          </h2>
          <CreativeSpacesModule
            spaces={creativeSpaces}
            isLoading={creativeSpacesLoading}
            onCreate={handleCreateCreativeSpace}
            onRename={handleRenameCreativeSpace}
            onDelete={handleDeleteCreativeSpace}
            onClone={handleCloneCreativeSpace}
            onToggleVisibility={handleToggleSpaceVisibility}
            onTogglePublished={handleToggleSpacePublished}
            onShowStats={(space) => setActiveSpaceForStats(space)}
          />
          {activeSpaceForStats && (
            <div className="mt-3 text-xs text-gray-600 border rounded-lg p-3 bg-gray-50">
              <div className="flex justify-between items-start mb-1">
                <div className="font-semibold text-gray-800 truncate">
                  Space stats: {activeSpaceForStats.name}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSpaceForStats(null)}
                  className="text-gray-400 hover:text-gray-600 text-[11px]"
                >
                  Close
                </button>
              </div>
              <div className="space-y-1">
                <div>space_id: {activeSpaceForStats.id}</div>
                <div>
                  visibility/published: {activeSpaceForStats.visibility || "private"} ·
                  {" "}
                  {activeSpaceForStats.published ? "published" : "unpublished"}
                </div>
                {activeSpaceForStats.last_synced_at && (
                  <div>
                    last sync: {new Date(activeSpaceForStats.last_synced_at).toLocaleString()}
                  </div>
                )}
                {activeSpaceForStats.sync_state && (
                  <div>sync state: {activeSpaceForStats.sync_state}</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Stories the user is creating / co-creating */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-600" />
            Stories I'm creating / co-creating
            {!previewMode && authUser?.id && (
              <Popover open={storiesSettingsOpen} onOpenChange={setStoriesSettingsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Visibility</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0"
                        onClick={() => setStoriesSettingsOpen(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Control who can see the list of stories you are creating or
                      co-creating on your public profile.
                    </p>
                    <RadioGroup
                      value={getContainerVisibility("stories")}
                      onValueChange={(val) =>
                        setContainerVisibility(
                          "stories",
                          val as "public" | "private" | "friends" | "selected",
                        )
                      }
                      className="space-y-1 text-xs"
                    >
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="public" id="stories-public" />
                        <Label
                          htmlFor="stories-public"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3 w-3 text-green-600" />
                          <span>Make visible (Public)</span>
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="private" id="stories-private" />
                        <Label
                          htmlFor="stories-private"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <EyeOff className="h-3 w-3 text-gray-600" />
                          <span>Make invisible (Private)</span>
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="friends" id="stories-friends" />
                        <Label
                          htmlFor="stories-friends"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Users className="h-3 w-3 text-purple-600" />
                          <span>Friends only</span>
                        </Label>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="selected" id="stories-selected" />
                          <Label
                            htmlFor="stories-selected"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <User className="h-3 w-3 text-purple-600" />
                            <span>Selected users only</span>
                          </Label>
                        </div>
                        {getContainerVisibility("stories") === "selected" && (
                          <div className="mt-2 border-t pt-2">
                            <UserInteractionsWidget
                              ownerUserId={authUser.id}
                              containerKey="stories"
                              selectedUserIds={
                                (profile as any).stories_selected_user_ids || []
                              }
                              onChangeSelectedUserIds={(ids) =>
                                handleSelectedUsersChange("stories", ids)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </RadioGroup>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Link
              to="/stories/spaces-migration"
              className="ml-auto text-xs text-blue-700 hover:underline"
            >
              Manage story–Space assignments
            </Link>
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
            {!previewMode && authUser?.id && (
              <Popover
                open={screenplaysSettingsOpen}
                onOpenChange={setScreenplaysSettingsOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Visibility</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0"
                        onClick={() => setScreenplaysSettingsOpen(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Control who can see the list of screenplays you are
                      creating or co-creating on your public profile.
                    </p>
                    <RadioGroup
                      value={getContainerVisibility("screenplays")}
                      onValueChange={(val) =>
                        setContainerVisibility(
                          "screenplays",
                          val as "public" | "private" | "friends" | "selected",
                        )
                      }
                      className="space-y-1 text-xs"
                    >
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="public" id="screenplays-public" />
                        <Label
                          htmlFor="screenplays-public"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3 w-3 text-green-600" />
                          <span>Make visible (Public)</span>
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="private" id="screenplays-private" />
                        <Label
                          htmlFor="screenplays-private"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <EyeOff className="h-3 w-3 text-gray-600" />
                          <span>Make invisible (Private)</span>
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="friends" id="screenplays-friends" />
                        <Label
                          htmlFor="screenplays-friends"
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Users className="h-3 w-3 text-purple-600" />
                          <span>Friends only</span>
                        </Label>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="selected" id="screenplays-selected" />
                          <Label
                            htmlFor="screenplays-selected"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <User className="h-3 w-3 text-purple-600" />
                            <span>Selected users only</span>
                          </Label>
                        </div>
                        {getContainerVisibility("screenplays") === "selected" && (
                          <div className="mt-2 border-t pt-2">
                            <UserInteractionsWidget
                              ownerUserId={authUser.id}
                              containerKey="screenplays"
                              selectedUserIds={
                                (profile as any).screenplays_selected_user_ids || []
                              }
                              onChangeSelectedUserIds={(ids) =>
                                handleSelectedUsersChange("screenplays", ids)
                              }
                            />
                          </div>
                        )}
                      </div>
                    </RadioGroup>
                  </div>
                </PopoverContent>
              </Popover>
            )}
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

        {/* Experience containers: Favorites / Living / Lived */}
        <div className="mb-10 space-y-8">
          <section>
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-600" />
              Favorites
              {!previewMode && authUser?.id && (
                <Popover open={favoritesSettingsOpen} onOpenChange={setFavoritesSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 text-pink-600 hover:text-pink-700"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Visibility</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0"
                          onClick={() => setFavoritesSettingsOpen(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Control who can see your favorites list on your public
                        profile page.
                      </p>
                      <RadioGroup
                        value={getContainerVisibility("favorites")}
                        onValueChange={(val) =>
                          setContainerVisibility(
                            "favorites",
                            val as "public" | "private" | "friends" | "selected",
                          )
                        }
                        className="space-y-1 text-xs"
                      >
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="public" id="favorites-public" />
                          <Label
                            htmlFor="favorites-public"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3 w-3 text-green-600" />
                            <span>Make visible (Public)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="private" id="favorites-private" />
                          <Label
                            htmlFor="favorites-private"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <EyeOff className="h-3 w-3 text-gray-600" />
                            <span>Make invisible (Private)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="friends" id="favorites-friends" />
                          <Label
                            htmlFor="favorites-friends"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Users className="h-3 w-3 text-purple-600" />
                            <span>Friends only</span>
                          </Label>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 cursor-pointer">
                            <RadioGroupItem value="selected" id="favorites-selected" />
                            <Label
                              htmlFor="favorites-selected"
                              className="flex items-center gap-1 cursor-pointer"
                            >
                              <User className="h-3 w-3 text-purple-600" />
                              <span>Selected users only</span>
                            </Label>
                          </div>
                          {getContainerVisibility("favorites") === "selected" && (
                            <div className="mt-2 border-t pt-2">
                              <UserInteractionsWidget
                                ownerUserId={authUser.id}
                                containerKey="favorites"
                                selectedUserIds={
                                  (profile as any).favorites_selected_user_ids || []
                                }
                                onChangeSelectedUserIds={(ids) =>
                                  handleSelectedUsersChange("favorites", ids)
                                }
                              />
                            </div>
                          )}
                        </div>
                      </RadioGroup>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </h2>
            <FavoriteStories userId={authUser?.id ?? null} />
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-purple-600" />
              Living / Experiencing the story(-ies)
              {!previewMode && authUser?.id && (
                <Popover open={livingSettingsOpen} onOpenChange={setLivingSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Visibility</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0"
                          onClick={() => setLivingSettingsOpen(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Control who can see which stories and screenplays you
                        are currently experiencing.
                      </p>
                      <RadioGroup
                        value={getContainerVisibility("living")}
                        onValueChange={(val) =>
                          setContainerVisibility(
                            "living",
                            val as "public" | "private" | "friends" | "selected",
                          )
                        }
                        className="space-y-1 text-xs"
                      >
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="public" id="living-public" />
                          <Label
                            htmlFor="living-public"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3 w-3 text-green-600" />
                            <span>Make visible (Public)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="private" id="living-private" />
                          <Label
                            htmlFor="living-private"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <EyeOff className="h-3 w-3 text-gray-600" />
                            <span>Make invisible (Private)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="friends" id="living-friends" />
                          <Label
                            htmlFor="living-friends"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Users className="h-3 w-3 text-purple-600" />
                            <span>Friends only</span>
                          </Label>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 cursor-pointer">
                            <RadioGroupItem value="selected" id="living-selected" />
                            <Label
                              htmlFor="living-selected"
                              className="flex items-center gap-1 cursor-pointer"
                            >
                              <User className="h-3 w-3 text-purple-600" />
                              <span>Selected users only</span>
                            </Label>
                          </div>
                          {getContainerVisibility("living") === "selected" && (
                            <div className="mt-2 border-t pt-2">
                              <UserInteractionsWidget
                                ownerUserId={authUser.id}
                                containerKey="living"
                                selectedUserIds={
                                  (profile as any).living_selected_user_ids || []
                                }
                                onChangeSelectedUserIds={(ids) =>
                                  handleSelectedUsersChange("living", ids)
                                }
                              />
                            </div>
                          )}
                        </div>
                      </RadioGroup>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </h2>
            <LivingExperiencingStories userId={authUser?.id ?? null} />
          </section>
          <section>
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-600" />
              Lived / Experienced those story(-ies)
              {!previewMode && authUser?.id && (
                <Popover open={livedSettingsOpen} onOpenChange={setLivedSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 text-teal-600 hover:text-teal-700"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Visibility</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0"
                          onClick={() => setLivedSettingsOpen(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Control who can see the stories and screenplays you
                        have already finished experiencing.
                      </p>
                      <RadioGroup
                        value={getContainerVisibility("lived")}
                        onValueChange={(val) =>
                          setContainerVisibility(
                            "lived",
                            val as "public" | "private" | "friends" | "selected",
                          )
                        }
                        className="space-y-1 text-xs"
                      >
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="public" id="lived-public" />
                          <Label
                            htmlFor="lived-public"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3 w-3 text-green-600" />
                            <span>Make visible (Public)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="private" id="lived-private" />
                          <Label
                            htmlFor="lived-private"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <EyeOff className="h-3 w-3 text-gray-600" />
                            <span>Make invisible (Private)</span>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer">
                          <RadioGroupItem value="friends" id="lived-friends" />
                          <Label
                            htmlFor="lived-friends"
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Users className="h-3 w-3 text-purple-600" />
                            <span>Friends only</span>
                          </Label>
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 cursor-pointer">
                            <RadioGroupItem value="selected" id="lived-selected" />
                            <Label
                              htmlFor="lived-selected"
                              className="flex items-center gap-1 cursor-pointer"
                            >
                              <User className="h-3 w-3 text-purple-600" />
                              <span>Selected users only</span>
                            </Label>
                          </div>
                          {getContainerVisibility("lived") === "selected" && (
                            <div className="mt-2 border-t pt-2">
                              <UserInteractionsWidget
                                ownerUserId={authUser.id}
                                containerKey="lived"
                                selectedUserIds={
                                  (profile as any).lived_selected_user_ids || []
                                }
                                onChangeSelectedUserIds={(ids) =>
                                  handleSelectedUsersChange("lived", ids)
                                }
                              />
                            </div>
                          )}
                        </div>
                      </RadioGroup>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </h2>
            <LivedExperiencedStories userId={authUser?.id ?? null} />
          </section>
        </div>

 
        {/* My Groups Section - Only shown when not in preview mode */}
        {!previewMode && authUser?.id && (
          <div className="mb-12">
            <h1 className="text-4xl font-bold mb-6 text-[#1A1F2C]">
              <EditableText id="my-groups">My Groups</EditableText>
            </h1>
            <GroupsManager userId={authUser.id} />
          </div>
        )}

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
