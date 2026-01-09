import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, ThumbsUp, ThumbsDown } from "lucide-react";

// Use same-origin API base in development; dev server proxies to backend.
// In production, VITE_API_BASE_URL can point at the deployed API.
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

// Minimal comment shape we care about
interface BaseComment {
  id: string;
  body: string;
  created_at: string;
}

type InteractionsTarget =
  | { kind: "story"; storyTitleId: string }
  | { kind: "chapter"; chapterId: string }
  | { kind: "screenplay"; screenplayId: string }
  | { kind: "scene"; screenplayId: string; sceneId: string };

interface InteractionsWidgetProps extends InteractionsTarget {
  label?: string;
}

const InteractionsWidget: React.FC<InteractionsWidgetProps> = (props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [comments, setComments] = useState<BaseComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [reactions, setReactions] = useState<
    { reaction_type: string; count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const resolvedLabel =
    props.label ||
    (props.kind === "chapter"
      ? "Chapter comments"
      : props.kind === "scene"
      ? "Scene comments"
      : "Comments");

  // Helpers to derive query strings and payloads
  const buildCommentsQuery = () => {
    switch (props.kind) {
      case "story":
        return `${API_BASE}/comments?storyTitleId=${props.storyTitleId}`;
      case "chapter":
        return `${API_BASE}/comments?chapterId=${props.chapterId}`;
      case "screenplay":
        return `${API_BASE}/comments?screenplayId=${props.screenplayId}`;
      case "scene":
        return `${API_BASE}/comments?screenplaySceneId=${props.sceneId}`;
    }
  };

  const buildReactionsQuery = () => {
    switch (props.kind) {
      case "story":
        return `${API_BASE}/reactions?storyTitleId=${props.storyTitleId}`;
      case "chapter":
        return `${API_BASE}/reactions?chapterId=${props.chapterId}`;
      case "screenplay":
        return `${API_BASE}/reactions?screenplayId=${props.screenplayId}`;
      case "scene":
        return `${API_BASE}/reactions?screenplaySceneId=${props.sceneId}`;
    }
  };

  const buildCommentPayload = (body: string) => {
    if (!user) return null;
    switch (props.kind) {
      case "story":
        return {
          userId: user.id,
          storyTitleId: props.storyTitleId,
          body,
        };
      case "chapter":
        return {
          userId: user.id,
          chapterId: props.chapterId,
          body,
        };
      case "screenplay":
        return {
          userId: user.id,
          screenplayId: props.screenplayId,
          body,
        };
      case "scene":
        return {
          userId: user.id,
          screenplayId: props.screenplayId,
          screenplaySceneId: props.sceneId,
          body,
        };
    }
  };

  const buildReactionPayload = (reactionType: string) => {
    if (!user) return null;
    switch (props.kind) {
      case "story":
        return {
          userId: user.id,
          storyTitleId: props.storyTitleId,
          reactionType,
        };
      case "chapter":
        return {
          userId: user.id,
          chapterId: props.chapterId,
          reactionType,
        };
      case "screenplay":
        return {
          userId: user.id,
          screenplayId: props.screenplayId,
          reactionType,
        };
      case "scene":
        return {
          userId: user.id,
          screenplayId: props.screenplayId,
          screenplaySceneId: props.sceneId,
          reactionType,
        };
    }
  };

  // Load comments + reactions
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Comments
        try {
          const res = await fetch(buildCommentsQuery());
          if (res.ok) {
            const raw = await res.json();
            const mapped: BaseComment[] = Array.isArray(raw)
              ? raw.map((row: any) => ({
                  id: row.id,
                  body: row.body,
                  created_at: row.created_at,
                }))
              : [];
            setComments(mapped);
          } else {
            setComments([]);
          }
        } catch (err) {
          console.error("[InteractionsWidget] Failed to load comments", err);
          setComments([]);
        }

        // Reactions
        try {
          const rRes = await fetch(buildReactionsQuery());
          if (rRes.ok) {
            const data = await rRes.json();
            setReactions(Array.isArray(data) ? data : []);
          } else {
            setReactions([]);
          }
        } catch (err) {
          console.error("[InteractionsWidget] Failed to load reactions", err);
          setReactions([]);
        }
      } finally {
        setLoading(false);
      }
    };

    // Basic validation: ensure required ids exist
    if (
      (props.kind === "story" && !props.storyTitleId) ||
      (props.kind === "chapter" && !props.chapterId) ||
      (props.kind === "screenplay" && !props.screenplayId) ||
      (props.kind === "scene" && (!props.screenplayId || !props.sceneId))
    ) {
      setComments([]);
      setReactions([]);
      setLoading(false);
      return;
    }

    load();
  }, [props.kind, JSON.stringify(props)]);

  // Like/dislike handler
  const handleReact = async (like: boolean) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to react" });
      return;
    }
    const payload = buildReactionPayload(like ? "like" : "dislike");
    if (!payload) return;

    try {
      const res = await fetch(`${API_BASE}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Failed to update reaction",
          variant: "destructive",
        });
        return;
      }
      // Refresh reactions
      const rRes = await fetch(buildReactionsQuery());
      if (rRes.ok) {
        const data = await rRes.json();
        setReactions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("[InteractionsWidget] Failed to update reaction", err);
      toast({
        title: "Error",
        description: "Failed to update reaction",
        variant: "destructive",
      });
    }
  };

  // Add comment
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Login required", description: "Please log in to comment" });
      return;
    }
    if (!commentInput.trim()) return;

    const payload = buildCommentPayload(commentInput.trim());
    if (!payload) return;

    try {
      const res = await fetch(`${API_BASE}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Error",
          description: body.error || "Could not add comment",
          variant: "destructive",
        });
        return;
      }

      setCommentInput("");
      const newComment: BaseComment = {
        id: body.id,
        body: body.body,
        created_at: body.created_at,
      };
      setComments((prev) => [...prev, newComment]);
    } catch (err) {
      console.error("[InteractionsWidget] Failed to add comment", err);
      toast({
        title: "Error",
        description: "Could not add comment",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-xs text-gray-400">Loading interactions...</div>;
  }

  const likeCount = reactions.find((r) => r.reaction_type === "like")?.count ?? 0;
  const dislikeCount = reactions.find((r) => r.reaction_type === "dislike")?.count ?? 0;

  return (
    <div className="bg-gray-100 p-3 rounded-md mt-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          className="flex items-center gap-1 text-green-700 px-2 py-1 rounded hover:bg-green-50"
          onClick={() => handleReact(true)}
        >
          <ThumbsUp size={14} /> {likeCount}
        </button>
        <button
          className="flex items-center gap-1 text-red-700 px-2 py-1 rounded hover:bg-red-50"
          onClick={() => handleReact(false)}
        >
          <ThumbsDown size={14} /> {dislikeCount}
        </button>
        <div className="flex items-center gap-1 ml-2 text-blue-500 text-xs">
          <MessageCircle size={13} /> {comments.length} Comments
        </div>
      </div>
      <div>
        <form className="flex gap-2 mt-2" onSubmit={handleSubmitComment}>
          <Input
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder={`Add a comment...`}
            className="flex-1"
          />
          <Button size="sm" type="submit" disabled={!commentInput.trim()}>
            Post
          </Button>
        </form>
      </div>
      <div className="mt-2 max-h-44 overflow-y-auto space-y-2">
        {comments.length === 0 ? (
          <div className="text-xs text-gray-500">No comments yet.</div>
        ) : (
          comments.map((cmt) => (
            <div key={cmt.id} className="bg-white p-2 rounded border text-sm">
              <span className="mx-2 text-gray-400 text-xs">
                {new Date(cmt.created_at).toLocaleString()}
              </span>
              <div className="pl-2">{cmt.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InteractionsWidget;
