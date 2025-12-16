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
  username: ""    // <-- Add this line
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
  const [contributionFilter, setContributionFilter] = useState("total");

  // Stats for the stats display component
  const statsOverview = {
    stories: 5,
    views: 50,
    likes: 10,
    contributions: 5
  };

  // Stats for stories and contributions
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

  // Updated contributions data to match the screenshot
  const contributions = [
    { 
      id: 1, 
      storyTitle: "The story title", 
      chapterName: "In the unknown",  
      date: "2023-05-01",
      time: "11:28",
      words: 550,
      likes: 3,
      status: "approved"
    },
    { 
      id: 2, 
      storyTitle: "Another story", 
      chapterName: "Chapter 5",
      date: "2023-05-03",
      time: "14:15",
      words: 320,
      likes: 7,
      status: "denied"
    },
    { 
      id: 3, 
      storyTitle: "Epic Journey", 
      chapterName: "Introduction",
      date: "2023-05-05",
      time: "09:45",
      words: 480,
      likes: 12,
      status: "undecided"
    }
  ];

  // Filter for contributions (for StatsDisplay)
  const filteredContributions = contributions.filter(contribution => {
    if (contributionFilter === "total") return true;
    return contribution.status === contributionFilter;
  });

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

  // Load or create profile for current user (Supabase legacy)
  // When using local auth (authUser), skip Supabase and just use the
  // in-memory INITIAL_PROFILE to avoid network errors against paused
  // Supabase projects.
  useEffect(() => {
    if (!userId || !userEmail) return;

    // If we have a local-auth user, skip Supabase profile entirely
    if (authUser) {
      console.log('[Profile] Skipping Supabase profile fetch because local auth user is present');
      setIsLoading(false);
      return;
    }

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
          // If Supabase is unreachable, avoid noisy toasts
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
          // Create an empty profile (must provide required username)
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
  }, [userId, userEmail, authUser]);

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

  // Save profile field (generic handler)
  const saveProfileField = async (key: keyof typeof profile, value: any) => {
    if (!userId) return;
    setProfile((prev) => ({ ...prev, [key]: value }));
    const updateObj: any = {};
    updateObj[key] = value;
    const { error } = await supabase.from("profiles").update(updateObj).eq("id", userId);
    if (error) {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Saved",
        description: `Your ${key.replace(/_/g, " ")} has been updated.`,
        duration: 1500
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

  // Avatar/image
  const handleProfileImageChange = (imageUrl: string) => {
    saveProfileField("profile_image_url", imageUrl);
    setProfile((p) => ({ ...p, profile_image_url: imageUrl }));
    setIsUploadDialogOpen(false);
  };

  // Bio/about
  const handleBioSave = (bio: string) => {
    saveProfileField("bio", bio);
    setProfile((p) => ({ ...p, bio }));
  };

  // Editing fields (allow generic for text fields)
  const startEditing = (field: string, value: string) => {
    if (previewMode) return;
    setEditField(field);
    setTempFieldValue(value || "");
  };
  const saveField = () => {
    if (!editField) return;
    saveProfileField(editField as keyof typeof profile, tempFieldValue);
    setEditField(null);
  };
  const cancelEditing = () => setEditField(null);

  // Languages
  const handleAddLanguage = (lang: string) => {
    if (!lang || profile.languages.includes(lang)) return;
    const updated = [...profile.languages, lang];
    saveProfileField("languages", updated);
    setProfile((p) => ({ ...p, languages: updated }));
    setNewLanguage("");
  };
  const handleRemoveLanguage = (lang: string) => {
    const updated = profile.languages.filter((l: string) => l !== lang);
    saveProfileField("languages", updated);
    setProfile((p) => ({ ...p, languages: updated }));
  };

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
                    className="space-y-2"
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
                  {profile.profile_image_url ? (
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
              {/* Editable fields */}
              {/* First Name */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-500">
                    <EditableText id="first-name">First name</EditableText>
                  </Label>
                  {!previewMode && editField === 'first_name' ? (
                    <div className="flex space-x-2">
                      <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-6 w-6 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={saveField} className="h-6 w-6 p-0 text-green-600">
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : !previewMode ? (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => startEditing('first_name', profile.first_name)}
                      className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                    >
                      <EditableText id="edit-button">Edit</EditableText>
                    </Button>
                  ) : null}
                </div>
                {!previewMode && editField === 'first_name' ? (
                  <Input 
                    value={tempFieldValue}
                    onChange={(e) => setTempFieldValue(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                ) : (
                  <div className="font-medium">{profile.first_name || <span className="text-gray-400 italic">No first name set</span>}</div>
                )}
              </div>
              {/* Last Name */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-500">
                    <EditableText id="last-name">Last name</EditableText>
                  </Label>
                  {!previewMode && editField === 'last_name' ? (
                    <div className="flex space-x-2">
                      <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-6 w-6 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={saveField} className="h-6 w-6 p-0 text-green-600">
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : !previewMode ? (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => startEditing('last_name', profile.last_name)}
                      className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                    >
                      <EditableText id="edit-button">Edit</EditableText>
                    </Button>
                  ) : null}
                </div>
                {!previewMode && editField === 'last_name' ? (
                  <Input 
                    value={tempFieldValue}
                    onChange={(e) => setTempFieldValue(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                ) : (
                  <div className="font-medium text-gray-800">{profile.last_name || <span className="text-gray-400 italic">No last name set</span>}</div>
                )}
              </div>
              {/* Nickname */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-500">
                    <EditableText id="nickname-label">Nickname</EditableText>
                  </Label>
                  {!previewMode && editField === 'nickname' ? (
                    <div className="flex space-x-2">
                      <Button size="sm" variant="ghost" onClick={cancelEditing} className="h-6 w-6 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={saveField} className="h-6 w-6 p-0 text-green-600">
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : !previewMode ? (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => startEditing('nickname', profile.nickname)}
                      className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                    >
                      <EditableText id="edit-button">Edit</EditableText>
                    </Button>
                  ) : null}
                </div>
                {!previewMode && editField === 'nickname' ? (
                  <Input 
                    value={tempFieldValue}
                    onChange={(e) => setTempFieldValue(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                ) : (
                  <div className="font-medium text-gray-800">
                    {profile.nickname ? profile.nickname : (
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
                {!previewMode && editField === "birthday" ? (
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={tempFieldValue}
                      onChange={e => setTempFieldValue(e.target.value)}
                    />
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={saveField}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : !previewMode ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditing("birthday", profile.birthday || "")}
                    className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                  >
                    <EditableText id="edit-button">Edit</EditableText>
                  </Button>
                ) : null}
                {!previewMode && editField === "birthday" ? null : (
                  <div className="font-medium text-gray-800">
                    {profile.birthday ? new Date(profile.birthday).toLocaleDateString() : <span className="text-gray-400 italic">No birthday set</span>}
                  </div>
                )}
              </div>
              {/* Telephone */}
              <div className="space-y-1">
                <Label className="text-sm text-gray-500">
                  <Smartphone className="w-4 h-4 inline mb-1 mr-1" /> Telephone (optional)
                </Label>
                {!previewMode && editField === "telephone" ? (
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={tempFieldValue}
                      onChange={e => setTempFieldValue(e.target.value)}
                    />
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={saveField}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : !previewMode ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEditing("telephone", profile.telephone || "")}
                    className="h-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-transparent"
                  >
                    <EditableText id="edit-button">Edit</EditableText>
                  </Button>
                ) : null}
                {!previewMode && editField === "telephone" ? null : (
                  <div className="font-medium text-gray-800">
                    {profile.telephone ? profile.telephone : <span className="text-gray-400 italic">No telephone set</span>}
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
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          handleAddLanguage(newLanguage);
                          setNewLanguage("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        handleAddLanguage(newLanguage);
                        setNewLanguage("");
                      }}
                      size="sm"
                    >
                      <EditableText id="add-language">Add</EditableText>
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {profile.languages.map((lang, idx) => (
                    <div key={idx} className="bg-gray-100 rounded-full px-3 py-1 flex items-center gap-1">
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
                  ))}
                </div>
              </div>
              {/* Socials */}
              <div className="space-y-1">
                <Label className="text-sm text-gray-500">
                  <Facebook className="w-4 h-4 inline mb-1 mr-1" /> Facebook
                </Label>
                <Input
                  value={profile.social_facebook || ""}
                  onChange={e => handleSocialChange("social_facebook", e.target.value)}
                  placeholder="Facebook username/url"
                  disabled={previewMode}
                />
                <Label className="text-sm text-gray-500">
                  <Instagram className="w-4 h-4 inline mb-1 mr-1" /> Instagram
                </Label>
                <Input
                  value={profile.social_instagram || ""}
                  onChange={e => handleSocialChange("social_instagram", e.target.value)}
                  placeholder="Instagram username/url"
                  disabled={previewMode}
                />
                <Label className="text-sm text-gray-500">Snapchat</Label>
                <Input
                  value={profile.social_snapchat || ""}
                  onChange={e => handleSocialChange("social_snapchat", e.target.value)}
                  placeholder="Snapchat"
                  disabled={previewMode}
                />
                <Label className="text-sm text-gray-500">Other Social</Label>
                <Input
                  value={profile.social_other || ""}
                  onChange={e => handleSocialChange("social_other", e.target.value)}
                  placeholder="Other social"
                  disabled={previewMode}
                />
              </div>
            </div>
          </div>
        </div>

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
          <div className="mb-12">
            <StatsDisplay
              stats={statsOverview}
              contributions={filteredContributions}
              onFilterChange={setContributionFilter}
              currentFilter={contributionFilter}
            />
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
                <EditableText id="contributions-heading">Contributions</EditableText>
              </h3>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center">
                  <HelpCircle className="h-4 w-4 text-gray-400 mr-2" />
                </div>
                <div className="flex space-x-4 text-sm">
                  <button 
                    className={`${contributionFilter === 'total' ? 'text-blue-500' : 'text-gray-500'}`}
                    onClick={() => setContributionFilter('total')}
                  >
                    <EditableText id="filter-total">total</EditableText>
                  </button>
                  <button 
                    className={`${contributionFilter === 'approved' ? 'text-blue-500' : 'text-gray-500'}`}
                    onClick={() => setContributionFilter('approved')}
                  >
                    <EditableText id="filter-approved">approved</EditableText>
                  </button>
                  <button 
                    className={`${contributionFilter === 'denied' ? 'text-blue-500' : 'text-gray-500'}`}
                    onClick={() => setContributionFilter('denied')}
                  >
                    <EditableText id="filter-denied">denied</EditableText>
                  </button>
                  <button 
                    className={`${contributionFilter === 'undecided' ? 'text-blue-500' : 'text-gray-500'}`}
                    onClick={() => setContributionFilter('undecided')}
                  >
                    <EditableText id="filter-undecided">undecided</EditableText>
                  </button>
                </div>
              </div>
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

        <Link 
          to="/account-administration" 
          className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
        >
          <EditableText id="account-administration">
            Account Administration
          </EditableText>
        </Link>
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default Profile;
