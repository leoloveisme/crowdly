
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Menu, X, LogOut, Bell, MessageSquare, User, Users, Heart, Gift, Settings, HelpCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useEditableContent } from "@/contexts/EditableContentContext";
import { toast } from "@/hooks/use-toast";
import EditableText from "@/components/EditableText";
import LoginForm from "@/components/LoginForm";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const CrowdlyHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("leoforce@example.com");
  const [password, setPassword] = useState("12345678qwas!");
  const [showPassword, setShowPassword] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [notificationCount, setNotificationCount] = useState(3);
  const [messageCount, setMessageCount] = useState(5);

  const { user, signIn, signOut } = useAuth();
  const { currentLanguage, setCurrentLanguage } = useEditableContent();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleLogin = () => {
    if (user) return; // Don't show login form if user is logged in
    setShowLogin(!showLogin);
  };

  const handleLanguageChange = (value: string) => {
    setCurrentLanguage(value);
    toast({
      title: "Language changed",
      description: `Content is now displayed in ${value}`,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please enter both email and password.",
        variant: "destructive"
      });
      return;
    }
    try {
      setIsLoggingIn(true);
      await signIn(email, password);
      setShowLogin(false);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  // Create initials from email for avatar
  const getInitials = (email: string) => {
    if (!email) return "U";
    const parts = email.split('@');
    if (parts.length === 0) return "U";
    const name = parts[0];
    return name.substring(0, 1).toUpperCase();
  };

  // HEADER DESIGN START
  return (
    <header className="relative z-30">
      <div className="relative bg-gradient-to-r from-pink-100/90 via-white/80 to-indigo-100/70 dark:from-background dark:via-background/80 dark:to-indigo-800/60 w-full shadow-xl border-b">
        <div className="container mx-auto max-w-7xl px-4 py-5 flex flex-col md:flex-row justify-between items-center gap-3 rounded-b-3xl drop-shadow-xl backdrop-blur">
          {/* Logo/Title */}
          <div className="flex items-center gap-4">
            <Link to="/" className="group bg-white/80 dark:bg-slate-900/50 p-3 md:p-5 rounded-2xl shadow flex items-center justify-center border border-indigo-100 dark:border-indigo-900 hover:scale-105 transition">
              <div className="text-2xl md:text-3xl font-bold bg-gradient-to-tr from-indigo-500 via-pink-500 to-violet-500 text-transparent bg-clip-text group-hover:brightness-125 transition">
                LOGO
              </div>
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent hidden md:block px-2">
              <EditableText id="header-title">
                Crowdly where YOUR entertainment is
              </EditableText>
            </h1>
          </div>

          {/* Center area: Search & language */}
          <div className="flex-1 flex justify-center items-center gap-4">
            <div className="relative hidden md:block">
              <Input 
                type="text" 
                placeholder="Search" 
                className="w-56 md:w-64 pl-10 bg-white/80 dark:bg-gray-900/60 border-none shadow-inner rounded-xl"
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-4 h-4 text-indigo-400" aria-hidden="true" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                </svg>
              </div>
            </div>
            <div className="hidden md:block">
              <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-36 shadow bg-white/80 dark:bg-gray-900/60 border-none rounded-xl">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Russian">Russian</SelectItem>
                  <SelectItem value="Chinese">中文</SelectItem>
                  <SelectItem value="Portuguese">Portuguese</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* User & Nav area */}
          <div className="flex gap-2 items-center">
            {/* Desktop nav: Authentication */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  {/* Notification Bell Icon */}
                  <Button variant="ghost" size="icon" className="relative bg-white/60 dark:bg-gray-950/70 shadow rounded-full">
                    <Bell className="h-5 w-5 text-indigo-500" />
                    {notificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                        {notificationCount}
                      </span>
                    )}
                  </Button>
                  {/* Message Icon */}
                  <Button variant="ghost" size="icon" className="relative bg-white/60 dark:bg-gray-950/70 shadow rounded-full">
                    <MessageSquare className="h-5 w-5 text-indigo-500" />
                    {messageCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                        {messageCount}
                      </span>
                    )}
                  </Button>
                  {/* User Profile Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative p-0 h-10 w-10 rounded-full bg-gradient-to-tr from-pink-100 to-indigo-200 shadow border-2 border-indigo-200 dark:bg-indigo-700/40 dark:border-indigo-800">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src="" alt={user.email || ""} />
                          <AvatarFallback className="bg-pink-300/60 text-indigo-900">
                            {getInitials(user.email || "")}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 mt-2 bg-white/95 shadow-lg border rounded-xl backdrop-blur-xl" align="end">
                      <div className="flex items-center p-2 space-x-2 border-b">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src="" alt={user.email || ""} />
                          <AvatarFallback className="bg-pink-300/60 text-indigo-900">
                            {getInitials(user.email || "")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{user.email}</span>
                        </div>
                      </div>
                      
                      <DropdownMenuGroup>
                        <DropdownMenuItem asChild>
                          <Link to="/profile" className="cursor-pointer flex items-center">
                            <User className="mr-2 h-4 w-4" /> Profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Users className="mr-2 h-4 w-4" /> Friends
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Users className="mr-2 h-4 w-4" /> Groups
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <MessageSquare className="mr-2 h-4 w-4" /> Communications
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Heart className="mr-2 h-4 w-4" /> Favorites
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Gift className="mr-2 h-4 w-4" /> Friends' recommendations
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem asChild>
                          <Link to="/account-administration" className="cursor-pointer flex items-center">
                            <Settings className="mr-2 h-4 w-4" /> Account settings
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <HelpCircle className="mr-2 h-4 w-4" /> Help
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                        <LogOut className="mr-2 h-4 w-4" /> Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <>
                  <Button variant="link" onClick={() => window.location.href = "/register"} className="text-indigo-800 font-medium hover:text-pink-600">
                    <EditableText id="header-register">Register</EditableText>
                  </Button>
                  <Button variant="link" onClick={toggleLogin} className="text-indigo-800 font-medium hover:text-pink-600">
                    <EditableText id="header-login">Login</EditableText>
                  </Button>
                </>
              )}
            </div>
            {/* Mobile menu button */}
            <Button 
              className="md:hidden text-indigo-500 bg-white/80 focus:outline-none rounded-full border border-indigo-200 shadow"
              variant="ghost"
              onClick={toggleMenu}
            >
              {isMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
            </Button>
          </div>
        </div>
        {/* Login modal */}
        {showLogin && !user && (
          <div className="container mx-auto mt-2 z-40">
            <div className="w-full md:w-64 p-4 rounded-lg shadow-lg bg-white/90 border border-indigo-200 md:absolute md:right-4 md:top-[5.6rem] z-10 relative">
              <LoginForm onClose={() => setShowLogin(false)} />
            </div>
          </div>
        )}
        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-2 transition-all">
            <div className="flex flex-col space-y-2 p-5 bg-gradient-to-b from-white/95 via-pink-50/80 to-indigo-50/60 border-t rounded-b-3xl drop-shadow-md mx-2">
              <div className="relative my-2">
                <Input
                  type="text"
                  placeholder="Search"
                  className="w-full pl-10 bg-white/50 rounded-xl"
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="w-4 h-4 text-indigo-400" aria-hidden="true" fill="none" viewBox="0 0 20 20">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                  </svg>
                </div>
              </div>
              <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-full bg-white/80 rounded-xl">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Russian">Russian</SelectItem>
                  <SelectItem value="Chinese">中文</SelectItem>
                  <SelectItem value="Portuguese">Portuguese</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="Arabic">Arabic</SelectItem>
                </SelectContent>
              </Select>
              {user ? (
                <>
                  <div className="text-sm font-medium py-2 px-3 rounded-lg bg-pink-50/80 dark:bg-indigo-900/40">{user.email}</div>
                  <Link to="/profile" className="flex items-center py-2 text-indigo-900 hover:underline">
                    <User className="h-4 w-4 mr-2" /> Profile
                  </Link>
                  <div className="flex items-center py-2">
                    <Users className="h-4 w-4 mr-2" /> Friends
                  </div>
                  <div className="flex items-center py-2">
                    <Users className="h-4 w-4 mr-2" /> Groups
                  </div>
                  <div className="flex items-center py-2">
                    <MessageSquare className="h-4 w-4 mr-2" /> Communications
                  </div>
                  <div className="flex items-center py-2">
                    <Heart className="h-4 w-4 mr-2" /> Favorites
                  </div>
                  <div className="flex items-center py-2">
                    <Gift className="h-4 w-4 mr-2" /> Friends' recommendations
                  </div>
                  <div className="flex items-center py-2">
                    <Settings className="h-4 w-4 mr-2" /> Account settings
                  </div>
                  <div className="flex items-center py-2">
                    <HelpCircle className="h-4 w-4 mr-2" /> Help
                  </div>
                  <Button variant="outline" onClick={handleLogout} className="flex items-center justify-center mt-2 rounded-xl">
                    <LogOut className="h-4 w-4 mr-1" /> 
                    <EditableText id="mobile-logout">Sign out</EditableText>
                  </Button>
                </>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => window.location.href = "/register"}>
                    <EditableText id="mobile-register">Register</EditableText>
                  </Button>
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={toggleLogin}>
                    <EditableText id="mobile-login">Login</EditableText>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default CrowdlyHeader;
