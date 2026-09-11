import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserPlus, MessageSquare, X, Check, Loader2, Search as SearchIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Friend,
  FriendRequest,
  UserSummary,
  listFriends,
  listFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  unfriend,
  sendFriendRequest,
} from "@/lib/friendsApi";
import { fetchSearchResults } from "@/modules/search";
import { errorMessage } from "@/lib/apiBase";
import { useLiveUpdates } from "@/contexts/LiveUpdatesContext";

function getInitials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

const PersonRow: React.FC<{ person: UserSummary; children: React.ReactNode }> = ({ person, children }) => (
  <div className="flex items-center justify-between py-3 border-b last:border-0">
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-indigo-100 text-indigo-700">{getInitials(person.displayName)}</AvatarFallback>
      </Avatar>
      <div>
        <div className="font-medium">{person.displayName}</div>
        <div className="text-xs text-muted-foreground">{person.email}</div>
      </div>
    </div>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const EmptyState: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <p className="text-center text-muted-foreground py-8">
    <EditableText id={id}>{children as string}</EditableText>
  </p>
);

const Friends: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refresh: refreshLiveUpdates } = useLiveUpdates();

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<FriendRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; title: string; snippet?: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError(false);
    try {
      const [friendsData, requestsData] = await Promise.all([listFriends(), listFriendRequests()]);
      setFriends(friendsData.friends);
      setIncoming(requestsData.incoming);
      setOutgoing(requestsData.outgoing);
    } catch (err) {
      console.error("Failed to load friends data", err);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      fetchSearchResults(searchQuery, { limit: 10 })
        .then((results) =>
          setSearchResults(
            results
              .filter((r) => r.type === "user" && r.id !== `user:${user?.id}`)
              .map((r) => ({ id: r.id.replace(/^user:/, ""), title: r.title, snippet: r.snippet })),
          ),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, user?.id]);

  const handleSendRequest = (addresseeId: string) =>
    withBusy(addresseeId, async () => {
      try {
        const result = await sendFriendRequest(addresseeId);
        toast({
          title: result.autoAccepted ? "You're now friends" : "Friend request sent",
        });
        await loadAll();
      } catch (err) {
        toast({ title: "Couldn't send request", description: errorMessage(err), variant: "destructive" });
      }
    });

  const handleAccept = (requestId: string) =>
    withBusy(requestId, async () => {
      try {
        await acceptFriendRequest(requestId);
        toast({ title: "Friend request accepted" });
        await loadAll();
        refreshLiveUpdates();
      } catch (err) {
        toast({ title: "Couldn't accept request", description: errorMessage(err), variant: "destructive" });
      }
    });

  const handleDecline = (requestId: string) =>
    withBusy(requestId, async () => {
      try {
        await declineFriendRequest(requestId);
        await loadAll();
      } catch (err) {
        toast({ title: "Couldn't decline request", description: errorMessage(err), variant: "destructive" });
      }
    });

  const handleCancel = (requestId: string) =>
    withBusy(requestId, async () => {
      try {
        await cancelFriendRequest(requestId);
        await loadAll();
      } catch (err) {
        toast({ title: "Couldn't cancel request", description: errorMessage(err), variant: "destructive" });
      }
    });

  const handleUnfriend = (userId: string) =>
    withBusy(userId, async () => {
      try {
        await unfriend(userId);
        toast({ title: "Removed from friends" });
        await loadAll();
      } catch (err) {
        toast({ title: "Couldn't remove friend", description: errorMessage(err), variant: "destructive" });
      }
    });

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">
          <EditableText id="friends-page-title">Friends</EditableText>
        </h1>

        {loadError ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground mb-3">
                <EditableText id="friends-load-error">Couldn't load your friends. Please try again.</EditableText>
              </p>
              <Button onClick={loadAll}>
                <EditableText id="friends-retry">Retry</EditableText>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="friends" className="w-full">
            <TabsList className="grid grid-cols-3 w-full mb-4">
              <TabsTrigger value="friends">
                <EditableText id="friends-tab-friends">Friends</EditableText>
                {friends && friends.length > 0 ? ` (${friends.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="requests">
                <EditableText id="friends-tab-requests">Requests</EditableText>
                {incoming && incoming.length > 0 ? ` (${incoming.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="find">
                <EditableText id="friends-tab-find">Find people</EditableText>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends">
              <Card>
                <CardContent className="p-4">
                  {friends === null ? (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : friends.length === 0 ? (
                    <EmptyState id="friends-empty">No friends yet — try the Find people tab.</EmptyState>
                  ) : (
                    friends.map((friend) => (
                      <PersonRow key={friend.id} person={friend}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Message ${friend.displayName}`}
                          onClick={() => navigate(`/communications?with=${friend.id}`)}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Unfriend ${friend.displayName}`}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {friend.displayName} as a friend?</AlertDialogTitle>
                              <AlertDialogDescription>
                                You'll need to send a new friend request to reconnect later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleUnfriend(friend.id)} disabled={busyIds.has(friend.id)}>
                                {busyIds.has(friend.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </PersonRow>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="requests">
              <Card className="mb-4">
                <CardContent className="p-4">
                  <h2 className="font-semibold mb-2">
                    <EditableText id="friends-incoming-heading">Incoming</EditableText>
                  </h2>
                  {incoming === null ? (
                    <Skeleton className="h-12 w-full" />
                  ) : incoming.length === 0 ? (
                    <EmptyState id="friends-incoming-empty">No pending requests.</EmptyState>
                  ) : (
                    incoming.map((req) => (
                      <PersonRow key={req.requestId} person={req.from!}>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Accept"
                          disabled={busyIds.has(req.requestId)}
                          onClick={() => handleAccept(req.requestId)}
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Decline"
                          disabled={busyIds.has(req.requestId)}
                          onClick={() => handleDecline(req.requestId)}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </PersonRow>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h2 className="font-semibold mb-2">
                    <EditableText id="friends-outgoing-heading">Sent</EditableText>
                  </h2>
                  {outgoing === null ? (
                    <Skeleton className="h-12 w-full" />
                  ) : outgoing.length === 0 ? (
                    <EmptyState id="friends-outgoing-empty">No outgoing requests.</EmptyState>
                  ) : (
                    outgoing.map((req) => (
                      <PersonRow key={req.requestId} person={req.to!}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyIds.has(req.requestId)}
                          onClick={() => handleCancel(req.requestId)}
                        >
                          {busyIds.has(req.requestId) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                        </Button>
                      </PersonRow>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="find">
              <Card>
                <CardContent className="p-4">
                  <div className="relative mb-4">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, username, or email"
                      className="pl-9"
                      aria-label="Search for people"
                    />
                  </div>
                  {searching && <Skeleton className="h-12 w-full" />}
                  {!searching && searchQuery.trim() && searchResults.length === 0 && (
                    <EmptyState id="friends-search-empty">No one found.</EmptyState>
                  )}
                  {searchResults.map((result) => (
                    <PersonRow key={result.id} person={{ id: result.id, email: result.snippet || "", displayName: result.title }}>
                      <Button
                        size="sm"
                        disabled={busyIds.has(result.id)}
                        onClick={() => handleSendRequest(result.id)}
                      >
                        {busyIds.has(result.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-1" /> Add
                          </>
                        )}
                      </Button>
                    </PersonRow>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Friends;
