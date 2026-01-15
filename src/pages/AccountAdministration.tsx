
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Eye,
  EyeOff,
  Info,
  Phone,
  Mail,
  User,
  Lock,
  Hash,
  Bell,
  FileText,
  Image,
  Volume2,
  Video,
  Pencil,
  Trash2,
  Settings,
  ChevronRight,
  Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

type Profile = {
  telephone?: string | null;
  username?: string | null;
};

const AccountAdministration = () => {
  const { user: authUser, signOut } = useAuth();
  const { toast } = useToast();

  // State for showing password fields
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  // State for password change dialog
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  // State for delete account confirmation
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // State for final delete confirmation with password
  const [isFinalDeleteOpen, setIsFinalDeleteOpen] = useState(false);

  // Account/profile data
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser?.id) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const res = await fetch(`${API_BASE}/profiles/${authUser.id}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[AccountAdministration] Failed to load profile", {
            status: res.status,
            body,
          });
          toast({
            title: "Failed to load account data",
            description: body.error || "Could not load your account information.",
            variant: "destructive",
          });
          return;
        }
        setProfile(body as Profile);
      } catch (err) {
        console.error("[AccountAdministration] Error loading profile", err);
        toast({
          title: "Failed to load account data",
          description: "Network error while loading account information.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [authUser, toast]);

  const handleChangePassword = async () => {
    if (!authUser) {
      toast({
        title: "Not signed in",
        description: "Please sign in again to change your password.",
        variant: "destructive",
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in both current and new password.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsChangingPassword(true);
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUser.id,
          currentPassword,
          newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Failed to change password",
          description: body.error || "Could not update your password.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Password changed",
        description: "Your password has been updated.",
      });
      setIsPasswordDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      console.error("[AccountAdministration] change password failed", err);
      toast({
        title: "Failed to change password",
        description: "Network error while updating your password.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!authUser) {
      toast({
        title: "Not signed in",
        description: "Please sign in again before deleting your account.",
        variant: "destructive",
      });
      return;
    }

    if (!deletePassword) {
      toast({
        title: "Missing password",
        description: "Please enter your current password to confirm deletion.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeletingAccount(true);
      const res = await fetch(`${API_BASE}/auth/delete-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authUser.id, password: deletePassword }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const title =
          res.status === 401 ? "Incorrect password" : "Failed to delete account";
        toast({
          title,
          description: body.error || "Could not delete your account.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      setIsFinalDeleteOpen(false);
      setDeletePassword("");
      await signOut();
    } catch (err) {
      console.error("[AccountAdministration] delete account failed", err);
      toast({
        title: "Failed to delete account",
        description: "Network error while deleting your account.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const phoneNumber = profile?.telephone || "Not set";
  const email = authUser?.email || "Not set";
  const username = profile?.username || "Not set";
  const accountNumber = authUser ? authUser.id.slice(0, 8) : "—";

  const navItems = [
    { id: "telephone", label: "Telephone number", icon: Phone },
    { id: "email", label: "E-mail", icon: Mail },
    { id: "username", label: "Username", icon: User },
    { id: "password", label: "Password", icon: Lock },
    { id: "account", label: "Account", icon: Hash },
  ];

  const storySettings = [
    { id: "novels", label: "Novels", icon: FileText },
    { id: "screenplays", label: "Screenplays", icon: FileText },
    { id: "images", label: "Images", icon: Image },
    { id: "audio", label: "Audio", icon: Volume2 },
    { id: "video", label: "Video", icon: Video },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
        <CrowdlyHeader />
        <main className="flex-grow flex items-center justify-center">
          <p className="text-muted-foreground">Loading account information...</p>
        </main>
        <CrowdlyFooter />
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
        <CrowdlyHeader />
        <main className="flex-grow container mx-auto px-4 py-8 flex flex-col items-center justify-center">
          <div className="text-center max-w-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Account Administration
            </h1>
            <p className="text-muted-foreground mb-4">
              You need to be signed in to manage your account.
            </p>
            <Button asChild className="px-6">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </main>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <CrowdlyHeader />

      <main className="flex-grow container mx-auto px-4 py-8 animate-fade-in">
        {/* Page Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Settings className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Account Administration
          </h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {/* Left sidebar navigation */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Navigation Card */}
            <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  Quick Navigation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.id}
                    to={`#${item.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200 group"
                  >
                    <item.icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Notifications Card */}
            <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h3 className="font-medium text-sm text-foreground mb-3">
                    Messages
                  </h3>
                  <div className="space-y-2.5">
                    {["app", "web", "e-mail"].map((type) => (
                      <div
                        key={type}
                        className="flex items-center space-x-3"
                      >
                        <Checkbox
                          id={`${type}-messages`}
                          className="border-muted-foreground/30"
                        />
                        <Label
                          htmlFor={`${type}-messages`}
                          className="text-sm text-muted-foreground cursor-pointer capitalize"
                        >
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div>
                  <h3 className="font-medium text-sm text-foreground mb-3">
                    Platform notifications
                  </h3>
                  <div className="space-y-2.5">
                    {["app", "web", "e-mail"].map((type) => (
                      <div
                        key={type}
                        className="flex items-center space-x-3"
                      >
                        <Checkbox
                          id={`${type}-platform`}
                          className="border-muted-foreground/30"
                        />
                        <Label
                          htmlFor={`${type}-platform`}
                          className="text-sm text-muted-foreground cursor-pointer capitalize"
                        >
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Story Settings Card */}
            <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Default Story Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {storySettings.map((item) => (
                  <Link
                    key={item.id}
                    to={`#${item.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200 group"
                  >
                    <item.icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main content area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Account Details Card */}
            <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {/* Telephone Row */}
                <div
                  id="telephone"
                  className="flex items-center py-4 px-4 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-10 flex-shrink-0">
                    <Phone className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      Telephone number
                    </p>
                    <p className="text-foreground font-medium">
                      {phoneNumber}
                    </p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground/50 mr-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your phone number for account recovery</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* Email Row */}
                <div
                  id="email"
                  className="flex items-center py-4 px-4 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-10 flex-shrink-0">
                    <Mail className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      E-mail
                    </p>
                    <p className="text-foreground font-medium">{email}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground/50 mr-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your primary email address</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* Username Row */}
                <div
                  id="username"
                  className="flex items-center py-4 px-4 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-10 flex-shrink-0">
                    <User className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      Username
                    </p>
                    <p className="text-foreground font-medium">{username}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground/50 mr-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your unique username</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>

                <Separator className="bg-border/30" />

                {/* Password Info Row */}
                <div
                  id="password"
                  className="flex items-center py-4 px-4 rounded-lg bg-primary/5"
                >
                  <div className="w-10 flex-shrink-0">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Password can be changed at any time
                    </p>
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* Account Number Row */}
                <div
                  id="account"
                  className="flex items-center py-4 px-4 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-10 flex-shrink-0">
                    <Hash className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      Account number
                    </p>
                    <p className="text-foreground font-medium font-mono">
                      {accountNumber}
                    </p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground/50 mr-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your unique account identifier</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Account Number Info */}
                <div className="flex items-center py-3 px-4 rounded-lg bg-amber-500/10 mt-2">
                  <div className="w-10 flex-shrink-0">
                    <Info className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Account number cannot be changed or deleted
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Account Actions Card */}
            <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl">Account Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto justify-start gap-2 h-11 px-6 border-primary/20 hover:border-primary hover:bg-primary/5"
                  onClick={() => setIsPasswordDialogOpen(true)}
                >
                  <Lock className="w-4 h-4" />
                  Change Password
                </Button>

                <div className="pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground mb-3">
                    Danger Zone
                  </p>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto justify-start gap-2 h-11 px-6 border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive/5"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Password change dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPasswordDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={handleChangePassword}
              disabled={isChangingPassword}
            >
              {isChangingPassword ? "Changing..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete account confirmation dialog */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your account? This action cannot be
              undone and all your data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                setIsFinalDeleteOpen(true);
              }}
            >
              Yes, delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Final delete confirmation with password */}
      <Dialog open={isFinalDeleteOpen} onOpenChange={setIsFinalDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Confirm Account Deletion
            </DialogTitle>
            <DialogDescription>
              Please enter your password to confirm account deletion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Password</Label>
              <div className="relative">
                <Input
                  id="delete-password"
                  type={showDeletePassword ? "text" : "password"}
                  className="pr-10"
                  placeholder="Enter your password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDeletePassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFinalDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? "Deleting..." : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CrowdlyFooter />
    </div>
  );
};

export default AccountAdministration;
