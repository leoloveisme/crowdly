import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveUpdates } from "@/contexts/LiveUpdatesContext";
import {
  ConversationSummary,
  Message,
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
  openConversationWith,
} from "@/lib/messagesApi";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

interface CommunicationsSectionProps {
  // Deep-link into a specific friend's thread (used by the header's message
  // icon and the Friends page's "Message" button). Opens/creates the
  // conversation lazily via GET /conversations/with/:friendUserId.
  initialFriendId?: string;
}

const CommunicationsSection: React.FC<CommunicationsSectionProps> = ({ initialFriendId }) => {
  const { user } = useAuth();
  const { lastMessageEvent, refresh: refreshLiveUpdates } = useLiveUpdates();

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await listConversations();
      setConversations(data.conversations);
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load conversations", err);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialFriendId) return;
    openConversationWith(initialFriendId)
      .then((data) => setSelectedId(data.conversation.id))
      .catch((err) => {
        console.error("Failed to open conversation", err);
        toast({ title: "Couldn't open conversation", description: "You may not be friends with this user.", variant: "destructive" });
      });
  }, [initialFriendId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages(null);
      return;
    }
    let cancelled = false;
    setMessages(null);
    listMessages(selectedId)
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch((err) => console.error("Failed to load messages", err));
    markConversationRead(selectedId)
      .then(refreshLiveUpdates)
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshLiveUpdates]);

  // Live message arrival: append to the open thread if it matches, and
  // always refresh the list so previews/ordering stay current.
  useEffect(() => {
    if (!lastMessageEvent) return;
    if (lastMessageEvent.conversationId === selectedId) {
      setMessages((prev) => (prev ? [...prev, lastMessageEvent.message] : prev));
      markConversationRead(selectedId).then(refreshLiveUpdates).catch(() => {});
    }
    loadConversations();
  }, [lastMessageEvent, selectedId, loadConversations, refreshLiveUpdates]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      const { message } = await sendMessage(selectedId, body);
      setMessages((prev) => (prev ? [...prev, message] : [message]));
      setDraft("");
      loadConversations();
    } catch (err) {
      toast({ title: "Couldn't send message", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const selectedConversation = conversations?.find((c) => c.conversationId === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-[#1A1F2C]">
        <EditableText id="communication">Communication</EditableText>
      </h1>

      {loadError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-3">
              <EditableText id="communications-load-error">Couldn't load your messages. Please try again.</EditableText>
            </p>
            <Button onClick={loadConversations}>
              <EditableText id="communications-retry">Retry</EditableText>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-[280px_1fr] gap-4">
          <Card className="md:h-[520px] md:overflow-y-auto">
            <CardContent className="p-2">
              {conversations === null ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-2">
                  <EditableText id="no-conversations">
                    No conversations yet.
                  </EditableText>{" "}
                  <Link to="/friends" className="text-indigo-600 hover:underline">
                    Add friends
                  </Link>{" "}
                  to start messaging.
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.conversationId}
                    onClick={() => setSelectedId(conv.conversationId)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-muted transition ${
                      selectedId === conv.conversationId ? "bg-muted" : ""
                    }`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-indigo-100 text-indigo-700">
                        {getInitials(conv.with.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm truncate ${conv.unread ? "font-semibold" : "font-medium"}`}>
                        {conv.with.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage?.body ?? "No messages yet"}
                      </div>
                    </div>
                    {conv.unread && <span className="h-2 w-2 rounded-full bg-pink-500 shrink-0" aria-label="Unread" />}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="md:h-[520px] flex flex-col">
            {!selectedConversation && !initialFriendId ? (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <EditableText id="communications-select-prompt">Select a conversation to start chatting.</EditableText>
              </CardContent>
            ) : (
              <>
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages === null ? (
                    <>
                      <Skeleton className="h-10 w-2/3" />
                      <Skeleton className="h-10 w-1/2 ml-auto" />
                    </>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      <EditableText id="communications-thread-empty">
                        No messages yet. Say hello!
                      </EditableText>
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.sender_id === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                              mine ? "bg-indigo-600 text-white" : "bg-muted"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={`text-[10px] mt-1 ${mine ? "text-indigo-100" : "text-muted-foreground"}`}>
                              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </CardContent>
                <div className="p-3 border-t flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Write a message..."
                    aria-label="Write a message"
                    maxLength={5000}
                    className="flex-grow"
                  />
                  <Button onClick={handleSend} disabled={!draft.trim() || sending} aria-label="Send message">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default CommunicationsSection;
