import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { UserPlus, Check, Clock, Users, Loader2 } from "lucide-react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Button } from "@/components/ui/button";
import FavoriteStories from "@/modules/favorite stories";
import LivingExperiencingStories from "@/modules/living-experiencing stories";
import LivedExperiencedStories from "@/modules/lived-experienced stories";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  getFriendStatus,
  sendFriendRequest,
  acceptFriendRequest,
  type FriendStatus,
} from "@/lib/friendsApi";
import { getFollowStatus, followUser, unfollowUser } from "@/lib/followApi";
import { errorMessage } from "@/lib/apiBase";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface PublicProfileData {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  show_public_stories?: boolean;
  show_public_screenplays?: boolean;
  show_public_favorites?: boolean;
  show_public_living?: boolean;
  show_public_lived?: boolean;
  // Fine-grained per-container visibility
  favorites_visibility?: "public" | "private" | "friends" | "selected";
  living_visibility?: "public" | "private" | "friends" | "selected";
  lived_visibility?: "public" | "private" | "friends" | "selected";
  stories_visibility?: "public" | "private" | "friends" | "selected";
  screenplays_visibility?: "public" | "private" | "friends" | "selected";
  favorites_selected_user_ids?: string[] | null;
  living_selected_user_ids?: string[] | null;
  lived_selected_user_ids?: string[] | null;
  stories_selected_user_ids?: string[] | null;
  screenplays_selected_user_ids?: string[] | null;
}

interface PublicStory {
  story_title_id: string;
  title: string;
  created_at: string;
  visibility?: string;
  published?: boolean;
}

interface PublicScreenplay {
  screenplay_id: string;
  title: string;
  created_at: string;
  visibility?: string;
  published?: boolean;
}

const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { user: viewer } = useAuth();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [stories, setStories] = useState<PublicStory[]>([]);
  const [screenplays, setScreenplays] = useState<PublicScreenplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followActionLoading, setFollowActionLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!username) return;
      setLoading(true);
      setNotFound(false);

      try {
        // 1) Load public profile by username
        const profRes = await fetch(`${API_BASE}/public-profiles/${encodeURIComponent(username)}`);
        if (!profRes.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const prof = await profRes.json();
        setProfile(prof);

        const userId = prof.id as string;

        // 2) Load stories the user is involved in
        const storiesRes = await fetch(`${API_BASE}/users/${userId}/stories`);
        if (storiesRes.ok) {
          const data = (await storiesRes.json()) as PublicStory[];
          const visible = Array.isArray(data)
            ? data.filter((s) => s.visibility === "public" && s.published === true)
            : [];
          setStories(visible);
        } else {
          setStories([]);
        }

        // 3) Load screenplays the user is involved in
        const spRes = await fetch(`${API_BASE}/users/${userId}/screenplays`);
        if (spRes.ok) {
          const data = (await spRes.json()) as PublicScreenplay[];
          const visible = Array.isArray(data)
            ? data.filter((sp) => sp.visibility === "public" && sp.published === true)
            : [];
          setScreenplays(visible);
        } else {
          setScreenplays([]);
        }
      } catch (err) {
        console.error("[PublicProfile] failed to load", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [username]);

  const viewerId = viewer?.id ?? null;

  useEffect(() => {
    if (!profile || !viewerId || viewerId === profile.id) {
      setFriendStatus(null);
      setFriendRequestId(null);
      setFollowing(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [friendRes, followRes] = await Promise.all([
          getFriendStatus(profile.id),
          getFollowStatus(profile.id),
        ]);
        if (cancelled) return;
        setFriendStatus(friendRes.status);
        setFriendRequestId(friendRes.requestId ?? null);
        setFollowing(followRes.following);
      } catch (err) {
        console.error("[PublicProfile] failed to load relationship status", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, viewerId]);

  const handleAddFriend = async () => {
    if (!profile) return;
    setFriendActionLoading(true);
    try {
      const result = await sendFriendRequest(profile.id);
      if (result.autoAccepted) {
        setFriendStatus("friends");
        toast({ title: "You're now friends" });
      } else {
        setFriendStatus("pending_outgoing");
        toast({ title: "Friend request sent" });
      }
    } catch (err) {
      toast({
        title: "Couldn't send friend request",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!friendRequestId) return;
    setFriendActionLoading(true);
    try {
      await acceptFriendRequest(friendRequestId);
      setFriendStatus("friends");
      toast({ title: "Friend request accepted" });
    } catch (err) {
      toast({
        title: "Couldn't accept friend request",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!profile) return;
    setFollowActionLoading(true);
    try {
      if (following) {
        await unfollowUser(profile.id);
        setFollowing(false);
      } else {
        await followUser(profile.id);
        setFollowing(true);
      }
    } catch (err) {
      toast({
        title: "Couldn't update follow status",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setFollowActionLoading(false);
    }
  };

  const resolveVisibility = (
    container: "favorites" | "living" | "lived",
  ): "public" | "private" | "friends" | "selected" => {
    if (!profile) return "public";
    const field =
      container === "favorites"
        ? "favorites_visibility"
        : container === "living"
        ? "living_visibility"
        : "lived_visibility";
    const raw = (profile as any)[field];
    if (raw === "public" || raw === "private" || raw === "friends" || raw === "selected") {
      return raw;
    }
    // Fallback to legacy booleans if newer fields are not present.
    const legacyFlag =
      container === "favorites"
        ? profile.show_public_favorites
        : container === "living"
        ? profile.show_public_living
        : profile.show_public_lived;
    return legacyFlag === false ? "private" : "public";
  };

  const isOwner = profile && viewerId && viewerId === profile.id;

  const canSeeContainer = (
    container: "favorites" | "living" | "lived",
  ): boolean => {
    if (!profile) return false;
    if (isOwner) return true;

    const mode = resolveVisibility(container);
    if (mode === "public") return true;
    if (mode === "private") return false;

    if (mode === "selected") {
      if (!viewerId) return false;
      const list =
        container === "favorites"
          ? profile.favorites_selected_user_ids
          : container === "living"
          ? profile.living_selected_user_ids
          : profile.lived_selected_user_ids;
      return Array.isArray(list) && list.includes(viewerId as string);
    }

    // TODO: once a friends/relationship graph exists, enforce real
    // friends-only semantics here. For now, treat friends-only as private
    // for non-owners.
    if (mode === "friends") return false;

    return false;
  };

  const resolveStoriesVisibility = (
    kind: "stories" | "screenplays",
  ): "public" | "private" | "friends" | "selected" => {
    if (!profile) return "public";
    const field =
      kind === "stories" ? "stories_visibility" : "screenplays_visibility";
    const raw = (profile as any)[field];
    if (raw === "public" || raw === "private" || raw === "friends" || raw === "selected") {
      return raw;
    }
    const legacyFlag =
      kind === "stories"
        ? profile.show_public_stories
        : profile.show_public_screenplays;
    return legacyFlag === false ? "private" : "public";
  };

  const canSeeStoriesContainer = (
    kind: "stories" | "screenplays",
  ): boolean => {
    if (!profile) return false;
    if (isOwner) return true;

    const mode = resolveStoriesVisibility(kind);
    if (mode === "public") return true;
    if (mode === "private") return false;

    if (mode === "selected") {
      if (!viewerId) return false;
      const list =
        kind === "stories"
          ? profile.stories_selected_user_ids
          : profile.screenplays_selected_user_ids;
      return Array.isArray(list) && list.includes(viewerId as string);
    }

    // As with experience containers, friends-only behaves like private until
    // a real friends graph exists.
    if (mode === "friends") return false;

    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">Loading public profile...</p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col">
        <CrowdlyHeader />
        <div className="flex flex-1 items-center justify-center flex-col text-center px-4">
          <h1 className="text-3xl font-bold mb-2">User not found</h1>
          <p className="text-gray-600 mb-4">
            We couldn&apos;t find a public profile for this username.
          </p>
        </div>
        <CrowdlyFooter />
      </div>
    );
  }

  const displayName =
    (profile.first_name || profile.last_name)
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
      : profile.username;

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      <main className="flex-1">
        <div className="container mx-auto px-4 pt-10 pb-16">
          <header className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">
                <EditableText id="public-profile-heading">
                  {displayName}
                </EditableText>
              </h1>
              <p className="text-sm text-gray-500 mb-2">@{profile.username}</p>
              {profile.bio && (
                <p className="text-gray-700 max-w-2xl whitespace-pre-line">
                  {profile.bio}
                </p>
              )}
            </div>

            {viewerId && !isOwner && (
              <div className="flex items-center gap-2 shrink-0">
                {friendStatus === "friends" ? (
                  <Button variant="outline" size="sm" disabled>
                    <Users />
                    <EditableText id="public-profile-friends-label" as="span">
                      Friends
                    </EditableText>
                  </Button>
                ) : friendStatus === "pending_outgoing" ? (
                  <Button variant="outline" size="sm" disabled>
                    <Clock />
                    <EditableText id="public-profile-request-sent-label" as="span">
                      Request sent
                    </EditableText>
                  </Button>
                ) : friendStatus === "pending_incoming" ? (
                  <Button
                    size="sm"
                    onClick={handleAcceptFriendRequest}
                    disabled={friendActionLoading}
                  >
                    {friendActionLoading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    <EditableText id="public-profile-accept-friend-btn" as="span">
                      Accept request
                    </EditableText>
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleAddFriend} disabled={friendActionLoading}>
                    {friendActionLoading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UserPlus />
                    )}
                    <EditableText id="public-profile-add-friend-btn" as="span">
                      Add friend
                    </EditableText>
                  </Button>
                )}

                <Button
                  variant={following ? "outline" : "secondary"}
                  size="sm"
                  onClick={handleToggleFollow}
                  disabled={followActionLoading || following === null}
                >
                  {followActionLoading && <Loader2 className="animate-spin" />}
                  {following ? (
                    <EditableText id="public-profile-following-btn" as="span">
                      Following
                    </EditableText>
                  ) : (
                    <EditableText id="public-profile-follow-btn" as="span">
                      Follow
                    </EditableText>
                  )}
                </Button>
              </div>
            )}
          </header>

          {/* Public stories */}
          {canSeeStoriesContainer("stories") && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <span>Stories</span>
              </h2>
              {stories.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No public stories yet.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {stories.map((s) => (
                    <li key={s.story_title_id} className="flex items-center gap-2">
                      <Link
                        to={`/story/${s.story_title_id}`}
                        className="text-purple-700 hover:underline"
                      >
                        {s.title}
                      </Link>
                      <span className="text-[11px] text-gray-500">
                        ({new Date(s.created_at).toLocaleString()})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Public screenplays */}
          {canSeeStoriesContainer("screenplays") && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <span>Screenplays</span>
              </h2>
              {screenplays.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No public screenplays yet.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {screenplays.map((sp) => (
                    <li key={sp.screenplay_id} className="flex items-center gap-2">
                      <Link
                        to={`/screenplay/${sp.screenplay_id}`}
                        className="text-purple-700 hover:underline"
                      >
                        {sp.title}
                      </Link>
                      <span className="text-[11px] text-gray-500">
                        ({new Date(sp.created_at).toLocaleString()})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Favorites (experience model) */}
          {canSeeContainer("favorites") && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <span>Favorites</span>
              </h2>
              <FavoriteStories userId={profile.id} />
            </section>
          )}

          {/* Living / experiencing list */}
          {canSeeContainer("living") && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <span>Living / Experiencing the story(-ies)</span>
              </h2>
              <LivingExperiencingStories userId={profile.id} />
            </section>
          )}

          {/* Lived / experienced list */}
          {canSeeContainer("lived") && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <span>Lived / Experienced those story(-ies)</span>
              </h2>
              <LivedExperiencedStories userId={profile.id} />
            </section>
          )}
        </div>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default PublicProfile;
