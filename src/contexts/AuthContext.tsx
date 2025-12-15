
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export type UserRole =
  | "platform_admin"
  | "platform_supporter"
  | "consumer"
  | "author"
  | "editor"
  | "chief_editor"
  | "producer"
  | "contributor";

export type UserWithRoles = {
  id: string;
  email: string;
  roles?: UserRole[];
};

interface AuthContextType {
  user: UserWithRoles | null;
  loading: boolean;
  roles: UserRole[];
  hasRole: (role: UserRole) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthResponse {
  id: string;
  email: string;
  roles: UserRole[];
}

// Default to same-origin API calls in development; Vite dev proxy will
// forward to the backend (see vite.config.ts). In production, you can
// override with VITE_API_BASE_URL if the API is on a different origin.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";
const STORAGE_KEY = "crowdly_auth_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const navigate = useNavigate();

  // Load persisted user on first mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserWithRoles;
        setUser(parsed);
        setRoles(parsed.roles ?? []);
      }
    } catch (err) {
      console.error("Failed to parse stored auth user", err);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasRole = (role: UserRole): boolean => {
    return roles.includes(role);
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error || "Invalid email or password";
        toast({
          title: "Login failed",
          description: message,
          variant: "destructive",
        });
        throw new Error(message);
      }

      const data = (await response.json()) as AuthResponse;

      const nextUser: UserWithRoles = {
        id: data.id,
        email: data.email,
        roles: data.roles,
      };

      setUser(nextUser);
      setRoles(data.roles ?? []);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));

      toast({
        title: "Login successful",
        description: "Welcome back!",
      });

      navigate("/");
    } catch (error) {
      console.error("Error during sign in:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setUser(null);
      setRoles([]);
      localStorage.removeItem(STORAGE_KEY);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      navigate("/");
    } catch (error) {
      console.error("Error during sign out:", error);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    roles,
    hasRole,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
