import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { API_BASE, ApiError } from "@/lib/apiBase";
import {
  AppNotification,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead as apiMarkNotificationRead,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
} from "@/lib/notificationsApi";
import { getConversationUnreadCount, Message } from "@/lib/messagesApi";

export interface LiveMessageEvent {
  conversationId: string;
  message: Message;
  receivedAt: number;
}

interface LiveUpdatesContextType {
  notifications: AppNotification[];
  unreadNotificationCount: number;
  unreadMessageCount: number;
  lastMessageEvent: LiveMessageEvent | null;
  refresh: () => void;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const LiveUpdatesContext = createContext<LiveUpdatesContextType | undefined>(undefined);

export const LiveUpdatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, clearSession } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [lastMessageEvent, setLastMessageEvent] = useState<LiveMessageEvent | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const sourceRef = useRef<EventSource | null>(null);

  // A 401 here means the session died after AuthContext's initial check
  // (expired mid-visit, logged out in another tab) — drop the stale cached
  // user rather than silently leaving the bell/badges frozen at whatever
  // they last showed. Any other failure (network blip) is just logged.
  const handleFetchError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        return;
      }
      console.error("[LiveUpdates] refresh failed", err);
    },
    [clearSession],
  );

  const refresh = useCallback(() => {
    if (!user) return;
    listNotifications().then((data) => setNotifications(data.notifications)).catch(handleFetchError);
    getUnreadNotificationCount().then((data) => setUnreadNotificationCount(data.count)).catch(handleFetchError);
    getConversationUnreadCount().then((data) => setUnreadMessageCount(data.count)).catch(handleFetchError);
  }, [user, handleFetchError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live push over SSE. Native EventSource auto-reconnects on drop, so no
  // manual retry loop is needed here — only teardown on logout/unmount.
  useEffect(() => {
    if (!user) {
      sourceRef.current?.close();
      sourceRef.current = null;
      return;
    }

    const source = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener("notification", (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      const notification = data.notification as AppNotification;
      setNotifications((prev) => [notification, ...prev]);
      setUnreadNotificationCount((prev) => prev + 1);
      setAnnouncement(
        notification.type === "friend_request"
          ? `New friend request from ${notification.payload.fromEmail ?? "someone"}`
          : `${notification.payload.byEmail ?? "Someone"} accepted your friend request`,
      );
    });

    source.addEventListener("message", (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      setUnreadMessageCount((prev) => prev + 1);
      setLastMessageEvent({ conversationId: data.conversationId, message: data.message, receivedAt: Date.now() });
      setAnnouncement("New message received");
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [user]);

  const markNotificationRead = useCallback(async (id: string) => {
    await apiMarkNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadNotificationCount((prev) => Math.max(prev - 1, 0));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await apiMarkAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadNotificationCount(0);
  }, []);

  return (
    <LiveUpdatesContext.Provider
      value={{
        notifications,
        unreadNotificationCount,
        unreadMessageCount,
        lastMessageEvent,
        refresh,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
      {/* Screen-reader announcement for live events — the badge count change
          alone is silent to anyone not looking at it. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </LiveUpdatesContext.Provider>
  );
};

export const useLiveUpdates = () => {
  const context = useContext(LiveUpdatesContext);
  if (context === undefined) {
    throw new Error("useLiveUpdates must be used within a LiveUpdatesProvider");
  }
  return context;
};
