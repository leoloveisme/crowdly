
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
  DialogFooter
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, EyeOff, Info, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

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
  const [profile, setProfile] = useState<any | null>(null);
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
          console.error('[AccountAdministration] Failed to load profile', { status: res.status, body });
          toast({
            title: "Failed to load account data",
            description: body.error || "Could not load your account information.",
            variant: "destructive",
          });
          return;
        }
        setProfile(body);
      } catch (err) {
        console.error('[AccountAdministration] Error loading profile', err);
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
      console.error('[AccountAdministration] change password failed', err);
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
        const title = res.status === 401 ? "Incorrect password" : "Failed to delete account";
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
      console.error('[AccountAdministration] delete account failed', err);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <main className="flex-grow flex items-center justify-center">
          <p className="text-gray-500">Loading account information...</p>
        </main>
        <CrowdlyFooter />
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <main className="flex-grow container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-center mb-4">Account administration</h1>
          <p className="text-center text-gray-600">
            You need to be signed in to manage your account. {" "}
            <Link to="/login" className="text-blue-500 underline">Log in</Link>
          </p>
        </main>
        <CrowdlyFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Account administration</h1>
        
        <div className="grid md:grid-cols-4 gap-6">
          {/* Left sidebar navigation */}
          <div className="space-y-4">
            <div className="text-blue-500 hover:underline">
              <Link to="#telephone">telephone number</Link>
            </div>
            <div className="text-blue-500 hover:underline">
              <Link to="#email">e-mail</Link>
            </div>
            <div className="text-blue-500 hover:underline">
              <Link to="#username">username</Link>
            </div>
            <div className="text-blue-500 hover:underline">
              <Link to="#password">password</Link>
            </div>
            <div className="text-blue-500 hover:underline">
              <Link to="#account">account</Link>
            </div>
            
            <h2 className="text-xl font-bold mt-8">Notifications</h2>
            
            <div className="mt-4">
              <h3 className="font-medium mb-2">Messages</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="app-messages" />
                  <label htmlFor="app-messages">app</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="web-messages" />
                  <label htmlFor="web-messages">web</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="email-messages" />
                  <label htmlFor="email-messages">e-mail</label>
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <h3 className="font-medium mb-2">Platform notifications</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="app-platform" />
                  <label htmlFor="app-platform">app</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="web-platform" />
                  <label htmlFor="web-platform">web</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="email-platform" />
                  <label htmlFor="email-platform">e-mail</label>
                </div>
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="font-bold">Default settings<br />for new stories</h3>
              <div className="space-y-2 mt-2">
                <div className="text-blue-500 hover:underline">
                  <Link to="#text">text</Link>
                </div>
                <div className="text-blue-500 hover:underline">
                  <Link to="#images">images</Link>
                </div>
                <div className="text-blue-500 hover:underline">
                  <Link to="#audio">audio</Link>
                </div>
                <div className="text-blue-500 hover:underline">
                  <Link to="#video">video</Link>
                </div>
              </div>
            </div>
          </div>
          
          {/* Main content area */}
          <div className="col-span-3 space-y-6">
            <div id="telephone" className="flex items-center">
              <div className="w-8 text-gray-400">▲</div>
              <div className="w-1/3">telephone number</div>
              <div className="w-1/3 flex items-center">
                <span>{phoneNumber}</span>
                <Info className="ml-2 h-4 w-4 text-gray-400" />
              </div>
              <div className="flex space-x-2">
                <button className="text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5H9C7.89543 5 7 5.89543 7 7V17C7 18.1046 7.89543 19 9 19H15C16.1046 19 17 18.1046 17 17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 3L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 3L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className="text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 6L5 20M19 20L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div id="email" className="flex items-center">
              <div className="w-8 text-gray-400">▲</div>
              <div className="w-1/3">e-mail</div>
              <div className="w-1/3 flex items-center">
                <span>{email}</span>
                <Info className="ml-2 h-4 w-4 text-gray-400" />
              </div>
              <div className="flex space-x-2">
                <button className="text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5H9C7.89543 5 7 5.89543 7 7V17C7 18.1046 7.89543 19 9 19H15C16.1046 19 17 18.1046 17 17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 3L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 3L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className="text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 6L5 20M19 20L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div id="username" className="flex items-center">
              <div className="w-8 text-gray-400">▲</div>
              <div className="w-1/3">user name</div>
              <div className="w-1/3 flex items-center">
                <span>{username}</span>
                <Info className="ml-2 h-4 w-4 text-gray-400" />
              </div>
              <div>
                <button className="text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5H9C7.89543 5 7 5.89543 7 7V17C7 18.1046 7.89543 19 9 19H15C16.1046 19 17 18.1046 17 17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 3L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 3L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div id="password" className="flex items-center">
              <div className="w-8 text-gray-400">
                <Info className="h-4 w-4" />
              </div>
              <div className="w-2/3">can be changed at any time</div>
            </div>
            
            <div id="account" className="flex items-center">
              <div className="w8 text-gray-400"></div>
              <div className="w-1/3">account nr</div>
              <div className="w-1/3 flex items-center">
                <span>{accountNumber}</span>
                <Info className="ml-2 h-4 w-4 text-gray-400" />
              </div>
            </div>
            
            <div className="flex items-center">
              <div className="w-8 text-gray-400">
                <Info className="h-4 w-4" />
              </div>
              <div className="w-2/3">cannot be neither changed nor deleted</div>
            </div>
            
            {/* Password change dialog */}
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <div className="absolute right-4 top-4">
                  <X 
                    className="h-4 w-4 cursor-pointer opacity-70" 
                    onClick={() => setIsPasswordDialogOpen(false)} 
                  />
                </div>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label htmlFor="current-password">Type your current password, please</label>
                    <div className="relative">
                      <Input 
                        id="current-password" 
                        type={showCurrentPassword ? "text" : "password"} 
                        className="pr-10" 
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)} 
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="new-password">Type your new password, please</label>
                    <div className="relative">
                      <Input 
                        id="new-password" 
                        type={showNewPassword ? "text" : "password"} 
                        className="pr-10" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowNewPassword(!showNewPassword)} 
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                  >
                    {isChangingPassword ? "Changing..." : "Change"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <div className="pt-6">
              <Button 
                variant="link" 
                className="text-blue-500 p-0 h-auto"
                onClick={() => setIsPasswordDialogOpen(true)}
              >
                Change password
              </Button>
            </div>
            
            <div className="pt-4">
              <Button 
                variant="link" 
                className="text-blue-500 p-0 h-auto"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                Delete account
              </Button>
            </div>
            
            {/* Delete account confirmation dialog */}
            <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Do you really want to delete your account?</AlertDialogTitle>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsDeleteConfirmOpen(false)}>No</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => {
                      setIsDeleteConfirmOpen(false);
                      setIsFinalDeleteOpen(true);
                    }}
                  >
                    Yes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {/* Final delete confirmation with password */}
            <Dialog open={isFinalDeleteOpen} onOpenChange={setIsFinalDeleteOpen}>
              <DialogContent className="sm:max-w-md">
                <div className="absolute right-4 top-4">
                  <X 
                    className="h-4 w-4 cursor-pointer opacity-70" 
                    onClick={() => setIsFinalDeleteOpen(false)} 
                  />
                </div>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label htmlFor="delete-password">Type your current password, please</label>
                    <div className="relative">
                      <Input 
                        id="delete-password" 
                        type={showDeletePassword ? "text" : "password"} 
                        className="pr-10" 
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowDeletePassword(!showDeletePassword)} 
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        {showDeletePassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                  >
                    {isDeletingAccount ? "Deleting..." : "Delete forever"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </main>
      
      <CrowdlyFooter />
    </div>
  );
};

export default AccountAdministration;
