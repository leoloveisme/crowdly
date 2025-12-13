
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import type { ChapterComment, ChapterLike } from "@/types/chapterInteractions";

interface ChapterInteractionsProps {
  chapterId: string;
}

const ChapterInteractions: React.FC<ChapterInteractionsProps> = ({ chapterId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<ChapterComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [likes, setLikes] = useState<ChapterLike[]>([]);
  const [myLike, setMyLike] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch comments and likes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Comments
      const { data: commentsData } = await supabase
        .from("chapter_comments")
        .select("*")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: true });

      setComments(commentsData || []);
      // Likes
      const { data: likesData } = await supabase
        .from("chapter_likes")
        .select("*")
        .eq("chapter_id", chapterId);

      setLikes(likesData || []);
      if (user) {
        const existingLike = likesData?.find((like: ChapterLike) => like.user_id === user.id);
        setMyLike(existingLike ? !!existingLike.is_like : null);
      }
      setLoading(false);
    };

    if (chapterId) {
      fetchData();
    }
  }, [chapterId, user]);

  // Like/dislike handlers
  const handleLike = async (like: boolean) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to rate chapters" });
      return;
    }
    // FIX: onConflict must be a string, not string[]
    const { error } = await supabase.from("chapter_likes").upsert(
      {
        chapter_id: chapterId,
        user_id: user.id,
        is_like: like,
      },
      { onConflict: "chapter_id,user_id" } // THIS IS THE FIX
    );
    if (error) {
      toast({ title: "Error", description: "Could not update like", variant: "destructive" });
      return;
    }
    setMyLike(like);
    // Refetch likes
    const { data: likesData } = await supabase.from("chapter_likes").select("*").eq("chapter_id", chapterId);
    setLikes(likesData || []);
  };

  // Add comment
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Login required", description: "Please log in to comment" });
      return;
    }
    if (!commentInput.trim()) return;
    const { error } = await supabase.from("chapter_comments").insert([
      {
        chapter_id: chapterId,
        user_id: user.id,
        content: commentInput.trim(),
      },
    ]);
    if (error) {
      toast({ title: "Error", description: "Could not add comment", variant: "destructive" });
      return;
    }
    setCommentInput("");
    // Refetch comments
    const { data: commentsData } = await supabase
      .from("chapter_comments")
      .select("*")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: true });
    setComments(commentsData || []);
  };

  if (loading) return <div className="text-xs text-gray-400">Loading interactions...</div>;

  return (
    <div className="bg-gray-100 p-3 rounded-md mt-3 space-y-2">
      <div className="flex items-center gap-3">
        <button
          className={`flex items-center gap-1 text-green-700 px-2 py-1 rounded hover:bg-green-50 ${myLike === true ? "bg-green-100" : ""}`}
          onClick={() => handleLike(true)}
          disabled={myLike === true}
        >
          <ThumbsUp size={14} /> {likes.filter(l => l.is_like).length}
        </button>
        <button
          className={`flex items-center gap-1 text-red-700 px-2 py-1 rounded hover:bg-red-50 ${myLike === false ? "bg-red-100" : ""}`}
          onClick={() => handleLike(false)}
          disabled={myLike === false}
        >
          <ThumbsDown size={14} /> {likes.filter(l => !l.is_like).length}
        </button>
        <div className="flex items-center gap-1 ml-2 text-blue-500 text-xs">
          <MessageCircle size={13} /> {comments.length} Comments
        </div>
      </div>
      <div>
        <form className="flex gap-2 mt-2" onSubmit={handleSubmitComment}>
          <Input
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1"
          />
          <Button size="sm" type="submit" disabled={!commentInput.trim()}>Post</Button>
        </form>
      </div>
      <div className="mt-2 max-h-44 overflow-y-auto space-y-2">
        {comments.map((cmt) => (
          <div key={cmt.id} className="bg-white p-2 rounded border text-sm">
            <span className="font-semibold text-blue-700">{cmt.user_id.slice(0, 8)}</span>
            <span className="mx-2 text-gray-400 text-xs">{new Date(cmt.created_at).toLocaleString()}</span>
            <div className="pl-2">{cmt.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChapterInteractions;
