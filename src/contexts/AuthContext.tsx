
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export type UserRole =
  | "platform_admin"
  | "platform_supporter"
  | "ui_translator"
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
  // Clears the cached user without a server round-trip, for callers that
  // already know the session is dead (e.g. a background fetch got a 401)
  // rather than the user actively signing out.
  clearSession: () => void;
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

  // Show the cached user immediately (avoids a logged-out flash while the
  // /auth/me round-trip below is in flight), then confirm it against the
  // backend — the cache has no way to know if the session behind it has
  // since expired or been logged out elsewhere, so it can't be trusted on
  // its own.
  useEffect(() => {
    let cancelled = false;

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
    }

    (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (cancelled) return;

        if (!response.ok) {
          // No valid session server-side (expired, logged out elsewhere,
          // cookie cleared) — the cached user, if any, is stale.
          setUser(null);
          setRoles([]);
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        const data = (await response.json()) as AuthResponse;
        const nextUser: UserWithRoles = { id: data.id, email: data.email, roles: data.roles };
        setUser(nextUser);
        setRoles(data.roles ?? []);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      } catch (err) {
        // Network error reaching the backend — leave the cached user in
        // place rather than logging them out over a transient outage.
        console.error("Failed to verify session", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasRole = (role: UserRole): boolean => {
    return roles.includes(role);
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include", // required to store the session cookie the backend sets
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
      // Invalidate the session server-side too, not just locally — a stolen
      // cookie should stop working the moment the real user logs out.
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch((err) => {
        console.error("Failed to invalidate session server-side:", err);
      });
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

  const clearSession = () => {
    setUser(null);
    setRoles([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value: AuthContextType = {
    user,
    loading,
    roles,
    hasRole,
    signIn,
    signOut,
    clearSession,
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
