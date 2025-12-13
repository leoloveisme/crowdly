
import React, { useState } from "react";
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

const AccountAdministration = () => {
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
  
  // Mock user data
  const userData = {
    name: "John",
    phoneNumber: "+xxx xxxx xxxx",
    email: "x@x.x",
    username: "xxx",
    accountNumber: "xxx"
  };

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
                <span>{userData.phoneNumber}</span>
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
                <span>{userData.email}</span>
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
                <span>{userData.username}</span>
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
              <div className="w-8 text-gray-400"></div>
              <div className="w-1/3">account nr</div>
              <div className="w-1/3 flex items-center">
                <span>{userData.accountNumber}</span>
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
                  
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Change</Button>
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
                  
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Delete forever</Button>
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
